import {
    buildCSSInjectionCode,
    buildJsCssMap,
    clearImportedCssViteMetadataFromBundle,
    globalCssInjection,
    isCSSRequest,
    relativeCssInjection,
    removeLinkStyleSheets,
    resolveInjectionCode,
    warnLog,
} from './utils.js';
import type { OutputAsset } from 'rollup';
import type { Plugin, ResolvedConfig } from 'vite';
import type { DevOptions, PluginConfiguration } from './interface';

const VIRTUAL_MODULE_ID = 'virtual:css-injected-by-js';
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

const VIRTUAL_MODULE_BUILD_CODE = `
export function injectCSS(opts) {
  if (typeof globalThis === 'undefined') return;
  globalThis.__VITE_CSS_INJECT_OPTS__ = opts || {};
  globalThis.__VITE_CSS_UNLOCKED__ = true;
  var q = globalThis.__VITE_CSS_QUEUE__;
  if (q) {
    globalThis.__VITE_CSS_QUEUE__ = [];
    for (var i = 0; i < q.length; i++) q[i](opts || {});
  }
}
`;

const VIRTUAL_MODULE_DEV_CODE = `
var _cssEnabled = false;
var _styleCache = new Set();
var _observer = null;

if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach(function(n) {
    n.setAttribute('media', 'not all');
    _styleCache.add(n);
  });

  _observer = new MutationObserver(function(muts) {
    if (_cssEnabled) return;
    muts.forEach(function(m) {
      m.addedNodes.forEach(function(n) {
        if (n.nodeType === 1 && n.tagName === 'STYLE' && n.hasAttribute('data-vite-dev-id')) {
          n.setAttribute('media', 'not all');
          _styleCache.add(n);
        }
      });
    });
  });

  _observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function injectCSS(opts) {
  _cssEnabled = true;
  if (_observer) _observer.disconnect();
  if (typeof document === 'undefined') return;
  var target = (opts && opts.target) || document.head;
  _styleCache.forEach(function(n) {
    n.removeAttribute('media');
    if (target !== document.head) {
      target.appendChild(n);
    }
  });
  _styleCache.clear();
}
`;

/**
 * Inject the CSS compiled with JS.
 *
 * @return {Plugin[]}
 */
export default function cssInjectedByJsPlugin({
    cssAssetsFilterFunction,
    dev: { enableDev, removeStyleCode, removeStyleCodeFunction } = {} as DevOptions,
    injectCode,
    injectCodeFunction,
    injectionCodeFormat,
    jsAssetsFilterFunction,
    preRenderCSSCode,
    relativeCSSInjection,
    attributes,
    styleId,
    suppressUnusedCssWarning,
    topExecutionPriority,
    useStrictCSP,
}: PluginConfiguration | undefined = {}): Plugin[] {
    let config: ResolvedConfig;

    const topExecutionPriorityFlag = typeof topExecutionPriority == 'boolean' ? topExecutionPriority : true;

    let isBuild = false;
    let isVirtualModuleUsed = false;

    if (styleId) {
        warnLog(
            '[vite-plugin-css-injected-by-js] The "styleId" option is deprecated and will be removed in 5.0.0, please use the "attributes" option instead with an "id" property.'
        );
    }

    const plugins: Plugin[] = [
        {
            name: 'vite-plugin-css-injected-by-js-virtual',
            configResolved(resolvedConfig) {
                isBuild = resolvedConfig.command === 'build';
            },
            resolveId(id) {
                if (id === VIRTUAL_MODULE_ID) {
                    return RESOLVED_VIRTUAL_MODULE_ID;
                }
            },
            load(id) {
                if (id === RESOLVED_VIRTUAL_MODULE_ID) {
                    isVirtualModuleUsed = true;
                    return isBuild ? VIRTUAL_MODULE_BUILD_CODE : VIRTUAL_MODULE_DEV_CODE;
                }
            },
        },
        {
            apply: 'build',
            enforce: 'post',
            name: 'vite-plugin-css-injected-by-js',
            config(config, env) {
                if (env.command === 'build') {
                    if (!config.build) {
                        config.build = {};
                    }

                    if (relativeCSSInjection == true) {
                        if (!config.build.cssCodeSplit) {
                            config.build.cssCodeSplit = true;
                            warnLog(
                                `[vite-plugin-css-injected-by-js] Override of 'build.cssCodeSplit' option to true, it must be true when 'relativeCSSInjection' is enabled.`
                            );
                        }
                    }
                }
            },
            configResolved(_config) {
                config = _config;
            },
            async generateBundle(opts, bundle) {
                if (config.build.ssr) {
                    return;
                }

                const buildCssCode = (cssToInject: string) =>
                    buildCSSInjectionCode({
                        buildOptions: config.build,
                        cssToInject:
                            typeof preRenderCSSCode == 'function' ? preRenderCSSCode(cssToInject) : cssToInject,
                        injectCode,
                        injectCodeFunction,
                        injectionCodeFormat,
                        attributes: styleId ? { id: styleId, ...attributes } : attributes,
                        useStrictCSP,
                    });

                const cssAssetsFilter = (asset: OutputAsset): boolean => {
                    return typeof cssAssetsFilterFunction == 'function' ? cssAssetsFilterFunction(asset) : true;
                };

                const cssAssets = Object.keys(bundle).filter(
                    (i) =>
                        bundle[i].type == 'asset' &&
                        bundle[i].fileName.endsWith('.css') &&
                        cssAssetsFilter(bundle[i] as OutputAsset)
                );

                let unusedCssAssets: string[] = [];
                if (relativeCSSInjection) {
                    const assetsWithCss = buildJsCssMap(bundle, jsAssetsFilterFunction);
                    await relativeCssInjection(
                        bundle,
                        assetsWithCss,
                        buildCssCode,
                        topExecutionPriorityFlag,
                        config.build,
                        isVirtualModuleUsed
                    );

                    unusedCssAssets = cssAssets.filter((cssAsset) => !!bundle[cssAsset]);
                    if (!suppressUnusedCssWarning) {
                        // With all used CSS assets now being removed from the bundle, navigate any that have not been linked and output
                        const unusedCssAssetsString = unusedCssAssets.join(',');
                        unusedCssAssetsString.length > 0 &&
                            warnLog(
                                `[vite-plugin-css-injected-by-js] Some CSS assets were not included in any known JS: ${unusedCssAssetsString}`
                            );
                    }
                } else {
                    const allCssAssets = Object.keys(bundle).filter(
                        (i) => bundle[i].type == 'asset' && bundle[i].fileName.endsWith('.css')
                    );

                    unusedCssAssets = allCssAssets.filter((cssAsset) => !cssAssets.includes(cssAsset));

                    await globalCssInjection(
                        bundle,
                        cssAssets,
                        buildCssCode,
                        jsAssetsFilterFunction,
                        topExecutionPriorityFlag,
                        config.build,
                        isVirtualModuleUsed
                    );
                }

                clearImportedCssViteMetadataFromBundle(bundle, unusedCssAssets);

                const htmlFiles = Object.keys(bundle).filter((i) => i.endsWith('.html'));
                for (const name of htmlFiles) {
                    const htmlChunk = bundle[name] as OutputAsset;
                    let replacedHtml =
                        htmlChunk.source instanceof Uint8Array
                            ? new TextDecoder().decode(htmlChunk.source)
                            : `${htmlChunk.source}`;

                    cssAssets.forEach(function replaceLinkedStylesheetsHtml(cssName) {
                        if (!unusedCssAssets.includes(cssName)) {
                            replacedHtml = removeLinkStyleSheets(replacedHtml, cssName);
                            htmlChunk.source = replacedHtml;
                        }
                    });
                }
            },
        },
    ];

    if (enableDev) {
        warnLog(
            '[vite-plugin-css-injected-by-js] Experimental dev mode activated! Please, for any error open a issue.'
        );

        plugins.push({
            name: 'vite-plugin-css-injected-by-js-dev',
            apply: 'serve',
            enforce: 'post',
            transform(src, id) {
                if (isCSSRequest(id)) {
                    const defaultRemoveStyleCode = (devId: string) => `{
                        (function removeStyleInjected() {
                            const elementsToRemove = document.querySelectorAll("style[data-vite-dev-id='${devId}']");
                            elementsToRemove.forEach(element => {
                                element.remove();
                            });
                        })()
                    }`;

                    let removeStyleFunction: (id: string) => string = removeStyleCode || defaultRemoveStyleCode;
                    if (removeStyleCodeFunction) {
                        removeStyleFunction = (id) => `(${removeStyleCodeFunction})("${id}")`;
                    }

                    // removeStyleFunction is called before since the function that inject the CSS doesn't handle the update case required in dev mode.
                    let injectionCode = src.replace(
                        '__vite__updateStyle(__vite__id, __vite__css)',
                        ';\n' +
                            removeStyleFunction(id) +
                            ';\n' +
                            resolveInjectionCode('__vite__css', injectCode, injectCodeFunction, {
                                attributes: { type: 'text/css', ['data-vite-dev-id']: id },
                            })
                    );

                    injectionCode = injectionCode.replace('__vite__removeStyle(__vite__id)', removeStyleFunction(id));

                    return {
                        code: injectionCode,
                        map: null,
                    };
                }
            },
        });
    }

    return plugins;
}

import { buildCSSInjectionCode, debugLog, removeLinkStyleSheets, warnLog } from './utils.js';
import { OutputAsset, OutputChunk } from 'rollup';
import { Plugin, ResolvedConfig } from 'vite';
import { PluginConfiguration } from './interface';

/**
 * Inject the CSS compiled with JS.
 *
 * @return {Plugin}
 */
export default function cssInjectedByJsPlugin({
    injectCode,
    injectCodeFunction,
    jsAssetsFilterFunction,
    preRenderCSSCode,
    styleId,
    topExecutionPriority,
    useStrictCSP,
    relativeCSSInjection,
}: PluginConfiguration | undefined = {}): Plugin {
    //Globally so we can add it to legacy and non-legacy bundle.
    let globalCssToInject: string = '';
    let config: ResolvedConfig;

    const topExecutionPriorityFlag = typeof topExecutionPriority == 'boolean' ? topExecutionPriority : true;

    const isDebug = process.env.VITE_CSS_INJECTED_BY_JS_DEBUG;

    return {
        apply: 'build',
        enforce: 'post',
        name: 'vite-plugin-css-injected-by-js',
        configResolved(_config) {
            config = _config;
        },
        async generateBundle(opts, bundle) {
            if (config.build.ssr) {
                return;
            }

            const htmlFiles = Object.keys(bundle).filter((i) => i.endsWith('.html'));
            const cssAssets = Object.keys(bundle).filter(
                (i) => bundle[i].type == 'asset' && bundle[i].fileName.endsWith('.css')
            );

            for (const name of htmlFiles) {
                const htmlChunk = bundle[name] as OutputAsset;
                let replacedHtml = htmlChunk.source as string;

                cssAssets.forEach((cssName) => {
                    replacedHtml = removeLinkStyleSheets(replacedHtml, cssName);
                    htmlChunk.source = replacedHtml;
                });
            }

            const jsAssetsFilter =
                typeof jsAssetsFilterFunction == 'function' ? jsAssetsFilterFunction : defaultJsAssetsFilter;

            let jsAssetTargets = [];
            if (typeof jsAssetsFilterFunction != 'function') {
                const jsAssets = Object.keys(bundle).filter(
                    (i) => isJsOutputChunk(bundle[i]) && defaultJsAssetsFilter(bundle[i] as OutputChunk)
                );

                const jsTargetFileName = jsAssets[jsAssets.length - 1];
                if (jsAssets.length > 1) {
                    warnLog(
                        `[vite-plugin-css-injected-by-js] has identified "${jsTargetFileName}" as one of the multiple output files marked as "entry" to put the CSS injection code. However, if this is not the intended file to add the CSS injection code, you can use the "jsAssetsFilterFunction" parameter to specify the desired output file (read docs).`
                    );
                    if (isDebug) {
                        debugLog(
                            `[vite-plugin-css-injected-by-js] identified js file targets: ${jsAssets.join(
                                ', '
                            )}. Selected "${jsTargetFileName}".\n`
                        );
                    }
                }

                // This should be always the root of the application
                jsAssetTargets.push(bundle[jsTargetFileName] as OutputChunk);
            } else {
                const jsAssets = Object.keys(bundle).filter(
                    (i) => isJsOutputChunk(bundle[i]) && jsAssetsFilter(bundle[i] as OutputChunk)
                );

                jsAssets.forEach((jsAssetKey) => {
                    jsAssetTargets.push(bundle[jsAssetKey] as OutputChunk);
                });
            }

            if (jsAssetTargets.length == 0) {
                throw new Error(
                    'Unable to locate the JavaScript asset for adding the CSS injection code. It is recommended to review your configurations.'
                );
            }

            if (!relativeCSSInjection) {
                const allCssCode = cssAssets.reduce(function extractCssCodeAndDeleteFromBundle(previousValue, cssName) {
                    return previousValue + extractCssCode(bundle[cssName] as OutputAsset);
                }, '');

                if (allCssCode.length > 0) {
                    globalCssToInject = allCssCode;
                }
            }

            for (const jsAsset of jsAssetTargets) {
                let cssToInject: string = '';

                if (!relativeCSSInjection && globalCssToInject.length > 0) {
                    cssToInject = globalCssToInject;
                } else {
                    // @ts-ignore
                    const cssNamesSet: Set<string> = jsAsset.viteMetadata.importedCss;
                    cssNamesSet.forEach(function extractCssToInject(cssName) {
                        cssToInject += String(extractCssCode(bundle[cssName] as OutputAsset));
                    });
                }

                const cssInjectionCode = await buildCSSInjectionCode({
                    cssToInject: typeof preRenderCSSCode == 'function' ? preRenderCSSCode(cssToInject) : cssToInject,
                    styleId,
                    injectCode,
                    injectCodeFunction,
                    useStrictCSP,
                });

                const appCode = jsAsset.code;
                jsAsset.code = topExecutionPriorityFlag ? '' : appCode;
                jsAsset.code += cssInjectionCode ? cssInjectionCode.code : '';
                jsAsset.code += !topExecutionPriorityFlag ? '' : appCode;
            }

            cssAssets.forEach(function deleteCSSOutputAssetsFromBundle(cssName) {
                delete bundle[cssName];
            });
        },
    };
}

function extractCssCode(cssAsset: OutputAsset) {
    return typeof cssAsset.source == 'string' ? cssAsset.source.replace(/(\r\n|\n|\r)+$/gm, '') : cssAsset.source;
}

function isJsOutputChunk(chunk: OutputAsset | OutputChunk): boolean {
    return chunk.type == 'chunk' && chunk.fileName.match(/.[cm]?js$/) != null;
}

function defaultJsAssetsFilter(chunk: OutputChunk) {
    return chunk.isEntry && !chunk.fileName.includes('polyfill');
}

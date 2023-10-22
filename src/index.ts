import {
    buildCSSInjectionCode,
    buildJsCssMap,
    clearImportedCssViteMetadataFromBundle,
    globalCssInjection,
    relativeCssInjection,
    removeLinkStyleSheets,
    warnLog,
} from './utils.js';
import type { OutputAsset } from 'rollup';
import type { Plugin, ResolvedConfig } from 'vite';
import type { PluginConfiguration } from './interface';

/**
 * Inject the CSS compiled with JS.
 *
 * @return {Plugin}
 */
export default function cssInjectedByJsPlugin({
    cssAssetsFilterFunction,
    injectCode,
    injectCodeFunction,
    jsAssetsFilterFunction,
    preRenderCSSCode,
    relativeCSSInjection,
    styleId,
    suppressUnusedCssWarning,
    topExecutionPriority,
    useStrictCSP,
}: PluginConfiguration | undefined = {}): Plugin {
    let config: ResolvedConfig;

    const topExecutionPriorityFlag = typeof topExecutionPriority === 'boolean' ? topExecutionPriority : true;

    return {
        apply: 'build',
        enforce: 'post',
        name: 'vite-plugin-css-injected-by-js',
        config(config, env) {
            if (env.command === 'build') {
                if (!config.build) {
                    config.build = {};
                }

                if (relativeCSSInjection === true) {
                    if (config.build.cssCodeSplit === false) {
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
                    cssToInject: typeof preRenderCSSCode === 'function' ? preRenderCSSCode(cssToInject) : cssToInject,
                    styleId,
                    injectCode,
                    injectCodeFunction,
                    useStrictCSP,
                    buildOptions: config.build,
                });

            const cssAssetsFilter = (asset: OutputAsset): boolean => {
                return typeof cssAssetsFilterFunction === 'function' ? cssAssetsFilterFunction(asset) : true;
            };

            const cssAssets = Object.keys(bundle).filter(
                (i) =>
                    bundle[i].type === 'asset' &&
                    bundle[i].fileName.endsWith('.css') &&
                    cssAssetsFilter(bundle[i] as OutputAsset)
            );

            let unusedCssAssets: string[] = [];
            if (relativeCSSInjection) {
                const assetsWithCss = buildJsCssMap(bundle, jsAssetsFilterFunction);
                await relativeCssInjection(bundle, assetsWithCss, buildCssCode, topExecutionPriorityFlag);

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
                await globalCssInjection(
                    bundle,
                    cssAssets,
                    buildCssCode,
                    jsAssetsFilterFunction,
                    topExecutionPriorityFlag
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
    };
}

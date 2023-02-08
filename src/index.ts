import {
    buildCSSInjectionCode,
    buildJsCssMap,
    concatCssAndDeleteFromBundle,
    debugLog,
    getJsAssetTargets,
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
    // Globally so we can add it to legacy and non-legacy bundle.
    let globalCssToInject: string = '';
    let config: ResolvedConfig;

    const topExecutionPriorityFlag = typeof topExecutionPriority == 'boolean' ? topExecutionPriority : true;

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
                let replacedHtml =
                    htmlChunk.source instanceof Uint8Array
                        ? new TextDecoder().decode(htmlChunk.source)
                        : `${htmlChunk.source}`;

                cssAssets.forEach(function replaceLinkedStylesheetsHtml(cssName) {
                    replacedHtml = removeLinkStyleSheets(replacedHtml, cssName);
                    htmlChunk.source = replacedHtml;
                });
            }

            const buildCssCode = (cssToInject: string) =>
                buildCSSInjectionCode({
                    cssToInject: typeof preRenderCSSCode == 'function' ? preRenderCSSCode(cssToInject) : cssToInject,
                    styleId,
                    injectCode,
                    injectCodeFunction,
                    useStrictCSP,
                });

            if (relativeCSSInjection) {
                const assetsWithCss = buildJsCssMap(bundle, jsAssetsFilterFunction);
                await relativeCssInjection(bundle, assetsWithCss, buildCssCode);

                if (!suppressUnusedCssWarning) {
                    // With all used CSS assets now being removed from the bundle, navigate any that have not been linked and output
                    const unusedCssAssets = cssAssets.filter((cssAsset) => !!bundle[cssAsset]).join(',');
                    unusedCssAssets.length > 0 &&
                        warnLog(
                            `[vite-plugin-css-injected-by-js] Some CSS assets were not included in any known JS: ${unusedCssAssets}`
                        );
                }

                return;
            }

            // Non-relative / Global CSS injection path
            const jsAssetTargets = getJsAssetTargets(bundle, jsAssetsFilterFunction);
            if (jsAssetTargets.length == 0) {
                throw new Error(
                    'Unable to locate the JavaScript asset for adding the CSS injection code. It is recommended to review your configurations.'
                );
            }

            process.env.VITE_CSS_INJECTED_BY_JS_DEBUG &&
                debugLog(`[vite-plugin-css-injected-by-js] Global CSS Assets: [${cssAssets.join(',')}]`);
            const allCssCode = concatCssAndDeleteFromBundle(bundle, cssAssets);
            if (allCssCode.length > 0) {
                globalCssToInject = allCssCode;
            }
            const globalCssInjectionCode = await buildCssCode(globalCssToInject);

            for (const jsAsset of jsAssetTargets) {
                process.env.VITE_CSS_INJECTED_BY_JS_DEBUG &&
                    debugLog(`[vite-plugin-css-injected-by-js] Global CSS inject: ${jsAsset.fileName}`);
                const appCode = jsAsset.code;
                jsAsset.code = topExecutionPriorityFlag ? '' : appCode;
                jsAsset.code += globalCssInjectionCode ? globalCssInjectionCode.code : '';
                jsAsset.code += !topExecutionPriorityFlag ? '' : appCode;
            }
        },
    };
}

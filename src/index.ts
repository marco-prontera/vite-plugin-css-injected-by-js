import { buildCSSInjectionCode, debugLog, removeLinkStyleSheets, warnLog } from './utils.js';
import type { OutputAsset, OutputBundle, OutputChunk } from 'rollup';
import type { Plugin, ResolvedConfig } from 'vite';
import type { PluginConfiguration } from './interface';

function extractCssAndDeleteFromBundle(bundle: OutputBundle, cssName: string): string {
    const cssAsset = bundle[cssName] as OutputAsset;
    const cssSource = cssAsset.source;
    delete bundle[cssName];

    // We treat these as strings and coerce them implicitly to strings, explicitly handle conversion
    return cssSource instanceof Uint8Array ? new TextDecoder().decode(cssSource) : `${cssSource}`;
}

function concatCss(bundle: OutputBundle, cssAssets: string[]): string {
    return cssAssets.reduce((previous: string, cssName: string) => {
        return previous + extractCssAndDeleteFromBundle(bundle, cssName);
    }, '');
}

function buildJsCssMap(
    bundle: OutputBundle,
    jsAssetsFilterFunction: PluginConfiguration['jsAssetsFilterFunction']
): Record<string, string[]> {
    const assetsWithCss: Record<string, string[]> = {};
    const filteredBundle = jsAssetsFilterFunction
        ? Object.fromEntries(
              Object.entries(bundle).filter(([_key, chunk]) => isJsOutputChunk(chunk) && jsAssetsFilterFunction(chunk))
          )
        : bundle;
    const bundleKeys = Object.keys(filteredBundle);
    if (bundleKeys.length === 0) {
        throw new Error(
            'Unable to locate the JavaScript asset for adding the CSS injection code. It is recommended to review your configurations.'
        );
    }

    for (const key of bundleKeys) {
        const asset = bundle[key];
        if (asset.type === 'asset' || !asset.viteMetadata || asset.viteMetadata.importedCss.size === 0) {
            continue;
        }

        const assetStyles = assetsWithCss[key] || [];
        assetStyles.push(...asset.viteMetadata.importedCss.values());
        assetsWithCss[key] = assetStyles;
    }

    return assetsWithCss;
}

function getJsAssetTargets(
    bundle: OutputBundle,
    jsAssetsFilterFunction?: PluginConfiguration['jsAssetsFilterFunction']
) {
    const jsAssetTargets: OutputChunk[] = [];
    if (typeof jsAssetsFilterFunction != 'function') {
        const jsAssets = Object.keys(bundle).filter((i) => {
            const asset = bundle[i];
            return isJsOutputChunk(asset) && defaultJsAssetsFilter(asset);
        });

        const jsTargetFileName = jsAssets[jsAssets.length - 1];
        if (jsAssets.length > 1) {
            warnLog(
                `[vite-plugin-css-injected-by-js] has identified "${jsTargetFileName}" as one of the multiple output files marked as "entry" to put the CSS injection code.` +
                    'However, if this is not the intended file to add the CSS injection code, you can use the "jsAssetsFilterFunction" parameter to specify the desired output file (read docs).'
            );
            if (process.env.VITE_CSS_INJECTED_BY_JS_DEBUG) {
                const jsAssetsStr = jsAssets.join(', ');
                debugLog(
                    `[vite-plugin-css-injected-by-js] identified js file targets: ${jsAssetsStr}. Selected "${jsTargetFileName}".\n`
                );
            }
        }

        // This should be always the root of the application
        jsAssetTargets.push(bundle[jsTargetFileName] as OutputChunk);
    } else {
        const jsAssets = Object.keys(bundle).filter(
            (i) => isJsOutputChunk(bundle[i]) && jsAssetsFilterFunction(bundle[i] as OutputChunk)
        );

        jsAssets.forEach((jsAssetKey) => {
            jsAssetTargets.push(bundle[jsAssetKey] as OutputChunk);
        });
    }

    return jsAssetTargets;
}

async function relativeCssInjection(
    bundle: OutputBundle,
    assetsWithCss: Record<string, string[]>,
    buildCssCode: (css: string) => Promise<OutputChunk | null>
): Promise<void> {
    for (const [jsAssetName, cssAssets] of Object.entries(assetsWithCss)) {
        process.env.VITE_CSS_INJECTED_BY_JS_DEBUG &&
            debugLog(`[vite-plugin-css-injected-by-js] Relative CSS: ${jsAssetName}: [${cssAssets.join(',')}]`);
        const assetCss = concatCss(bundle, cssAssets);
        const cssInjectionCode = await buildCssCode(assetCss);

        // We have already filtered these chunks to be RenderedChunks
        const jsAsset = bundle[jsAssetName] as OutputChunk;
        const jsAssetSrc = jsAsset.code;
        let cssInjectedSrc = cssInjectionCode ? cssInjectionCode.code : '';
        cssInjectedSrc += jsAssetSrc;
        jsAsset.code = cssInjectedSrc;
    }
}

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

                cssAssets.forEach((cssName) => {
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
                return;
            }

            const jsAssetTargets = getJsAssetTargets(bundle, jsAssetsFilterFunction);
            if (jsAssetTargets.length == 0) {
                throw new Error(
                    'Unable to locate the JavaScript asset for adding the CSS injection code. It is recommended to review your configurations.'
                );
            }

            process.env.VITE_CSS_INJECTED_BY_JS_DEBUG &&
                debugLog(`[vite-plugin-css-injected-by-js] Global CSS Assets: [${cssAssets.join(',')}]`);
            const allCssCode = concatCss(bundle, cssAssets);
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

function isJsOutputChunk(chunk: OutputAsset | OutputChunk): chunk is OutputChunk {
    return chunk.type == 'chunk' && chunk.fileName.match(/.[cm]?js$/) != null;
}

function defaultJsAssetsFilter(chunk: OutputChunk): boolean {
    return chunk.isEntry && !chunk.fileName.includes('polyfill');
}

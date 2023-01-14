import { buildCSSInjectionCode, removeLinkStyleSheets } from './utils.js';
import { OutputAsset, OutputChunk } from 'rollup';
import { Plugin, ResolvedConfig } from 'vite';
import { PluginConfiguration } from './interface';

/**
 * Inject the CSS compiled with JS.
 *
 * @return {Plugin}
 */
export default function cssInjectedByJsPlugin(
    {
        topExecutionPriority,
        styleId,
        injectCode,
        injectCodeFunction,
        useStrictCSP,
        jsAssetsFilterFunction,
    }: PluginConfiguration | undefined = {
        topExecutionPriority: true,
        styleId: '',
    }
): Plugin {
    //Globally so we can add it to legacy and non-legacy bundle.
    let cssToInject: string = '';
    let config: ResolvedConfig;

    return {
        apply: 'build',
        enforce: 'post',
        name: 'css-in-js-plugin',
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

            const allCssCode = cssAssets.reduce(function extractCssCodeAndDeleteFromBundle(previousValue, cssName) {
                const cssAsset = bundle[cssName] as OutputAsset;
                const cssAssetSource =
                    typeof cssAsset.source == 'string'
                        ? cssAsset.source.replace(/(\r\n|\n|\r)+$/gm, '')
                        : cssAsset.source;
                const result = previousValue + cssAssetSource;
                delete bundle[cssName];

                return result;
            }, '');

            if (allCssCode.length > 0) {
                cssToInject = allCssCode;
            }

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

                // This should be always the root of the application
                jsAssetTargets.push(bundle[jsAssets[jsAssets.length - 1]] as OutputChunk);
            } else {
                const jsAssets = Object.keys(bundle).filter(
                    (i) => isJsOutputChunk(bundle[i]) && jsAssetsFilter(bundle[i] as OutputChunk)
                );

                jsAssets.forEach((jsAssetKey) => {
                    jsAssetTargets.push(bundle[jsAssetKey] as OutputChunk);
                });
            }

            const cssInjectionCode = await buildCSSInjectionCode({
                cssToInject,
                styleId,
                injectCode,
                injectCodeFunction,
                useStrictCSP,
            });

            jsAssetTargets.forEach((jsAsset) => {
                const appCode = jsAsset.code;
                jsAsset.code = topExecutionPriority ? '' : appCode;
                jsAsset.code += cssInjectionCode ? cssInjectionCode.code : '';
                jsAsset.code += !topExecutionPriority ? '' : appCode;
            });
        },
    };
}

function isJsOutputChunk(chunk: OutputAsset | OutputChunk): boolean {
    return chunk.type == 'chunk' && chunk.fileName.match(/.[cm]?js$/) != null;
}

function defaultJsAssetsFilter(chunk: OutputChunk) {
    return chunk.isEntry && !chunk.fileName.includes('polyfill');
}

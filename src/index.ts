import { Plugin, ResolvedConfig } from 'vite';
import { OutputAsset, OutputChunk } from 'rollup';
import { buildCSSInjectionCode, removeLinkStyleSheets } from './utils.js';

/**
 * Inject the CSS compiled with JS.
 *
 * @return {Plugin}
 */
export default function cssInjectedByJsPlugin(
    { topExecutionPriority, styleId }: { topExecutionPriority?: boolean; styleId?: string } | undefined = {
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
            const jsAssets = Object.keys(bundle).filter(
                (i) =>
                    bundle[i].type == 'chunk' &&
                    bundle[i].fileName.match(/.[cm]?js$/) != null &&
                    !bundle[i].fileName.includes('polyfill')
            );

            const allCssCode = cssAssets.reduce(function extractCssCodeAndDeleteFromBundle(previousValue, cssName) {
                const cssAsset = bundle[cssName] as OutputAsset;
                const result = previousValue + cssAsset.source;
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

            const jsAsset = bundle[jsAssets[0]] as OutputChunk;

            const cssInjectionCode = await buildCSSInjectionCode(cssToInject, styleId);
            const appCode = jsAsset.code;
            jsAsset.code = topExecutionPriority ? '' : appCode;
            jsAsset.code += cssInjectionCode ? cssInjectionCode.code : '';
            jsAsset.code += !topExecutionPriority ? '' : appCode;
        },
    };
}

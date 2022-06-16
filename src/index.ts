import { build, Plugin } from 'vite';
import { OutputAsset, OutputChunk } from 'rollup';

/**
 * Inject the CSS compiled with JS.
 *
 * @return {Plugin}
 */
export default function cssInjectedByJsPlugin(
    { topExecutionPriority, styleId } = {
        topExecutionPriority: true,
        styleId: '',
    }
): Plugin {
    //Globally so we can add it to legacy and non-legacy bundle.
    let cssToInject: string = '';

    return {
        apply: 'build',
        enforce: 'post',
        name: 'css-in-js-plugin',
        async generateBundle(opts, bundle) {
            const htmlFiles = Object.keys(bundle).filter((i) => i.endsWith('.html'));
            const cssAssets = Object.keys(bundle).filter((i) => bundle[i].type == 'asset' && bundle[i].fileName.endsWith('.css'));
            const jsAssets = Object.keys(bundle).filter(
                (i) =>
                    bundle[i].type == 'chunk' &&
                    bundle[i].fileName.match(/.[cm]?js$/) != null &&
                    !bundle[i].fileName.includes('polyfill')
            );

            for (const name of htmlFiles) {
                const htmlChunk = bundle[name] as OutputAsset;
                let replacedHtml = htmlChunk.source as string;

                const allCssCode = cssAssets.reduce(function extractCssCodeAndDeleteFromBundle(previousValue, cssName) {
                    const cssAsset = bundle[cssName] as OutputAsset;
                    const result = previousValue + cssAsset.source;
                    delete bundle[cssName];
                    replacedHtml = removeLinkStyleSheets(replacedHtml, cssName);
                    htmlChunk.source = replacedHtml;
                    return result;
                }, '');

                if (allCssCode.length > 0) {
                    cssToInject = allCssCode;
                }
            }

            const jsAsset = bundle[jsAssets[0]] as OutputChunk;

            let topCode: string = '';
            let bottomCode: string = '';
            if (topExecutionPriority) {
                bottomCode = jsAsset.code;
            } else {
                topCode = jsAsset.code;
            }

            jsAsset.code = topCode;
            jsAsset.code += await buildCSSInjectionCode(cssToInject, styleId);
            jsAsset.code += bottomCode;
        },
    };
}

function removeLinkStyleSheets(html: string, cssFileName: string): string {
    const removeCSS = new RegExp(`<link rel="stylesheet"[^>]*?href=".*/${cssFileName}"[^>]*?>`);
    return html.replaceAll(removeCSS, '');
}

const cssInjectedByJsId = '\0vite/all-css';

async function buildCSSInjectionCode(cssToInject: string, styleId: string): Promise<OutputChunk | null> {
    const res = await build({
        root: __dirname,
        configFile: false,
        logLevel: 'error',
        plugins: [singleCSSChunkPlugin(cssToInject, styleId)],
        build: {
            write: false,
            target: 'es2015',
            minify: 'terser',
            assetsDir: '',
            rollupOptions: {
                input: {
                    ['all-css']: cssInjectedByJsId,
                },
                output: {
                    format: 'iife',
                    manualChunks: undefined,
                },
            },
        },
    });
    const _cssChunk = Array.isArray(res) ? res[0] : res;
    if (!('output' in _cssChunk)) return null;

    return _cssChunk.output[0];
}

/**
 * @param {string} cssToInject
 * @param {string|null} styleId
 * @return {Plugin}
 */
function singleCSSChunkPlugin(cssToInject: string, styleId: string | null): Plugin {
    return {
        name: 'vite:single-css-chunk-plugin',
        resolveId(id: string) {
            if (id === cssInjectedByJsId) {
                return id;
            }
        },
        load(id: string) {
            if (id === cssInjectedByJsId) {
                const cssCode = JSON.stringify(cssToInject.trim());

                return `try{var elementStyle = document.createElement('style');${
                    typeof styleId == 'string' && styleId.length > 0 ? 'elementStyle.id = "${styleId}";' : ''
                }elementStyle.appendChild(document.createTextNode(${cssCode}));document.head.appendChild(elementStyle);}catch(e){console.error('vite-plugin-css-injected-by-js', e);}`;
            }
        },
    };
}

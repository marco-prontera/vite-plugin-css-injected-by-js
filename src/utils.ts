import { build, Plugin } from 'vite';
import { OutputChunk } from 'rollup';

interface InjectCodeOptions {
    styleId?: string;
}

export type InjectCode = (cssCode: string, options: InjectCodeOptions) => void;

const cssInjectedByJsId = '\0vite/all-css';

function injectStyleTag(css: string, options: InjectCodeOptions) {
    try {
        if (typeof document != 'undefined') {
            const $style = document.createElement('style');
            if (options.styleId) {
                $style.id = options.styleId;
            }
            $style.appendChild(document.createTextNode(css));
            document.head.appendChild($style);
        }
    } catch (e) {
        console.error('vite-plugin-css-injected-by-js', e);
    }
}

export async function buildCSSInjectionCode(
    cssToInject: string,
    styleId?: string,
    injectCode?: InjectCode
): Promise<OutputChunk | null> {
    const res = await build({
        root: '',
        configFile: false,
        logLevel: 'error',
        plugins: [injectionCSSCodePlugin(cssToInject, styleId, injectCode)],
        build: {
            write: false,
            target: 'es2015',
            minify: 'esbuild',
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
 * @param {InjectCode|null} injectCode
 * @return {Plugin}
 */
function injectionCSSCodePlugin(cssToInject: string, styleId?: string, injectCode?: InjectCode): Plugin {
    return {
        name: 'vite:injection-css-code-plugin',
        resolveId(id: string) {
            if (id == cssInjectedByJsId) {
                return id;
            }
        },
        load(id: string) {
            if (id == cssInjectedByJsId) {
                const cssCode = JSON.stringify(cssToInject.trim());
                const injectFunction = injectCode || injectStyleTag;
                return `(${injectFunction})(${cssCode}, ${JSON.stringify({ styleId })})`;
            }
        },
    };
}

export function removeLinkStyleSheets(html: string, cssFileName: string): string {
    const removeCSS = new RegExp(`<link rel=".*"[^>]*?href=".*/?${cssFileName}"[^>]*?>`);
    return html.replace(removeCSS, '');
}

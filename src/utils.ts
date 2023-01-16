import { build, Plugin } from 'vite';
import { OutputChunk } from 'rollup';
import { BuildCSSInjectionConfiguration } from './interface';

interface InjectCodeOptions {
    styleId?: string;
    useStrictCSP?: boolean;
}

export type InjectCode = (cssCode: string, options: InjectCodeOptions) => string;
export type InjectCodeFunction = (cssCode: string, options: InjectCodeOptions) => void;

const cssInjectedByJsId = '\0vite/all-css';

const defaultInjectCode: InjectCode = (cssCode, { styleId, useStrictCSP }) =>
    `try{if(typeof document != 'undefined'){var elementStyle = document.createElement('style');${
        typeof styleId == 'string' && styleId.length > 0 ? `elementStyle.id = '${styleId}';` : ''
    }${
        useStrictCSP ? `elementStyle.nonce = document.head.querySelector('meta[property=csp-nonce]')?.content;` : ''
    }elementStyle.appendChild(document.createTextNode(${cssCode}));document.head.appendChild(elementStyle);}}catch(e){console.error('vite-plugin-css-injected-by-js', e);}`;

export async function buildCSSInjectionCode({
    cssToInject,
    styleId,
    injectCode,
    injectCodeFunction,
    useStrictCSP,
}: BuildCSSInjectionConfiguration): Promise<OutputChunk | null> {
    const res = await build({
        root: '',
        configFile: false,
        logLevel: 'error',
        plugins: [injectionCSSCodePlugin({ cssToInject, styleId, injectCode, injectCodeFunction, useStrictCSP })],
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

function injectionCSSCodePlugin({
    cssToInject,
    injectCode,
    injectCodeFunction,
    styleId,
    useStrictCSP,
}: BuildCSSInjectionConfiguration): Plugin {
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
                if (injectCodeFunction) {
                    return `(${injectCodeFunction})(${cssCode}, ${JSON.stringify({ styleId, useStrictCSP })})`;
                }
                const injectFunction = injectCode || defaultInjectCode;
                return injectFunction(cssCode, { styleId, useStrictCSP });
            }
        },
    };
}

export function removeLinkStyleSheets(html: string, cssFileName: string): string {
    const removeCSS = new RegExp(`<link rel=".*"[^>]*?href=".*/?${cssFileName}"[^>]*?>`);
    return html.replace(removeCSS, '');
}

export function warnLog(msg: string) {
    console.warn(`\x1b[33m \n${msg} \x1b[39m`);
}

export function debugLog(msg: string) {
    console.debug(`\x1b[34m \n${msg} \x1b[39m`);
}

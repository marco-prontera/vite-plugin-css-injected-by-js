import { build, Plugin } from 'vite';
import type { OutputAsset, OutputBundle, OutputChunk } from 'rollup';
import type { BuildCSSInjectionConfiguration, PluginConfiguration } from './interface';

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

/* istanbul ignore next -- @preserve */
export function warnLog(msg: string) {
    console.warn(`\x1b[33m \n${msg} \x1b[39m`);
}

/* istanbul ignore next -- @preserve */
export function debugLog(msg: string) {
    console.debug(`\x1b[34m \n${msg} \x1b[39m`);
}

function isJsOutputChunk(chunk: OutputAsset | OutputChunk): chunk is OutputChunk {
    return chunk.type == 'chunk' && chunk.fileName.match(/.[cm]?js$/) != null;
}

function defaultJsAssetsFilter(chunk: OutputChunk): boolean {
    return chunk.isEntry && !chunk.fileName.includes('polyfill');
}

export function extractCss(bundle: OutputBundle, cssName: string): string {
    const cssAsset = bundle[cssName] as OutputAsset;
    const cssSource = cssAsset.source;

    // We treat these as strings and coerce them implicitly to strings, explicitly handle conversion
    return cssSource instanceof Uint8Array ? new TextDecoder().decode(cssSource) : `${cssSource}`;
}

export function concatCssAndDeleteFromBundle(bundle: OutputBundle, cssAssets: string[]): string {
    return cssAssets.reduce((previous: string, cssName: string) => {
        const cssSource = extractCss(bundle, cssName);
        delete bundle[cssName];

        return previous + cssSource;
    }, '');
}

export function buildJsCssMap(
    bundle: OutputBundle,
    jsAssetsFilterFunction?: PluginConfiguration['jsAssetsFilterFunction']
): Record<string, string[]> {
    const chunksWithCss: Record<string, string[]> = {};
    const chunkFilter = jsAssetsFilterFunction
        ? (chunk: OutputAsset | OutputChunk) => isJsOutputChunk(chunk) && jsAssetsFilterFunction(chunk)
        : (chunk: OutputAsset | OutputChunk) => isJsOutputChunk(chunk);
    const bundleKeys = Object.entries(bundle)
        .filter(([_key, chunk]) => chunkFilter(chunk))
        .map(([key]) => key);
    if (bundleKeys.length === 0) {
        throw new Error(
            'Unable to locate the JavaScript asset for adding the CSS injection code. It is recommended to review your configurations.'
        );
    }

    for (const key of bundleKeys) {
        const chunk = bundle[key];
        if (chunk.type === 'asset' || !chunk.viteMetadata || chunk.viteMetadata.importedCss.size === 0) {
            continue;
        }

        const chunkStyles = chunksWithCss[key] || [];
        chunkStyles.push(...chunk.viteMetadata.importedCss.values());
        chunksWithCss[key] = chunkStyles;
    }

    return chunksWithCss;
}

export function getJsAssetTargets(
    bundle: OutputBundle,
    jsAssetsFilterFunction?: PluginConfiguration['jsAssetsFilterFunction']
): OutputChunk[] {
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
        return [bundle[jsTargetFileName] as OutputChunk];
    }

    // jsAssetsFilterFunction has been provided
    return Object.values(bundle).filter(
        (chunk): chunk is OutputChunk => isJsOutputChunk(chunk) && jsAssetsFilterFunction(chunk)
    );
}

export async function relativeCssInjection(
    bundle: OutputBundle,
    assetsWithCss: Record<string, string[]>,
    buildCssCode: (css: string) => Promise<OutputChunk | null>
): Promise<void> {
    for (const [jsAssetName, cssAssets] of Object.entries(assetsWithCss)) {
        process.env.VITE_CSS_INJECTED_BY_JS_DEBUG &&
            debugLog(`[vite-plugin-css-injected-by-js] Relative CSS: ${jsAssetName}: [ ${cssAssets.join(',')} ]`);
        const assetCss = concatCssAndDeleteFromBundle(bundle, cssAssets);
        const cssInjectionCode = await buildCssCode(assetCss);

        // We have already filtered these chunks to be RenderedChunks
        const jsAsset = bundle[jsAssetName] as OutputChunk;
        const jsAssetSrc = jsAsset.code;
        let cssInjectedSrc = cssInjectionCode ? cssInjectionCode.code : '';
        cssInjectedSrc += jsAssetSrc;
        jsAsset.code = cssInjectedSrc;
    }
}

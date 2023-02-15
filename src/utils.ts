import { build, Plugin } from 'vite';
import type { OutputAsset, OutputBundle, OutputChunk } from 'rollup';
import type { BuildCSSInjectionConfiguration, CSSInjectionConfiguration, PluginConfiguration } from './interface';

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
    buildOptions,
}: BuildCSSInjectionConfiguration): Promise<OutputChunk | null> {
    let { minify, target } = buildOptions;

    const res = await build({
        root: '',
        configFile: false,
        logLevel: 'error',
        plugins: [injectionCSSCodePlugin({ cssToInject, styleId, injectCode, injectCodeFunction, useStrictCSP })],
        build: {
            write: false,
            target,
            minify,
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
}: CSSInjectionConfiguration): Plugin {
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

// The cache must be global since execution context is different every entry
const cssSourceCache: { [key: string]: string } = {};
export function extractCss(bundle: OutputBundle, cssName: string): string {
    const cssAsset = bundle[cssName] as OutputAsset;

    if (cssAsset !== undefined && cssAsset.source) {
        const cssSource = cssAsset.source;
        // We treat these as strings and coerce them implicitly to strings, explicitly handle conversion
        cssSourceCache[cssName] =
            cssSource instanceof Uint8Array ? new TextDecoder().decode(cssSource) : `${cssSource}`;
    }

    return cssSourceCache[cssName] ?? '';
}

export function concatCssAndDeleteFromBundle(bundle: OutputBundle, cssAssets: string[]): string {
    return cssAssets.reduce(function extractCssAndDeleteFromBundle(previous: string, cssName: string): string {
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

    const bundleKeys = getJsTargetBundleKeys(
        bundle,
        typeof jsAssetsFilterFunction == 'function' ? jsAssetsFilterFunction : () => true
    );
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
        // .reverse() required to fix the imports order
        chunksWithCss[key] = chunkStyles.reverse();
    }

    return chunksWithCss;
}

export function getJsTargetBundleKeys(
    bundle: OutputBundle,
    jsAssetsFilterFunction?: PluginConfiguration['jsAssetsFilterFunction']
): string[] {
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
        return [jsTargetFileName];
    }

    const chunkFilter = ([_key, chunk]: [string, OutputAsset | OutputChunk]) =>
        isJsOutputChunk(chunk) && jsAssetsFilterFunction(chunk);

    return Object.entries(bundle)
        .filter(chunkFilter)
        .map(function extractAssetKeyFromBundleEntry([key]) {
            return key;
        });
}

export async function relativeCssInjection(
    bundle: OutputBundle,
    assetsWithCss: Record<string, string[]>,
    buildCssCode: (css: string) => Promise<OutputChunk | null>,
    topExecutionPriorityFlag: boolean
): Promise<void> {
    for (const [jsAssetName, cssAssets] of Object.entries(assetsWithCss)) {
        process.env.VITE_CSS_INJECTED_BY_JS_DEBUG &&
            debugLog(`[vite-plugin-css-injected-by-js] Relative CSS: ${jsAssetName}: [ ${cssAssets.join(',')} ]`);
        const assetCss = concatCssAndDeleteFromBundle(bundle, cssAssets);
        const cssInjectionCode = assetCss.length > 0 ? (await buildCssCode(assetCss))?.code : '';

        // We have already filtered these chunks to be RenderedChunks
        const jsAsset = bundle[jsAssetName] as OutputChunk;
        jsAsset.code = buildOutputChunkWithCssInjectionCode(
            jsAsset.code,
            cssInjectionCode ?? '',
            topExecutionPriorityFlag
        );
    }
}

// Globally so we can add it to legacy and non-legacy bundle.
let globalCssToInject = '';
export async function globalCssInjection(
    bundle: OutputBundle,
    cssAssets: string[],
    buildCssCode: (css: string) => Promise<OutputChunk | null>,
    jsAssetsFilterFunction: PluginConfiguration['jsAssetsFilterFunction'],
    topExecutionPriorityFlag: boolean
) {
    const jsTargetBundleKeys = getJsTargetBundleKeys(bundle, jsAssetsFilterFunction);
    if (jsTargetBundleKeys.length == 0) {
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
    const globalCssInjectionCode = globalCssToInject.length > 0 ? (await buildCssCode(globalCssToInject))?.code : '';

    for (const jsTargetKey of jsTargetBundleKeys) {
        const jsAsset = bundle[jsTargetKey] as OutputChunk;
        process.env.VITE_CSS_INJECTED_BY_JS_DEBUG &&
            debugLog(`[vite-plugin-css-injected-by-js] Global CSS inject: ${jsAsset.fileName}`);
        jsAsset.code = buildOutputChunkWithCssInjectionCode(
            jsAsset.code,
            globalCssInjectionCode ?? '',
            topExecutionPriorityFlag
        );
    }
}

export function buildOutputChunkWithCssInjectionCode(
    jsAssetCode: string,
    cssInjectionCode: string,
    topExecutionPriorityFlag: boolean
): string {
    const appCode = jsAssetCode.replace(/\/\*.*empty css.*\*\//, '');
    jsAssetCode = topExecutionPriorityFlag ? '' : appCode;
    jsAssetCode += cssInjectionCode;
    jsAssetCode += !topExecutionPriorityFlag ? '' : appCode;

    return jsAssetCode;
}

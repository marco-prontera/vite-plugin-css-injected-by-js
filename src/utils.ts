import { build, Plugin } from 'vite';
import type { OutputAsset, OutputBundle, OutputChunk } from 'rollup';
import type { BuildCSSInjectionConfiguration, CSSInjectionConfiguration, PluginConfiguration } from './interface';
import { v4 as uuidv4 } from 'uuid';

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
    relativeCSSInjection,
}: BuildCSSInjectionConfiguration): Promise<OutputChunk | null> {
    let { minify, target } = buildOptions;

    // Ensures styleId is unique when relativeCSSInjection is enabled
    const generatedStyleId = !relativeCSSInjection ? styleId : `${styleId}-${uuidv4()}`;

    const res = await build({
        root: '',
        configFile: false,
        logLevel: 'error',
        plugins: [injectionCSSCodePlugin({
            cssToInject,
            styleId: generatedStyleId,
            injectCode,
            injectCodeFunction,
            useStrictCSP
        })],
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
    return chunk.type == 'chunk' && chunk.fileName.match(/.[cm]?js(?:\?.+)?$/) != null;
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
        chunksWithCss[key] = chunkStyles;
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

        if (jsAssets.length == 0) {
            return [];
        }

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

const globalCSSCodeEntryCache = new Map();
let previousFacadeModuleId = '';

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
    let cssInjectionCode: string = '';

    if (allCssCode.length > 0) {
        const cssCode = (await buildCssCode(allCssCode))?.code;
        if (typeof cssCode == 'string') {
            cssInjectionCode = cssCode;
        }
    }

    for (const jsTargetKey of jsTargetBundleKeys) {
        const jsAsset = bundle[jsTargetKey] as OutputChunk;

        /**
         * Since it creates the assets once sequential builds for the same entry point
         * (for example when multiple formats of same entry point are built),
         * we need to reuse the same CSS created the first time.
         */
        if (jsAsset.facadeModuleId != null && jsAsset.isEntry && cssInjectionCode != '') {
            if (jsAsset.facadeModuleId != previousFacadeModuleId) {
                globalCSSCodeEntryCache.clear();
            }
            previousFacadeModuleId = jsAsset.facadeModuleId;
            globalCSSCodeEntryCache.set(jsAsset.facadeModuleId, cssInjectionCode);
        }
        if (
            cssInjectionCode == '' &&
            jsAsset.isEntry &&
            jsAsset.facadeModuleId != null &&
            typeof globalCSSCodeEntryCache.get(jsAsset.facadeModuleId) == 'string'
        ) {
            cssInjectionCode = globalCSSCodeEntryCache.get(jsAsset.facadeModuleId);
        }

        process.env.VITE_CSS_INJECTED_BY_JS_DEBUG &&
            debugLog(`[vite-plugin-css-injected-by-js] Global CSS inject: ${jsAsset.fileName}`);
        jsAsset.code = buildOutputChunkWithCssInjectionCode(
            jsAsset.code,
            cssInjectionCode ?? '',
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

    return topExecutionPriorityFlag
      ? `${cssInjectionCode}${appCode}` :
      `${appCode}${cssInjectionCode}`;
}

export function clearImportedCssViteMetadataFromBundle(bundle: OutputBundle, unusedCssAssets: string[]): void {
    // Required to exclude removed files from manifest.json
    for (const key in bundle) {
        const chunk = bundle[key] as OutputChunk;
        if (chunk.viteMetadata && chunk.viteMetadata.importedCss.size > 0) {
            const importedCssFileNames = chunk.viteMetadata.importedCss;
            importedCssFileNames.forEach((importedCssFileName) => {
                if (!unusedCssAssets.includes(importedCssFileName) && chunk.viteMetadata) {
                    chunk.viteMetadata.importedCss = new Set();
                }
            });
        }
    }
}

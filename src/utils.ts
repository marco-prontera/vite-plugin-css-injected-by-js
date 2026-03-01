import { build, Plugin } from 'vite';
import type { OutputAsset, OutputBundle, OutputChunk } from 'rollup';
import type { BuildCSSInjectionConfiguration, CSSInjectionConfiguration, PluginConfiguration } from './interface';

interface InjectCodeOptions {
    useStrictCSP?: boolean;
    attributes?: { [key: string]: string | (() => string) } | undefined;
}

export type InjectCode = (cssCode: string, options: InjectCodeOptions) => string;
export type InjectCodeFunction = (cssCode: string, options: InjectCodeOptions) => void;

const cssInjectedByJsId = '\0vite/all-css';

const defaultInjectCode: InjectCode = (cssCode, { useStrictCSP, attributes }) => {
    let attributesInjection = '';

    for (const attribute in attributes) {
        const attributeValue =
            typeof attributes[attribute] === 'function' ? attributes[attribute]() : attributes[attribute];
        attributesInjection += `elementStyle.setAttribute('${attribute}', '${attributeValue}');`;
    }

    return `try{if(typeof document != 'undefined'){var elementStyle = document.createElement('style');${
        useStrictCSP ? `elementStyle.nonce = document.head.querySelector('meta[property=csp-nonce]')?.content;` : ''
    }${attributesInjection}elementStyle.appendChild(document.createTextNode(${cssCode}));document.head.appendChild(elementStyle);}}catch(e){console.error('vite-plugin-css-injected-by-js', e);}`;
};

export async function buildCSSInjectionCode({
    buildOptions,
    cssToInject,
    injectCode,
    injectCodeFunction,
    injectionCodeFormat = 'iife',
    useStrictCSP,
    attributes,
}: BuildCSSInjectionConfiguration): Promise<OutputChunk | null> {
    let { minify, target } = buildOptions;

    const res = await build({
        root: '',
        configFile: false,
        logLevel: 'error',
        plugins: [
            injectionCSSCodePlugin({
                cssToInject,
                injectCode,
                injectCodeFunction,
                useStrictCSP,
                attributes,
            }),
        ],
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
                    format: injectionCodeFormat,
                },
            },
        },
    });
    const _cssChunk = Array.isArray(res) ? res[0] : res;
    if (!('output' in _cssChunk)) return null;

    return _cssChunk.output[0];
}

export function resolveInjectionCode(
    cssCode: string,
    injectCode: ((cssCode: string, options: InjectCodeOptions) => string) | undefined,
    injectCodeFunction: ((cssCode: string, options: InjectCodeOptions) => void) | undefined,
    { useStrictCSP, attributes }: InjectCodeOptions
) {
    const injectionOptions = { useStrictCSP, attributes };
    if (injectCodeFunction) {
        return `(${injectCodeFunction})(${cssCode}, ${JSON.stringify(injectionOptions)})`;
    }
    const injectFunction = injectCode || defaultInjectCode;
    return injectFunction(cssCode, injectionOptions);
}

function injectionCSSCodePlugin({
    cssToInject,
    injectCode,
    injectCodeFunction,
    useStrictCSP,
    attributes,
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
                return resolveInjectionCode(cssCode, injectCode, injectCodeFunction, { useStrictCSP, attributes });
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
    topExecutionPriorityFlag: boolean,
    buildOptions?: BuildCSSInjectionConfiguration['buildOptions'],
    isVirtualModuleUsed: boolean = false
): Promise<void> {
    for (const [jsAssetName, cssAssets] of Object.entries(assetsWithCss)) {
        process.env.VITE_CSS_INJECTED_BY_JS_DEBUG &&
            debugLog(`[vite-plugin-css-injected-by-js] Relative CSS: ${jsAssetName}: [ ${cssAssets.join(',')} ]`);
        const assetCss = concatCssAndDeleteFromBundle(bundle, cssAssets);
        const cssInjectionCode = assetCss.length > 0 ? (await buildCssCode(assetCss))?.code : '';

        // We have already filtered these chunks to be RenderedChunks
        const jsAsset = bundle[jsAssetName] as OutputChunk;
        injectAndFixMap(
            jsAsset,
            cssInjectionCode ?? '',
            buildOptions,
            topExecutionPriorityFlag,
            bundle,
            isVirtualModuleUsed
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
    topExecutionPriorityFlag: boolean,
    buildOptions?: BuildCSSInjectionConfiguration['buildOptions'],
    isVirtualModuleUsed: boolean = false
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

        injectAndFixMap(jsAsset, cssInjectionCode, buildOptions, topExecutionPriorityFlag, bundle, isVirtualModuleUsed);
        /*jsAsset.code = buildOutputChunkWithCssInjectionCode(
            jsAsset.code,
            cssInjectionCode ?? '',
            topExecutionPriorityFlag
        );*/
    }
}

export function buildOutputChunkWithCssInjectionCode(
    jsAssetCode: string,
    cssInjectionCode: string,
    topExecutionPriorityFlag: boolean
): string {
    const appCode = jsAssetCode.replace(/\/\*\s*empty css\s*\*\//g, '');
    jsAssetCode = topExecutionPriorityFlag ? '' : appCode;
    jsAssetCode += cssInjectionCode;
    jsAssetCode += !topExecutionPriorityFlag ? '' : appCode;

    return jsAssetCode;
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

export function isCSSRequest(request: string): boolean {
    const CSS_LANGS_RE = /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

    return CSS_LANGS_RE.test(request);
}

export function injectAndFixMap(
    chunk: OutputChunk,
    cssInjectionCode: string,
    buildOptions: BuildCSSInjectionConfiguration['buildOptions'] | undefined,
    topExecutionPriority: boolean,
    bundle: OutputBundle,
    isVirtualModuleUsed: boolean = false
) {
    // Always clean up empty CSS placeholder comments.
    chunk.code = chunk.code.replace(/\/\*\s*empty css\s*\*\//g, '');

    if (!cssInjectionCode) return;

    let mapObj: { mappings: string; [k: string]: unknown } | null = null;
    const mapAssetName = chunk.fileName + '.map';
    const mapAsset = bundle[mapAssetName] as OutputAsset | undefined;

    if (buildOptions?.sourcemap && mapAsset?.type === 'asset') {
        try {
            const raw =
                mapAsset.source instanceof Uint8Array
                    ? new TextDecoder().decode(mapAsset.source)
                    : String(mapAsset.source);
            mapObj = JSON.parse(raw);
        } catch (_) {
            /* swallow */
        }
    }

    /**
     * Apply the "Semicolon Shift" (Issue #155 fix):
     * Prepend one `;` to the VLQ `mappings` string to push every existing
     * mapping down by exactly one row – matching the single line we
     * prepended to the chunk code.
     */
    const shiftMap = () => {
        if (mapObj && mapAsset) {
            mapObj.mappings = ';' + mapObj.mappings;
            (mapAsset as OutputAsset).source = JSON.stringify(mapObj);
        }
        if (chunk.map && typeof chunk.map.mappings === 'string') {
            chunk.map.mappings = ';' + chunk.map.mappings;
        }
    };

    if (isVirtualModuleUsed) {
        // Shadow `document.head` inside an IIFE so the user's custom target
        // (e.g. a ShadowRoot passed via injectCSS({ target })) flows into
        // the original injection template without any code-gen changes.
        const patched = cssInjectionCode.replace(/document\.head/g, 'document_head');

        const payload =
            '(function(){' +
            'var _ei=function(_o){' +
            'var _t=(_o&&_o.target)||(typeof document!=="undefined"?document.head:void 0);' +
            'if(!_t)return;' +
            '(function(document_head){' +
            patched +
            '})(_t)' +
            '};' +
            'if(typeof globalThis!=="undefined"){' +
            'if(globalThis.__VITE_CSS_UNLOCKED__){' +
            '_ei(globalThis.__VITE_CSS_INJECT_OPTS__||{});' +
            '}else{' +
            '(globalThis.__VITE_CSS_QUEUE__=globalThis.__VITE_CSS_QUEUE__||[]).push(_ei);' +
            '}' +
            '}' +
            '})();';

        // Flatten any stray newlines from the injection code into one line.
        const singleLine = payload.replace(/\n/g, '');

        chunk.code = singleLine + '\n' + chunk.code;
        shiftMap();
    } else {
        const singleLine = cssInjectionCode.replace(/\n/g, '');

        if (topExecutionPriority) {
            chunk.code = singleLine + '\n' + chunk.code;
            shiftMap();
        } else {
            chunk.code += '\n' + singleLine;
            // No map shift needed when appending to the bottom.
        }
    }
}

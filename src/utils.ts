import { build, Plugin } from 'vite';
import type { OutputAsset, OutputBundle, OutputChunk } from 'rolldown';
import type { BuildCSSInjectionConfiguration, CSSInjectionConfiguration, PluginConfiguration } from './interface.js';

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
                    format: injectionCodeFormat
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
    { styleId, useStrictCSP, attributes }: InjectCodeOptions
): string {
    const injectionOptions = { styleId, useStrictCSP, attributes };
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
export function warnLog(msg: string): void {
    console.warn(`\x1b[33m \n${msg} \x1b[39m`);
}

/* istanbul ignore next -- @preserve */
export function debugLog(msg: string): void {
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
            assetCss,
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
    topExecutionPriorityFlag: boolean
): Promise<void> {
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

        injectAndFixMap(jsAsset, cssInjectionCode, allCssCode, buildOptions, topExecutionPriorityFlag, bundle, isVirtualModuleUsed);
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
    rawCss: string, // NEW PARAMETER
    buildOptions: BuildCSSInjectionConfiguration['buildOptions'] | undefined,
    topExecutionPriority: boolean,
    bundle: OutputBundle,
    isVirtualModuleUsed: boolean = false
) {
    chunk.code = chunk.code.replace(/\/\*\s*empty css\s*\*\//g, '');
    
    // Check both now, since in SSR cssInjectionCode might be empty but rawCss exists
    if (!cssInjectionCode && !rawCss) return;

    let mapObj: { mappings: string; [k: string]: unknown } | null = null;
    const mapAssetName = chunk.fileName + '.map';
    const mapAsset = bundle[mapAssetName] as OutputAsset | undefined;

    if (buildOptions?.sourcemap && mapAsset?.type === 'asset') {
        try { mapObj = JSON.parse(String(mapAsset.source)); } catch (_) {}
    }

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
        const patched = cssInjectionCode ? cssInjectionCode.replace(/document\.head/g, 'document_head') : '';

        // 1. Write the payload as a REAL function for syntax highlighting and linting!
        const payloadTemplate = function() {
            /* SSR Support: Store raw CSS globally */
            if (typeof globalThis !== 'undefined') {
                (globalThis as any).__VITE_CSS_RAW__ = ((globalThis as any).__VITE_CSS_RAW__ || '') + '%%RAW_CSS%%';
            }

            /* DOM Injection Support */
            if (typeof document !== 'undefined' && typeof globalThis !== 'undefined') {
                var executeInject: any = function(options: any) {
                    var target = (options && options.target) || document.head;
                    if (!target) return;

                    executeInject.cache = executeInject.cache || [];
                    
                    for (var i = 0; i < executeInject.cache.length; i++) {
                        if (executeInject.cache[i].target === target) {
                            var els = executeInject.cache[i].elements;
                            for (var j = 0; j < els.length; j++) target.appendChild(els[j]);
                            return; 
                        }
                    }

                    var newElements: any[] = [];
                    var observer = new MutationObserver(function() {});
                    var obsTarget = target.nodeType === 11 ? target : (document.documentElement || document);
                    observer.observe(obsTarget, { childList: true, subtree: true });

                    try {
                        (function(document_head) {
                            // %%PATCHED_CODE%%
                        })(target);
                    } finally {
                        var records = observer.takeRecords();
                        (globalThis as any).__VITE_CSS_ELS__ = (globalThis as any).__VITE_CSS_ELS__ || [];
                        
                        for (var i = 0; i < records.length; i++) {
                            for (var j = 0; j < records[i].addedNodes.length; j++) {
                                var node = records[i].addedNodes[j];
                                newElements.push(node);
                                (globalThis as any).__VITE_CSS_ELS__.push({ target: target, el: node }); 
                            }
                        }
                        observer.disconnect();
                    }

                    executeInject.cache.push({ target: target, elements: newElements });
                };

                (globalThis as any).__VITE_CSS_QUEUE__ = (globalThis as any).__VITE_CSS_QUEUE__ || [];
                (globalThis as any).__VITE_CSS_QUEUE__.push(executeInject);
            }
        };

        // 2. Serialize the function to a string, and replace our placeholders!
        const payload = `(${payloadTemplate.toString()})();`
            .replace("'%%RAW_CSS%%'", JSON.stringify(rawCss || ''))
            .replace('// %%PATCHED_CODE%%', patched);

        const singleLine = payload.replace(/\n/g, '').replace(/\s{2,}/g, ' ');

        // Decision 1: ALWAYS put at the top for virtual module to ensure queue is ready
        chunk.code = singleLine + '\n' + chunk.code;
        shiftMap();
    } else {
        const singleLine = cssInjectionCode.replace(/\n/g, '');

        if (topExecutionPriority) {
            chunk.code = singleLine + '\n' + chunk.code;
            shiftMap();
        } else {
            chunk.code += '\n' + singleLine;
        }
    }
}
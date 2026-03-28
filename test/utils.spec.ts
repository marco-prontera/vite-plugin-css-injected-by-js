import type { OutputAsset, OutputBundle, OutputChunk } from 'rolldown';
import { beforeAll, beforeEach, describe, expect, it, test, vi } from 'vitest';
import type { PluginConfiguration } from '../src/interface';
import {
    buildCSSInjectionCode,
    buildJsCssMap,
    clearImportedCssViteMetadataFromBundle,
    concatCssAndDeleteFromBundle,
    extractCss,
    getJsTargetBundleKeys,
    globalCssInjection,
    injectAndFixMap,
    relativeCssInjection,
    removeLinkStyleSheets,
    isCSSRequest,
} from '../src/utils';

describe('utils', () => {
    describe('isCSSRequest', () => {
        test('should match all extensions supported', () => {
            const extensions = ['css', 'less', 'sass', 'scss', 'styl', 'stylus', 'pcss', 'postcss', 'sss'];

            extensions.forEach((ext) => {
                expect(isCSSRequest('/some/path.' + ext));
            });
        });

        test('should return false when there is no supported extension', () => {
            const extensions = ['ctss', 'ltess', 'satss', 'stcss', 'sttyl', 'stbylus', 'pcrss', 'povstcss', 'sses'];

            extensions.forEach((ext) => {
                expect(isCSSRequest('/some/path.' + ext)).toBe(false);
            });
        });
    });

    describe('buildCSSInjectionCode', () => {
        const onerror = vi.fn();
        window.onerror = onerror;

        beforeAll(() => {
            const $meta = document.createElement('meta');
            $meta.setAttribute('property', 'csp-nonce');
            $meta.setAttribute('content', 'abc-123');
            document.head.prepend($meta);
        });

        test('Generate JS that applies styles', async () => {
            const styleId = `style-${Date.now()}`;
            const output = await buildCSSInjectionCode({
                cssToInject: 'body { color: red; }',
                attributes: {
                    id: styleId,
                },
                buildOptions: { minify: true, target: 'es2015' },
            });

            const $script = document.createElement('script');
            $script.textContent = output?.code || 'throw new Error("UNCAUGHT ERROR")';
            document.head.appendChild($script);

            // Doesn't error
            expect(onerror).not.toBeCalled();

            // StyleId applied
            expect(document.head.querySelector(`style#${styleId}`)).not.toBeNull();

            // Applied style!
            expect(getComputedStyle(document.body).color).toBe('red');
        });

        test('Generate JS that applies styles', async () => {
            const styleId = `style-${Date.now()}`;
            const output = await buildCSSInjectionCode({
                cssToInject: 'body { color: red; }',
                attributes: {
                    id: styleId,
                },
                buildOptions: { minify: true, target: 'es2015' },
            });

            const $script = document.createElement('script');
            $script.textContent = output?.code || 'throw new Error("UNCAUGHT ERROR")';
            document.head.appendChild($script);

            // Doesn't error
            expect(onerror).not.toBeCalled();

            // StyleId applied
            expect(document.head.querySelector(`style#${styleId}`)).not.toBeNull();

            // Applied style!
            expect(getComputedStyle(document.body).color).toBe('red');
        });

        test('Generate JS that applies styles with callback styleID', async () => {
            const styleId = () => `styleId-${Math.random()}`;
            const builds = await Promise.all([
                buildCSSInjectionCode({
                    cssToInject: 'body { color: red; }',
                    attributes: {
                        id: styleId,
                    },
                    buildOptions: { minify: true, target: 'es2015' },
                }),
                buildCSSInjectionCode({
                    cssToInject: 'body { background: blue; }',
                    attributes: {
                        id: styleId,
                    },
                    buildOptions: { minify: true, target: 'es2015' },
                }),
            ]);

            builds?.map((output) => {
                const $script = document.createElement('script');
                $script.textContent = output?.code || 'throw new Error("UNCAUGHT ERROR")';
                document.head.appendChild($script);
            });

            // Doesn't error
            expect(onerror).not.toBeCalled();

            // StyleId applied
            const styles = document.head.querySelectorAll(`style[id^=styleId-]`);

            expect(styles).toHaveLength(2);
            // @ts-ignore Expect unique style ids
            expect([...new Set([...styles].map((style: { id: any }) => style.id))]).toHaveLength(2);

            // Applied style!
            expect(getComputedStyle(document.body).color).toBe('red');
            expect(getComputedStyle(document.body).background).toBe('blue');
        });

        test('Generate JS that applies styles, without styleId', async () => {
            const output = await buildCSSInjectionCode({
                cssToInject: 'body { color: red; }',
                buildOptions: { minify: true, target: 'es2015' },
            });

            const $script = document.createElement('script');
            $script.textContent = output?.code || 'throw new Error("UNCAUGHT ERROR")';
            document.head.appendChild($script);

            // Doesn't error
            expect(onerror).not.toBeCalled();

            // StyleId applied
            expect(document.head.querySelector(`style`)).not.toBeNull();

            // Applied style!
            expect(getComputedStyle(document.body).color).toBe('red');
        });

        test('Generate JS that applies styles, with a nonce', async () => {
            const styleId = `style-${Date.now()}`;
            const output = await buildCSSInjectionCode({
                cssToInject: 'body { color: red; }',
                attributes: {
                    id: styleId,
                },
                useStrictCSP: true,
                buildOptions: { minify: true, target: 'es2015' },
            });

            const $script = document.createElement('script');
            $script.textContent = output?.code || 'throw new Error("UNCAUGHT ERROR")';
            document.head.appendChild($script);

            // Doesn't error
            expect(onerror).not.toBeCalled();

            // StyleId applied
            const $style = document.head.querySelector(`style#${styleId}`);
            expect($style).not.toBeNull();

            // Applied style!
            expect(getComputedStyle(document.body).color).toBe('red');

            // @ts-ignore
            expect($style?.nonce).toBe('abc-123');
        });

        test('Generate JS that applies styles from custom code', async () => {
            const styleId = `style-custom-${Date.now()}`;
            const output = await buildCSSInjectionCode({
                cssToInject: 'body { color: red; }',
                attributes: {
                    id: styleId,
                },
                injectCodeFunction: (css) => {
                    const $style = document.createElement('style');
                    $style.setAttribute('custom-style', '');
                    $style.appendChild(document.createTextNode(css));
                    document.head.appendChild($style);
                },
                buildOptions: { minify: true, target: 'es2015' },
            });

            const $script = document.createElement('script');
            $script.textContent = output?.code || 'throw new Error("UNCAUGHT ERROR")';
            document.head.appendChild($script);

            // Doesn't error
            expect(onerror).not.toBeCalled();

            // Custom attribute added
            expect(document.head.querySelector(`style[custom-style]`)).not.toBeNull();

            // StyleId applied
            expect(document.head.querySelector(`style#${styleId}`)).toBeNull();
        });

        test('Generate JS that applies styles from custom code, with a nonce', async () => {
            const styleId = `style-custom-${Date.now()}`;
            const output = await buildCSSInjectionCode({
                cssToInject: 'body { color: red; }',
                attributes: {
                    id: styleId,
                },
                useStrictCSP: true,
                injectCodeFunction: (css, { attributes }) => {
                    const $style = document.createElement('style');
                    $style.setAttribute('custom-style-strict', '');

                    const nonce = document.querySelector<HTMLMetaElement>('meta[property=csp-nonce]')?.content || '';
                    $style.nonce = nonce;

                    $style.appendChild(document.createTextNode(css));
                    document.head.appendChild($style);
                },
                buildOptions: { minify: true, target: 'es2015' },
            });

            const $script = document.createElement('script');
            $script.textContent = output?.code || 'throw new Error("UNCAUGHT ERROR")';
            document.head.appendChild($script);

            // Doesn't error
            expect(onerror).not.toBeCalled();

            const elem = document.head.querySelector<HTMLStyleElement>(`style[custom-style-strict]`);

            // Custom attribute added
            expect(elem).not.toBeNull();

            // Did we dynamically set the nonce?
            expect(elem?.nonce).toBe('abc-123');
        });
    });

    describe('injectAndFixMap – sourcemap handling', () => {
        function makeChunk(code: string, fileName: string): OutputChunk {
            return {
                preliminaryFileName: '',
                sourcemapFileName: null,
                code,
                dynamicImports: [],
                exports: [],
                facadeModuleId: null,
                fileName,
                implicitlyLoadedBefore: [],
                importedBindings: {},
                imports: [],
                isDynamicEntry: false,
                isEntry: true,
                isImplicitEntry: false,
                map: null,
                moduleIds: [],
                modules: {},
                name: 'test',
                referencedFiles: [],
                type: 'chunk',
                viteMetadata: { importedAssets: new Set(), importedCss: new Set() },
            };
        }

        it('prepends one ";" to mappings when top-priority and sourcemap asset exists', () => {
            const chunk = makeChunk('console.log(1);', 'index.js');
            const originalMappings = 'AAAA,SAAS';
            const bundle: OutputBundle = {
                'index.js': chunk,
                'index.js.map': {
                    fileName: 'index.js.map',
                    name: 'index',
                    needsCodeReference: false,
                    originalFileName: null,
                    source: JSON.stringify({ version: 3, mappings: originalMappings, sources: [], names: [] }),
                    type: 'asset',
                } as unknown as OutputAsset,
            };

            injectAndFixMap(chunk, 'var x=1;', 'var x=1;', { sourcemap: true }, true, bundle, false);

            const map = JSON.parse((bundle['index.js.map'] as OutputAsset).source as string);
            expect(map.mappings).toBe(';' + originalMappings);
            expect(chunk.code.startsWith('var x=1;')).toBe(true);
        });

        it('does NOT shift mappings when appending to bottom (topExecutionPriority = false)', () => {
            const chunk = makeChunk('console.log(1);', 'index.js');
            const originalMappings = 'AAAA,SAAS';
            const bundle: OutputBundle = {
                'index.js': chunk,
                'index.js.map': {
                    fileName: 'index.js.map',
                    name: 'index',
                    needsCodeReference: false,
                    originalFileName: null,
                    source: JSON.stringify({ version: 3, mappings: originalMappings, sources: [], names: [] }),
                    type: 'asset',
                } as unknown as OutputAsset,
            };

            injectAndFixMap(chunk, 'var x=1;', 'var x=1;', { sourcemap: true }, false, bundle, false);

            const map = JSON.parse((bundle['index.js.map'] as OutputAsset).source as string);
            expect(map.mappings).toBe(originalMappings);
            expect(chunk.code.endsWith('\nvar x=1;')).toBe(true);
        });

        it('applies semicolon-shift for virtual module mode regardless of topExecutionPriority', () => {
            const chunk = makeChunk('console.log(1);', 'entry.js');
            const originalMappings = 'EAAE';
            const bundle: OutputBundle = {
                'entry.js': chunk,
                'entry.js.map': {
                    fileName: 'entry.js.map',
                    name: 'entry',
                    needsCodeReference: false,
                    originalFileName: null,
                    source: JSON.stringify({ version: 3, mappings: originalMappings, sources: [], names: [] }),
                    type: 'asset',
                } as unknown as OutputAsset,
            };

            injectAndFixMap(chunk, 'var css="body{color:red}";', 'var css="body{color:red}";', { sourcemap: true }, false, bundle, true);

            const map = JSON.parse((bundle['entry.js.map'] as OutputAsset).source as string);
            expect(map.mappings).toBe(';' + originalMappings);
            // In virtual mode code is always prepended
            expect(chunk.code.indexOf('console.log(1);')).toBeGreaterThan(0);
        });

        it('strips newlines from injected payload so it stays single-line', () => {
            const chunk = makeChunk('console.log(1);', 'bundle.js');
            const bundle: OutputBundle = { 'bundle.js': chunk };
            const multiLineCode = 'var a = 1;\nvar b = 2;\nvar c = 3;';

            injectAndFixMap(chunk, multiLineCode, multiLineCode, undefined, true, bundle, false);

            // The prepended part (before the newline separator) should have no \n
            const prependedPart = chunk.code.split('\n')[0];
            expect(prependedPart).not.toContain('\n');
        });

        it('does nothing when cssInjectionCode is empty', () => {
            const chunk = makeChunk('console.log(1);', 'noop.js');
            const bundle: OutputBundle = { 'noop.js': chunk };

            injectAndFixMap(chunk, '', '', undefined, true, bundle, false);

            expect(chunk.code).toBe('console.log(1);');
        });

        it('cleans /* empty css */ comments even when cssInjectionCode is empty', () => {
            const chunk = makeChunk('/* empty css */console.log(1);/* empty css     */', 'noop.js');
            const bundle: OutputBundle = { 'noop.js': chunk };

            injectAndFixMap(chunk, '', '', undefined, true, bundle, false);

            expect(chunk.code).toBe('console.log(1);');
        });

        it('replaces document.head with document_head in virtual-module payload', () => {
            const chunk = makeChunk('console.log(1);', 'vm.js');
            const bundle: OutputBundle = { 'vm.js': chunk };
            const codeWithHead = 'document.head.appendChild(el);';

            injectAndFixMap(chunk, codeWithHead, '', undefined, true, bundle, true);

            // Verify the original references are shadowed
            expect(chunk.code).toContain('document_head');
            // The raw `document.head.appendChild` should not leak through
            expect(chunk.code).not.toContain('document.head.appendChild');
        });

        it('wraps virtual-module payload with queue/unlock logic', () => {
            const chunk = makeChunk('console.log(1);', 'vm2.js');
            const bundle: OutputBundle = { 'vm2.js': chunk };

            injectAndFixMap(chunk, 'var css="a";', 'var css="a";', undefined, true, bundle, true);

            expect(chunk.code).toContain('__VITE_CSS_QUEUE__');
        });

        it('shifts chunk.map.mappings when the chunk has an inline map object', () => {
            const originalMappings = 'AAAA';
            const chunk = makeChunk('console.log(1);', 'inline.js');
            (chunk as any).map = { version: 3, mappings: originalMappings, sources: [], names: [] };
            const bundle: OutputBundle = { 'inline.js': chunk };

            injectAndFixMap(chunk, 'var z=0;', 'var z=0;', { sourcemap: true }, true, bundle, false);

            expect((chunk.map as any).mappings).toBe(';' + originalMappings);
        });
    });

    describe('removeLinkStyleSheets', () => {
        test('Remove link stylesheets', async () => {
            const htmlGenerate = (cssFileName: string) => `<link rel="stylesheet" href="${cssFileName}">`;
            const cssFileName1 = `foo.css`;
            const cssFileNameDifferent = `bar.css`;

            const tagLinkCssFileName1 = htmlGenerate(cssFileName1);
            const emptyString = removeLinkStyleSheets(tagLinkCssFileName1, cssFileName1);
            expect(emptyString).toEqual('');

            const tagLinkNotChanged = removeLinkStyleSheets(tagLinkCssFileName1, cssFileNameDifferent);
            expect(tagLinkNotChanged).toEqual(tagLinkCssFileName1);
        });
    });

    describe('bundling', () => {
        function generateJsChunk(name: string, importedCss: string[], isEntry: boolean = false): OutputChunk {
            return {
                preliminaryFileName: '',
                sourcemapFileName: null,
                code: name,
                dynamicImports: [],
                exports: [],
                facadeModuleId: null,
                fileName: `${name}.js`,
                implicitlyLoadedBefore: [],
                importedBindings: {},
                imports: [],
                isDynamicEntry: false,
                isEntry: isEntry,
                isImplicitEntry: false,
                map: null,
                moduleIds: [],
                modules: {},
                name: name,
                referencedFiles: [],
                type: 'chunk',
                viteMetadata: { importedAssets: new Set(), importedCss: new Set(importedCss) },
            };
        }

        let bundle: OutputBundle;

        beforeEach(() => {
            bundle = {
                'a.css': {
                    fileName: 'a.css',
                    name: 'a',
                    source: 'a',
                    type: 'asset',
                } as OutputChunk | OutputAsset,
                'b.css': {
                    fileName: 'b.css',
                    name: 'b',
                    source: 'b',
                    type: 'asset',
                } as OutputChunk | OutputAsset,
                'c.css': {
                    fileName: 'c.css',
                    name: 'c',
                    source: 'c',
                    type: 'asset',
                } as OutputChunk | OutputAsset,
                'empty.css': {
                    fileName: 'empty.css',
                    name: 'empty',
                    source: '',
                    type: 'asset',
                } as OutputChunk | OutputAsset,
            };
        });

        describe('extractCss', () => {
            it('should return the specified css source from the bundle', () => {
                const src = extractCss(bundle, 'a.css');

                expect(src).toBeTypeOf('string');
                expect(src).toEqual('a');
            });

            it('should return a string when the asset source contains a buffer', () => {
                const sourceEncodedAsset: OutputAsset = {
                    ...bundle['a.css'],
                    source: new TextEncoder().encode('a'),
                } as OutputAsset;
                bundle['a.css'] = sourceEncodedAsset;

                const src = extractCss(bundle, 'a.css');

                expect(src).toBeTypeOf('string');
                expect(src).toEqual('a');
            });
        });

        describe('concatCssAndDeleteFromBundle', () => {
            it('should concat css sources', () => {
                const initialBundleSize = Object.keys(bundle).length;
                const toConcat = ['a.css', 'c.css'];
                const css = concatCssAndDeleteFromBundle(bundle, toConcat);

                expect(css).toEqual('ac');
                expect(Object.keys(bundle)).toHaveLength(initialBundleSize - toConcat.length);
            });

            it('should remove an extracted css asset from the bundle', () => {
                const bundleKeys = Object.keys(bundle);
                const bundleKeysLength = bundleKeys.length;
                const toExtract = 'a.css';

                concatCssAndDeleteFromBundle(bundle, [toExtract]);

                const reducedBundleKeys = Object.keys(bundle);
                expect(reducedBundleKeys).toHaveLength(bundleKeysLength - 1);
                expect(reducedBundleKeys).not.toContain(toExtract);
                for (const key of bundleKeys.filter((key) => key !== toExtract)) {
                    expect(bundle[key]).toBeDefined();
                }
            });
        });

        describe('buildJsCssMap', () => {
            it('should build a map with a JS assets', () => {
                bundle['a.js'] = generateJsChunk('a', ['a.css']);

                const assetsMap = buildJsCssMap(bundle);

                expect(Object.keys(assetsMap)).toHaveLength(1);
                expect(assetsMap['a.js']).toHaveLength(1);
                expect(assetsMap['a.js']).toContain('a.css');
            });

            it('should build a map of multiple JS assets', () => {
                bundle['a.js'] = generateJsChunk('a', ['a.css']);
                bundle['c.js'] = generateJsChunk('c', ['c.css']);

                const assetsMap = buildJsCssMap(bundle);

                expect(Object.keys(assetsMap)).toHaveLength(2);
                expect(assetsMap['a.js']).toHaveLength(1);
                expect(assetsMap['a.js']).toContain('a.css');
                expect(assetsMap['b.js']).toBeUndefined();
                expect(assetsMap['c.js']).toHaveLength(1);
                expect(assetsMap['c.js']).toContain('c.css');
            });

            it('should build a map of multiple JS assets with shared css', () => {
                bundle['a.js'] = generateJsChunk('a', ['a.css']);
                bundle['c.js'] = generateJsChunk('c', ['a.css', 'c.css']);

                const assetsMap = buildJsCssMap(bundle);

                expect(Object.keys(assetsMap)).toHaveLength(2);
                expect(assetsMap['a.js']).toHaveLength(1);
                expect(assetsMap['a.js']).toContain('a.css');
                expect(assetsMap['b.js']).toBeUndefined();
                expect(assetsMap['c.js']).toHaveLength(2);
                expect(assetsMap['c.js'][0]).toEqual('a.css');
                expect(assetsMap['c.js'][1]).toEqual('c.css');
            });

            it('should build a map with a customer filter', () => {
                const filter: PluginConfiguration['jsAssetsFilterFunction'] = (chunk: OutputChunk) =>
                    chunk.fileName === 'c.js';

                bundle['a.js'] = generateJsChunk('a', ['a.css']);
                bundle['b.js'] = generateJsChunk('b', ['b.css']);
                bundle['c.js'] = generateJsChunk('c', ['c.css']);

                const assetsMap = buildJsCssMap(bundle, filter);

                expect(Object.keys(assetsMap)).toHaveLength(1);
                expect(assetsMap['a.js']).toBeUndefined();
                expect(assetsMap['b.js']).toBeUndefined();
                expect(assetsMap['c.js']).toHaveLength(1);
                expect(assetsMap['c.js']).toContain('c.css');
            });

            // Ideally this would never happen, better safe than sorry
            it('should skip chunks that do not contain vite metadata', () => {
                bundle['a.js'] = generateJsChunk('a', ['a.css']);
                bundle['c.js'] = generateJsChunk('c', ['c.css']);
                delete (bundle['c.js'] as any)['viteMetadata'];

                const assetsMap = buildJsCssMap(bundle);

                expect(Object.keys(assetsMap)).toHaveLength(1);
                expect(assetsMap['a.js']).toHaveLength(1);
                expect(assetsMap['a.js']).toContain('a.css');
                expect(assetsMap['b.js']).toBeUndefined();
                // `c.js` should now be skipped as it does not contain the required metadata
                expect(assetsMap['c.js']).toBeUndefined();
            });

            it('should throw when a filter fails to find a key', () => {
                const filter: PluginConfiguration['jsAssetsFilterFunction'] = (chunk: OutputChunk) =>
                    chunk.name === 'cake-town';

                expect(() => buildJsCssMap(bundle, filter)).toThrowError(
                    'Unable to locate the JavaScript asset for adding the CSS injection code. It is recommended to review your configurations.'
                );
            });
        });

        describe('getJsTargetBundleKeys', () => {
            it('should select the entrypoint as the target', () => {
                bundle['a.js'] = generateJsChunk('a', ['a.css']);
                bundle['b.js'] = generateJsChunk('b', ['b.css']);
                bundle['b.js'].isEntry = true;
                bundle['c.js'] = generateJsChunk('c', ['c.css']);

                const target = getJsTargetBundleKeys(bundle);
                expect(target).toHaveLength(1);
                expect(target[0]).toStrictEqual('b.js');
            });

            it('should log a warning if there are multiple entrypoints, and take the last entrypoint', () => {
                const logWarnSpy = vi.spyOn(console, 'warn');

                bundle['a.js'] = generateJsChunk('a', ['a.css']);
                bundle['a.js'].isEntry = true;
                bundle['b.js'] = generateJsChunk('b', ['b.css']);
                bundle['b.js'].isEntry = true;
                bundle['c.js'] = generateJsChunk('c', ['c.css']);
                bundle['c.js'].isEntry = true;

                const target = getJsTargetBundleKeys(bundle);
                expect(target).toHaveLength(1);
                expect(target[0]).toStrictEqual('c.js');
                expect(logWarnSpy).toHaveBeenCalledOnce();
            });

            it('should use a filter to select the target entrypoint', () => {
                const filter: PluginConfiguration['jsAssetsFilterFunction'] = (chunk: OutputChunk) =>
                    chunk.fileName === 'a.js';

                bundle['a.js'] = generateJsChunk('a', ['a.css']);
                bundle['b.js'] = generateJsChunk('b', ['b.css']);
                bundle['b.js'].isEntry = true;
                bundle['c.js'] = generateJsChunk('c', ['c.css']);

                const target = getJsTargetBundleKeys(bundle, filter);
                expect(target).toHaveLength(1);
                expect(target[0]).toStrictEqual('a.js');
            });
        });

        describe('relativeCssInjection', () => {
            async function buildCssCodeMock(css: string): Promise<OutputChunk> {
                return {
                    code: css,
                } as OutputChunk;
            }

            it('should inject the relevant css for a single file', async () => {
                bundle['a.js'] = generateJsChunk('a', ['a.css']);

                expect(bundle['a.js'].code).toEqual('a');

                await relativeCssInjection(bundle, buildJsCssMap(bundle), buildCssCodeMock, true);
                expect(bundle['a.js'].code).toEqual('a\na');
            });

            it('should inject the relevant multiple css for a single file', async () => {
                bundle['a.js'] = generateJsChunk('a', ['a.css', 'c.css']);

                expect(bundle['a.js'].code).toEqual('a');

                await relativeCssInjection(bundle, buildJsCssMap(bundle), buildCssCodeMock, true);
                expect(bundle['a.js'].code).toEqual('ac\na');
            });

            it('should inject the relevant css for every file', async () => {
                bundle['a.js'] = generateJsChunk('a', ['c.css']);
                bundle['b.js'] = generateJsChunk('b', ['a.css']);
                bundle['c.js'] = generateJsChunk('c', ['b.css']);

                expect(bundle['a.js'].code).toEqual('a');
                expect(bundle['b.js'].code).toEqual('b');
                expect(bundle['c.js'].code).toEqual('c');

                await relativeCssInjection(bundle, buildJsCssMap(bundle), buildCssCodeMock, true);
                expect(bundle['a.js'].code).toEqual('c\na');
                expect(bundle['b.js'].code).toEqual('a\nb');
                expect(bundle['c.js'].code).toEqual('b\nc');
            });

            it('should inject the relevant css for only files with css', async () => {
                bundle['a.js'] = generateJsChunk('a', ['a.css']);
                bundle['b.js'] = generateJsChunk('b', []);
                bundle['c.js'] = generateJsChunk('c', ['c.css']);

                expect(bundle['a.js'].code).toEqual('a');
                expect(bundle['b.js'].code).toEqual('b');
                expect(bundle['c.js'].code).toEqual('c');

                await relativeCssInjection(bundle, buildJsCssMap(bundle), buildCssCodeMock, true);
                expect(bundle['a.js'].code).toEqual('a\na');
                expect(bundle['b.js'].code).toEqual('b'); // no css stitched in
                expect(bundle['c.js'].code).toEqual('c\nc');
            });

            it('should skip empty css injection', async () => {
                const cssAssets = ['empty.css'];
                bundle['a.js'] = generateJsChunk('a', cssAssets, true);

                await relativeCssInjection(bundle, buildJsCssMap(bundle), buildCssCodeMock, true);

                expect(bundle['a.js'].code).toEqual('a');
            });

            it('should remove occurrences of /* empty css */ from the bundled code', async () => {
                bundle['a.js'] = generateJsChunk('a', ['a.css']);
                bundle['a.js'].code = `/* empty css */${bundle['a.js'].code}/* empty css     */`;
                await relativeCssInjection(bundle, buildJsCssMap(bundle), buildCssCodeMock, true);

                expect(bundle['a.js'].code).toEqual('a\na');
            });
        });

        describe('globalCssInjection', () => {
            async function buildCssCodeMock(css: string): Promise<OutputChunk> {
                return {
                    code: css,
                } as OutputChunk;
            }

            it('should skip empty css injection', async () => {
                const cssAssets = ['empty.css'];
                bundle['a.js'] = generateJsChunk('a', cssAssets, true);

                await globalCssInjection(bundle, cssAssets, buildCssCodeMock, undefined, true);

                expect(bundle['a.js'].code).toEqual('a');
            });

            it('should inject all css', async () => {
                const cssAssets = ['a.css', 'b.css', 'c.css'];
                bundle['a.js'] = generateJsChunk('a', cssAssets, true);

                await globalCssInjection(bundle, cssAssets, buildCssCodeMock, undefined, true);

                expect(bundle['a.js'].code).toEqual('abc\na');
            });

            it('should remove occurrences of /* empty css */ from the bundled code', async () => {
                const cssAssets = ['a.css', 'b.css', 'c.css'];
                bundle['a.js'] = generateJsChunk('a', cssAssets, true);
                bundle['a.js'].code = `/* empty css */${bundle['a.js'].code}/* empty css     */`;

                await globalCssInjection(bundle, cssAssets, buildCssCodeMock, undefined, true);

                expect(bundle['a.js'].code).toEqual('abc\na');
            });

            it('should inject all css should throw if no entry is available', async () => {
                const cssAssets = ['a.css', 'b.css', 'c.css'];
                bundle['a.js'] = generateJsChunk('a', cssAssets, false);

                try {
                    await globalCssInjection(bundle, cssAssets, buildCssCodeMock, undefined, true);
                } catch (e) {
                    // @ts-ignore
                    expect(e.message).toEqual(
                        'Unable to locate the JavaScript asset for adding the CSS injection code. It is recommended to review your configurations.'
                    );
                }
            });
        });

        describe('manifest.json clear viteMetadata', () => {
            it('should not remove ununsedCssAssets', () => {
                const bundle = {
                    'chunk-1.js': generateJsChunk('style', ['style.css']),
                    'chunk-2.js': generateJsChunk('style', ['style.css']),
                };
                const unusedCssAssets = ['style.css'];

                clearImportedCssViteMetadataFromBundle(bundle, unusedCssAssets);

                const chunk1 = bundle['chunk-1.js'] as OutputChunk;
                const chunk2 = bundle['chunk-2.js'] as OutputChunk;
                expect(chunk1?.viteMetadata?.importedCss.size).toBe(1);
                expect(chunk2?.viteMetadata?.importedCss.size).toBe(1);
            });

            it('should remove all importedCss', () => {
                const bundle: OutputBundle = {
                    'chunk-1.js': generateJsChunk('style', ['style.css', 'style1.css', 'style2.css']),
                    'chunk-2.js': generateJsChunk('style', ['style.css']),
                };
                const unusedCssAssets: string[] = [];

                clearImportedCssViteMetadataFromBundle(bundle, unusedCssAssets);
                const chunk1 = bundle['chunk-1.js'] as OutputChunk;
                const chunk2 = bundle['chunk-2.js'] as OutputChunk;
                expect(chunk1?.viteMetadata?.importedCss.size).toBe(0);
                expect(chunk2?.viteMetadata?.importedCss.size).toBe(0);
            });
        });
    });
});

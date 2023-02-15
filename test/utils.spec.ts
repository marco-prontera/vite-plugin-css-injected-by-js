import type { OutputAsset, OutputBundle, OutputChunk } from 'rollup';
import { beforeAll, beforeEach, describe, expect, it, test, vi } from 'vitest';
import type { PluginConfiguration } from '../src/interface';
import {
    buildCSSInjectionCode,
    buildJsCssMap,
    concatCssAndDeleteFromBundle,
    extractCss,
    getJsTargetBundleKeys,
    globalCssInjection,
    relativeCssInjection,
    removeLinkStyleSheets,
} from '../src/utils';

describe('utils', () => {
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
                styleId,
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
                styleId,
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
                styleId,
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
                styleId,
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
                styleId,
                useStrictCSP: true,
                injectCodeFunction: (css, { styleId }) => {
                    const $style = document.createElement('style');
                    $style.setAttribute('custom-style-strict', '');

                    const nonce = document.querySelector<HTMLMetaElement>('meta[property=csp-nonce]')?.content;
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
                },
                'b.css': {
                    fileName: 'b.css',
                    name: 'b',
                    source: 'b',
                    type: 'asset',
                },
                'c.css': {
                    fileName: 'c.css',
                    name: 'c',
                    source: 'c',
                    type: 'asset',
                },
                'empty.css': {
                    fileName: 'empty.css',
                    name: 'empty',
                    source: '',
                    type: 'asset',
                },
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

            it('should build a map of multiple JS assets with shared css should reverse css imports', () => {
                bundle['a.js'] = generateJsChunk('a', ['a.css']);
                bundle['c.js'] = generateJsChunk('c', ['a.css', 'c.css']);

                const assetsMap = buildJsCssMap(bundle);

                expect(Object.keys(assetsMap)).toHaveLength(2);
                expect(assetsMap['a.js']).toHaveLength(1);
                expect(assetsMap['a.js']).toContain('a.css');
                expect(assetsMap['b.js']).toBeUndefined();
                expect(assetsMap['c.js']).toHaveLength(2);
                expect(assetsMap['c.js'][0]).toEqual('c.css');
                expect(assetsMap['c.js'][1]).toEqual('a.css');
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
                expect(bundle['a.js'].code).toEqual('aa');
            });

            it('should inject the relevant multiple css for a single file', async () => {
                bundle['a.js'] = generateJsChunk('a', ['a.css', 'c.css']);

                expect(bundle['a.js'].code).toEqual('a');

                await relativeCssInjection(bundle, buildJsCssMap(bundle), buildCssCodeMock, true);
                expect(bundle['a.js'].code).toEqual('caa');
            });

            it('should inject the relevant css for every file', async () => {
                bundle['a.js'] = generateJsChunk('a', ['c.css']);
                bundle['b.js'] = generateJsChunk('b', ['a.css']);
                bundle['c.js'] = generateJsChunk('c', ['b.css']);

                expect(bundle['a.js'].code).toEqual('a');
                expect(bundle['b.js'].code).toEqual('b');
                expect(bundle['c.js'].code).toEqual('c');

                await relativeCssInjection(bundle, buildJsCssMap(bundle), buildCssCodeMock, true);
                expect(bundle['a.js'].code).toEqual('ca');
                expect(bundle['b.js'].code).toEqual('ab');
                expect(bundle['c.js'].code).toEqual('bc');
            });

            it('should inject the relevant css for only files with css', async () => {
                bundle['a.js'] = generateJsChunk('a', ['a.css']);
                bundle['b.js'] = generateJsChunk('b', []);
                bundle['c.js'] = generateJsChunk('c', ['c.css']);

                expect(bundle['a.js'].code).toEqual('a');
                expect(bundle['b.js'].code).toEqual('b');
                expect(bundle['c.js'].code).toEqual('c');

                await relativeCssInjection(bundle, buildJsCssMap(bundle), buildCssCodeMock, true);
                expect(bundle['a.js'].code).toEqual('aa');
                expect(bundle['b.js'].code).toEqual('b'); // no css stitched in
                expect(bundle['c.js'].code).toEqual('cc');
            });

            it('should skip empty css injection', async () => {
                const cssAssets = ['empty.css'];
                bundle['a.js'] = generateJsChunk('a', cssAssets, true);

                await relativeCssInjection(bundle, buildJsCssMap(bundle), buildCssCodeMock, true);

                expect(bundle['a.js'].code).toEqual('a');
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

                expect(bundle['a.js'].code).toEqual('abca');
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
    });
});

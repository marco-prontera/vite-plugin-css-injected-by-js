import type { OutputAsset, OutputBundle, OutputChunk } from 'rollup';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildJsCssMap, concatCss, extractCssAndDeleteFromBundle, getJsAssetTargets } from '../src/index';
import type { PluginConfiguration } from '../src/interface';

describe('css-injected-by-js', () => {
    function generateJsChunk(name: string, importedCss: string[]): OutputChunk {
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
            isEntry: false,
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
        };
    });

    describe('extractCssAndDeleteFromBundle', () => {
        it('should return the specified css source from the bundle', () => {
            const src = extractCssAndDeleteFromBundle(bundle, 'a.css');

            expect(src).toBeTypeOf('string');
            expect(src).toEqual('a');
        });

        it('should remove an extracted css asset from the bundle', () => {
            const bundleKeys = Object.keys(bundle);
            const bundleKeysLength = bundleKeys.length;
            const toExtract = 'a.css';

            extractCssAndDeleteFromBundle(bundle, toExtract);

            const reducedBundleKeys = Object.keys(bundle);
            expect(reducedBundleKeys).toHaveLength(bundleKeysLength - 1);
            expect(reducedBundleKeys).not.toContain(toExtract);
            for (const key of bundleKeys.filter((key) => key !== toExtract)) {
                expect(bundle[key]).toBeDefined();
            }
        });

        it('should return a string when the asset source contains a buffer', () => {
            const sourceEncodedAsset: OutputAsset = {
                ...bundle['a.css'],
                source: new TextEncoder().encode('a'),
            } as OutputAsset;
            bundle['a.css'] = sourceEncodedAsset;

            const src = extractCssAndDeleteFromBundle(bundle, 'a.css');

            expect(src).toBeTypeOf('string');
            expect(src).toEqual('a');
        });
    });

    describe('concatCss', () => {
        it('should concat css sources', () => {
            const initialBundleSize = Object.keys(bundle).length;
            const toConcat = ['a.css', 'c.css'];
            const css = concatCss(bundle, toConcat);

            expect(css).toEqual('ac');
            // Only assert numbers here, removal validity tested in `extractCssAndDeleteFromBundle` tests.
            expect(Object.keys(bundle)).toHaveLength(initialBundleSize - toConcat.length);
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

    describe('getJsAssetTargets', () => {
        it('should select the entrypoint as the target', () => {
            bundle['a.js'] = generateJsChunk('a', ['a.css']);
            bundle['b.js'] = generateJsChunk('b', ['b.css']);
            bundle['b.js'].isEntry = true;
            bundle['c.js'] = generateJsChunk('c', ['c.css']);

            const target = getJsAssetTargets(bundle);
            expect(target).toHaveLength(1);
            expect(target[0]).toStrictEqual(bundle['b.js']);
        });

        it('should log a warning if there are multiple entrypoints, and take the last entrypoint', () => {
            const logWarnSpy = vi.spyOn(console, 'warn');

            bundle['a.js'] = generateJsChunk('a', ['a.css']);
            bundle['a.js'].isEntry = true;
            bundle['b.js'] = generateJsChunk('b', ['b.css']);
            bundle['b.js'].isEntry = true;
            bundle['c.js'] = generateJsChunk('c', ['c.css']);
            bundle['c.js'].isEntry = true;

            const target = getJsAssetTargets(bundle);
            expect(target).toHaveLength(1);
            expect(target[0]).toStrictEqual(bundle['c.js']);
            expect(logWarnSpy).toHaveBeenCalledOnce();
        });

        it('should use a filter to select the target entrypoint', () => {
            const filter: PluginConfiguration['jsAssetsFilterFunction'] = (chunk: OutputChunk) =>
                chunk.fileName === 'a.js';

            bundle['a.js'] = generateJsChunk('a', ['a.css']);
            bundle['b.js'] = generateJsChunk('b', ['b.css']);
            bundle['b.js'].isEntry = true;
            bundle['c.js'] = generateJsChunk('c', ['c.css']);

            const target = getJsAssetTargets(bundle, filter);
            expect(target).toHaveLength(1);
            expect(target[0]).toStrictEqual(bundle['a.js']);
        });
    });
});

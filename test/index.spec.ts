import type { OutputAsset, OutputBundle } from 'rollup';
import { beforeEach, describe, expect, it } from 'vitest';

import { concatCss, extractCssAndDeleteFromBundle } from '../src/index';

describe('css-injected-by-js', () => {
    let bundle: OutputBundle;

    beforeEach(() => {
        bundle = {
            'a.css': {
                fileName: 'a.css',
                name: 'a.css',
                source: 'a',
                type: 'asset',
            },
            'b.css': {
                fileName: 'b.css',
                name: 'b.css',
                source: 'b',
                type: 'asset',
            },
            'c.css': {
                fileName: 'c.css',
                name: 'c.css',
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
});

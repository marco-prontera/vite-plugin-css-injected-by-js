// @vitest-environment node
import { execFile } from 'child_process';
import { access, readdir, writeFile } from 'fs/promises';
import type { OutputAsset, OutputChunk, RolldownOutput } from 'rolldown';
import path from 'path';
import { build } from 'vite';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { describe, expect, it } from 'vitest';
import cssInjectedByJsPlugin from '../../src/index';
import { createFixtureFromTemplate } from '../fixture-utils';

const runIntegration = process.env.INTEGRATION === '1' || process.env.INTEGRATION === 'true';
const describeIntegration = runIntegration ? describe.sequential : describe.skip;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const execFileAsync = promisify(execFile);

function normalizeOutput(result: RolldownOutput | RolldownOutput[]): RolldownOutput {
    return Array.isArray(result) ? result[0] : result;
}

function assetSourceToString(source: OutputAsset['source']): string {
    return source instanceof Uint8Array ? new TextDecoder().decode(source) : `${source}`;
}

function getCssAssets(output: RolldownOutput['output']): OutputAsset[] {
    return output.filter(
        (item): item is OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css')
    );
}

function getHtmlAssets(output: RolldownOutput['output']): OutputAsset[] {
    return output.filter(
        (item): item is OutputAsset => item.type === 'asset' && item.fileName.endsWith('.html')
    );
}

function getEntryChunks(output: RolldownOutput['output']): OutputChunk[] {
    return output.filter((item): item is OutputChunk => item.type === 'chunk' && item.isEntry);
}

async function buildFixture({
    root,
    input,
    pluginOptions,
    cssCodeSplit,
}: {
    root: string;
    input: string | Record<string, string>;
    pluginOptions?: Parameters<typeof cssInjectedByJsPlugin>[0];
    cssCodeSplit?: boolean;
}): Promise<RolldownOutput['output']> {
    const normalizeInput = (value: string) => path.relative(root, value);
    const normalizedInput =
        typeof input === 'string'
            ? normalizeInput(input)
            : Object.fromEntries(Object.entries(input).map(([key, value]) => [key, normalizeInput(value)]));

    const previousCwd = process.cwd();
    process.chdir(root);

    try {
        const result = await build({
            root: '.',
            configFile: false,
            logLevel: 'silent',
            plugins: cssInjectedByJsPlugin(pluginOptions),
            build: {
                write: false,
                minify: false,
                cssCodeSplit: cssCodeSplit ?? true,
                rollupOptions: {
                    input: normalizedInput,
                },
            },
        });

        const output = normalizeOutput(result).output;
        return output;
    } finally {
        process.chdir(previousCwd);
    }
}

describeIntegration('fixture templates', () => {
    it('builds basic fixture and injects css', async () => {
        const fixture = await createFixtureFromTemplate('basic');

        try {
            const output = await buildFixture({
                root: fixture.root,
                input: path.resolve(fixture.root, 'index.html'),
            });

            expect(getCssAssets(output)).toHaveLength(0);

            const html = getHtmlAssets(output).map((asset) => assetSourceToString(asset.source)).join('\n');
            expect(html).not.toContain('rel="stylesheet"');

            const entryChunk = getEntryChunks(output)[0];
            expect(entryChunk).toBeDefined();
            expect(entryChunk.code).toContain('basic-entry');
        } finally {
            await fixture.cleanup();
        }
    });

    it('builds multiple entry fixture with relative injection', async () => {
        const fixture = await createFixtureFromTemplate('multiple-entry');

        try {
            const output = await buildFixture({
                root: fixture.root,
                input: {
                    main: path.resolve(fixture.root, 'index.html'),
                    nested: path.resolve(fixture.root, 'nested/index.html'),
                },
                pluginOptions: { relativeCSSInjection: true },
                cssCodeSplit: true,
            });

            expect(getCssAssets(output)).toHaveLength(0);

            const html = getHtmlAssets(output).map((asset) => assetSourceToString(asset.source)).join('\n');
            expect(html).not.toContain('rel="stylesheet"');

            const entryChunks = getEntryChunks(output);
            expect(entryChunks.length).toBeGreaterThanOrEqual(2);

            const mainChunk = entryChunks.find((chunk) => chunk.code.includes('main-entry'));
            const nestedChunk = entryChunks.find((chunk) => chunk.code.includes('nested-entry'));

            expect(mainChunk).toBeDefined();
            expect(nestedChunk).toBeDefined();
        } finally {
            await fixture.cleanup();
        }
    });

    it('builds dynamic import fixture and injects all css', async () => {
        const fixture = await createFixtureFromTemplate('dynamic-import');

        try {
            const output = await buildFixture({
                root: fixture.root,
                input: path.resolve(fixture.root, 'index.html'),
            });

            expect(getCssAssets(output)).toHaveLength(0);

            const entryChunk = getEntryChunks(output)[0];
            expect(entryChunk).toBeDefined();
            expect(entryChunk.code).toContain('base-entry');
            expect(entryChunk.code).toContain('dynamic-entry');
        } finally {
            await fixture.cleanup();
        }
    });

    it('builds shadow support fixture with inline css', async () => {
        const fixture = await createFixtureFromTemplate('shadow');

        try {
            const output = await buildFixture({
                root: fixture.root,
                input: path.resolve(fixture.root, 'index.html'),
            });

            expect(getCssAssets(output)).toHaveLength(0);

            const html = getHtmlAssets(output).map((asset) => assetSourceToString(asset.source)).join('\n');
            expect(html).not.toContain('rel="stylesheet"');

            const entryChunk = getEntryChunks(output)[0];
            expect(entryChunk).toBeDefined();
            expect(entryChunk.code).toContain('shadow-entry');
            expect(entryChunk.code).toContain('shadow-inline-css');
        } finally {
            await fixture.cleanup();
        }
    });
});

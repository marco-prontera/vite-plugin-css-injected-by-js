// @vitest-environment node
import { execFile } from 'child_process';
import { access, readFile, readdir, writeFile } from 'fs/promises';
import type { OutputAsset, OutputChunk, RollupOutput } from 'rollup';
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

function normalizeOutput(result: RollupOutput | RollupOutput[]): RollupOutput {
    return Array.isArray(result) ? result[0] : result;
}

function assetSourceToString(source: OutputAsset['source']): string {
    return source instanceof Uint8Array ? new TextDecoder().decode(source) : `${source}`;
}

function getCssAssets(output: RollupOutput['output']): OutputAsset[] {
    return output.filter(
        (item): item is OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css')
    );
}

function getHtmlAssets(output: RollupOutput['output']): OutputAsset[] {
    return output.filter(
        (item): item is OutputAsset => item.type === 'asset' && item.fileName.endsWith('.html')
    );
}

function getEntryChunks(output: RollupOutput['output']): OutputChunk[] {
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
}): Promise<RollupOutput['output']> {
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

async function writeFixtureViteConfig(root: string): Promise<void> {
    const configContents = `
    import { defineConfig } from 'vite'
    import cssInjectedByJsPlugin from '${path.resolve(__dirname, '../../dist/esm/index.js')}'

    export default defineConfig({
    plugins: [
        cssInjectedByJsPlugin(),
    ],
    })`;

    await writeFile(path.join(root, 'vite.config.cjs'), configContents);
}

async function runFixtureViteBuild(root: string): Promise<void> {
    const viteScript = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
    await execFileAsync(process.execPath, [viteScript, 'build'], { cwd: root });
}

async function findAssetFiles(distRoot: string, extension: string): Promise<string[]> {
    const assetsRoot = path.join(distRoot, 'assets');
    try {
        await access(assetsRoot);
    } catch {
        return [];
    }

    const entries = await readdir(assetsRoot, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
        .map((entry) => path.join(assetsRoot, entry.name));
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

    it(
        'builds basic fixture with rolldown package json',
        async () => {
        const fixture = await createFixtureFromTemplate('basic-rolldown');

        try {
            await writeFixtureViteConfig(fixture.root);
            await runFixtureViteBuild(fixture.root);

            const distRoot = path.join(fixture.root, 'dist');
            const html = await readFile(path.join(distRoot, 'index.html'), 'utf8');
            expect(html).not.toContain('rel="stylesheet"');

            const cssAssets = await findAssetFiles(distRoot, '.css');
            expect(cssAssets).toHaveLength(0);

            const jsAssets = await findAssetFiles(distRoot, '.js');
            const jsContents = await Promise.all(jsAssets.map((asset) => readFile(asset, 'utf8')));
            expect(jsContents.join('\n')).toContain('.paradise-entry');
        } finally {
            await fixture.cleanup();
        }
        }
    );
});

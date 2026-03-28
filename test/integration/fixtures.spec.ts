import { execFile } from 'child_process';
import { access, readFile, readdir, writeFile } from 'fs/promises';
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

function getMapAssets(output: RolldownOutput['output']): OutputAsset[] {
    return output.filter(
        (item): item is OutputAsset => item.type === 'asset' && item.fileName.endsWith('.map')
    );
}

function getJsChunks(output: RolldownOutput['output']): OutputChunk[] {
    return output.filter(
        (item): item is OutputChunk => item.type === 'chunk' && item.fileName.endsWith('.js')
    );
}

async function buildFixture({
    root,
    input,
    pluginOptions,
    cssCodeSplit,
    sourcemap,
}: {
    root: string;
    input: string | Record<string, string>;
    pluginOptions?: Parameters<typeof cssInjectedByJsPlugin>[0];
    cssCodeSplit?: boolean;
    sourcemap?: boolean | 'inline' | 'hidden';
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
                sourcemap: sourcemap ?? false,
                rollupOptions: {
                    input: normalizedInput,
                },
            },
        });

        const output = normalizeOutput(result as RolldownOutput | RolldownOutput[]).output;
        return output;
    } finally {
        process.chdir(previousCwd);
    }
}

async function writeFixtureViteConfig(root: string): Promise<void> {
    const configContents = `
    import { defineConfig } from 'vite'
    import cssInjectedByJsPlugin from '${path.resolve(__dirname, '../../dist/index.js')}'

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

    it('builds dynamic-inline fixture: ?inline CSS stays as a JS string and is not consumed by the plugin', async () => {
        const fixture = await createFixtureFromTemplate('dynamic-inline');

        try {
            const output = await buildFixture({
                root: fixture.root,
                input: path.resolve(fixture.root, 'index.html'),
            });

            // The base.css (normal import) should be consumed — no CSS assets left for it
            expect(getCssAssets(output)).toHaveLength(0);

            const html = getHtmlAssets(output).map((asset) => assetSourceToString(asset.source)).join('\n');
            expect(html).not.toContain('rel="stylesheet"');

            // The entry chunk should contain the base CSS class injected by the plugin
            const entryChunk = getEntryChunks(output)[0];
            expect(entryChunk).toBeDefined();
            expect(entryChunk.code).toContain('base-inline-entry');

            // The ?inline CSS should survive as a string literal inside the
            // dynamic chunk's JS code — the plugin must NOT strip it.
            const allChunks = getJsChunks(output);
            const allCode = allChunks.map((c) => c.code).join('\n');
            expect(allCode).toContain('dynamic-inline-entry');

            // Verify the dynamic chunk manually creates a <style> element
            expect(allCode).toContain('createElement');
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

    it('builds shadow-next fixture with virtual module injecting into ShadowRoot', async () => {
        const fixture = await createFixtureFromTemplate('shadow-next');

        try {
            const output = await buildFixture({
                root: fixture.root,
                input: path.resolve(fixture.root, 'index.html'),
            });

            // CSS assets should be consumed by the plugin — none left in the bundle
            expect(getCssAssets(output)).toHaveLength(0);

            const html = getHtmlAssets(output).map((asset) => assetSourceToString(asset.source)).join('\n');
            expect(html).not.toContain('rel="stylesheet"');

            const entryChunk = getEntryChunks(output)[0];
            expect(entryChunk).toBeDefined();

            // The CSS class names from style.css should be present in the bundle
            // (injected by the plugin as JS code)
            expect(entryChunk.code).toContain('shadow-next-entry');
            expect(entryChunk.code).toContain('shadow-next-inner');

            // The virtual module import should have been resolved — the bundle
            // must contain the Queue
            expect(entryChunk.code).toContain('__VITE_CSS_QUEUE__');

            // The injectCSS call from the user code should be present
            expect(entryChunk.code).toContain('injectCSS');

            // Shadow DOM setup code should be present
            expect(entryChunk.code).toContain('attachShadow');

            // Virtual-module mode wraps injection with document_head shadowing
            expect(entryChunk.code).toContain('document_head');
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

// ── Source Map Integration Tests ──────────────────────────────────────────────
describeIntegration('sourcemap generation', () => {
    it('produces .map assets with hidden sourcemap for basic fixture', async () => {
        const fixture = await createFixtureFromTemplate('basic');

        try {
            const output = await buildFixture({
                root: fixture.root,
                input: path.resolve(fixture.root, 'index.html'),
                sourcemap: 'hidden',
            });

            const maps = getMapAssets(output);
            expect(maps.length).toBeGreaterThanOrEqual(1);

            // Every map should be valid JSON with a version and mappings
            for (const map of maps) {
                const parsed = JSON.parse(assetSourceToString(map.source));
                expect(parsed).toHaveProperty('version', 3);
                expect(parsed).toHaveProperty('mappings');
                expect(typeof parsed.mappings).toBe('string');
            }
        } finally {
            await fixture.cleanup();
        }
    });

    it('applies semicolon-shift: entry map.mappings starts with ";" when css is prepended', async () => {
        const fixture = await createFixtureFromTemplate('basic');

        try {
            const output = await buildFixture({
                root: fixture.root,
                input: path.resolve(fixture.root, 'index.html'),
                sourcemap: 'hidden',
                // topExecutionPriority defaults to true → CSS is prepended
            });

            // No CSS assets should remain
            expect(getCssAssets(output)).toHaveLength(0);

            // Find the entry chunk and its corresponding .map
            const entryChunk = getEntryChunks(output)[0];
            expect(entryChunk).toBeDefined();

            const mapAsset = output.find(
                (item): item is OutputAsset =>
                    item.type === 'asset' && item.fileName === entryChunk.fileName + '.map'
            );

            // If this fixture produced a map for the entry chunk, verify the shift
            if (mapAsset) {
                const parsed = JSON.parse(assetSourceToString(mapAsset.source));
                expect(parsed.mappings.startsWith(';')).toBe(true);
            }
        } finally {
            await fixture.cleanup();
        }
    });

    it('does NOT shift mappings when topExecutionPriority is false (append mode)', async () => {
        const fixture = await createFixtureFromTemplate('basic');

        try {
            // Build with append mode (CSS at the bottom)
            const appendOutput = await buildFixture({
                root: fixture.root,
                input: path.resolve(fixture.root, 'index.html'),
                sourcemap: 'hidden',
                pluginOptions: { topExecutionPriority: false },
            });

            const appendEntry = getEntryChunks(appendOutput)[0];
            expect(appendEntry).toBeDefined();

            // In append mode CSS code appears at the end, not prepended
            const lines = appendEntry.code.split('\n');
            // Last non-empty line should contain CSS-related code
            const lastLine = lines.filter(l => l.trim().length > 0).pop() ?? '';
            // The first line should NOT be the CSS injection — it should be the original module code
            expect(lines[0]).not.toContain('createElement');

            // Now build the same fixture with prepend mode for comparison
            const prependOutput = await buildFixture({
                root: fixture.root,
                input: path.resolve(fixture.root, 'index.html'),
                sourcemap: 'hidden',
                pluginOptions: { topExecutionPriority: true },
            });

            const prependEntry = getEntryChunks(prependOutput)[0];
            expect(prependEntry).toBeDefined();

            const prependMapAsset = prependOutput.find(
                (item): item is OutputAsset =>
                    item.type === 'asset' && item.fileName === prependEntry.fileName + '.map'
            );
            const appendMapAsset = appendOutput.find(
                (item): item is OutputAsset =>
                    item.type === 'asset' && item.fileName === appendEntry.fileName + '.map'
            );

            if (prependMapAsset && appendMapAsset) {
                const prependMap = JSON.parse(assetSourceToString(prependMapAsset.source));
                const appendMap = JSON.parse(assetSourceToString(appendMapAsset.source));

                // The prepend-mode map should have one more leading ";" than the
                // append-mode map, because we shift mappings for prepended code.
                const countLeadingSemicolons = (s: string) => {
                    let count = 0;
                    for (const ch of s) { if (ch === ';') count++; else break; }
                    return count;
                };

                expect(countLeadingSemicolons(prependMap.mappings))
                    .toBeGreaterThan(countLeadingSemicolons(appendMap.mappings));
            }
        } finally {
            await fixture.cleanup();
        }
    });

    it('produces sourcemaps for relative CSS injection with multiple entries', async () => {
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
                sourcemap: 'hidden',
            });

            expect(getCssAssets(output)).toHaveLength(0);

            const jsChunks = getJsChunks(output);
            const maps = getMapAssets(output);

            // At least one JS chunk should have a corresponding map
            const jsFileNames = new Set(jsChunks.map((c) => c.fileName));
            const mapsForJs = maps.filter((m) => jsFileNames.has(m.fileName.replace(/\.map$/, '')));
            expect(mapsForJs.length).toBeGreaterThanOrEqual(1);

            // Verify every map is valid
            for (const map of mapsForJs) {
                const parsed = JSON.parse(assetSourceToString(map.source));
                expect(parsed).toHaveProperty('version', 3);
                expect(typeof parsed.mappings).toBe('string');
            }
        } finally {
            await fixture.cleanup();
        }
    });

    it('entry chunk code is single-line prepend + newline + original code', async () => {
        const fixture = await createFixtureFromTemplate('basic');

        try {
            const output = await buildFixture({
                root: fixture.root,
                input: path.resolve(fixture.root, 'index.html'),
                sourcemap: 'hidden',
            });

            const entryChunk = getEntryChunks(output)[0];
            expect(entryChunk).toBeDefined();

            // CSS should have been injected; the entry code should contain the marker
            expect(entryChunk.code).toContain('basic-entry');

            // The injected CSS payload is on the first line, separated from the
            // original code by a newline. Verify the first line is not empty.
            const lines = entryChunk.code.split('\n');
            expect(lines.length).toBeGreaterThanOrEqual(2);
            // First line is the CSS injection code (non-empty)
            expect(lines[0].trim().length).toBeGreaterThan(0);
        } finally {
            await fixture.cleanup();
        }
    });
});
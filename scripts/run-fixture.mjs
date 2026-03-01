#!/usr/bin/env node

/**
 * Run a fixture template in dev or build mode.
 *
 * Usage:
 *   node scripts/run-fixture.mjs <fixture>                    # build (default)
 *   node scripts/run-fixture.mjs --dev <fixture>              # dev server
 *   node scripts/run-fixture.mjs --build <fixture>            # build only
 *   node scripts/run-fixture.mjs --preview <fixture>          # build + preview server
 *   node scripts/run-fixture.mjs                              # list available fixtures
 *
 * Output (build):  test/fixtures-dist/<fixture>/
 */

import { access, mkdir, readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const templatesRoot = path.join(repoRoot, 'test', 'fixtures-templates');
const cacheRoot = path.join(repoRoot, 'test', 'fixtures-cache');
const distRoot = path.join(repoRoot, 'test', 'fixtures-dist');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

async function exists(p) {
    try {
        await access(p);
        return true;
    } catch {
        return false;
    }
}

async function listTemplates() {
    const entries = await readdir(templatesRoot, { withFileTypes: true });
    return entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
}

async function ensurePluginBuild() {
    const distEntry = path.join(repoRoot, 'dist', 'esm', 'index.js');
    if (!(await exists(distEntry))) {
        console.log('[fixture] Plugin not built — running npm run build …');
        await execFileAsync(npmCmd, ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
    }
}

async function resolveFixtureRoot(name) {
    // Prefer the cached version (already has node_modules when applicable)
    const cached = path.join(cacheRoot, name);
    if (await exists(cached)) return cached;
    // Fall back to the raw template
    const template = path.join(templatesRoot, name);
    if (await exists(template)) return template;
    return null;
}

// Start cli processing
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));

const mode = flags.has('--dev') ? 'dev' : flags.has('--preview') ? 'preview' : 'build';

const fixtureName = positional[0];

if (!fixtureName) {
    const templates = await listTemplates();
    console.log('Usage: node scripts/run-fixture.mjs [--dev | --build | --preview] <fixture>\n');
    console.log('Available fixtures:');
    for (const t of templates) console.log(`  ${t}`);
    process.exit(0);
}

// Resolve fixture root
const fixtureRoot = await resolveFixtureRoot(fixtureName);

if (!fixtureRoot) {
    console.error(`[fixture] "${fixtureName}" not found in templates or cache.`);
    const templates = await listTemplates();
    console.error('\nAvailable fixtures:');
    for (const t of templates) console.error(`  ${t}`);
    process.exit(1);
}

// If the fixture has its own package.json it may require installed deps.
const fixtureHasPkg = await exists(path.join(fixtureRoot, 'package.json'));
const fixtureHasNodeModules = await exists(path.join(fixtureRoot, 'node_modules'));

if (fixtureHasPkg && !fixtureHasNodeModules) {
    console.error(
        `[fixture] "${fixtureName}" has a package.json but no node_modules.\n` +
            'Run the following first to prepare cached fixtures:\n\n' +
            '  node scripts/prepare-integration-fixtures.mjs\n',
    );
    process.exit(1);
}

await ensurePluginBuild();

const pluginUrl = pathToFileURL(path.join(repoRoot, 'dist', 'esm', 'index.js')).href;
const { default: cssInjectedByJsPlugin } = await import(pluginUrl);

if (mode === 'dev') {
    const { createServer } = await import('vite');

    console.log(`[fixture] Starting dev server for "${fixtureName}" (${fixtureRoot})\n`);

    const server = await createServer({
        configFile: false,
        root: fixtureRoot,
        plugins: [cssInjectedByJsPlugin({ enableDev: true })],
        server: { open: true },
    });

    await server.listen();
    server.printUrls();
    server.bindCLIShortcuts({ print: true });
} else {
    const { build } = await import('vite');

    const outDir = path.join(distRoot, fixtureName);
    await mkdir(outDir, { recursive: true });

    console.log(`[fixture] Building "${fixtureName}" → ${path.relative(repoRoot, outDir)}\n`);

    await build({
        configFile: false,
        root: fixtureRoot,
        plugins: [cssInjectedByJsPlugin()],
        build: {
            outDir,
            emptyOutDir: true,
            sourcemap: true,
        },
    });

    console.log(`\n[fixture] Build output: ${path.relative(repoRoot, outDir)}`);

    // Preview mode — serve the built output with Vite's preview server
    if (mode === 'preview') {
        const { preview } = await import('vite');

        console.log('[fixture] Starting preview server …\n');

        const server = await preview({
            configFile: false,
            root: fixtureRoot,
            build: { outDir },
            preview: { open: true },
        });

        server.printUrls();
        server.bindCLIShortcuts({ print: true });
    }
}

import { access, copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatesRoot = path.join(repoRoot, 'test', 'fixtures-templates');
const cacheRoot = path.join(repoRoot, 'test', 'fixtures-cache');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

async function copyDir(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath);
    } else {
      await copyFile(sourcePath, targetPath);
    }
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function prepareTemplate(templateName) {
  const sourceRoot = path.join(templatesRoot, templateName);
  const sourcePackageJson = path.join(sourceRoot, 'package.json');

  if (!(await exists(sourcePackageJson))) {
    return;
  }

  const cacheTarget = path.join(cacheRoot, templateName);

  await rm(cacheTarget, { recursive: true, force: true });
  await copyDir(sourceRoot, cacheTarget);

  console.info(`[integration] Installing fixture dependencies for ${templateName}`);
  await execFileAsync(npmCmd, ['install', '--no-audit', '--no-fund'], { cwd: cacheTarget });

  await ensurePluginPackage(cacheTarget);
}

async function ensurePluginBuild() {
  const distRoot = path.join(repoRoot, 'dist');
  const distEntry = path.join(distRoot, 'esm', 'index.js');

  if (!(await exists(distEntry))) {
    console.info('[integration] Building plugin for fixtures');
    await execFileAsync(npmCmd, ['run', 'build'], { cwd: repoRoot });
  }

  return distRoot;
}

async function ensurePluginPackage(cacheTarget) {
  const distRoot = await ensurePluginBuild();
  const pluginRoot = path.join(cacheTarget, 'node_modules', 'vite-plugin-css-injected-by-js');
  const pluginDistRoot = path.join(pluginRoot, 'dist');

  if (!(await exists(path.join(pluginDistRoot, 'esm', 'index.js')))) {
    await rm(pluginRoot, { recursive: true, force: true });
    await mkdir(pluginRoot, { recursive: true });
    await copyDir(distRoot, pluginDistRoot);
  }

  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

  const pluginPackageJson = {
    name: 'vite-plugin-css-injected-by-js',
    version: packageJson.version || '0.0.0',
    type: 'module',
    main: './dist/cjs/index.js',
    module: './dist/esm/index.js',
    exports: {
      '.': {
        import: './dist/esm/index.js',
        require: './dist/cjs/index.js'
      }
    }
  };

  await writeFile(
    path.join(pluginRoot, 'package.json'),
    JSON.stringify(pluginPackageJson, null, 2)
  );
}

async function main() {
  await mkdir(cacheRoot, { recursive: true });
  const entries = await readdir(templatesRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const templateName = entry.name;
    const templatePath = path.join(templatesRoot, templateName);

    const stats = await stat(templatePath);
    if (!stats.isDirectory()) {
      continue;
    }

    await prepareTemplate(templateName);
  }
}

await main();

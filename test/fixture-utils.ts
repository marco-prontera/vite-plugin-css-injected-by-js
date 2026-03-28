import { access, copyFile, mkdir, mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const fixturesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures-templates');
const fixturesCacheRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures-cache');

async function exists(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function copyDir(sourceDir: string, targetDir: string): Promise<void> {
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

export async function createFixtureFromTemplate(templateName: string): Promise<{
    root: string;
    cleanup: () => Promise<void>;
}> {
    const cacheRoot = path.join(fixturesCacheRoot, templateName);
    const sourceRoot = (await exists(cacheRoot)) ? cacheRoot : path.join(fixturesRoot, templateName);
    const targetRoot = await mkdtemp(path.join(tmpdir(), `vite-css-injected-${templateName}-`));

    await copyDir(sourceRoot, targetRoot);

    return {
        root: targetRoot,
        cleanup: async () => {
            await rm(targetRoot, { recursive: true, force: true });
        },
    };
}

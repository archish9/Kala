import { createHash } from 'node:crypto';
import { readFile, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
const hashPath = async (abs) => {
    const s = await stat(abs);
    if (s.isDirectory()) {
        const entries = (await readdir(abs)).sort();
        const h = createHash('sha256');
        for (const e of entries)
            h.update(e).update(await hashPath(join(abs, e)));
        return `sha256:${h.digest('hex')}`;
    }
    const buf = await readFile(abs);
    return `sha256:${createHash('sha256').update(buf).digest('hex')}`;
};
export const hashSources = async (dir, paths) => {
    const out = [];
    for (const p of paths) {
        try {
            out.push({ path: p, hash: await hashPath(join(dir, p)) });
        }
        catch { /* source vanished; omit so the next derive notices */ }
    }
    return out;
};
export const checkStale = async (lock, dir) => {
    const changed = [];
    for (const src of lock.sources) {
        let current = null;
        try {
            current = await hashPath(join(dir, src.path));
        }
        catch {
            current = null;
        }
        if (current !== src.hash)
            changed.push(src.path);
    }
    return { stale: changed.length > 0, changed };
};

import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import createJiti from 'jiti';
import { hashSources } from './staleness.js';
import { scanComponents, UI_DIRS } from './registry.js';
import { emptyIntent } from './types.js';
const CONFIG_NAMES = [
    'tailwind.config.ts', 'tailwind.config.js',
    'tailwind.config.mjs', 'tailwind.config.cjs'
];
const CSS_CANDIDATES = [
    'src/globals.css', 'src/styles/globals.css',
    'app/globals.css', 'styles/globals.css'
];
const exists = async (p) => {
    try {
        await access(p);
        return true;
    }
    catch {
        return false;
    }
};
const toPx = (raw) => {
    const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(raw.trim());
    if (!m)
        return null;
    const n = Number(m[1]);
    if (Number.isNaN(n))
        return null;
    return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n;
};
const sortedPx = (obj) => [...new Set(Object.values(obj).map(toPx).filter((n) => n !== null))]
    .sort((a, b) => a - b);
const flattenColors = (obj, prefix = '') => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}-${k}` : k;
        if (typeof v === 'string')
            out[key] = v;
        else if (v && typeof v === 'object') {
            Object.assign(out, flattenColors(v, key));
        }
    }
    return out;
};
const emptyDerived = () => ({
    space: [], type: { steps: [], families: {} }, color: {},
    radius: [], components: {}
});
export const deriveLock = async (dir, intent = {}) => {
    const degraded = [];
    const sourcePaths = [];
    const derived = emptyDerived();
    let found = false;
    const configName = (await Promise.all(CONFIG_NAMES.map(async (n) => (await exists(join(dir, n))) ? n : null))).find(Boolean);
    if (configName) {
        try {
            const jiti = createJiti(dir, { interopDefault: true });
            const cfg = jiti(join(dir, configName));
            const ext = cfg.theme?.extend ?? {};
            const spacing = ext['spacing'];
            if (spacing)
                derived.space = sortedPx(spacing);
            const fontSize = ext['fontSize'];
            if (fontSize)
                derived.type.steps = sortedPx(fontSize);
            const colors = ext['colors'];
            if (colors)
                derived.color = flattenColors(colors);
            const radius = ext['borderRadius'];
            if (radius)
                derived.radius = sortedPx(radius);
            sourcePaths.push(configName);
            found = true;
        }
        catch (err) {
            degraded.push({
                code: 'CONFIG_LOAD_FAILED', path: configName,
                detail: err.message,
                impact: 'tailwind config not used for derivation'
            });
        }
    }
    if (!found) {
        for (const rel of CSS_CANDIDATES) {
            if (!await exists(join(dir, rel)))
                continue;
            const css = await readFile(join(dir, rel), 'utf8');
            const space = [];
            for (const m of css.matchAll(/--space[-\w]*:\s*([^;]+);/g)) {
                const px = toPx((m[1] ?? '').trim());
                if (px !== null)
                    space.push(px);
            }
            for (const m of css.matchAll(/--color-([\w-]+):\s*([^;]+);/g)) {
                const key = m[1];
                if (key)
                    derived.color[key] = (m[2] ?? '').trim();
            }
            if (space.length > 0)
                derived.space = [...new Set(space)].sort((a, b) => a - b);
            sourcePaths.push(rel);
            found = true;
            break;
        }
    }
    if (!found) {
        degraded.push({
            code: 'NO_DESIGN_SOURCE',
            detail: 'No tailwind config and no CSS custom properties found.',
            impact: 'lock cannot be derived; project needs bootstrap'
        });
        return { lock: null, degraded };
    }
    derived.components = await scanComponents(dir);
    for (const rel of UI_DIRS) {
        if (await exists(join(dir, rel))) {
            sourcePaths.push(rel);
            break;
        }
    }
    return {
        lock: {
            version: 1,
            sources: await hashSources(dir, sourcePaths),
            derived,
            intent: { ...emptyIntent(), ...intent }
        },
        degraded
    };
};

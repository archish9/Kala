import { readdir, readFile, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
const exists = async (p) => {
    try {
        await access(p);
        return true;
    }
    catch {
        return false;
    }
};
export const loadPack = async (dir) => {
    const rules = [];
    const degraded = [];
    const walk = async (d) => {
        const entries = await readdir(d, { withFileTypes: true });
        const out = [];
        for (const e of entries) {
            const p = join(d, e.name);
            if (e.isDirectory())
                out.push(...await walk(p));
            else if (e.name.endsWith('.json'))
                out.push(p);
        }
        return out;
    };
    for (const file of await walk(dir)) {
        let parsed;
        try {
            parsed = JSON.parse(await readFile(file, 'utf8'));
        }
        catch (err) {
            degraded.push({
                code: 'RULE_PARSE_FAILED', path: file,
                detail: err.message, impact: '1 rule not loaded'
            });
            continue;
        }
        const fx = parsed.fixtures;
        if (!fx?.pass || !fx?.fail) {
            degraded.push({
                code: 'RULE_MISSING_FIXTURE', path: file,
                detail: `Rule "${parsed.id}" needs both a pass and a fail fixture.`,
                impact: '1 rule not loaded'
            });
            continue;
        }
        const base = dirname(file);
        const missing = [];
        for (const rel of [fx.pass, fx.fail]) {
            if (!await exists(resolve(base, rel)))
                missing.push(rel);
        }
        if (missing.length > 0) {
            degraded.push({
                code: 'RULE_FIXTURE_NOT_FOUND', path: file,
                detail: `Fixture file(s) not found: ${missing.join(', ')}`,
                impact: '1 rule not loaded'
            });
            continue;
        }
        rules.push(parsed);
    }
    return { rules, degraded };
};

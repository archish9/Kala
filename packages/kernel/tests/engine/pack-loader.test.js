import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPack } from '../../src/engine/pack-loader.js';
let dir;
const RULE_OK = {
    id: 'space-off-scale', kind: 'node', severity: 'error',
    select: { hasFact: 'style.space.padding' },
    assert: { allIn: ['self.style.space.padding', '$lock.derived.space'] },
    message: 'Padding {value} is not on the spacing scale.',
    fixtures: { pass: 'fixtures/space-pass.tsx', fail: 'fixtures/space-fail.tsx' }
};
beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pack-'));
    await mkdir(join(dir, 'fixtures'), { recursive: true });
    await writeFile(join(dir, 'fixtures/space-pass.tsx'), 'export default () => <div/>');
    await writeFile(join(dir, 'fixtures/space-fail.tsx'), 'export default () => <div/>');
    await writeFile(join(dir, 'ok.json'), JSON.stringify(RULE_OK));
    await writeFile(join(dir, 'no-fixtures.json'), JSON.stringify({
        ...RULE_OK, id: 'no-fixtures', fixtures: { pass: 'fixtures/space-pass.tsx' }
    }));
    await writeFile(join(dir, 'missing-file.json'), JSON.stringify({
        ...RULE_OK, id: 'missing-file',
        fixtures: { pass: 'fixtures/nope.tsx', fail: 'fixtures/space-fail.tsx' }
    }));
    await writeFile(join(dir, 'broken.json'), '{ not json');
});
describe('loadPack', () => {
    it('loads a rule that has both fixtures', async () => {
        const { rules } = await loadPack(dir);
        expect(rules.map(r => r.id)).toContain('space-off-scale');
    });
    it('rejects a rule missing the fail fixture', async () => {
        const { rules, degraded } = await loadPack(dir);
        expect(rules.map(r => r.id)).not.toContain('no-fixtures');
        expect(degraded.some(d => d.code === 'RULE_MISSING_FIXTURE')).toBe(true);
    });
    it('rejects a rule whose fixture file does not exist', async () => {
        const { rules, degraded } = await loadPack(dir);
        expect(rules.map(r => r.id)).not.toContain('missing-file');
        expect(degraded.some(d => d.code === 'RULE_FIXTURE_NOT_FOUND')).toBe(true);
    });
    it('survives a malformed rule file and still loads the good ones', async () => {
        const { rules, degraded } = await loadPack(dir);
        expect(rules.length).toBe(1);
        expect(degraded.some(d => d.code === 'RULE_PARSE_FAILED')).toBe(true);
    });
});

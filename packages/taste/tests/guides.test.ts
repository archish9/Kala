import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadGuides, GUIDE_ACTIONS } from '../src/guides.js'
import { GUIDES_DIR } from '@kala/packs'

const load = async () => (await loadGuides(GUIDES_DIR)).guides

describe('loadGuides', () => {
  it('ships one playbook per action, all valid', async () => {
    const { guides, degraded } = await loadGuides(GUIDES_DIR)
    expect(degraded).toEqual([])
    expect(guides).toHaveLength(GUIDE_ACTIONS.length)
    expect(guides.map(g => g.id).sort()).toEqual([...GUIDE_ACTIONS].sort())
  })

  it('gives every playbook at least three moves and one thing to avoid', async () => {
    for (const g of await load()) {
      expect(g.moves.length, `${g.id} moves`).toBeGreaterThanOrEqual(3)
      expect(g.avoid.length, `${g.id} avoid`).toBeGreaterThanOrEqual(1)
    }
  })

  it('declares at least one token group per playbook', async () => {
    for (const g of await load()) {
      expect(g.usesTokens.length, `${g.id}`).toBeGreaterThanOrEqual(1)
    }
  })

  it('only declares token groups the lock actually carries', async () => {
    const known = ['space', 'type', 'color', 'radius', 'motion']
    for (const g of await load()) {
      for (const t of g.usesTokens) expect(known, `${g.id}`).toContain(t)
    }
  })

  it('rejects a playbook with an unknown action id', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'guide-'))
    await writeFile(join(dir, 'nope.json'), JSON.stringify({
      id: 'sparkle', intent: 'x'.repeat(12), moves: ['a', 'b', 'c'],
      avoid: ['y'], usesTokens: ['color']
    }))
    const { guides, degraded } = await loadGuides(dir)
    expect(guides).toEqual([])
    expect(degraded.some(d => d.code === 'GUIDE_INVALID')).toBe(true)
  })

  it('survives a malformed playbook file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'guide-'))
    await writeFile(join(dir, 'broken.json'), '{ not json')
    const { degraded } = await loadGuides(dir)
    expect(degraded.some(d => d.code === 'GUIDE_PARSE_FAILED')).toBe(true)
  })
})

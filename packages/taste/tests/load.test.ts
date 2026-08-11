import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSystems } from '../src/load.js'
import { SYSTEMS_DIR } from '@fe-design/packs'

describe('loadSystems', () => {
  it('loads every shipped system without degradation', async () => {
    const { systems, degraded } = await loadSystems(SYSTEMS_DIR)
    expect(degraded).toEqual([])
    expect(systems.length).toBeGreaterThanOrEqual(3)
    expect(systems.map(s => s.id)).toContain('quiet-precision')
  })

  it('gives every system a non-empty signature and antiDefaults', async () => {
    const { systems } = await loadSystems(SYSTEMS_DIR)
    for (const s of systems) {
      expect(s.signature.length, `${s.id} signature`).toBeGreaterThanOrEqual(3)
      expect(s.antiDefaults.length, `${s.id} antiDefaults`).toBeGreaterThanOrEqual(1)
    }
  })

  it('gives every system four axis ranges with low <= high inside 0..1', async () => {
    const { systems } = await loadSystems(SYSTEMS_DIR)
    for (const s of systems) {
      for (const axis of ['formality', 'density', 'energy', 'expressiveness'] as const) {
        const [lo, hi] = s.axes[axis]
        expect(lo, `${s.id}.${axis} low`).toBeGreaterThanOrEqual(0)
        expect(hi, `${s.id}.${axis} high`).toBeLessThanOrEqual(1)
        expect(lo, `${s.id}.${axis} ordering`).toBeLessThanOrEqual(hi)
      }
    }
  })

  it('rejects a system missing a required field, keeping the rest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sys-'))
    await writeFile(join(dir, 'bad.json'), JSON.stringify({ id: 'bad' }))
    await writeFile(join(dir, 'ok.json'), JSON.stringify({
      id: 'ok',
      axes: { formality: [0, 1], density: [0, 1], energy: [0, 1], expressiveness: [0, 1] },
      fitFor: ['x'], avoidFor: [],
      type: { families: { sans: 'A', serif: 'B' }, fallbacks: { sans: ['system-ui'] }, ratio: 1.2, baseSize: 16, maxWeights: 2 },
      space: { base: 4, rhythm: 'normal', sectionGap: 64 },
      shape: { radius: 4, depth: 'borders' },
      color: { strategy: 's', neutralHue: 250, chromaCeiling: 0.04 },
      motion: { budget: 'minimal', duration: 150, easing: 'ease-out' },
      signature: ['a', 'b', 'c'], antiDefaults: ['x']
    }))
    const { systems, degraded } = await loadSystems(dir)
    expect(systems.map(s => s.id)).toEqual(['ok'])
    expect(degraded.some(d => d.code === 'SYSTEM_INVALID')).toBe(true)
  })

  it('survives a malformed system file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sys-'))
    await writeFile(join(dir, 'broken.json'), '{ not json')
    const { systems, degraded } = await loadSystems(dir)
    expect(systems).toEqual([])
    expect(degraded.some(d => d.code === 'SYSTEM_PARSE_FAILED')).toBe(true)
  })
})

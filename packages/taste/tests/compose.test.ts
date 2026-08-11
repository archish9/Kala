import { describe, it, expect } from 'vitest'
import { oklch } from 'culori'
import { composeSystem } from '../src/compose.js'
import { loadSystems } from '../src/load.js'
import { contrast } from '../src/color/solve.js'
import { SYSTEMS_DIR } from '@fe-design/packs'
import type { DesignSystem } from '../src/types.js'

const load = async (): Promise<DesignSystem[]> =>
  (await loadSystems(SYSTEMS_DIR)).systems

describe('composeSystem', () => {
  it('fills every token group', async () => {
    const t = composeSystem((await load())[0]!, '#1F4B3F')
    expect(t.space.length).toBeGreaterThan(4)
    expect(t.type.steps.length).toBeGreaterThan(4)
    expect(t.radius.length).toBeGreaterThan(1)
    expect(Object.keys(t.ramps.accent).length).toBe(11)
    expect(Object.keys(t.ramps.neutral).length).toBe(11)
  })

  it('carries the system through unchanged', async () => {
    const sys = (await load()).find(s => s.id === 'quiet-precision')!
    const t = composeSystem(sys, '#1F4B3F')
    expect(t.system.id).toBe('quiet-precision')
    expect(t.system.signature).toEqual(sys.signature)
  })

  it('honours an explicit accent', async () => {
    expect(composeSystem((await load())[0]!, '#7C3AED').accent).toBe('#7C3AED')
  })

  it('falls back to a per-system default accent when none is given', async () => {
    expect(composeSystem((await load())[0]!).accent).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('respects the system chroma ceiling', async () => {
    const sys = (await load()).find(s => s.id === 'quiet-precision')!
    const t = composeSystem(sys, '#7C3AED')
    for (const hex of Object.values(t.ramps.accent)) {
      expect(oklch(hex)!.c).toBeLessThanOrEqual(sys.color.chromaCeiling + 0.001)
    }
  })

  it('meets every contrast target in both schemes, for every system', async () => {
    for (const sys of await load()) {
      const t = composeSystem(sys, '#1F4B3F')
      for (const r of t.report) {
        expect(r.meets, `${sys.id}: ${r.pair} was ${r.ratio.toFixed(2)}`).toBe(true)
      }
      expect(contrast(t.light.fg, t.light.bg)).toBeGreaterThanOrEqual(7)
      expect(contrast(t.dark.fg, t.dark.bg)).toBeGreaterThanOrEqual(7)
    }
  })

  it('is deterministic', async () => {
    const sys = (await load())[0]!
    expect(composeSystem(sys, '#1F4B3F')).toEqual(composeSystem(sys, '#1F4B3F'))
  })
})

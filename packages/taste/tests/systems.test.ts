import { describe, it, expect } from 'vitest'
import { oklch } from 'culori'
import { loadSystems } from '../src/load.js'
import { composeSystem } from '../src/compose.js'
import { contrast } from '../src/color/solve.js'
import { selectSystems } from '../src/select.js'
import { SYSTEMS_DIR } from '@fe-design/packs'

const load = async () => (await loadSystems(SYSTEMS_DIR)).systems

const HUES = [0, 40, 80, 120, 160, 200, 240, 280, 320]
const accentAt = (hue: number) => `oklch(0.5 0.12 ${hue})`

describe('the curated catalogue', () => {
  it('ships twelve systems, all valid', async () => {
    const { systems, degraded } = await loadSystems(SYSTEMS_DIR)
    expect(degraded).toEqual([])
    expect(systems).toHaveLength(12)
  })

  it('gives every system a unique id', async () => {
    const ids = (await load()).map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('does not name an overused default font as a primary family', async () => {
    for (const s of await load()) {
      expect(['Inter', 'Roboto', 'Arial', 'Helvetica'], `${s.id}`)
        .not.toContain(s.type.families.sans)
    }
  })

  it('covers the axis space, so briefs land somewhere distinct', async () => {
    const systems = await load()
    for (const axis of ['formality', 'density', 'energy', 'expressiveness'] as const) {
      const lows = systems.map(s => s.axes[axis][0])
      const highs = systems.map(s => s.axes[axis][1])
      expect(Math.min(...lows), `${axis} low coverage`).toBeLessThanOrEqual(0.2)
      expect(Math.max(...highs), `${axis} high coverage`).toBeGreaterThanOrEqual(0.8)
    }
  })

  it('meets every contrast target for every system at every hue', async () => {
    for (const system of await load()) {
      for (const hue of HUES) {
        const t = composeSystem(system, accentAt(hue))
        for (const r of t.report) {
          expect(r.meets, `${system.id} @ hue ${hue}: ${r.pair} was ${r.ratio.toFixed(2)}`)
            .toBe(true)
        }
      }
    }
  })

  it('keeps ramp lightness monotonic for every system', async () => {
    for (const system of await load()) {
      const t = composeSystem(system, accentAt(120))
      for (const ramp of [t.ramps.accent, t.ramps.neutral]) {
        const ls = Object.values(ramp).map(h => oklch(h)!.l)
        for (let i = 1; i < ls.length; i++) {
          expect(ls[i]!, `${system.id} step ${i}`).toBeLessThan(ls[i - 1]!)
        }
      }
    }
  })

  it('keeps body text at AAA in both schemes for every system', async () => {
    for (const system of await load()) {
      const t = composeSystem(system, accentAt(200))
      expect(contrast(t.light.fg, t.light.bg), `${system.id} light`).toBeGreaterThanOrEqual(7)
      expect(contrast(t.dark.fg, t.dark.bg), `${system.id} dark`).toBeGreaterThanOrEqual(7)
    }
  })

  it('composes deterministically for every system', async () => {
    for (const system of await load()) {
      expect(composeSystem(system, '#1F4B3F')).toEqual(composeSystem(system, '#1F4B3F'))
    }
  })

  it('does not return the same top system for every kind of brief', async () => {
    const systems = await load()
    const briefs = [
      'banking compliance portal for auditors',
      'playful game for kids',
      'portfolio site for a photographer',
      'dense analytics dashboard',
      'meditation and wellness app',
      'developer CLI documentation'
    ]
    const tops = briefs.map(b => selectSystems(b, systems)[0]!.system.id)
    expect(new Set(tops).size, `tops were ${tops.join(', ')}`).toBeGreaterThanOrEqual(4)
  })
})

import { describe, it, expect } from 'vitest'
import { oklch } from 'culori'
import { buildRamp, buildNeutralRamp } from '../../src/color/ramp.js'
import { solveSemantics } from '../../src/color/solve.js'
import { deriveDark } from '../../src/color/dark.js'

const neutral = buildNeutralRamp(40, 0.04)
const accent = buildRamp('#1F4B3F', 0.06)

describe('deriveDark', () => {
  it('produces a dark background', () => {
    expect(oklch(deriveDark(neutral, accent).semantics.bg)!.l).toBeLessThan(0.3)
  })

  it('produces foreground text far lighter than the background', () => {
    // deriveDark picks the dimmest step that still clears 7:1, on purpose:
    // pinning every text colour to pure white flattens hierarchy. So this
    // asserts a wide light/dark separation, not maximum brightness.
    const { semantics } = deriveDark(neutral, accent)
    const fg = oklch(semantics.fg)!.l
    const bg = oklch(semantics.bg)!.l
    expect(fg).toBeGreaterThan(0.75)
    expect(fg - bg).toBeGreaterThan(0.5)
  })

  it('raises surface above bg by lightness, not by shadow', () => {
    const { semantics } = deriveDark(neutral, accent)
    expect(oklch(semantics.surface)!.l).toBeGreaterThan(oklch(semantics.bg)!.l)
  })

  it('meets every contrast target it reports', () => {
    for (const r of deriveDark(neutral, accent).report) {
      expect(r.meets, `${r.pair} was ${r.ratio.toFixed(2)}, target ${r.target}`).toBe(true)
    }
  })

  it('reduces accent chroma relative to the light scheme', () => {
    const light = solveSemantics(neutral, accent).semantics
    const dark = deriveDark(neutral, accent).semantics
    expect(oklch(dark.primary)!.c).toBeLessThan(oklch(light.primary)!.c * 0.95)
  })

  it('is not a straight inversion of the light scheme', () => {
    const light = solveSemantics(neutral, accent).semantics
    const dark = deriveDark(neutral, accent).semantics
    expect(dark.bg).not.toBe(light.fg)
    expect(dark.primary).not.toBe(light.primary)
  })

  it('holds every target for every hue around the wheel', () => {
    for (let hue = 0; hue < 360; hue += 15) {
      const a = buildRamp(`oklch(0.55 0.12 ${hue})`, 0.12)
      for (const r of deriveDark(neutral, a).report) {
        expect(r.meets, `hue ${hue}: ${r.pair} was ${r.ratio.toFixed(2)}`).toBe(true)
      }
    }
  })

  it('picks a dark-scheme primary that still reads as the accent', () => {
    const p = oklch(deriveDark(neutral, accent).semantics.primary)!
    expect(p.l).toBeGreaterThan(0.3)
    expect(p.l).toBeLessThan(0.85)
    expect(p.c).toBeGreaterThan(0.015)
  })

  it('is deterministic', () => {
    expect(deriveDark(neutral, accent).semantics)
      .toEqual(deriveDark(neutral, accent).semantics)
  })
})

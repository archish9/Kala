import { describe, it, expect } from 'vitest'
import { buildRamp, buildNeutralRamp } from '../../src/color/ramp.js'
import { oklch } from 'culori'
import { solveSemantics, contrast, TARGETS } from '../../src/color/solve.js'

const neutral = buildNeutralRamp(40, 0.04)
const accent = buildRamp('#1F4B3F', 0.06)

describe('contrast', () => {
  it('matches known WCAG extremes', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 1)
  })
})

describe('solveSemantics', () => {
  it('fills every semantic role with a hex value', () => {
    const { semantics } = solveSemantics(neutral, accent)
    for (const [role, value] of Object.entries(semantics)) {
      expect(value, role).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('meets the body text target', () => {
    const { semantics } = solveSemantics(neutral, accent)
    expect(contrast(semantics.fg, semantics.bg)).toBeGreaterThanOrEqual(TARGETS.fg)
  })

  it('meets the muted text target', () => {
    const { semantics } = solveSemantics(neutral, accent)
    expect(contrast(semantics.muted, semantics.bg)).toBeGreaterThanOrEqual(TARGETS.muted)
  })

  it('meets the non-text border target', () => {
    const { semantics } = solveSemantics(neutral, accent)
    expect(contrast(semantics.border, semantics.bg)).toBeGreaterThanOrEqual(TARGETS.border)
  })

  it('meets the on-primary target', () => {
    const { semantics } = solveSemantics(neutral, accent)
    expect(contrast(semantics.onPrimary, semantics.primary))
      .toBeGreaterThanOrEqual(TARGETS.onPrimary)
  })

  it('reports every pair as meeting its target', () => {
    const { report } = solveSemantics(neutral, accent)
    expect(report.length).toBeGreaterThanOrEqual(4)
    for (const r of report) {
      expect(r.meets, `${r.pair} was ${r.ratio.toFixed(2)}, target ${r.target}`).toBe(true)
    }
  })

  it('holds for every hue around the wheel', () => {
    for (let hue = 0; hue < 360; hue += 15) {
      const a = buildRamp(`oklch(0.55 0.12 ${hue})`, 0.12)
      const { report } = solveSemantics(neutral, a)
      for (const r of report) {
        expect(r.meets, `hue ${hue}: ${r.pair} was ${r.ratio.toFixed(2)}`).toBe(true)
      }
    }
  })

  it('picks a primary that still reads as the accent, not as near-black', () => {
    // Walking the ramp from either end trivially satisfies contrast and lands
    // on near-black or near-white, which erases the accent the system was
    // chosen for. The primary must stay in the recognisable middle.
    const { semantics } = solveSemantics(neutral, accent)
    const p = oklch(semantics.primary)!
    expect(p.l).toBeGreaterThan(0.3)
    expect(p.l).toBeLessThan(0.8)
    expect(p.c).toBeGreaterThan(0.02)
  })

  it('keeps the primary hue close to the seed accent hue', () => {
    const seedHue = oklch(accent[500])!.h!
    const p = oklch(solveSemantics(neutral, accent).semantics.primary)!
    expect(Math.abs(p.h! - seedHue)).toBeLessThan(10)
  })

  it('keeps surface distinct from bg so elevation is visible', () => {
    const { semantics } = solveSemantics(neutral, accent)
    expect(semantics.surface).not.toBe(semantics.bg)
  })
})

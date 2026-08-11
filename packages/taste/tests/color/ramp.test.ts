import { describe, it, expect } from 'vitest'
import { oklch } from 'culori'
import { buildRamp, buildNeutralRamp, RAMP_STEPS, LIGHTNESS } from '../../src/color/ramp.js'

describe('buildRamp', () => {
  it('produces every step as a hex string', () => {
    const ramp = buildRamp('#1F4B3F', 0.06)
    for (const step of RAMP_STEPS) {
      expect(ramp[step], `step ${step}`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('descends monotonically in perceived lightness', () => {
    const ramp = buildRamp('#1F4B3F', 0.06)
    const ls = RAMP_STEPS.map(s => oklch(ramp[s])!.l)
    for (let i = 1; i < ls.length; i++) {
      expect(ls[i]!, `step ${RAMP_STEPS[i]} vs ${RAMP_STEPS[i - 1]}`)
        .toBeLessThan(ls[i - 1]!)
    }
  })

  it('holds the seed hue across every step', () => {
    const seedHue = oklch('#1F4B3F')!.h!
    const ramp = buildRamp('#1F4B3F', 0.06)
    for (const step of RAMP_STEPS) {
      const c = oklch(ramp[step])!
      if (c.h !== undefined && c.c > 0.01) {
        expect(Math.abs(c.h - seedHue), `step ${step}`).toBeLessThan(6)
      }
    }
  })

  it('never exceeds the chroma ceiling', () => {
    const ramp = buildRamp('#1F4B3F', 0.04)
    for (const step of RAMP_STEPS) {
      expect(oklch(ramp[step])!.c, `step ${step}`).toBeLessThanOrEqual(0.0401)
    }
  })

  it('is deterministic', () => {
    expect(buildRamp('#1F4B3F', 0.06)).toEqual(buildRamp('#1F4B3F', 0.06))
  })

  it('accepts a seed in any css color form', () => {
    expect(buildRamp('rgb(31, 75, 63)', 0.06)[500]).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('throws on an unparseable seed rather than emitting garbage', () => {
    expect(() => buildRamp('not-a-color', 0.06)).toThrow(/could not parse/i)
  })

  it('hits the documented lightness target at each step within tolerance', () => {
    const ramp = buildRamp('#1F4B3F', 0.06)
    for (const step of RAMP_STEPS) {
      expect(Math.abs(oklch(ramp[step])!.l - LIGHTNESS[step]), `step ${step}`)
        .toBeLessThan(0.04)
    }
  })
})

describe('buildNeutralRamp', () => {
  it('produces a tinted neutral, never pure gray', () => {
    const ramp = buildNeutralRamp(40, 0.04)
    expect(oklch(ramp[500])!.c).toBeGreaterThan(0.002)
    expect(ramp[500]!.toLowerCase()).not.toBe('#808080')
  })

  it('stays far below the accent chroma ceiling', () => {
    const ramp = buildNeutralRamp(40, 0.04)
    for (const step of RAMP_STEPS) {
      expect(oklch(ramp[step])!.c, `step ${step}`).toBeLessThanOrEqual(0.0201)
    }
  })
})

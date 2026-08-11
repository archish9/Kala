import { oklch, formatHex, clampChroma } from 'culori'

export const RAMP_STEPS = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950
] as const

export type RampStep = typeof RAMP_STEPS[number]
export type Ramp = Record<RampStep, string>

/**
 * Perceived lightness per step, fixed rather than derived from the seed. Two
 * different accents therefore produce ramps that are equally light at 500,
 * which is what lets the contrast solver in solve.ts reason about steps.
 */
export const LIGHTNESS: Record<RampStep, number> = {
  50: 0.97, 100: 0.94, 200: 0.89, 300: 0.82, 400: 0.72, 500: 0.62,
  600: 0.55, 700: 0.47, 800: 0.39, 900: 0.32, 950: 0.24
}

/**
 * Chroma multiplier per step. Colour peaks through the middle and falls off at
 * both ends: near-white and near-black tints hold very little chroma before
 * they start to look dirty.
 */
const CHROMA_CURVE: Record<RampStep, number> = {
  50: 0.18, 100: 0.32, 200: 0.55, 300: 0.76, 400: 0.92, 500: 1.0,
  600: 0.98, 700: 0.90, 800: 0.78, 900: 0.62, 950: 0.48
}

export const lightnessOf = (hex: string): number => {
  const c = oklch(hex)
  if (!c) throw new Error(`could not parse color: ${hex}`)
  return c.l
}

const stepHex = (l: number, c: number, h: number): string => {
  // clampChroma pulls the colour back into sRGB while holding lightness and
  // hue, which is what keeps the ramp even instead of clipping to a corner.
  const hex = formatHex(clampChroma({ mode: 'oklch', l, c, h }, 'oklch'))
  if (!hex) throw new Error('could not format color step')
  return hex
}

export const buildRamp = (seedHex: string, chromaCeiling: number): Ramp => {
  const seed = oklch(seedHex)
  if (!seed) throw new Error(`could not parse color: ${seedHex}`)

  const hue = seed.h ?? 0
  const peak = Math.min(seed.c, chromaCeiling)

  const ramp = {} as Ramp
  for (const step of RAMP_STEPS) {
    ramp[step] = stepHex(LIGHTNESS[step], peak * CHROMA_CURVE[step], hue)
  }
  return ramp
}

export const buildNeutralRamp = (hue: number, chromaCeiling: number): Ramp => {
  // Neutrals carry roughly half the accent ceiling: enough to read as warm or
  // cool rather than as #808080, not enough to look like a colour.
  const peak = Math.min(chromaCeiling / 2, 0.02)

  const ramp = {} as Ramp
  for (const step of RAMP_STEPS) {
    ramp[step] = stepHex(LIGHTNESS[step], peak * CHROMA_CURVE[step], hue)
  }
  return ramp
}

import { buildRamp, buildNeutralRamp, type Ramp } from './color/ramp.js'
import { solveSemantics, type Semantics, type PairReport } from './color/solve.js'
import { deriveDark } from './color/dark.js'
import { typeScale, spaceScale, radiusScale } from './scales.js'
import type { DesignSystem } from './types.js'

export type ComposedTokens = {
  system: DesignSystem
  accent: string
  space: number[]
  type: { steps: number[]; families: { sans: string; serif: string }; fallbacks: string[] }
  radius: number[]
  ramps: { neutral: Ramp; accent: Ramp }
  light: Semantics
  dark: Semantics
  report: PairReport[]
}

/**
 * Fallback accents per system, chosen to suit each one's character. A generic
 * default across all systems would undo the point of curating them.
 */
export const DEFAULT_ACCENTS: Record<string, string> = {
  'quiet-precision': '#1F4B3F',
  'warm-utility': '#B4531F',
  'editorial-clean': '#1B3A6B',
  'technical-mono': '#2563A8',
  'soft-clinical': '#1F7A6B',
  'bold-commerce': '#D2401E',
  'archive-serif': '#26406E',
  'playful-rounded': '#C42A7A',
  'dense-console': '#3B5BC4',
  'muted-enterprise': '#3A5480',
  'sunlit-wellness': '#A8641C',
  'stark-brutal': '#111111'
}

const FALLBACK_ACCENT = '#1F4B3F'

export const composeSystem = (
  system: DesignSystem, accentHex?: string
): ComposedTokens => {
  const accent = accentHex ?? DEFAULT_ACCENTS[system.id] ?? FALLBACK_ACCENT

  const ramps = {
    accent: buildRamp(accent, system.color.chromaCeiling),
    neutral: buildNeutralRamp(system.color.neutralHue, system.color.chromaCeiling)
  }

  const { semantics: light, report: lightReport } =
    solveSemantics(ramps.neutral, ramps.accent)
  const { semantics: dark, report: darkReport } =
    deriveDark(ramps.neutral, ramps.accent)

  return {
    system,
    accent,
    space: spaceScale(system.space.base, system.space.rhythm),
    type: {
      steps: typeScale(system.type.baseSize, system.type.ratio),
      families: system.type.families,
      fallbacks: system.type.fallbacks.sans
    },
    radius: radiusScale(system.shape.radius),
    ramps,
    light,
    dark,
    report: [...lightReport, ...darkReport]
  }
}

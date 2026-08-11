import { wcagContrast, parse } from 'culori'
import { RAMP_STEPS, type Ramp, type RampStep } from './ramp.js'

export type SemanticName =
  | 'bg' | 'surface' | 'fg' | 'muted' | 'border' | 'primary' | 'onPrimary'

export type Semantics = Record<SemanticName, string>

export type PairReport = {
  pair: string
  ratio: number
  target: number
  meets: boolean
}

/**
 * WCAG 2.1 AA is the floor. Body text takes AAA because on a near-white
 * background it costs nothing — the darkest neutral steps clear 7:1 anyway.
 */
export const TARGETS = {
  fg: 7.0,
  muted: 4.5,
  border: 3.0,
  onPrimary: 4.5
} as const

export const contrast = (a: string, b: string): number => {
  const ca = parse(a), cb = parse(b)
  if (!ca || !cb) throw new Error(`could not parse color pair: ${a} / ${b}`)
  return wcagContrast(ca, cb)
}

const LIGHT_TO_DARK: RampStep[] = [...RAMP_STEPS]
const DARK_TO_LIGHT: RampStep[] = [...RAMP_STEPS].reverse()

const firstMeeting = (
  ramp: Ramp, order: RampStep[], against: string, target: number
): string | null => {
  for (const step of order) {
    if (contrast(ramp[step], against) >= target) return ramp[step]
  }
  return null
}

export const solveSemantics = (
  neutral: Ramp, accent: Ramp
): { semantics: Semantics; report: PairReport[] } => {
  const bg = neutral[50]
  const surface = neutral[100]

  // Walk from the light end so text is the lightest value that still clears the
  // target — pinning everything to the darkest step would flatten hierarchy.
  const fg = firstMeeting(neutral, LIGHT_TO_DARK, bg, TARGETS.fg) ?? neutral[950]
  const muted = firstMeeting(neutral, LIGHT_TO_DARK, bg, TARGETS.muted) ?? neutral[700]
  const border = firstMeeting(neutral, LIGHT_TO_DARK, bg, TARGETS.border) ?? neutral[300]

  // Primary must carry legible text on top. Try each accent step and keep the
  // first that works with either the lightest or darkest neutral.
  let primary = accent[600]
  let onPrimary = neutral[50]
  for (const step of DARK_TO_LIGHT) {
    const candidate = accent[step]
    const light = contrast(neutral[50], candidate)
    const dark = contrast(neutral[950], candidate)
    if (light >= TARGETS.onPrimary || dark >= TARGETS.onPrimary) {
      primary = candidate
      onPrimary = light >= dark ? neutral[50] : neutral[950]
      break
    }
  }

  const semantics: Semantics = { bg, surface, fg, muted, border, primary, onPrimary }

  const report: PairReport[] = [
    { pair: 'fg on bg', ratio: contrast(fg, bg), target: TARGETS.fg, meets: false },
    { pair: 'muted on bg', ratio: contrast(muted, bg), target: TARGETS.muted, meets: false },
    { pair: 'border on bg', ratio: contrast(border, bg), target: TARGETS.border, meets: false },
    { pair: 'onPrimary on primary', ratio: contrast(onPrimary, primary), target: TARGETS.onPrimary, meets: false }
  ].map(r => ({ ...r, meets: r.ratio >= r.target }))

  return { semantics, report }
}

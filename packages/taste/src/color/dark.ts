import { oklch, formatHex, clampChroma } from 'culori'
import { RAMP_STEPS, type Ramp, type RampStep } from './ramp.js'
import {
  contrast, TARGETS, PRIMARY_PREFERENCE,
  type Semantics, type PairReport
} from './solve.js'

/** Saturated colour glares against a dark ground, so chroma comes down. */
const DARK_CHROMA_SCALE = 0.85

const desaturate = (hex: string, scale: number): string => {
  const c = oklch(hex)
  if (!c) throw new Error(`could not parse color: ${hex}`)
  const out = formatHex(clampChroma({ ...c, c: c.c * scale }, 'oklch'))
  if (!out) throw new Error(`could not format color: ${hex}`)
  return out
}

const DARK_TO_LIGHT: RampStep[] = [...RAMP_STEPS].reverse()

const firstMeeting = (
  ramp: Ramp, order: RampStep[], against: string, target: number
): string | null => {
  for (const step of order) {
    if (contrast(ramp[step], against) >= target) return ramp[step]
  }
  return null
}

export const deriveDark = (
  neutral: Ramp, accent: Ramp
): { semantics: Semantics; report: PairReport[] } => {
  // Elevation is lightness, not shadow: 950 is the page, 900 sits above it.
  const bg = neutral[950]
  const surface = neutral[900]

  // Walk from the dark end so text is the dimmest value that still clears the
  // target, which keeps a readable hierarchy instead of pinning all text white.
  const fg = firstMeeting(neutral, DARK_TO_LIGHT, bg, TARGETS.fg) ?? neutral[50]
  const muted = firstMeeting(neutral, DARK_TO_LIGHT, bg, TARGETS.muted) ?? neutral[300]
  const border = firstMeeting(neutral, DARK_TO_LIGHT, bg, TARGETS.border) ?? neutral[700]

  let primary = desaturate(accent[400], DARK_CHROMA_SCALE)
  let onPrimary = neutral[950]
  for (const step of PRIMARY_PREFERENCE) {
    const candidate = desaturate(accent[step], DARK_CHROMA_SCALE)
    const light = contrast(neutral[50], candidate)
    const dark = contrast(neutral[950], candidate)
    if (light >= TARGETS.onPrimary || dark >= TARGETS.onPrimary) {
      primary = candidate
      onPrimary = dark >= light ? neutral[950] : neutral[50]
      break
    }
  }

  const semantics: Semantics = { bg, surface, fg, muted, border, primary, onPrimary }

  const report: PairReport[] = [
    { pair: 'dark fg on bg', ratio: contrast(fg, bg), target: TARGETS.fg, meets: false },
    { pair: 'dark muted on bg', ratio: contrast(muted, bg), target: TARGETS.muted, meets: false },
    { pair: 'dark border on bg', ratio: contrast(border, bg), target: TARGETS.border, meets: false },
    { pair: 'dark onPrimary on primary', ratio: contrast(onPrimary, primary), target: TARGETS.onPrimary, meets: false }
  ].map(r => ({ ...r, meets: r.ratio >= r.target }))

  return { semantics, report }
}

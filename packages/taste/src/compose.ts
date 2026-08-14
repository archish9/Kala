import { buildRamp, buildNeutralRamp, type Ramp } from './color/ramp.js'
import { solveSemantics, type Semantics, type PairReport } from './color/solve.js'
import { deriveDark } from './color/dark.js'
import { typeScale, spaceScale, radiusScale } from './scales.js'
import { selectSystems, selectCatalogStyles, selectCatalogPalettes, selectCatalogTypography } from './select.js'
import type { CatalogPools } from './catalog.js'
import type {
  DesignSystem, CatalogStyle, CatalogPalette, CatalogTypography, Proposal
} from './types.js'

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

const DARK_QUERY_MARKERS = [
  'dark mode', 'dark theme', 'dark ui', 'dark-mode', 'darkmode',
  'night mode', 'midnight', 'oled'
]

export const resolveColorMode = (brief: string, style: CatalogStyle): 'light' | 'dark' => {
  const lower = brief.toLowerCase()
  if (DARK_QUERY_MARKERS.some(m => lower.includes(m))) return 'dark'
  if (style.color.darkPrimary) return 'dark'
  return 'light'
}

const synthesizeSystem = (
  style: CatalogStyle, palette: CatalogPalette, typography: CatalogTypography
): DesignSystem => ({
  id: `${style.id}--${palette.id}--${typography.id}`,
  axes: style.axes,
  fitFor: style.fitFor,
  avoidFor: style.avoidFor,
  type: {
    families: typography.families,
    fallbacks: { sans: ['system-ui', 'sans-serif'] },
    ratio: typography.ratio,
    baseSize: typography.baseSize,
    maxWeights: typography.maxWeights
  },
  space: { base: 4, rhythm: 'normal', sectionGap: 64 },
  shape: style.shape,
  color: {
    strategy: style.color.strategy,
    neutralHue: palette.neutralHue,
    chromaCeiling: palette.chromaCeiling
  },
  motion: style.motion,
  signature: [],
  antiDefaults: []
})

/** Below this, a curated-system fit is treated as not a real match. */
const CURATED_FIT_THRESHOLD = 0.55

/**
 * Curated systems first — they carry hand-authored signature/antiDefaults
 * guidance the catalog tier does not. Only when the best curated fit is weak
 * does this fall through to independently picking a style, a color-mode-
 * matched palette, and a typography pairing from the catalog. The avoidFor
 * penalty (scorePool, -0.30 per hit) already prices an avoidFor match into
 * `fit`, so a single threshold check covers both "weak fit" and
 * "avoidFor-blocked" without a second condition.
 */
export const proposeSystem = (
  brief: string, curated: DesignSystem[], catalog: CatalogPools, limit = 3
): Proposal[] => {
  const curatedProposals = selectSystems(brief, curated, limit)
  const bestCurated = curatedProposals[0]

  if (bestCurated !== undefined && bestCurated.fit >= CURATED_FIT_THRESHOLD) {
    return curatedProposals
  }

  const styles = selectCatalogStyles(brief, catalog.styles, limit)
  if (styles.length === 0) return curatedProposals // never a dead end

  return styles.map(({ style, fit, rationale }) => {
    const mode = resolveColorMode(brief, style)
    const palette = selectCatalogPalettes(brief, catalog.palettes, mode, 1)[0]?.palette
    const typography = selectCatalogTypography(brief, catalog.typography, 1)[0]?.typography

    if (!palette || !typography) return curatedProposals[0]! // catalog partially empty

    return { system: synthesizeSystem(style, palette, typography), fit, rationale }
  })
}

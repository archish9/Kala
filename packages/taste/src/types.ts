export type Axes = {
  formality: number
  density: number
  energy: number
  expressiveness: number
}

export const AXIS_NAMES = [
  'formality', 'density', 'energy', 'expressiveness'
] as const

export type AxisName = typeof AXIS_NAMES[number]
export type AxisRange = [number, number]

export type DesignSystem = {
  id: string
  axes: Record<AxisName, AxisRange>
  fitFor: string[]
  avoidFor: string[]
  type: {
    families: { sans: string; serif: string }
    fallbacks: { sans: string[] }
    ratio: number
    baseSize: number
    maxWeights: number
  }
  space: { base: number; rhythm: 'tight' | 'normal' | 'generous'; sectionGap: number }
  shape: { radius: number; depth: 'borders' | 'shadows' }
  color: { strategy: string; neutralHue: number; chromaCeiling: number }
  motion: { budget: string; duration: number; easing: string }
  signature: string[]
  antiDefaults: string[]
}

export type Brief = { text: string; accent?: string }

export type Proposal = {
  system: DesignSystem
  fit: number
  rationale: string
}

export type CatalogStyle = {
  id: string
  axes: Record<AxisName, AxisRange>
  fitFor: string[]
  avoidFor: string[]
  keywords: string[]
  shape: { radius: number; depth: 'borders' | 'shadows' }
  motion: { budget: string; duration: number; easing: string }
  color: { strategy: string; darkPrimary: boolean }
  signature: string[]
  antiDefaults: string[]
}

export type CatalogPalette = {
  id: string
  axes: Record<AxisName, AxisRange>
  fitFor: string[]
  avoidFor: string[]
  neutralHue: number
  chromaCeiling: number
  defaultAccent: string
  darkPrimary: boolean
}

export type CatalogTypography = {
  id: string
  axes: Record<AxisName, AxisRange>
  fitFor: string[]
  avoidFor: string[]
  keywords: string[]
  families: { sans: string; serif: string }
  ratio: number
  baseSize: number
  maxWeights: number
  googleFontsUrl?: string
}

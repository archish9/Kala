import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Degraded } from '@kala/kernel/engine/rule-types.js'
import {
  AXIS_NAMES, type CatalogStyle, type CatalogPalette, type CatalogTypography
} from './types.js'

const isRange = (v: unknown): boolean =>
  Array.isArray(v) && v.length === 2 &&
  v.every(n => typeof n === 'number' && n >= 0 && n <= 1) &&
  (v[0] as number) <= (v[1] as number)

const hasValidAxes = (s: { axes?: unknown }): boolean => {
  const axes = s.axes as Record<string, unknown> | undefined
  if (!axes) return false
  return AXIS_NAMES.every(axis => isRange(axes[axis]))
}

const validateStyle = (s: Partial<CatalogStyle>): string | null => {
  if (!s.id) return 'missing id'
  if (!hasValidAxes(s)) return 'axes must be [low, high] within 0..1 for every axis, low <= high'
  if (!Array.isArray(s.fitFor)) return 'missing fitFor'
  if (typeof s.shape?.radius !== 'number') return 'missing shape.radius'
  if (typeof s.motion?.duration !== 'number') return 'missing motion.duration'
  if (typeof s.color?.strategy !== 'string') return 'missing color.strategy'
  return null
}

const validatePalette = (p: Partial<CatalogPalette>): string | null => {
  if (!p.id) return 'missing id'
  if (!hasValidAxes(p)) return 'axes must be [low, high] within 0..1 for every axis, low <= high'
  if (typeof p.neutralHue !== 'number') return 'missing neutralHue'
  if (typeof p.chromaCeiling !== 'number') return 'missing chromaCeiling'
  if (typeof p.defaultAccent !== 'string') return 'missing defaultAccent'
  return null
}

const validateTypography = (t: Partial<CatalogTypography>): string | null => {
  if (!t.id) return 'missing id'
  if (!hasValidAxes(t)) return 'axes must be [low, high] within 0..1 for every axis, low <= high'
  if (!t.families?.sans) return 'missing families.sans'
  if (typeof t.ratio !== 'number') return 'missing ratio'
  return null
}

export type CatalogPools = {
  styles: CatalogStyle[]
  palettes: CatalogPalette[]
  typography: CatalogTypography[]
}

const loadArray = async <T>(
  file: string, validate: (row: Partial<T>) => string | null, code: string
): Promise<{ items: T[]; degraded: Degraded[] }> => {
  const degraded: Degraded[] = []
  let rows: unknown[]
  try {
    rows = JSON.parse(await readFile(file, 'utf8'))
  } catch (err) {
    degraded.push({
      code: `${code}_PARSE_FAILED`, path: file,
      detail: (err as Error).message, impact: 'catalog domain not available'
    })
    return { items: [], degraded }
  }

  const items: T[] = []
  for (const row of rows) {
    const problem = validate(row as Partial<T>)
    if (problem) {
      degraded.push({
        code: `${code}_INVALID`, path: file,
        detail: `${(row as { id?: string }).id ?? '(no id)'}: ${problem}`,
        impact: '1 catalog entry not loaded'
      })
      continue
    }
    items.push(row as T)
  }
  return { items, degraded }
}

export const loadCatalog = async (
  dir: string
): Promise<{ catalog: CatalogPools; degraded: Degraded[] }> => {
  const [styles, palettes, typography] = await Promise.all([
    loadArray<CatalogStyle>(join(dir, 'styles.json'), validateStyle, 'CATALOG_STYLE'),
    loadArray<CatalogPalette>(join(dir, 'palettes.json'), validatePalette, 'CATALOG_PALETTE'),
    loadArray<CatalogTypography>(join(dir, 'typography.json'), validateTypography, 'CATALOG_TYPOGRAPHY')
  ])

  return {
    catalog: { styles: styles.items, palettes: palettes.items, typography: typography.items },
    degraded: [...styles.degraded, ...palettes.degraded, ...typography.degraded]
  }
}

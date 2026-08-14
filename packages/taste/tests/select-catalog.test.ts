import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATALOG_DIR } from '@kala/packs'
import {
  selectCatalogStyles, selectCatalogPalettes, selectCatalogTypography
} from '../src/select.js'
import type { CatalogStyle, CatalogPalette, CatalogTypography } from '../src/types.js'

const load = <T>(file: string): T[] =>
  JSON.parse(readFileSync(join(CATALOG_DIR, file), 'utf8')) as T[]

const styles = load<CatalogStyle>('styles.json')
const palettes = load<CatalogPalette>('palettes.json')
const typography = load<CatalogTypography>('typography.json')

describe('selectCatalogStyles', () => {
  it('returns three proposals, fit descending', () => {
    const picks = selectCatalogStyles('playful kids game app', styles)
    expect(picks).toHaveLength(3)
    const fits = picks.map(p => p.fit)
    expect(fits).toEqual([...fits].sort((a, b) => b - a))
  })

  it('is deterministic for the same brief', () => {
    const a = selectCatalogStyles('dense analytics dashboard', styles).map(p => p.style.id)
    const b = selectCatalogStyles('dense analytics dashboard', styles).map(p => p.style.id)
    expect(a).toEqual(b)
  })
})

describe('selectCatalogPalettes', () => {
  it('prefers a dark-primary palette when mode is dark', () => {
    const picks = selectCatalogPalettes('admin console', palettes, 'dark', 1)
    expect(picks[0]!.palette.darkPrimary).toBe(true)
  })

  it('never returns an empty list when the pool is non-empty', () => {
    expect(selectCatalogPalettes('anything', palettes, 'light', 1)).toHaveLength(1)
  })
})

describe('selectCatalogTypography', () => {
  it('returns three proposals, fit descending', () => {
    const picks = selectCatalogTypography('luxury boutique fashion', typography)
    expect(picks).toHaveLength(3)
    const fits = picks.map(p => p.fit)
    expect(fits).toEqual([...fits].sort((a, b) => b - a))
  })
})

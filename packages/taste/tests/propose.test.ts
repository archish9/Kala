import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATALOG_DIR, SYSTEMS_DIR } from '@kala/packs'
import { loadSystems } from '../src/load.js'
import { proposeSystem, resolveColorMode, composeSystem } from '../src/compose.js'
import type { CatalogPools } from '../src/catalog.js'
import type {
  CatalogStyle, CatalogPalette, CatalogTypography, DesignSystem
} from '../src/types.js'

const loadJson = <T>(file: string): T[] =>
  JSON.parse(readFileSync(join(CATALOG_DIR, file), 'utf8')) as T[]

const catalog: CatalogPools = {
  styles: loadJson<CatalogStyle>('styles.json'),
  palettes: loadJson<CatalogPalette>('palettes.json'),
  typography: loadJson<CatalogTypography>('typography.json')
}

/**
 * Axes pinned far from the neutral 0.5 midpoint every real curated system's
 * range straddles — no ordinary brief can score this well, so proposeSystem
 * is forced into the catalog tier deterministically, independent of the real
 * systems/*.json data (which could otherwise drift and make a hand-picked
 * "unmatched" brief start matching something).
 */
const impossibleCurated: DesignSystem[] = [{
  id: 'impossible-fit',
  axes: {
    formality: [0.95, 1], density: [0.95, 1], energy: [0.95, 1], expressiveness: [0.95, 1]
  },
  fitFor: [], avoidFor: [],
  type: {
    families: { sans: 'X', serif: 'Y' }, fallbacks: { sans: ['system-ui'] },
    ratio: 1.2, baseSize: 16, maxWeights: 2
  },
  space: { base: 4, rhythm: 'normal', sectionGap: 64 },
  shape: { radius: 4, depth: 'borders' },
  color: { strategy: 's', neutralHue: 0, chromaCeiling: 0.05 },
  motion: { budget: 'minimal', duration: 150, easing: 'ease-out' },
  signature: ['a', 'b', 'c'], antiDefaults: ['x']
}]

describe('resolveColorMode', () => {
  const style = catalog.styles[0]!

  it('resolves dark when the brief explicitly asks for dark mode', () => {
    expect(resolveColorMode('a dark mode dashboard', { ...style, color: { ...style.color, darkPrimary: false } }))
      .toBe('dark')
  })

  it('resolves dark when the chosen style is dark-primary, even with a neutral brief', () => {
    expect(resolveColorMode('a project management tool', { ...style, color: { ...style.color, darkPrimary: true } }))
      .toBe('dark')
  })

  it('defaults to light otherwise', () => {
    expect(resolveColorMode('a project management tool', { ...style, color: { ...style.color, darkPrimary: false } }))
      .toBe('light')
  })
})

describe('proposeSystem', () => {
  it('uses a curated system when the fit is strong', async () => {
    const { systems } = await loadSystems(SYSTEMS_DIR)
    const proposals = proposeSystem('portfolio site for a photographer', systems, catalog)
    expect(proposals[0]!.system.id).toBe('editorial-clean')
  })

  it('falls through to the catalog when no curated system fits', () => {
    const proposals = proposeSystem(
      'artisanal candle subscription box for pet reptiles', impossibleCurated, catalog
    )
    expect(proposals[0]!.system.signature).toEqual([])
    expect(proposals[0]!.system.antiDefaults).toEqual([])
  })

  it('never returns an empty list, even with an empty catalog', async () => {
    const { systems } = await loadSystems(SYSTEMS_DIR)
    const empty: CatalogPools = { styles: [], palettes: [], typography: [] }
    const proposals = proposeSystem('anything at all', systems, empty)
    expect(proposals.length).toBeGreaterThan(0)
  })

  it('is deterministic for the same brief', async () => {
    const { systems } = await loadSystems(SYSTEMS_DIR)
    const a = proposeSystem('calm banking tool', systems, catalog).map(p => p.system.id)
    const b = proposeSystem('calm banking tool', systems, catalog).map(p => p.system.id)
    expect(a).toEqual(b)
  })

  it('runs the WCAG contrast solver on a catalog-sourced system, not a literal-hex bypass', () => {
    const proposals = proposeSystem(
      'artisanal candle subscription box for pet reptiles', impossibleCurated, catalog
    )
    const catalogSourced = proposals.find(p => p.system.signature.length === 0)
    expect(catalogSourced).toBeDefined()
    const tokens = composeSystem(catalogSourced!.system)
    expect(tokens.report.length).toBeGreaterThan(0)
    for (const r of tokens.report) {
      expect(r.meets, `${catalogSourced!.system.id}: ${r.pair} was ${r.ratio.toFixed(2)}`).toBe(true)
    }
  })
})

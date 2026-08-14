import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadCatalog } from '../src/catalog.js'

const validStyle = {
  id: 'test-style',
  axes: { formality: [0, 1], density: [0, 1], energy: [0, 1], expressiveness: [0, 1] },
  fitFor: ['saas'], avoidFor: [],
  keywords: ['clean'],
  shape: { radius: 8, depth: 'borders' },
  motion: { budget: 'moderate', duration: 200, easing: 'ease-out' },
  color: { strategy: 'test strategy', darkPrimary: false },
  signature: [], antiDefaults: []
}

const validPalette = {
  id: 'test-palette-1',
  axes: { formality: [0, 1], density: [0, 1], energy: [0, 1], expressiveness: [0, 1] },
  fitFor: ['saas'], avoidFor: [],
  neutralHue: 220, chromaCeiling: 0.1, defaultAccent: '#2563EB', darkPrimary: false
}

const validTypography = {
  id: 'test-pairing',
  axes: { formality: [0, 1], density: [0, 1], energy: [0, 1], expressiveness: [0, 1] },
  fitFor: ['saas'], avoidFor: [],
  keywords: ['modern'],
  families: { sans: 'Inter', serif: 'Inter' },
  ratio: 1.25, baseSize: 16, maxWeights: 3
}

describe('loadCatalog', () => {
  it('loads valid styles, palettes, and typography', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'catalog-'))
    await writeFile(join(dir, 'styles.json'), JSON.stringify([validStyle]))
    await writeFile(join(dir, 'palettes.json'), JSON.stringify([validPalette]))
    await writeFile(join(dir, 'typography.json'), JSON.stringify([validTypography]))

    const { catalog, degraded } = await loadCatalog(dir)
    expect(degraded).toEqual([])
    expect(catalog.styles).toHaveLength(1)
    expect(catalog.palettes).toHaveLength(1)
    expect(catalog.typography).toHaveLength(1)
  })

  it('rejects an invalid entry, keeping the rest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'catalog-'))
    await writeFile(join(dir, 'styles.json'), JSON.stringify([validStyle, { id: 'bad' }]))
    await writeFile(join(dir, 'palettes.json'), JSON.stringify([validPalette]))
    await writeFile(join(dir, 'typography.json'), JSON.stringify([validTypography]))

    const { catalog, degraded } = await loadCatalog(dir)
    expect(catalog.styles.map(s => s.id)).toEqual(['test-style'])
    expect(degraded.some(d => d.code === 'CATALOG_STYLE_INVALID')).toBe(true)
  })

  it('survives a malformed catalog file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'catalog-'))
    await writeFile(join(dir, 'styles.json'), '{ not json')
    await writeFile(join(dir, 'palettes.json'), JSON.stringify([validPalette]))
    await writeFile(join(dir, 'typography.json'), JSON.stringify([validTypography]))

    const { catalog, degraded } = await loadCatalog(dir)
    expect(catalog.styles).toEqual([])
    expect(degraded.some(d => d.code === 'CATALOG_STYLE_PARSE_FAILED')).toBe(true)
  })
})

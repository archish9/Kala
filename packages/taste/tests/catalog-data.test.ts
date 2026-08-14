import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CATALOG_DIR } from '@kala/packs'
import { join } from 'node:path'
import { AXIS_NAMES, type CatalogStyle, type CatalogPalette } from '../src/types.js'

const styles = JSON.parse(
  readFileSync(join(CATALOG_DIR, 'styles.json'), 'utf8')
) as CatalogStyle[]

describe('catalog/styles.json', () => {
  it('has 84 entries', () => {
    expect(styles).toHaveLength(84)
  })

  it('gives every style a valid axis range and non-empty fitFor or keywords', () => {
    for (const s of styles) {
      for (const axis of AXIS_NAMES) {
        const [lo, hi] = s.axes[axis]
        expect(lo, `${s.id}.${axis}`).toBeGreaterThanOrEqual(0)
        expect(hi, `${s.id}.${axis}`).toBeLessThanOrEqual(1)
        expect(lo).toBeLessThanOrEqual(hi)
      }
      expect(s.keywords.length, s.id).toBeGreaterThan(0)
    }
  })

  it('has unique ids', () => {
    expect(new Set(styles.map(s => s.id)).size).toBe(styles.length)
  })

  it('converts the first source row (Minimalism & Swiss Style) correctly', () => {
    const minimalism = styles.find(s => s.id === 'minimalism-swiss-style')
    expect(minimalism).toBeDefined()
    expect(minimalism!.keywords).toContain('clean')
    expect(minimalism!.fitFor).toContain('enterprise apps')
    expect(minimalism!.shape.depth).toBe('borders')
  })
})

const palettes = JSON.parse(
  readFileSync(join(CATALOG_DIR, 'palettes.json'), 'utf8')
) as CatalogPalette[]

describe('catalog/palettes.json', () => {
  it('has 192 entries', () => {
    expect(palettes).toHaveLength(192)
  })

  it('gives every palette a valid axis range and a sane neutralHue/chromaCeiling', () => {
    for (const p of palettes) {
      for (const axis of AXIS_NAMES) {
        const [lo, hi] = p.axes[axis]
        expect(lo, `${p.id}.${axis}`).toBeGreaterThanOrEqual(0)
        expect(hi, `${p.id}.${axis}`).toBeLessThanOrEqual(1)
      }
      expect(p.neutralHue).toBeGreaterThanOrEqual(0)
      expect(p.neutralHue).toBeLessThan(360)
      expect(p.chromaCeiling).toBeGreaterThan(0)
      expect(p.chromaCeiling).toBeLessThanOrEqual(0.22)
      expect(p.defaultAccent).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('has unique ids', () => {
    expect(new Set(palettes.map(p => p.id)).size).toBe(palettes.length)
  })

  it('converts the first source row (SaaS General) correctly', () => {
    const saas = palettes.find(p => p.id === 'saas-general-1')
    expect(saas).toBeDefined()
    expect(saas!.defaultAccent).toBe('#EA580C')
    expect(saas!.darkPrimary).toBe(false)
  })
})

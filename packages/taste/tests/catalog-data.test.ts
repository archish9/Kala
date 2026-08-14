import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CATALOG_DIR } from '@kala/packs'
import { join } from 'node:path'
import { AXIS_NAMES, type CatalogStyle } from '../src/types.js'

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

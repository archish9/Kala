import { describe, it, expect } from 'vitest'
import { typeScale, spaceScale, radiusScale } from '../src/scales.js'

describe('typeScale', () => {
  it('produces whole pixel values', () => {
    for (const n of typeScale(16, 1.25)) expect(Number.isInteger(n)).toBe(true)
  })

  it('ascends strictly, so no two steps collide', () => {
    const s = typeScale(15, 1.2)
    for (let i = 1; i < s.length; i++) expect(s[i]!).toBeGreaterThan(s[i - 1]!)
  })

  it('includes the base size', () => {
    expect(typeScale(16, 1.25)).toContain(16)
  })

  it('caps at seven steps, because more stops meaning anything', () => {
    expect(typeScale(16, 1.25).length).toBeLessThanOrEqual(7)
  })

  it('keeps the smallest step legible', () => {
    expect(Math.min(...typeScale(16, 1.25))).toBeGreaterThanOrEqual(12)
  })

  it('produces a wider spread for a larger ratio', () => {
    expect(Math.max(...typeScale(16, 1.4))).toBeGreaterThan(Math.max(...typeScale(16, 1.2)))
  })
})

describe('spaceScale', () => {
  it('starts at zero and ascends', () => {
    const s = spaceScale(4, 'normal')
    expect(s[0]).toBe(0)
    for (let i = 1; i < s.length; i++) expect(s[i]!).toBeGreaterThan(s[i - 1]!)
  })

  it('is a multiple of the base unit throughout', () => {
    for (const n of spaceScale(4, 'normal')) expect(n % 4).toBe(0)
  })

  it('stretches for a generous rhythm and compresses for a tight one', () => {
    expect(Math.max(...spaceScale(4, 'generous')))
      .toBeGreaterThan(Math.max(...spaceScale(4, 'tight')))
  })
})

describe('radiusScale', () => {
  it('always offers a square option', () => {
    expect(radiusScale(8)).toContain(0)
  })

  it('includes the system radius', () => {
    expect(radiusScale(8)).toContain(8)
  })

  it('ascends without duplicates even when the system radius is zero', () => {
    const s = radiusScale(0)
    expect(new Set(s).size).toBe(s.length)
    for (let i = 1; i < s.length; i++) expect(s[i]!).toBeGreaterThan(s[i - 1]!)
  })
})

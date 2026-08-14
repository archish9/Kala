import { describe, it, expect } from 'vitest'
import { parseCsv, csvToObjects, slugify, deriveAxesRange } from './lib.mjs'

describe('parseCsv', () => {
  it('splits simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('keeps commas inside quoted fields intact', () => {
    expect(parseCsv('a,b\n"one, two",3\n')).toEqual([['a', 'b'], ['one, two', '3']])
  })

  it('unescapes doubled quotes inside quoted fields', () => {
    expect(parseCsv('a\n"she said ""hi"""\n')).toEqual([['a'], ['she said "hi"']])
  })

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('csvToObjects', () => {
  it('maps each row to the header', () => {
    expect(csvToObjects('Name,Age\nAda,30\n')).toEqual([{ Name: 'Ada', Age: '30' }])
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Minimalism & Swiss Style')).toBe('minimalism-swiss-style')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  Neon! ')).toBe('neon')
  })
})

describe('deriveAxesRange', () => {
  it('returns a [low, high] pair within 0..1 for every axis', () => {
    const range = deriveAxesRange('dashboard analytics admin console')
    for (const axis of ['formality', 'density', 'energy', 'expressiveness']) {
      const [lo, hi] = range[axis]
      expect(lo).toBeGreaterThanOrEqual(0)
      expect(hi).toBeLessThanOrEqual(1)
      expect(lo).toBeLessThanOrEqual(hi)
    }
  })

  it('widens density upward for dashboard-flavoured text', () => {
    const range = deriveAxesRange('dashboard analytics admin console metrics')
    expect(range.density[1]).toBeGreaterThan(0.5)
  })
})

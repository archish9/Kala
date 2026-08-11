import { describe, it, expect } from 'vitest'
import { extractorFor, SUPPORTED_EXTENSIONS, EXTRACTORS } from '../src/extractors.js'

describe('extractor registry', () => {
  it('resolves a tsx file to an extractor', () => {
    expect(extractorFor('src/App.tsx')).toBeTypeOf('function')
  })

  it('resolves jsx as well', () => {
    expect(extractorFor('src/App.jsx')).toBeTypeOf('function')
  })

  it('returns null for an unsupported extension', () => {
    expect(extractorFor('src/styles.css')).toBeNull()
  })

  it('returns null for a file with no extension', () => {
    expect(extractorFor('Makefile')).toBeNull()
  })

  it('is case-insensitive about the extension', () => {
    expect(extractorFor('src/App.TSX')).toBeTypeOf('function')
  })

  it('lists its supported extensions', () => {
    expect(SUPPORTED_EXTENSIONS).toContain('.tsx')
    expect(SUPPORTED_EXTENSIONS.every(e => e.startsWith('.'))).toBe(true)
  })

  it('keys every entry by an extension with a leading dot', () => {
    for (const key of Object.keys(EXTRACTORS)) expect(key).toMatch(/^\.[a-z]+$/)
  })

  it('produces a working IRDoc through the resolved extractor', () => {
    const fn = extractorFor('a.tsx')!
    const doc = fn('export default () => <div className="p-4">x</div>', 'a.tsx')
    expect(doc.framework).toBe('react')
    expect(doc.nodes).toHaveLength(1)
  })
})

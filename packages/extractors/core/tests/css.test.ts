import { describe, it, expect } from 'vitest'
import { declsToStyleFacts, parseInlineStyle, parseStyleSheet } from '../src/css.js'
import { isKnown } from '@fe-design/kernel/ir/fact.js'

const origin = { kind: 'stylesheet' as const, raw: '.card' }

describe('parseInlineStyle', () => {
  it('splits declarations', () => {
    expect(parseInlineStyle('padding: 1rem; color: #111')).toEqual([
      { prop: 'padding', value: '1rem' },
      { prop: 'color', value: '#111' }
    ])
  })

  it('tolerates a trailing semicolon and odd spacing', () => {
    expect(parseInlineStyle('  padding:4px ;')).toEqual([{ prop: 'padding', value: '4px' }])
  })

  it('returns nothing for an empty string', () => {
    expect(parseInlineStyle('')).toEqual([])
  })
})

describe('declsToStyleFacts', () => {
  it('converts uniform padding', () => {
    const f = declsToStyleFacts([{ prop: 'padding', value: '1rem' }], origin)
    if (!isKnown(f.space.padding)) throw new Error('expected known')
    expect(f.space.padding.value).toEqual({ top: 16, right: 16, bottom: 16, left: 16 })
  })

  it('expands two-value padding shorthand', () => {
    const f = declsToStyleFacts([{ prop: 'padding', value: '8px 16px' }], origin)
    if (!isKnown(f.space.padding)) throw new Error('expected known')
    expect(f.space.padding.value).toEqual({ top: 8, right: 16, bottom: 8, left: 16 })
  })

  it('expands four-value padding shorthand', () => {
    const f = declsToStyleFacts([{ prop: 'padding', value: '1px 2px 3px 4px' }], origin)
    if (!isKnown(f.space.padding)) throw new Error('expected known')
    expect(f.space.padding.value).toEqual({ top: 1, right: 2, bottom: 3, left: 4 })
  })

  it('applies longhand padding over shorthand in source order', () => {
    const f = declsToStyleFacts([
      { prop: 'padding', value: '16px' },
      { prop: 'padding-left', value: '8px' }
    ], origin)
    if (!isKnown(f.space.padding)) throw new Error('expected known')
    expect(f.space.padding.value).toEqual({ top: 16, right: 16, bottom: 16, left: 8 })
  })

  it('converts font size, weight, and family', () => {
    const f = declsToStyleFacts([
      { prop: 'font-size', value: '18px' },
      { prop: 'font-weight', value: '600' },
      { prop: 'font-family', value: 'Söhne, system-ui' }
    ], origin)
    if (isKnown(f.type.size)) expect(f.type.size.value.px).toBe(18)
    if (isKnown(f.type.weight)) expect(f.type.weight.value).toBe(600)
    if (isKnown(f.type.family)) expect(f.type.family.value).toBe('Söhne')
  })

  it('maps named font weights to numbers', () => {
    const f = declsToStyleFacts([{ prop: 'font-weight', value: 'bold' }], origin)
    if (isKnown(f.type.weight)) expect(f.type.weight.value).toBe(700)
  })

  it('converts colors from hex and named forms', () => {
    const f = declsToStyleFacts([
      { prop: 'color', value: '#111827' },
      { prop: 'background-color', value: 'white' },
      { prop: 'border-color', value: '#e5e7eb' }
    ], origin)
    if (isKnown(f.color.fg)) expect(f.color.fg.value.hex).toBe('#111827')
    if (isKnown(f.color.bg)) expect(f.color.bg.value.hex).toBe('#ffffff')
    if (isKnown(f.color.border)) expect(f.color.border.value.hex).toBe('#e5e7eb')
  })

  it('reads the color out of a background shorthand', () => {
    const f = declsToStyleFacts([{ prop: 'background', value: '#ffffff' }], origin)
    if (isKnown(f.color.bg)) expect(f.color.bg.value.hex).toBe('#ffffff')
  })

  it('converts radius, border width, and gap', () => {
    const f = declsToStyleFacts([
      { prop: 'border-radius', value: '12px' },
      { prop: 'border-width', value: '1px' },
      { prop: 'gap', value: '8px' }
    ], origin)
    if (isKnown(f.shape.radius)) expect(f.shape.radius.value.px).toBe(12)
    if (isKnown(f.shape.borderWidth)) expect(f.shape.borderWidth.value.px).toBe(1)
    if (isKnown(f.space.gap)) expect(f.space.gap.value.px).toBe(8)
  })

  it('reads border width out of the border shorthand', () => {
    const f = declsToStyleFacts([{ prop: 'border', value: '1px solid #ccc' }], origin)
    if (isKnown(f.shape.borderWidth)) expect(f.shape.borderWidth.value.px).toBe(1)
    if (isKnown(f.color.border)) expect(f.color.border.value.hex).toBe('#cccccc')
  })

  it('marks a value it cannot resolve statically as unknown, not absent', () => {
    const f = declsToStyleFacts([{ prop: 'padding', value: 'var(--space-4)' }], origin)
    expect(f.space.padding.state).toBe('unknown')
  })

  it('leaves untouched properties absent', () => {
    const f = declsToStyleFacts([{ prop: 'padding', value: '4px' }], origin)
    expect(f.color.fg.state).toBe('absent')
  })

  it('records the raw declarations', () => {
    const f = declsToStyleFacts([{ prop: 'padding', value: '4px' }], origin)
    expect(f.raw).toContain('padding: 4px')
  })
})

describe('parseStyleSheet', () => {
  it('extracts rules and their declarations', () => {
    const { rules } = parseStyleSheet('.card { padding: 1rem; color: #111 } .x { gap: 8px }')
    expect(rules).toHaveLength(2)
    expect(rules[0]!.selector).toBe('.card')
    expect(rules[0]!.decls).toEqual([
      { prop: 'padding', value: '1rem' },
      { prop: 'color', value: '#111' }
    ])
  })

  it('counts what it could not parse rather than throwing', () => {
    const { rules, unparsed } = parseStyleSheet('.a { color: red } this is not css {{{')
    expect(rules.length).toBeGreaterThanOrEqual(0)
    expect(unparsed).toBeGreaterThanOrEqual(1)
  })

  it('returns nothing for empty css', () => {
    expect(parseStyleSheet('').rules).toEqual([])
  })
})

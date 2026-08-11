import { describe, it, expect } from 'vitest'
import { matchSelector, rulesFor } from '../src/selectors.js'

const el = { tag: 'div', classes: ['card', 'wide'], id: 'main' }

describe('matchSelector', () => {
  it('applies for a matching class', () => {
    expect(matchSelector('.card', el)).toBe('applies')
  })

  it('applies for a matching tag', () => {
    expect(matchSelector('div', el)).toBe('applies')
  })

  it('applies for a matching id', () => {
    expect(matchSelector('#main', el)).toBe('applies')
  })

  it('applies for a compound selector when every part matches', () => {
    expect(matchSelector('div.card.wide', el)).toBe('applies')
  })

  it('does not apply when a compound part is missing', () => {
    expect(matchSelector('div.card.narrow', el)).toBe('no')
  })

  it('does not apply for an unrelated class', () => {
    expect(matchSelector('.sidebar', el)).toBe('no')
  })

  it('is a maybe for a descendant selector whose subject matches', () => {
    expect(matchSelector('.sidebar .card', el)).toBe('maybe')
  })

  it('does not apply when the descendant subject does not match', () => {
    expect(matchSelector('.sidebar .other', el)).toBe('no')
  })

  it('is a maybe for a pseudo-class on a matching subject', () => {
    expect(matchSelector('.card:hover', el)).toBe('maybe')
  })

  it('handles a selector list, taking the strongest outcome', () => {
    expect(matchSelector('.nope, .card', el)).toBe('applies')
    expect(matchSelector('.nope, .sidebar .card', el)).toBe('maybe')
    expect(matchSelector('.nope, .other', el)).toBe('no')
  })

  it('treats the universal selector as applying', () => {
    expect(matchSelector('*', el)).toBe('applies')
  })
})

describe('rulesFor', () => {
  const rules = [
    { selector: '.card', decls: [{ prop: 'padding', value: '16px' }] },
    { selector: '.sidebar .card', decls: [{ prop: 'color', value: 'red' }] },
    { selector: '.other', decls: [{ prop: 'gap', value: '4px' }] }
  ]

  it('separates certain declarations from uncertain ones', () => {
    const { certain, uncertain } = rulesFor(rules, el)
    expect(certain).toEqual([{ prop: 'padding', value: '16px' }])
    expect(uncertain).toEqual([{ prop: 'color', value: 'red' }])
  })

  it('ignores rules that cannot apply', () => {
    const { certain, uncertain } = rulesFor(rules, el)
    expect([...certain, ...uncertain].some(d => d.prop === 'gap')).toBe(false)
  })
})

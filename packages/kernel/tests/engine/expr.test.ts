import { describe, it, expect } from 'vitest'
import { evaluate } from '../../src/engine/expr.js'
import { known, absent, unknown } from '../../src/ir/fact.js'

const origin = { kind: 'class' as const, raw: 'p-4' }

describe('evaluate — unknown contract', () => {
  it('returns unknown when any operand is an unknown Fact', () => {
    const ctx = { self: { style: { space: { padding: unknown('dynamic-expression') } } } }
    expect(evaluate({ gte: ['self.style.space.padding', 4] }, ctx).state).toBe('unknown')
  })

  it('propagates unknown through and/or, never short-circuiting past it', () => {
    const ctx = { self: { a: known(1, origin), b: unknown('prop-flow') } }
    expect(evaluate({ and: [{ gte: ['self.a', 0] }, { gte: ['self.b', 0] }] }, ctx).state)
      .toBe('unknown')
    expect(evaluate({ or: [{ gte: ['self.a', 0] }, { gte: ['self.b', 0] }] }, ctx).state)
      .toBe('unknown')
  })

  it('treats absent as a real value, not as unknown', () => {
    const ctx = { self: { a: absent() } }
    expect(evaluate({ eq: ['self.a', null] }, ctx)).toEqual({ state: 'value', value: true })
  })

  it('resolves a path that reaches through an absent fact to undefined', () => {
    const ctx = { self: { style: { type: { size: absent() } } } }
    expect(evaluate({ in: ['self.style.type.size.px', [12, 16]] }, ctx))
      .toEqual({ state: 'value', value: false })
  })
})

describe('evaluate — operators', () => {
  it('gte compares numbers', () => {
    const ctx = { self: { a: known(16, origin) } }
    expect(evaluate({ gte: ['self.a', 12] }, ctx)).toEqual({ state: 'value', value: true })
    expect(evaluate({ gte: ['self.a', 20] }, ctx)).toEqual({ state: 'value', value: false })
  })

  it('in checks membership against a list', () => {
    const ctx = { self: { a: known(16, origin) }, lock: { space: [4, 8, 16] } }
    expect(evaluate({ in: ['self.a', '$lock.space'] }, ctx))
      .toEqual({ state: 'value', value: true })
  })

  it('allIn requires every member of a Box to be in the list', () => {
    const box = { top: 16, right: 16, bottom: 13, left: 16 }
    const ctx = { self: { p: known(box, origin) }, lock: { space: [4, 8, 16] } }
    expect(evaluate({ allIn: ['self.p', '$lock.space'] }, ctx))
      .toEqual({ state: 'value', value: false })
  })
})

describe('evaluate — builtins', () => {
  it('contrast computes a WCAG ratio', () => {
    const ctx = {
      self: { fg: known({ hex: '#000000' }, origin) },
      other: { bg: known({ hex: '#ffffff' }, origin) }
    }
    expect(evaluate({ gte: ['contrast(self.fg, other.bg)', 20] }, ctx))
      .toEqual({ state: 'value', value: true })
  })

  it('distinct counts unique collected values', () => {
    expect(evaluate({ gte: ['distinct(collected)', 3] }, { collected: [12, 12, 16, 20] }))
      .toEqual({ state: 'value', value: true })
  })

  it('a builtin over an unknown operand yields unknown', () => {
    const ctx = {
      self: { fg: unknown('external-stylesheet') },
      other: { bg: known({ hex: '#fff' }, origin) }
    }
    expect(evaluate({ gte: ['contrast(self.fg, other.bg)', 4.5] }, ctx).state)
      .toBe('unknown')
  })
})

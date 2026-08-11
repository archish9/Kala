import { describe, it, expect } from 'vitest'
import { mergeFacts } from '../src/merge.js'
import { emptyStyleFacts } from '@fe-design/kernel/ir/types.js'
import { known, unknown, isKnown } from '@fe-design/kernel/ir/fact.js'

const origin = { kind: 'class' as const, raw: 'p-4' }
const withPadding = (v: number) => {
  const f = emptyStyleFacts()
  f.space.padding = known({ top: v, right: v, bottom: v, left: v }, origin)
  return f
}

describe('mergeFacts', () => {
  it('lets a later layer win over an earlier one', () => {
    const merged = mergeFacts([withPadding(4), withPadding(16)])
    if (!isKnown(merged.space.padding)) throw new Error('expected known')
    expect(merged.space.padding.value.top).toBe(16)
  })

  it('keeps an earlier known value when the later layer is absent', () => {
    const merged = mergeFacts([withPadding(4), emptyStyleFacts()])
    if (!isKnown(merged.space.padding)) throw new Error('expected known')
    expect(merged.space.padding.value.top).toBe(4)
  })

  it('lets unknown override known, because uncertainty is contagious', () => {
    const later = emptyStyleFacts()
    later.space.padding = unknown('external-stylesheet')
    expect(mergeFacts([withPadding(4), later]).space.padding.state).toBe('unknown')
  })

  it('stays absent when every layer is absent', () => {
    expect(mergeFacts([emptyStyleFacts(), emptyStyleFacts()]).space.padding.state)
      .toBe('absent')
  })

  it('concatenates raw across layers', () => {
    const a = emptyStyleFacts(); a.raw = ['p-4']
    const b = emptyStyleFacts(); b.raw = ['padding: 1rem']
    expect(mergeFacts([a, b]).raw).toEqual(['p-4', 'padding: 1rem'])
  })

  it('returns an empty fact set for no layers', () => {
    expect(mergeFacts([]).space.padding.state).toBe('absent')
  })
})

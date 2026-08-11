import { describe, it, expect } from 'vitest'
import { known, absent, unknown, isKnown, isUnknown } from '../../src/ir/fact.js'

describe('Fact', () => {
  it('known carries a value and its origin', () => {
    const f = known(16, { kind: 'class', raw: 'p-4' })
    expect(isKnown(f)).toBe(true)
    if (isKnown(f)) {
      expect(f.value).toBe(16)
      expect(f.origin.raw).toBe('p-4')
    }
  })

  it('absent is distinguishable from unknown', () => {
    expect(isKnown(absent())).toBe(false)
    expect(isUnknown(absent())).toBe(false)
    expect(isUnknown(unknown('dynamic-expression'))).toBe(true)
  })

  it('unknown records why it could not be determined', () => {
    const f = unknown('unresolved-call')
    if (isUnknown(f)) expect(f.reason).toBe('unresolved-call')
  })
})

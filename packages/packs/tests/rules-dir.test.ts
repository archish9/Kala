import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { RULES_DIR } from '../src/index.js'

describe('RULES_DIR', () => {
  it('points at a directory that actually holds the pack', () => {
    expect(existsSync(RULES_DIR)).toBe(true)
    expect(existsSync(join(RULES_DIR, 'scale/space-off-scale.json'))).toBe(true)
    expect(existsSync(join(RULES_DIR, 'predicates/nested-card.mjs'))).toBe(true)
  })
})

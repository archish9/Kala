import { describe, it, expect } from 'vitest'
import { KERNEL_VERSION } from '../src/version.js'

describe('kernel', () => {
  it('exposes a semver version string', () => {
    expect(KERNEL_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

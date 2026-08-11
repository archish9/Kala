import { describe, it, expect } from 'vitest'
import { resolveSurface } from '../../src/surface/resolve.js'

describe('resolveSurface', () => {
  it('derives a surface id from an app-router page path', () => {
    expect(resolveSurface('src/app/settings/page.tsx')).toBe('settings')
  })

  it('derives a surface id from a pages-router path', () => {
    expect(resolveSurface('pages/dashboard.tsx')).toBe('dashboard')
  })

  it('derives a surface id from a SvelteKit route', () => {
    expect(resolveSurface('src/routes/billing/+page.svelte')).toBe('billing')
  })

  it('honours an explicit override', () => {
    expect(resolveSurface('src/x/Weird.tsx', { 'src/x/Weird.tsx': 'checkout' }))
      .toBe('checkout')
  })

  it('falls back to the file path when no route pattern matches', () => {
    expect(resolveSurface('src/components/Card.tsx')).toBe('src/components/Card.tsx')
  })
})

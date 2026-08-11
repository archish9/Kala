import { describe, it, expect } from 'vitest'
import {
  browserAvailable, launchChromium, INSTALL_HINT, DEFAULT_VIEWPORTS
} from '../src/launch.js'

describe('browser availability', () => {
  it('answers whether a browser can be launched without throwing', async () => {
    expect(typeof await browserAvailable()).toBe('boolean')
  }, 30000)

  it('offers an install hint that names the actual command', () => {
    expect(INSTALL_HINT).toContain('playwright install chromium')
  })

  it('ships sensible default viewports covering phone and desktop', () => {
    expect(DEFAULT_VIEWPORTS.length).toBeGreaterThanOrEqual(2)
    expect(DEFAULT_VIEWPORTS.some(v => v.width <= 400)).toBe(true)
    expect(DEFAULT_VIEWPORTS.some(v => v.width >= 1280)).toBe(true)
    for (const v of DEFAULT_VIEWPORTS) {
      expect(v.width).toBeGreaterThan(0)
      expect(v.height).toBeGreaterThan(0)
    }
  })
})

describe('launchChromium', () => {
  it('either launches or degrades, but never throws', async () => {
    const r = await launchChromium()
    if (r.ok) {
      expect(r.browser).toBeTruthy()
      await r.browser.close()
    } else {
      expect(r.degraded.code).toBe('BROWSER_UNAVAILABLE')
      expect(r.degraded.detail).toContain('playwright install chromium')
    }
  }, 30000)
})

import type { Degraded } from '@fe-design/kernel/engine/rule-types.js'
import type { BrowserLike, Viewport } from './facts.js'

export const INSTALL_HINT =
  'Install the browser pack with: npx playwright install chromium'

/** Phone, tablet, and desktop. Overflow shows up at the narrow end. */
export const DEFAULT_VIEWPORTS: Viewport[] = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 }
]

/**
 * Playwright is imported here and nowhere else, so importing this package
 * succeeds even when Playwright is absent. The browser pass is opt-in; every
 * other tool must keep working without it.
 */
const loadChromium = async (): Promise<unknown | null> => {
  try {
    const mod = await import('playwright') as { chromium?: unknown }
    return mod.chromium ?? null
  } catch {
    return null
  }
}

export const browserAvailable = async (): Promise<boolean> => {
  const chromium = await loadChromium()
  if (!chromium) return false
  try {
    const b = await (chromium as {
      launch(o: { headless: boolean }): Promise<{ close(): Promise<void> }>
    }).launch({ headless: true })
    await b.close()
    return true
  } catch {
    return false
  }
}

export const launchChromium = async (): Promise<
  { ok: true; browser: BrowserLike } | { ok: false; degraded: Degraded }
> => {
  const chromium = await loadChromium()
  if (!chromium) {
    return {
      ok: false,
      degraded: {
        code: 'BROWSER_UNAVAILABLE',
        detail: `Playwright is not installed. ${INSTALL_HINT}`,
        impact: 'no rendered findings; source analysis is unaffected'
      }
    }
  }

  try {
    const browser = await (chromium as {
      launch(o: { headless: boolean }): Promise<BrowserLike>
    }).launch({ headless: true })
    return { ok: true, browser }
  } catch (err) {
    return {
      ok: false,
      degraded: {
        code: 'BROWSER_UNAVAILABLE',
        detail: `Chromium could not start: ${(err as Error).message}. ${INSTALL_HINT}`,
        impact: 'no rendered findings; source analysis is unaffected'
      }
    }
  }
}

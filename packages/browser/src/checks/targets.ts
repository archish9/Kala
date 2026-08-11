import type { PageFacts } from '../facts.js'
import type { BrowserFinding } from './contrast.js'

/** WCAG 2.2 target size, and the practical floor for a fingertip. */
export const MIN_TARGET_PX = 44

/** Above this width a pointer is likely, and the target rule does not apply. */
const TOUCH_VIEWPORT_MAX = 1024

export const checkTargets = (facts: PageFacts): BrowserFinding[] => {
  if (facts.viewport.width > TOUCH_VIEWPORT_MAX) return []

  const viewport = `${facts.viewport.width}x${facts.viewport.height}`
  const out: BrowserFinding[] = []

  for (const node of facts.nodes) {
    if (!node.interactive) continue

    const { w, h } = node.rect
    // Zero-sized controls are hidden, not small; reporting them is noise.
    if (w === 0 || h === 0) continue
    if (w >= MIN_TARGET_PX && h >= MIN_TARGET_PX) continue

    out.push({
      rule: 'small-touch-target',
      sev: 'warn',
      selector: node.selector,
      viewport,
      msg: `${node.selector} renders at ${w}x${h}px, below the ${MIN_TARGET_PX}px touch minimum.`,
      fix: `Grow the control, or add padding until both sides reach ${MIN_TARGET_PX}px.`
    })
  }

  return out
}

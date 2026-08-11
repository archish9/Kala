import type { PageFacts } from '../facts.js'
import type { BrowserFinding } from './contrast.js'

/** Sub-pixel layout rounding routinely puts scrollWidth one over. */
const TOLERANCE_PX = 1

export const checkOverflow = (facts: PageFacts): BrowserFinding[] => {
  const viewport = `${facts.viewport.width}x${facts.viewport.height}`
  const overflow = facts.scrollWidth - facts.viewport.width
  if (overflow <= TOLERANCE_PX) return []

  // The page-level fact is one finding. The widest element that extends past
  // the viewport is named alongside it, because "the page scrolls sideways" is
  // not actionable without a culprit.
  const culprit = facts.nodes
    .filter(n => n.rect.x + n.rect.w > facts.viewport.width + TOLERANCE_PX)
    .sort((a, b) => (b.rect.x + b.rect.w) - (a.rect.x + a.rect.w))[0]

  return [{
    rule: 'horizontal-overflow',
    sev: 'error',
    selector: culprit?.selector ?? 'document',
    viewport,
    msg: culprit
      ? `The page scrolls sideways by ${overflow}px at ${viewport}; ${culprit.selector} extends to ${culprit.rect.x + culprit.rect.w}px.`
      : `The page scrolls sideways by ${overflow}px at ${viewport}.`,
    fix: 'Let the element wrap or shrink instead of holding a fixed width.'
  }]
}

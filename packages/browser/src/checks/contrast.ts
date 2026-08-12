import { contrast } from '@kala/taste'
import type { Severity } from '@kala/kernel/engine/rule-types.js'
import type { PageFacts } from '../facts.js'

export type BrowserFinding = {
  rule: string
  sev: Severity
  selector: string
  viewport: string
  msg: string
  fix?: string
}

/** WCAG large text: 24px, or 18.66px when bold. */
export const LARGE_TEXT_PX = 24
export const LARGE_TEXT_BOLD_PX = 18.66

const TARGET_NORMAL = 4.5
const TARGET_LARGE = 3.0

const isLarge = (fontSize: number, fontWeight: number): boolean =>
  fontSize >= LARGE_TEXT_PX ||
  (fontWeight >= 700 && fontSize >= LARGE_TEXT_BOLD_PX)

export const checkContrast = (facts: PageFacts): BrowserFinding[] => {
  const out: BrowserFinding[] = []
  const viewport = `${facts.viewport.width}x${facts.viewport.height}`

  for (const node of facts.nodes) {
    if (!node.text) continue

    if (!node.bgResolved) {
      // No single background colour exists — an image or gradient sits behind.
      // Reporting a ratio here would invent a number, so this is information.
      out.push({
        rule: 'contrast-unresolved',
        sev: 'info',
        selector: node.selector,
        viewport,
        msg: `Could not resolve a background colour behind ${node.selector}; contrast not checked.`,
        fix: 'Check this element by eye, or give it an explicit background.'
      })
      continue
    }

    let ratio: number
    try {
      ratio = contrast(node.color, node.bg)
    } catch {
      continue
    }
    if (!Number.isFinite(ratio)) continue

    const target = isLarge(node.fontSize, node.fontWeight) ? TARGET_LARGE : TARGET_NORMAL
    if (ratio >= target) continue

    out.push({
      rule: 'computed-contrast',
      sev: 'error',
      selector: node.selector,
      viewport,
      msg: `Rendered contrast is ${ratio.toFixed(2)}:1 against ${node.bg}, below the ${target}:1 minimum.`,
      fix: `Darken the text or lighten the background until it reaches ${target}:1.`
    })
  }

  return out
}

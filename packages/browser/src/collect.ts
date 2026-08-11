import type { PageFacts, PageLike, Viewport } from './facts.js'

/**
 * Runs inside the page. It must be self-contained: no imports, no closure over
 * anything outside itself, because it is serialised across the process
 * boundary.
 *
 * The important part is background resolution. getComputedStyle returns
 * `rgba(0, 0, 0, 0)` for an element with no background of its own, so contrast
 * against it would be meaningless. Walking ancestors to the first opaque colour
 * is what source analysis cannot do, and it is the reason this pass exists.
 */
export const COLLECT_SCRIPT = (): Omit<PageFacts, 'viewport'> => {
  const INTERACTIVE = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary'])

  const isTransparent = (c: string): boolean =>
    c === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c)

  const shortSelector = (el: Element): string => {
    const tag = el.tagName.toLowerCase()
    if (el.id) return `${tag}#${el.id}`
    const cls = (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean)
    return cls.length > 0 ? `${tag}.${cls[0]}` : tag
  }

  const nodes: Omit<PageFacts, 'viewport'>['nodes'] = []
  let i = 0

  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const tag = el.tagName.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'br') continue

    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue

    const rect = el.getBoundingClientRect()

    let bg = cs.backgroundColor
    let bgResolved = !isTransparent(bg)
    if (!bgResolved) {
      let parent: Element | null = el.parentElement
      while (parent) {
        const pbg = getComputedStyle(parent).backgroundColor
        if (!isTransparent(pbg)) { bg = pbg; bgResolved = true; break }
        parent = parent.parentElement
      }
      if (!bgResolved) {
        // Nothing opaque up the tree: the page background is the last resort.
        const bodyBg = getComputedStyle(document.body).backgroundColor
        if (!isTransparent(bodyBg)) { bg = bodyBg; bgResolved = true }
      }
    }

    // Only the element's own text, not its descendants', so a wrapper does not
    // inherit the blame for a child's contrast.
    const ownText = Array.from(el.childNodes)
      .filter(n => n.nodeType === 3)
      .map(n => (n.textContent ?? '').trim())
      .join(' ')
      .trim()

    nodes.push({
      id: `b${i++}`,
      tag,
      selector: shortSelector(el),
      text: ownText.length > 0 ? ownText.slice(0, 80) : null,
      color: cs.color,
      bg,
      bgResolved,
      fontSize: parseFloat(cs.fontSize) || 0,
      fontWeight: parseInt(cs.fontWeight, 10) || 400,
      rect: {
        x: Math.round(rect.x), y: Math.round(rect.y),
        w: Math.round(rect.width), h: Math.round(rect.height)
      },
      interactive: INTERACTIVE.has(tag) || el.hasAttribute('onclick')
        || el.getAttribute('role') === 'button'
    })
  }

  return { scrollWidth: document.documentElement.scrollWidth, nodes }
}

export const collectFacts = async (
  page: PageLike, viewport: Viewport
): Promise<PageFacts> => {
  const collected = await page.evaluate<Omit<PageFacts, 'viewport'>>(COLLECT_SCRIPT)
  return { viewport, scrollWidth: collected.scrollWidth, nodes: collected.nodes }
}

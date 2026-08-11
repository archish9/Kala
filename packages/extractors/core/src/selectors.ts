import type { Decl, CssRule } from './css.js'

export type ElementKey = { tag: string; classes: string[]; id: string | null }
export type SelectorMatch = 'applies' | 'maybe' | 'no'

const RANK: Record<SelectorMatch, number> = { no: 0, maybe: 1, applies: 2 }

/** A compound like `div.card.wide` — no combinators, no pseudos. */
const matchCompound = (compound: string, el: ElementKey): boolean => {
  const parts = compound.match(/^[a-zA-Z][\w-]*|\.[\w-]+|#[\w-]+|\*/g)
  if (!parts || parts.join('') !== compound) return false

  for (const part of parts) {
    if (part === '*') continue
    if (part.startsWith('.')) {
      if (!el.classes.includes(part.slice(1))) return false
    } else if (part.startsWith('#')) {
      if (el.id !== part.slice(1)) return false
    } else if (part.toLowerCase() !== el.tag.toLowerCase()) {
      return false
    }
  }
  return true
}

const matchOne = (selector: string, el: ElementKey): SelectorMatch => {
  const sel = selector.trim()
  if (sel === '') return 'no'

  // Strip pseudo-classes and pseudo-elements from the subject. They make the
  // rule conditional, so a match becomes 'maybe' rather than 'applies'.
  const hasPseudo = /::?[\w-]+/.test(sel)
  const base = sel.replace(/::?[\w-]+(\([^)]*\))?/g, '')

  // The subject is the last compound after any combinator.
  const compounds = base.split(/\s*[>+~]\s*|\s+/).filter(Boolean)
  const subject = compounds[compounds.length - 1] ?? ''
  if (!matchCompound(subject, el)) return 'no'

  // Ancestors and siblings cannot be evaluated without document context, and
  // a pseudo-class depends on runtime state. Either way the honest answer is
  // that this rule might apply, so its declarations become unknown.
  if (compounds.length > 1 || hasPseudo) return 'maybe'
  return 'applies'
}

export const matchSelector = (selector: string, el: ElementKey): SelectorMatch => {
  let best: SelectorMatch = 'no'
  for (const part of selector.split(',')) {
    const r = matchOne(part, el)
    if (RANK[r] > RANK[best]) best = r
  }
  return best
}

export const rulesFor = (
  rules: CssRule[], el: ElementKey
): { certain: Decl[]; uncertain: Decl[] } => {
  const certain: Decl[] = []
  const uncertain: Decl[] = []

  for (const rule of rules) {
    const m = matchSelector(rule.selector, el)
    if (m === 'applies') certain.push(...rule.decls)
    else if (m === 'maybe') uncertain.push(...rule.decls)
  }

  return { certain, uncertain }
}

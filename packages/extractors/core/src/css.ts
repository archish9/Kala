import postcss from 'postcss'
import { formatHex, parse as parseColor } from 'culori'
import {
  emptyStyleFacts, type StyleFacts, type Box
} from '@kala/kernel/ir/types.js'
import { known, unknown, type StyleOrigin } from '@kala/kernel/ir/fact.js'

export type Decl = { prop: string; value: string }
export type CssRule = { selector: string; decls: Decl[] }

const FONT_WEIGHTS: Record<string, number> = {
  thin: 100, extralight: 200, light: 300, normal: 400, regular: 400,
  medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900
}

/** null means "present but not statically resolvable", which becomes unknown. */
const toPx = (raw: string): number | null => {
  const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(raw.trim())
  if (!m) return null
  const n = Number(m[1])
  if (Number.isNaN(n)) return null
  return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n
}

const toHex = (raw: string): string | null => {
  const c = parseColor(raw.trim())
  if (!c) return null
  return formatHex(c) ?? null
}

const expandBox = (value: string): Box | null => {
  const parts = value.trim().split(/\s+/)
  const px = parts.map(toPx)
  if (px.some(p => p === null)) return null
  const [a, b, c, d] = px as number[]
  if (parts.length === 1) return { top: a!, right: a!, bottom: a!, left: a! }
  if (parts.length === 2) return { top: a!, right: b!, bottom: a!, left: b! }
  if (parts.length === 3) return { top: a!, right: b!, bottom: c!, left: b! }
  if (parts.length === 4) return { top: a!, right: b!, bottom: c!, left: d! }
  return null
}

export const parseInlineStyle = (style: string): Decl[] =>
  style.split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const i = part.indexOf(':')
      if (i === -1) return null
      return { prop: part.slice(0, i).trim(), value: part.slice(i + 1).trim() }
    })
    .filter((d): d is Decl => d !== null)

export const parseStyleSheet = (
  css: string
): { rules: CssRule[]; unparsed: number } => {
  const rules: CssRule[] = []
  let unparsed = 0

  try {
    const root = postcss.parse(css)
    root.walkRules(rule => {
      const decls: Decl[] = []
      rule.walkDecls(d => { decls.push({ prop: d.prop, value: d.value }) })
      rules.push({ selector: rule.selector, decls })
    })
  } catch {
    // A malformed block yields no rules rather than a thrown extraction.
    unparsed += 1
  }

  return { rules, unparsed }
}

export const declsToStyleFacts = (
  decls: Decl[], origin: StyleOrigin
): StyleFacts => {
  const facts = emptyStyleFacts()
  facts.raw = decls.map(d => `${d.prop}: ${d.value}`)

  // Longhands are applied in source order after shorthands, so a later
  // padding-left wins over an earlier padding, matching the cascade.
  let box: Box | null = null

  for (const { prop, value } of decls) {
    const p = prop.toLowerCase()

    if (p === 'padding') {
      const b = expandBox(value)
      if (b) box = b
      else facts.space.padding = unknown('parse-limit')
      continue
    }
    if (p.startsWith('padding-')) {
      const side = p.slice('padding-'.length)
      const px = toPx(value)
      if (px === null) { facts.space.padding = unknown('parse-limit'); continue }
      box ??= { top: 0, right: 0, bottom: 0, left: 0 }
      if (side === 'top' || side === 'right' || side === 'bottom' || side === 'left') {
        box[side] = px
      }
      continue
    }

    if (p === 'gap') {
      const px = toPx(value)
      facts.space.gap = px === null ? unknown('parse-limit') : known({ px }, origin)
      continue
    }

    if (p === 'font-size') {
      const px = toPx(value)
      facts.type.size = px === null ? unknown('parse-limit') : known({ px }, origin)
      continue
    }
    if (p === 'font-weight') {
      const named = FONT_WEIGHTS[value.trim().toLowerCase()]
      const n = named ?? Number(value.trim())
      facts.type.weight = Number.isFinite(n)
        ? known(n, origin) : unknown('parse-limit')
      continue
    }
    if (p === 'font-family') {
      const first = value.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '')
      if (first) facts.type.family = known(first, origin)
      continue
    }
    if (p === 'line-height') {
      const px = toPx(value)
      if (px !== null) facts.type.leading = known({ px }, origin)
      continue
    }
    if (p === 'letter-spacing') {
      const px = toPx(value)
      if (px !== null) facts.type.tracking = known({ px }, origin)
      continue
    }

    if (p === 'color') {
      const hex = toHex(value)
      facts.color.fg = hex ? known({ hex }, origin) : unknown('parse-limit')
      continue
    }
    if (p === 'background-color' || p === 'background') {
      const hex = toHex(value.split(/\s+/)[0] ?? value)
      if (hex) facts.color.bg = known({ hex }, origin)
      else if (p === 'background-color') facts.color.bg = unknown('parse-limit')
      continue
    }
    if (p === 'border-color') {
      const hex = toHex(value)
      facts.color.border = hex ? known({ hex }, origin) : unknown('parse-limit')
      continue
    }

    if (p === 'border-radius') {
      const px = toPx(value.split(/\s+/)[0] ?? value)
      facts.shape.radius = px === null
        ? unknown('parse-limit') : known({ px }, origin)
      continue
    }
    if (p === 'border-width') {
      const px = toPx(value.split(/\s+/)[0] ?? value)
      facts.shape.borderWidth = px === null
        ? unknown('parse-limit') : known({ px }, origin)
      continue
    }
    if (p === 'border') {
      // `1px solid #ccc` — width first, colour last where both are present.
      const parts = value.trim().split(/\s+/)
      const px = toPx(parts[0] ?? '')
      if (px !== null) facts.shape.borderWidth = known({ px }, origin)
      const hex = toHex(parts[parts.length - 1] ?? '')
      if (hex) facts.color.border = known({ hex }, origin)
      continue
    }
    if (p === 'box-shadow') {
      facts.shape.shadow = known({ raw: value.trim() }, origin)
      continue
    }

    if (p === 'display') { facts.layout.display = known(value.trim(), origin); continue }
    if (p === 'flex-direction') { facts.layout.direction = known(value.trim(), origin); continue }
    if (p === 'align-items') { facts.layout.align = known(value.trim(), origin); continue }
  }

  if (box && facts.space.padding.state === 'absent') {
    facts.space.padding = known(box, origin)
  }

  return facts
}

import { isKnown, isUnknown, type Fact } from '../ir/fact.js'
import * as B from './builtins.js'

export type EvalResult = { state: 'value'; value: unknown } | { state: 'unknown' }

export type EvalContext = {
  self?: unknown
  other?: unknown
  collected?: unknown[]
  lock?: unknown
  surface?: unknown
}

export type Expr =
  | string | number | boolean | null | readonly unknown[]
  | { gte: [Expr, Expr] } | { lte: [Expr, Expr] } | { eq: [Expr, Expr] }
  | { in: [Expr, Expr] } | { allIn: [Expr, Expr] } | { anyIn: [Expr, Expr] }
  | { not: Expr } | { and: Expr[] } | { or: Expr[] }

const UNKNOWN: EvalResult = { state: 'unknown' }
const val = (value: unknown): EvalResult => ({ state: 'value', value })

const isFact = (x: unknown): x is Fact<unknown> =>
  typeof x === 'object' && x !== null && 'state' in x

/** known -> value, absent -> null, unknown -> UNKNOWN. */
const unwrap = (x: unknown): EvalResult => {
  if (!isFact(x)) return val(x)
  if (isUnknown(x)) return UNKNOWN
  if (isKnown(x)) return val(x.value)
  return val(null)
}

const BUILTIN_RE = /^(\w+)\((.*)\)$/

const resolvePath = (path: string, ctx: EvalContext): EvalResult => {
  if (path === 'collected') return val(ctx.collected)

  const root = path.startsWith('$lock.') ? ctx.lock
    : path.startsWith('$surface.') ? ctx.surface
    : path.startsWith('self.') ? ctx.self
    : path.startsWith('other.') ? ctx.other
    : undefined
  if (root === undefined) return val(undefined)

  const rest = path.replace(/^(\$lock|\$surface|self|other)\./, '')

  let cur: unknown = root
  for (const seg of rest.split('.')) {
    if (cur === null || cur === undefined) return val(undefined)
    if (isFact(cur)) {
      const u = unwrap(cur)
      if (u.state === 'unknown') return UNKNOWN
      cur = u.value
      // An `absent` Fact unwraps to null. Indexing into it would throw, so a
      // path that reaches through an unset fact resolves to undefined instead.
      if (cur === null || cur === undefined) return val(undefined)
    }
    cur = (cur as Record<string, unknown>)[seg]
  }
  return unwrap(cur)
}

const callBuiltin = (name: string, args: EvalResult[]): EvalResult => {
  if (args.some(a => a.state === 'unknown')) return UNKNOWN
  const v = args.map(a => (a as { value: unknown }).value)
  switch (name) {
    case 'contrast': {
      const a = v[0] as { hex: string } | string | undefined
      const b = v[1] as { hex: string } | string | undefined
      const ax = typeof a === 'string' ? a : a?.hex
      const bx = typeof b === 'string' ? b : b?.hex
      if (!ax || !bx) return UNKNOWN
      return val(B.contrastRatio(ax, bx))
    }
    case 'distinct': return val(B.distinct(v[0] as unknown[]))
    case 'count':    return val(B.count(v[0] as unknown[]))
    case 'nearest':  return val(B.nearest(v[0] as number[], v[1] as number))
    case 'median':   return val(B.median(v[0] as number[]))
    case 'stddev':   return val(B.stddev(v[0] as number[]))
    default:         return UNKNOWN
  }
}

const toList = (v: unknown): unknown[] => {
  if (Array.isArray(v)) return v
  if (v && typeof v === 'object') return Object.values(v as Record<string, unknown>)
  return [v]
}

export const evaluate = (expr: Expr, ctx: EvalContext): EvalResult => {
  if (typeof expr === 'number' || typeof expr === 'boolean' || expr === null) {
    return val(expr)
  }

  if (Array.isArray(expr)) return val(expr)

  if (typeof expr === 'string') {
    const m = BUILTIN_RE.exec(expr)
    if (m) {
      const name = m[1] as string
      const argSrc = (m[2] ?? '').trim()
      const args = argSrc === ''
        ? []
        : argSrc.split(',').map(a => evaluate(a.trim() as Expr, ctx))
      return callBuiltin(name, args)
    }
    if (/^(self|other|collected|\$lock|\$surface)\b/.test(expr)) {
      return resolvePath(expr, ctx)
    }
    return val(expr)
  }

  for (const k of ['gte', 'lte', 'eq', 'in', 'allIn', 'anyIn'] as const) {
    if (!(k in expr)) continue
    const [l, r] = (expr as Record<string, [Expr, Expr]>)[k] as [Expr, Expr]
    const a = evaluate(l, ctx), b = evaluate(r, ctx)
    if (a.state === 'unknown' || b.state === 'unknown') return UNKNOWN
    const av = a.value, bv = b.value
    if (k === 'gte') return val((av as number) >= (bv as number))
    if (k === 'lte') return val((av as number) <= (bv as number))
    if (k === 'eq')  return val(JSON.stringify(av) === JSON.stringify(bv))
    if (k === 'in')  return val(toList(bv).includes(av))
    if (k === 'allIn') {
      const list = toList(bv)
      return val(toList(av).every(x => list.includes(x)))
    }
    if (k === 'anyIn') {
      const list = toList(bv)
      return val(toList(av).some(x => list.includes(x)))
    }
  }

  if ('not' in expr) {
    const r = evaluate(expr.not, ctx)
    return r.state === 'unknown' ? UNKNOWN : val(!r.value)
  }

  // and/or evaluate every branch: an unknown anywhere makes the whole
  // expression unknown, so short-circuiting would hide it.
  if ('and' in expr) {
    const rs = expr.and.map(e => evaluate(e, ctx))
    if (rs.some(r => r.state === 'unknown')) return UNKNOWN
    return val(rs.every(r => (r as { value: unknown }).value))
  }
  if ('or' in expr) {
    const rs = expr.or.map(e => evaluate(e, ctx))
    if (rs.some(r => r.state === 'unknown')) return UNKNOWN
    return val(rs.some(r => (r as { value: unknown }).value))
  }

  return UNKNOWN
}

import { evaluate } from './expr.js'
import { distinct as distinctFn } from './builtins.js'
import { ancestors } from '../ir/query.js'
import { resolveSurface } from '../surface/resolve.js'
import { known, isKnown, isUnknown, type Fact, type StyleOrigin } from '../ir/fact.js'
import type { IRDoc, IRNode } from '../ir/types.js'
import type {
  RuleDef, Selector, Finding, VerifyResult, Degraded
} from './rule-types.js'

export type PredicateCtx = {
  doc: IRDoc
  lock: unknown
  fact: (path: string) => Fact<unknown> | undefined
}

export type PredicateFn = (
  node: IRNode, ctx: PredicateCtx
) => Omit<Finding, 'id'> | null

export type DocPredicateCtx = { lock: unknown; surface: string }

/**
 * Runs once per file with the whole IRDoc. State completeness is a property of
 * a document, not of one node: "this query has no error branch" needs the
 * source list and the branch list together, and every other rule kind selects
 * nodes before it can ask anything.
 *
 * Returns an array because one file can have three queries each missing a
 * different state.
 */
export type DocPredicateFn = (
  doc: IRDoc, ctx: DocPredicateCtx
) => Omit<Finding, 'id'>[]

const isFactLike = (x: unknown): x is Fact<unknown> =>
  typeof x === 'object' && x !== null && 'state' in x

/**
 * Resolve a dotted path on a node to a Fact.
 *
 * A path may continue past a Fact (`style.space.padding.top`), in which case it
 * descends into the fact's value and re-wraps the result carrying the original
 * origin. absent and unknown propagate untouched, so reaching into an
 * unresolvable fact stays unresolvable rather than silently becoming undefined.
 */
export const getFactPath = (
  node: IRNode, path: string
): Fact<unknown> | undefined => {
  const rel = path.replace(/^self\./, '')
  let cur: unknown = node
  let origin: StyleOrigin | undefined

  for (const seg of rel.split('.')) {
    if (cur === null || cur === undefined) return undefined
    if (isFactLike(cur)) {
      if (cur.state !== 'known') return cur
      origin = cur.origin
      cur = cur.value
      if (cur === null || cur === undefined) return undefined
    }
    cur = (cur as Record<string, unknown>)[seg]
  }

  if (cur === undefined) return undefined
  if (isFactLike(cur)) return cur
  return origin ? known(cur, origin) : undefined
}

export const selectNodes = (doc: IRDoc, sel: Selector): IRNode[] =>
  doc.nodes.filter(n => {
    if (sel.name && n.name !== sel.name) return false
    if (sel.kind && n.kind !== sel.kind) return false
    if (sel.hasFact) {
      const f = getFactPath(n, sel.hasFact)
      // `absent` means provably unstyled — not a candidate.
      // `unknown` IS a candidate, so it gets counted as skipped coverage.
      if (!f || f.state === 'absent') return false
    }
    return true
  })

const render = (tpl: string, vars: Record<string, unknown>): string =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : `{${k}}`)

export const runRules = (
  docs: IRDoc[],
  rules: RuleDef[],
  lock: unknown,
  predicates: Record<string, PredicateFn | DocPredicateFn> = {}
): VerifyResult => {
  const findings: Finding[] = []
  const degraded: Degraded[] = []
  let analyzed = 0
  let skipped = 0
  let seq = 0

  for (const doc of docs) {
    for (const rule of rules) {

      if (rule.kind === 'document') {
        if (!rule.predicate) continue
        const fn = predicates[rule.predicate] as DocPredicateFn | undefined
        if (!fn) {
          degraded.push({
            code: 'PREDICATE_NOT_FOUND',
            detail: `Predicate "${rule.predicate}" for rule "${rule.id}" is not registered.`,
            impact: '1 rule not run'
          })
          continue
        }
        try {
          const hits = fn(doc, { lock, surface: resolveSurface(doc.file) })
          for (const hit of hits) findings.push({ id: `f${++seq}`, ...hit })
        } catch (err) {
          degraded.push({
            code: 'PREDICATE_THREW',
            detail: `Rule "${rule.id}": ${(err as Error).message}`,
            impact: '1 rule not run'
          })
        }
        continue
      }

      if (rule.kind === 'aggregate') {
        const collected: unknown[] = []
        for (const n of selectNodes(doc, rule.select)) {
          const f = rule.collect ? getFactPath(n, rule.collect) : undefined
          if (!f) continue
          if (isUnknown(f)) { skipped++; continue }
          if (isKnown(f)) { analyzed++; collected.push(f.value) }
        }

        if (collected.length < (rule.minSample ?? 1)) continue
        if (!rule.assert) continue

        const r = evaluate(rule.assert, { collected, lock })
        if (r.state === 'unknown' || r.value === true) continue

        const surface = rule.scope === 'surface' ? resolveSurface(doc.file) : undefined
        findings.push({
          id: `f${++seq}`,
          rule: rule.id,
          sev: rule.severity,
          file: doc.file,
          line: 1,
          msg: render(rule.message, { distinct: distinctFn(collected) }),
          ...(rule.fix ? { fix: rule.fix } : {}),
          ...(surface ? { surface } : {})
        })
        continue
      }

      for (const node of selectNodes(doc, rule.select)) {
        analyzed++

        if (rule.predicate) {
          const fn = predicates[rule.predicate] as PredicateFn | undefined
          if (!fn) {
            degraded.push({
              code: 'PREDICATE_NOT_FOUND',
              detail: `Predicate "${rule.predicate}" for rule "${rule.id}" is not registered.`,
              impact: '1 rule not run'
            })
            continue
          }
          try {
            const hit = fn(node, {
              doc, lock, fact: (p: string) => getFactPath(node, p)
            })
            if (hit) findings.push({ id: `f${++seq}`, ...hit })
          } catch (err) {
            degraded.push({
              code: 'PREDICATE_THREW',
              detail: `Rule "${rule.id}": ${(err as Error).message}`,
              impact: '1 rule not run'
            })
          }
          continue
        }

        let other: IRNode | undefined
        if (rule.kind === 'relation') {
          const want = rule.against?.nearestAncestor
          if (!want) { skipped++; continue }
          other = ancestors(doc, node.id).find(a => {
            if (!want.hasFact) return true
            const f = getFactPath(a, want.hasFact)
            return !!f && f.state !== 'absent'
          })
          if (!other) { skipped++; continue }
        }

        if (!rule.assert) { skipped++; continue }

        const r = evaluate(rule.assert, { self: node, other, lock })
        if (r.state === 'unknown') { skipped++; continue }
        if (r.value === true) continue

        const f = rule.select.hasFact ? getFactPath(node, rule.select.hasFact) : undefined
        const value = f && isKnown(f) ? JSON.stringify(f.value) : ''

        findings.push({
          id: `f${++seq}`,
          rule: rule.id,
          sev: rule.severity,
          file: doc.file,
          line: node.loc.line,
          msg: render(rule.message, { value }),
          ...(rule.fix ? { fix: render(rule.fix, { value }) } : {})
        })
      }
    }
  }

  const seen = new Set<string>()
  const uniqueDegraded = degraded.filter(d => {
    const k = `${d.code}|${d.detail}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  return {
    findings,
    coverage: skipped > 0
      ? { analyzed, skipped, reason: 'facts that could not be resolved statically' }
      : { analyzed, skipped },
    degraded: uniqueDegraded
  }
}

import { describe, it, expect } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { loadPack } from '@fe-design/kernel/engine/pack-loader.js'
import { runRules } from '@fe-design/kernel/engine/runner.js'
import { extractReact } from '@fe-design/extractor-react'
import type { RuleDef } from '@fe-design/kernel/engine/rule-types.js'
import type { PredicateFn } from '@fe-design/kernel/engine/runner.js'

const PACKS = join(import.meta.dirname, '..', 'rules')

const LOCK = {
  derived: {
    space: [0, 4, 8, 12, 16, 24, 32, 48],
    type: { steps: [12, 14, 16, 18, 24, 30] },
    radius: [0, 2, 6, 12],
    color: { white: '#ffffff', 'gray-900': '#111827', 'gray-400': '#9ca3af' }
  }
}

const loadPredicates = async (): Promise<Record<string, PredicateFn>> => {
  const dir = join(PACKS, 'predicates')
  const out: Record<string, PredicateFn> = {}
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.mjs')) continue
    const mod = await import(join(dir, f)) as { default: PredicateFn }
    out[f.replace(/\.mjs$/, '')] = mod.default
  }
  return out
}

const runOne = async (
  rule: RuleDef, fixtureAbs: string, predicates: Record<string, PredicateFn>
) => {
  const doc = extractReact(await readFile(fixtureAbs, 'utf8'), fixtureAbs)
  return runRules([doc], [rule], LOCK, predicates)
}

describe('rule pack', () => {
  it('loads every rule without degradation', async () => {
    const { rules, degraded } = await loadPack(PACKS)
    expect(degraded).toEqual([])
    expect(rules.length).toBeGreaterThanOrEqual(9)
  })

  it('every rule fires on its own fail fixture', async () => {
    const { rules } = await loadPack(PACKS)
    const predicates = await loadPredicates()
    for (const rule of rules) {
      const r = await runOne(rule, rule.fixtures.fail, predicates)
      expect(r.findings.map(f => f.rule), `${rule.id} must fire on its fail fixture`)
        .toContain(rule.id)
    }
  })

  it('no rule fires on its own pass fixture', async () => {
    const { rules } = await loadPack(PACKS)
    const predicates = await loadPredicates()
    for (const rule of rules) {
      const r = await runOne(rule, rule.fixtures.pass, predicates)
      expect(r.findings.map(f => f.rule), `${rule.id} must stay silent on its pass fixture`)
        .not.toContain(rule.id)
    }
  })

  it('no rule fires on the all-unknown fixture', async () => {
    const { rules } = await loadPack(PACKS)
    const predicates = await loadPredicates()
    const abs = resolve(PACKS, 'fixtures/all-unknown.tsx')
    const doc = extractReact(await readFile(abs, 'utf8'), abs)
    const r = runRules([doc], rules, LOCK, predicates)
    expect(r.findings).toEqual([])
    expect(r.coverage.skipped).toBeGreaterThan(0)
  })

  it('every rule with a source also declares modified', async () => {
    const { rules } = await loadPack(PACKS)
    for (const r of rules) {
      if (r.source) expect(r.modified, `${r.id}`).toBe(true)
    }
  })
})

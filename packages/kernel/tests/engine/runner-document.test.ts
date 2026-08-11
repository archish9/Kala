import { describe, it, expect } from 'vitest'
import { runRules } from '../../src/engine/runner.js'
import { makeNode } from '../../src/ir/types.js'
import type { IRDoc } from '../../src/ir/types.js'
import type { RuleDef } from '../../src/engine/rule-types.js'

const rule: RuleDef = {
  id: 'missing-error-state', kind: 'document', severity: 'error',
  select: {},
  predicate: 'missing-error-state',
  message: 'A data source has no error branch.',
  fixtures: { pass: 'p.tsx', fail: 'f.tsx' }
}

const doc = (opts: { sources: number; errorBranch: boolean }): IRDoc => ({
  file: 'src/app/settings/page.tsx',
  framework: 'react',
  imports: [],
  nodes: [makeNode({ id: 'n1', name: 'div' })],
  branches: opts.errorBranch
    ? [{ id: 'b1', kind: 'conditional', condition: 'error', semantic: 'error' }]
    : [],
  dataSources: Array.from({ length: opts.sources }, (_, i) => ({
    id: `d${i + 1}`, kind: 'query' as const, raw: 'useQuery()',
    branches: opts.errorBranch ? ['b1'] : []
  }))
})

const predicates = {
  'missing-error-state': (d: IRDoc) =>
    d.dataSources
      .filter(src => !src.branches.some(
        id => d.branches?.find(b => b.id === id)?.semantic === 'error'
      ))
      .map(src => ({
        rule: 'missing-error-state', sev: 'error' as const,
        file: d.file, line: 1,
        msg: `Data source ${src.id} has no error branch.`
      }))
}

describe('runRules — document kind', () => {
  it('reports one finding per unhandled source', () => {
    const r = runRules([doc({ sources: 3, errorBranch: false })], [rule], {}, predicates)
    expect(r.findings).toHaveLength(3)
    expect(r.findings.every(f => f.rule === 'missing-error-state')).toBe(true)
  })

  it('reports nothing when the state is handled', () => {
    expect(runRules([doc({ sources: 2, errorBranch: true })], [rule], {}, predicates).findings)
      .toEqual([])
  })

  it('reports nothing for a document with no data sources', () => {
    expect(runRules([doc({ sources: 0, errorBranch: false })], [rule], {}, predicates).findings)
      .toEqual([])
  })

  it('gives every finding a unique id', () => {
    const ids = runRules([doc({ sources: 3, errorBranch: false })], [rule], {}, predicates)
      .findings.map(f => f.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('runs once per document, not once per node', () => {
    const many: IRDoc = {
      ...doc({ sources: 1, errorBranch: false }),
      nodes: Array.from({ length: 20 }, (_, i) => makeNode({ id: `n${i}`, name: 'div' }))
    }
    expect(runRules([many], [rule], {}, predicates).findings).toHaveLength(1)
  })

  it('counts a missing predicate as degraded, not as a finding', () => {
    const r = runRules([doc({ sources: 1, errorBranch: false })], [rule], {}, {})
    expect(r.findings).toEqual([])
    expect(r.degraded.some(d => d.code === 'PREDICATE_NOT_FOUND')).toBe(true)
  })

  it('survives a document predicate that throws', () => {
    const boom = { 'missing-error-state': () => { throw new Error('boom') } }
    const r = runRules([doc({ sources: 1, errorBranch: false })], [rule], {}, boom as never)
    expect(r.findings).toEqual([])
    expect(r.degraded.some(d => d.code === 'PREDICATE_THREW')).toBe(true)
  })

  it('passes the resolved surface to the predicate', () => {
    let seen = ''
    const spy = { 'missing-error-state': (_d: IRDoc, ctx: { surface: string }) => {
      seen = ctx.surface
      return []
    } }
    runRules([doc({ sources: 1, errorBranch: false })], [rule], {}, spy as never)
    expect(seen).toBe('settings')
  })
})

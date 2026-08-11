import { describe, it, expect } from 'vitest'
import { runRules, getFactPath } from '../../src/engine/runner.js'
import { makeNode, emptyStyleFacts } from '../../src/ir/types.js'
import { known, unknown } from '../../src/ir/fact.js'
import type { IRDoc } from '../../src/ir/types.js'
import type { RuleDef } from '../../src/engine/rule-types.js'

const origin = { kind: 'class' as const, raw: 'p-[13px]' }
const lock = { derived: { space: [0, 4, 8, 12, 16, 24] } }
const base = emptyStyleFacts()

const spaceRule: RuleDef = {
  id: 'space-off-scale', kind: 'node', severity: 'error',
  select: { hasFact: 'style.space.padding' },
  assert: { allIn: ['self.style.space.padding', '$lock.derived.space'] },
  message: 'Padding is not on the spacing scale.',
  fixtures: { pass: 'p.tsx', fail: 'f.tsx' }
}

const contrastRule: RuleDef = {
  id: 'text-contrast', kind: 'relation', severity: 'error',
  select: { hasFact: 'style.color.fg' },
  against: { nearestAncestor: { hasFact: 'style.color.bg' } },
  assert: { gte: ['contrast(self.style.color.fg, other.style.color.bg)', 4.5] },
  message: 'Contrast is below 4.5:1.',
  fixtures: { pass: 'p.tsx', fail: 'f.tsx' }
}

const flatRule: RuleDef = {
  id: 'flat-type-hierarchy', kind: 'aggregate', scope: 'file', severity: 'warn',
  select: { hasFact: 'style.type.size' },
  collect: 'style.type.size',
  assert: { gte: ['distinct(collected)', 3] },
  minSample: 4,
  message: 'Only {distinct} distinct text sizes. Hierarchy is flat.',
  fixtures: { pass: 'p.tsx', fail: 'f.tsx' }
}

const padDoc = (padding: any): IRDoc => ({
  file: 'a.tsx', framework: 'react', imports: [], dataSources: [],
  nodes: [makeNode({
    id: 'n1', name: 'div',
    style: { ...base, space: { ...base.space, padding } }
  })]
})

describe('runRules — node kind', () => {
  it('reports a finding when the assertion is false', () => {
    const doc = padDoc(known({ top: 13, right: 13, bottom: 13, left: 13 }, origin))
    const r = runRules([doc], [spaceRule], lock)
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0]?.rule).toBe('space-off-scale')
  })

  it('reports nothing when the assertion is true', () => {
    const doc = padDoc(known({ top: 16, right: 16, bottom: 16, left: 16 }, origin))
    expect(runRules([doc], [spaceRule], lock).findings).toHaveLength(0)
  })

  it('skips silently and counts coverage when the fact is unknown', () => {
    const r = runRules([padDoc(unknown('dynamic-expression'))], [spaceRule], lock)
    expect(r.findings).toHaveLength(0)
    expect(r.coverage.skipped).toBe(1)
  })

  it('does not select nodes whose fact is absent', () => {
    const doc: IRDoc = {
      file: 'a.tsx', framework: 'react', imports: [], dataSources: [],
      nodes: [makeNode({ id: 'n1', name: 'div' })]
    }
    const r = runRules([doc], [spaceRule], lock)
    expect(r.findings).toHaveLength(0)
    expect(r.coverage.skipped).toBe(0)
  })
})

describe('getFactPath', () => {
  const padded = makeNode({
    id: 'n1', name: 'div',
    style: {
      ...base,
      space: {
        ...base.space,
        padding: known({ top: 16, right: 8, bottom: 16, left: 8 }, origin)
      }
    }
  })

  it('reaches inside a known fact value and re-wraps with the original origin', () => {
    const f = getFactPath(padded, 'style.space.padding.top')
    expect(f?.state).toBe('known')
    if (f?.state === 'known') {
      expect(f.value).toBe(16)
      expect(f.origin).toBe(origin)
    }
  })

  it('propagates unknown rather than descending into it', () => {
    const n = makeNode({
      id: 'n2', name: 'div',
      style: { ...base, space: { ...base.space, padding: unknown('prop-flow') } }
    })
    expect(getFactPath(n, 'style.space.padding.top')?.state).toBe('unknown')
  })

  it('propagates absent rather than descending into it', () => {
    expect(getFactPath(makeNode({ id: 'n3', name: 'div' }), 'style.space.padding.top')?.state)
      .toBe('absent')
  })
})

describe('runRules — relation kind', () => {
  const relDoc = (fg: string, bgFact: any): IRDoc => ({
    file: 'a.tsx', framework: 'react', imports: [], dataSources: [],
    nodes: [
      makeNode({
        id: 'p1', name: 'section', children: ['c1'],
        style: { ...base, color: { ...base.color, bg: bgFact } }
      }),
      makeNode({
        id: 'c1', name: 'p', parent: 'p1',
        style: { ...base, color: { ...base.color, fg: known({ hex: fg }, origin) } }
      })
    ]
  })

  it('flags low contrast against the nearest ancestor background', () => {
    const r = runRules([relDoc('#9ca3af', known({ hex: '#ffffff' }, origin))], [contrastRule], lock)
    expect(r.findings).toHaveLength(1)
  })

  it('passes high contrast', () => {
    const r = runRules([relDoc('#111827', known({ hex: '#ffffff' }, origin))], [contrastRule], lock)
    expect(r.findings).toHaveLength(0)
  })

  it('skips when the ancestor background is unknown', () => {
    const r = runRules([relDoc('#9ca3af', unknown('external-stylesheet'))], [contrastRule], lock)
    expect(r.findings).toHaveLength(0)
    expect(r.coverage.skipped).toBe(1)
  })
})

describe('runRules — aggregate kind', () => {
  const sizedDoc = (sizes: (number | 'u')[]): IRDoc => ({
    file: 'src/app/settings/page.tsx', framework: 'react',
    imports: [], dataSources: [],
    nodes: sizes.map((s, i) => makeNode({
      id: `n${i}`, name: 'p',
      style: {
        ...base,
        type: {
          ...base.type,
          size: s === 'u' ? unknown('dynamic-expression') : known({ px: s }, origin)
        }
      }
    }))
  })

  it('flags a flat hierarchy', () => {
    const r = runRules([sizedDoc([16, 16, 16, 16, 16])], [flatRule], lock)
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0]?.msg).toContain('Only 1 distinct')
  })

  it('passes a varied hierarchy', () => {
    expect(runRules([sizedDoc([12, 16, 24, 40])], [flatRule], lock).findings).toHaveLength(0)
  })

  it('does not fire below minSample', () => {
    expect(runRules([sizedDoc([16, 16])], [flatRule], lock).findings).toHaveLength(0)
  })

  it('excludes unknown values and counts them skipped', () => {
    const r = runRules([sizedDoc([12, 16, 24, 40, 'u'])], [flatRule], lock)
    expect(r.findings).toHaveLength(0)
    expect(r.coverage.skipped).toBe(1)
  })

  it('emits one finding per document, not per node', () => {
    const r = runRules([sizedDoc([16, 16, 16, 16]), sizedDoc([14, 14, 14, 14])], [flatRule], lock)
    expect(r.findings).toHaveLength(2)
  })

  it('attaches a surface id when scope is surface', () => {
    const surfaceRule = { ...flatRule, scope: 'surface' as const }
    const r = runRules([sizedDoc([16, 16, 16, 16])], [surfaceRule], lock)
    expect(r.findings[0]?.surface).toBe('settings')
  })
})

describe('runRules — predicate rules', () => {
  const cardRule: RuleDef = {
    id: 'nested-card', kind: 'node', severity: 'warn',
    select: { hasFact: 'style.shape.radius' },
    predicate: 'nested-card',
    message: 'Card nested inside a card.',
    fixtures: { pass: 'p.tsx', fail: 'f.tsx' }
  }

  const card = (id: string, parent: string | null, children: string[] = []) =>
    makeNode({
      id, name: 'div', parent, children,
      style: { ...base, shape: { ...base.shape, radius: known({ px: 12 }, origin) } }
    })

  const doc = (nodes: ReturnType<typeof card>[]): IRDoc =>
    ({ file: 'a.tsx', framework: 'react', imports: [], dataSources: [], nodes })

  const predicates = {
    'nested-card': (node: any, ctx: any) => {
      const parent = ctx.doc.nodes.find((n: any) => n.id === node.parent)
      if (!parent || parent.style.shape.radius.state !== 'known') return null
      return {
        rule: 'nested-card', sev: 'warn' as const, file: ctx.doc.file,
        line: node.loc.line, msg: 'Card nested inside a card.'
      }
    }
  }

  it('reports what the predicate returns', () => {
    const d = doc([card('a', null, ['b']), card('b', 'a')])
    expect(runRules([d], [cardRule], {}, predicates).findings.map(f => f.rule))
      .toEqual(['nested-card'])
  })

  it('reports nothing when the predicate returns null', () => {
    expect(runRules([doc([card('a', null)])], [cardRule], {}, predicates).findings).toEqual([])
  })

  it('counts a missing predicate as degraded, not as a finding', () => {
    const d = doc([card('a', null, ['b']), card('b', 'a')])
    const r = runRules([d], [cardRule], {}, {})
    expect(r.findings).toEqual([])
    expect(r.degraded.some(x => x.code === 'PREDICATE_NOT_FOUND')).toBe(true)
  })

  it('survives a predicate that throws', () => {
    const d = doc([card('a', null, ['b']), card('b', 'a')])
    const boom = { 'nested-card': () => { throw new Error('boom') } }
    const r = runRules([d], [cardRule], {}, boom as any)
    expect(r.findings).toEqual([])
    expect(r.degraded.some(x => x.code === 'PREDICATE_THREW')).toBe(true)
  })
})

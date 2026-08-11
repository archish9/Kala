import { describe, it, expect } from 'vitest'
import { buildReview } from '../src/critique.js'
import type { Finding } from '@fe-design/kernel/engine/rule-types.js'
import type { BrowserFinding } from '@fe-design/browser'

const f = (over: Partial<Finding>): Finding => ({
  id: 'f1', rule: 'space-off-scale', sev: 'error',
  file: 'src/app/settings/page.tsx', line: 12,
  msg: 'Padding 13px is not on the spacing scale.',
  ...over
})

const base = {
  surface: 'settings',
  system: 'quiet-precision',
  findings: [] as Finding[],
  rendered: [] as BrowserFinding[],
  coverage: { analyzed: 40, skipped: 0 },
  degraded: []
}

describe('buildReview', () => {
  it('counts findings by severity', () => {
    const r = buildReview({
      ...base,
      findings: [
        f({ id: 'f1', sev: 'error' }),
        f({ id: 'f2', sev: 'warn', rule: 'tiny-text' }),
        f({ id: 'f3', sev: 'warn', rule: 'radius-off-scale' })
      ]
    })
    expect(r.counts).toEqual({ error: 1, warn: 2, info: 0 })
  })

  it('groups findings into named sections', () => {
    const r = buildReview({
      ...base,
      findings: [
        f({ id: 'f1', rule: 'text-contrast' }),
        f({ id: 'f2', rule: 'space-off-scale' })
      ]
    })
    expect(r.sections.map(s => s.title)).toContain('Accessibility')
    expect(r.sections.map(s => s.title)).toContain('Consistency')
  })

  it('omits sections that have no findings', () => {
    const r = buildReview({ ...base, findings: [f({ rule: 'text-contrast' })] })
    expect(r.sections.every(s => s.items.length > 0)).toBe(true)
  })

  it('orders sections by their worst severity', () => {
    const r = buildReview({
      ...base,
      findings: [
        f({ id: 'f1', rule: 'monotonous-spacing', sev: 'info' }),
        f({ id: 'f2', rule: 'text-contrast', sev: 'error' })
      ]
    })
    expect(r.sections[0]!.title).toBe('Accessibility')
  })

  it('labels where each static finding came from', () => {
    const r = buildReview({ ...base, findings: [f({})] })
    const item = r.sections.flatMap(s => s.items)[0]!
    expect(item.source).toBe('static')
    expect(item.where).toBe('src/app/settings/page.tsx:12')
  })

  it('merges rendered findings and labels them by viewport', () => {
    const r = buildReview({
      ...base,
      rendered: [{
        rule: 'computed-contrast', sev: 'error', selector: 'p.muted',
        viewport: '375x812', msg: 'Rendered contrast is 2.85:1.'
      }]
    })
    const item = r.sections.flatMap(s => s.items).find(i => i.source === 'rendered')!
    expect(item.where).toBe('p.muted @ 375x812')
  })

  it('puts an unrecognised rule in a catch-all section rather than dropping it', () => {
    const r = buildReview({ ...base, findings: [f({ rule: 'brand-new-rule' })] })
    expect(r.sections.flatMap(s => s.items).map(i => i.rule)).toContain('brand-new-rule')
  })

  it('carries coverage and degradation through untouched', () => {
    const r = buildReview({
      ...base,
      coverage: { analyzed: 61, skipped: 9 },
      degraded: [{ code: 'PARSE_FAILED', detail: 'x', impact: '1 file' }]
    })
    expect(r.coverage).toEqual({ analyzed: 61, skipped: 9 })
    expect(r.degraded).toHaveLength(1)
  })

  it('produces an empty review with no sections for a clean surface', () => {
    const r = buildReview(base)
    expect(r.sections).toEqual([])
    expect(r.counts).toEqual({ error: 0, warn: 0, info: 0 })
  })
})

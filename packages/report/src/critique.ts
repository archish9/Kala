import type { Finding, Severity, Degraded } from '@kala/kernel/engine/rule-types.js'
import type { BrowserFinding } from '@kala/browser'

export type ReviewItem = {
  rule: string
  sev: Severity
  where: string
  msg: string
  fix?: string
  source: 'static' | 'rendered'
}

export type ReviewSection = { title: string; items: ReviewItem[] }

export type Review = {
  surface: string
  system: string | null
  counts: { error: number; warn: number; info: number }
  sections: ReviewSection[]
  coverage: { analyzed: number; skipped: number }
  degraded: Degraded[]
}

/**
 * Rule to section. A flat list of twenty findings reads as noise; the same
 * twenty grouped tell a reader what kind of problem each one is.
 */
export const SECTION_FOR: Record<string, string> = {
  'text-contrast': 'Accessibility',
  'computed-contrast': 'Accessibility',
  'contrast-unresolved': 'Accessibility',
  'tiny-text': 'Accessibility',
  'small-touch-target': 'Accessibility',
  'space-off-scale': 'Consistency',
  'type-off-scale': 'Consistency',
  'radius-off-scale': 'Consistency',
  'color-off-palette': 'Consistency',
  'flat-type-hierarchy': 'Craft',
  'monotonous-spacing': 'Craft',
  'nested-card': 'Craft',
  'horizontal-overflow': 'Craft',
  'missing-error-state': 'Real-world states',
  'missing-loading-state': 'Real-world states',
  'missing-empty-state': 'Real-world states',
  'list-without-empty': 'Real-world states'
}

const OTHER = 'Other'
const SEVERITY_RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 }

export const buildReview = (input: {
  surface: string
  system: string | null
  findings: Finding[]
  rendered: BrowserFinding[]
  coverage: { analyzed: number; skipped: number }
  degraded: Degraded[]
}): Review => {
  const items: ReviewItem[] = [
    ...input.findings.map((f): ReviewItem => ({
      rule: f.rule,
      sev: f.sev,
      where: `${f.file}:${f.line}`,
      msg: f.msg,
      ...(f.fix ? { fix: f.fix } : {}),
      source: 'static' as const
    })),
    ...input.rendered.map((f): ReviewItem => ({
      rule: f.rule,
      sev: f.sev,
      where: `${f.selector} @ ${f.viewport}`,
      msg: f.msg,
      ...(f.fix ? { fix: f.fix } : {}),
      source: 'rendered' as const
    }))
  ]

  const counts = { error: 0, warn: 0, info: 0 }
  for (const item of items) counts[item.sev] += 1

  const grouped = new Map<string, ReviewItem[]>()
  for (const item of items) {
    // An unrecognised rule lands in Other rather than vanishing: a new rule
    // must never be silently dropped from a review.
    const title = SECTION_FOR[item.rule] ?? OTHER
    const list = grouped.get(title) ?? []
    list.push(item)
    grouped.set(title, list)
  }

  const sections: ReviewSection[] = [...grouped.entries()]
    .map(([title, list]) => ({
      title,
      items: [...list].sort((a, b) => SEVERITY_RANK[a.sev] - SEVERITY_RANK[b.sev])
    }))
    .sort((a, b) => {
      const worst = (s: ReviewSection): number =>
        Math.min(...s.items.map(i => SEVERITY_RANK[i.sev]))
      return worst(a) - worst(b) || a.title.localeCompare(b.title)
    })

  return {
    surface: input.surface,
    system: input.system,
    counts,
    sections,
    coverage: input.coverage,
    degraded: input.degraded
  }
}

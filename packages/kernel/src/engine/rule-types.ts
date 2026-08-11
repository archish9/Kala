import type { Expr } from './expr.js'

export type Severity = 'error' | 'warn' | 'info'

export type Selector = {
  hasFact?: string
  name?: string
  kind?: 'element' | 'component' | 'text' | 'slot'
}

export type AgainstSelector = { nearestAncestor: Selector }

export type RuleDef = {
  id: string
  kind: 'node' | 'relation' | 'aggregate' | 'document'
  severity: Severity
  select: Selector
  against?: AgainstSelector
  assert?: Expr
  predicate?: string
  collect?: string
  scope?: 'file' | 'surface'
  minSample?: number
  message: string
  fix?: string
  fixtures: { pass: string; fail: string }
  source?: string
  modified?: boolean
}

export type Finding = {
  id: string
  rule: string
  sev: Severity
  file: string
  line: number
  msg: string
  fix?: string
  surface?: string
}

export type Degraded = {
  code: string
  path?: string
  detail: string
  impact: string
}

export type Coverage = { analyzed: number; skipped: number; reason?: string }

export type VerifyResult = {
  findings: Finding[]
  coverage: Coverage
  degraded: Degraded[]
}

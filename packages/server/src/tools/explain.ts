import { getPack } from '../context.js'
import type { VerifyResult, Severity } from '@kala/kernel/engine/rule-types.js'

export type ExplainResult = {
  found: boolean
  rule?: string
  severity?: Severity
  detail: string
  fix?: string
  source?: string
}

export const explain = async (
  id: string, lastRun: VerifyResult | null
): Promise<ExplainResult> => {
  const finding = lastRun?.findings.find(f => f.id === id || f.rule === id)
  const { rules } = await getPack()
  const rule = rules.find(r => r.id === (finding?.rule ?? id))

  if (!rule) {
    return { found: false, detail: `No finding or rule matches "${id}".` }
  }

  return {
    found: true,
    rule: rule.id,
    severity: rule.severity,
    detail: [
      rule.message,
      `Kind: ${rule.kind}${rule.scope ? ` (scope: ${rule.scope})` : ''}`,
      rule.source ? `Adapted from: ${rule.source}` : null
    ].filter(Boolean).join('\n'),
    ...(rule.fix ? { fix: rule.fix } : {}),
    ...(rule.source ? { source: rule.source } : {})
  }
}

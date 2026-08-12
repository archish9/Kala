import { resolve } from 'node:path'
import { buildReview, writeReport, type Review } from '@kala/report'
import { inspectUrl, type BrowserFinding } from '@kala/browser'
import { deriveLock } from '@kala/kernel/lock/derive.js'
import { resolveSurface } from '@kala/kernel/surface/resolve.js'
import type { Degraded } from '@kala/kernel/engine/rule-types.js'
import { verify } from './verify.js'

export type CritiqueResult = { review: Review; reportPath: string | null }

export const critique = async (
  dir: string,
  paths: string[],
  opts: { url?: string; html?: boolean } = {}
): Promise<CritiqueResult> => {
  const root = resolve(dir)

  // verify throws only on path escape, which must stay a hard error here too.
  const result = await verify(root, paths)

  const degraded: Degraded[] = [...result.degraded]
  let rendered: BrowserFinding[] = []

  if (opts.url) {
    const inspected = await inspectUrl(opts.url)
    rendered = inspected.findings
    degraded.push(...inspected.degraded)
  }

  const { lock } = await deriveLock(root)

  const review = buildReview({
    surface: paths[0] ? resolveSurface(paths[0]) : 'project',
    system: lock?.intent.system ?? null,
    findings: result.findings,
    rendered,
    coverage: { analyzed: result.coverage.analyzed, skipped: result.coverage.skipped },
    degraded
  })

  return {
    review,
    reportPath: opts.html ? await writeReport(review) : null
  }
}

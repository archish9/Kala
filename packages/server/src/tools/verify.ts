import { readFile } from 'node:fs/promises'
import { relative } from 'node:path'
import { deriveLock } from '@fe-design/kernel/lock/derive.js'
import { runRules } from '@fe-design/kernel/engine/runner.js'
import type { IRDoc } from '@fe-design/kernel/ir/types.js'
import type { VerifyResult, Degraded } from '@fe-design/kernel/engine/rule-types.js'
import { getPack, safeJoin } from '../context.js'
import { extractorFor, SUPPORTED_EXTENSIONS } from '../extractors.js'

const MAX_BYTES = 2 * 1024 * 1024

export const verify = async (
  dir: string, paths: string[]
): Promise<VerifyResult> => {
  // safeJoin throws on escape — a hard error, deliberately not degraded.
  const abs = paths.map(p => safeJoin(dir, p))

  const degraded: Degraded[] = []
  const docs: IRDoc[] = []

  const { lock, degraded: lockDegraded } = await deriveLock(dir)
  degraded.push(...lockDegraded)

  const { rules, degraded: packDegraded, predicates } = await getPack()
  degraded.push(...packDegraded)

  for (const file of abs) {
    const rel = relative(dir, file)

    let src: string
    try {
      src = await readFile(file, 'utf8')
    } catch (err) {
      degraded.push({
        code: 'READ_FAILED', path: rel,
        detail: (err as Error).message, impact: '1 file not analyzed'
      })
      continue
    }

    if (Buffer.byteLength(src) > MAX_BYTES) {
      degraded.push({
        code: 'FILE_TOO_LARGE', path: rel,
        detail: 'Larger than 2MB; treated as a bundle, not source.',
        impact: '1 file not analyzed'
      })
      continue
    }

    const extract = extractorFor(file)
    if (!extract) {
      degraded.push({
        code: 'UNSUPPORTED_FRAMEWORK', path: rel,
        detail: `No extractor for this file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}.`,
        impact: '1 file not analyzed'
      })
      continue
    }

    try {
      docs.push(extract(src, rel))
    } catch (err) {
      degraded.push({
        code: 'PARSE_FAILED', path: rel,
        detail: (err as Error).message, impact: '1 file not analyzed'
      })
    }
  }

  const result = runRules(docs, rules, lock ?? { derived: {} }, predicates)
  return { ...result, degraded: [...degraded, ...result.degraded] }
}

import { readdir, readFile, access } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import type { RuleDef, Degraded } from './rule-types.js'

const exists = async (p: string): Promise<boolean> => {
  try { await access(p); return true } catch { return false }
}

export const loadPack = async (
  dir: string
): Promise<{ rules: RuleDef[]; degraded: Degraded[] }> => {
  const rules: RuleDef[] = []
  const degraded: Degraded[] = []

  const walk = async (d: string): Promise<string[]> => {
    const entries = await readdir(d, { withFileTypes: true })
    const out: string[] = []
    for (const e of entries) {
      const p = join(d, e.name)
      if (e.isDirectory()) out.push(...await walk(p))
      else if (e.name.endsWith('.json')) out.push(p)
    }
    return out
  }

  for (const file of await walk(dir)) {
    let parsed: RuleDef
    try {
      parsed = JSON.parse(await readFile(file, 'utf8')) as RuleDef
    } catch (err) {
      degraded.push({
        code: 'RULE_PARSE_FAILED', path: file,
        detail: (err as Error).message, impact: '1 rule not loaded'
      })
      continue
    }

    const fx = parsed.fixtures
    if (!fx?.pass || !fx?.fail) {
      degraded.push({
        code: 'RULE_MISSING_FIXTURE', path: file,
        detail: `Rule "${parsed.id}" needs both a pass and a fail fixture.`,
        impact: '1 rule not loaded'
      })
      continue
    }

    const base = dirname(file)
    const abs = { pass: resolve(base, fx.pass), fail: resolve(base, fx.fail) }
    const missing: string[] = []
    for (const [key, p] of Object.entries(abs)) {
      if (!await exists(p)) missing.push(`${key}: ${fx[key as 'pass' | 'fail']}`)
    }
    if (missing.length > 0) {
      degraded.push({
        code: 'RULE_FIXTURE_NOT_FOUND', path: file,
        detail: `Fixture file(s) not found: ${missing.join(', ')}`,
        impact: '1 rule not loaded'
      })
      continue
    }

    // Fixture paths are written relative to the rule file. Only the loader knows
    // that directory, so it resolves them here rather than leaking the
    // convention to every consumer.
    rules.push({ ...parsed, fixtures: abs })
  }

  return { rules, degraded }
}

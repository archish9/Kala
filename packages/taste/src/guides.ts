import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Degraded } from '@kala/kernel/engine/rule-types.js'

export const GUIDE_ACTIONS = [
  'bolder', 'quieter', 'distill', 'harden', 'animate', 'typeset', 'layout',
  'colorize', 'delight', 'clarify', 'adapt', 'optimize', 'onboard'
] as const

export type GuideAction = typeof GUIDE_ACTIONS[number]

export type TokenGroup = 'space' | 'type' | 'color' | 'radius' | 'motion'

export const TOKEN_GROUPS: TokenGroup[] =
  ['space', 'type', 'color', 'radius', 'motion']

export type GuideDef = {
  id: GuideAction
  intent: string
  moves: string[]
  avoid: string[]
  usesTokens: TokenGroup[]
}

const validate = (g: Partial<GuideDef>): string | null => {
  if (!g.id) return 'missing id'
  if (!(GUIDE_ACTIONS as readonly string[]).includes(g.id)) {
    return `"${g.id}" is not a known action`
  }
  if (!g.intent || g.intent.length < 10) return 'intent must be a real sentence'
  if (!Array.isArray(g.moves) || g.moves.length < 3) {
    return 'moves needs at least 3 entries'
  }
  if (!Array.isArray(g.avoid) || g.avoid.length < 1) {
    return 'avoid needs at least 1 entry'
  }
  if (!Array.isArray(g.usesTokens) || g.usesTokens.length < 1) {
    return 'usesTokens needs at least 1 entry'
  }
  for (const t of g.usesTokens) {
    if (!TOKEN_GROUPS.includes(t)) return `unknown token group "${t}"`
  }
  return null
}

export const loadGuides = async (
  dir: string
): Promise<{ guides: GuideDef[]; degraded: Degraded[] }> => {
  const guides: GuideDef[] = []
  const degraded: Degraded[] = []

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch (err) {
    degraded.push({
      code: 'GUIDES_DIR_MISSING', path: dir,
      detail: (err as Error).message, impact: 'no guides available'
    })
    return { guides, degraded }
  }

  for (const entry of entries.sort()) {
    if (!entry.endsWith('.json')) continue
    const file = join(dir, entry)

    let parsed: GuideDef
    try {
      parsed = JSON.parse(await readFile(file, 'utf8')) as GuideDef
    } catch (err) {
      degraded.push({
        code: 'GUIDE_PARSE_FAILED', path: file,
        detail: (err as Error).message, impact: '1 guide not loaded'
      })
      continue
    }

    const problem = validate(parsed)
    if (problem) {
      degraded.push({
        code: 'GUIDE_INVALID', path: file,
        detail: `Guide "${parsed.id ?? entry}": ${problem}`,
        impact: '1 guide not loaded'
      })
      continue
    }

    guides.push(parsed)
  }

  return { guides, degraded }
}

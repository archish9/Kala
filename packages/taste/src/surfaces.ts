import { readdir, readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { Degraded } from '@kala/kernel/engine/rule-types.js'

export type RequiredState =
  | 'loading' | 'error' | 'empty' | 'success' | 'disabled' | 'permission'

export const REQUIRED_STATES: RequiredState[] = [
  'loading', 'error', 'empty', 'success', 'disabled', 'permission'
]

export type SurfaceDef = {
  id: string
  aliases: string[]
  purpose: string
  requiredStates: RequiredState[]
  requirements: string[]
  antiPatterns: string[]
  primaryAction: string | null
}

const validate = (s: Partial<SurfaceDef>): string | null => {
  if (!s.id) return 'missing id'
  if (!Array.isArray(s.aliases)) return 'missing aliases'
  if (!s.purpose || s.purpose.length < 10) return 'purpose must be a real sentence'
  if (!Array.isArray(s.requiredStates)) return 'missing requiredStates'
  for (const st of s.requiredStates) {
    if (!REQUIRED_STATES.includes(st)) return `unknown required state "${st}"`
  }
  if (!Array.isArray(s.requirements) || s.requirements.length < 3) {
    return 'requirements needs at least 3 entries'
  }
  if (!Array.isArray(s.antiPatterns) || s.antiPatterns.length < 1) {
    return 'antiPatterns needs at least 1 entry'
  }
  if (s.primaryAction === undefined) return 'primaryAction must be set, or null'
  return null
}

export const loadSurfaces = async (
  dir: string
): Promise<{ surfaces: SurfaceDef[]; degraded: Degraded[] }> => {
  const surfaces: SurfaceDef[] = []
  const degraded: Degraded[] = []

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch (err) {
    degraded.push({
      code: 'SURFACES_DIR_MISSING', path: dir,
      detail: (err as Error).message, impact: 'no surfaces available'
    })
    return { surfaces, degraded }
  }

  for (const entry of entries.sort()) {
    if (!entry.endsWith('.json')) continue
    const file = join(dir, entry)

    let parsed: SurfaceDef
    try {
      parsed = JSON.parse(await readFile(file, 'utf8')) as SurfaceDef
    } catch (err) {
      degraded.push({
        code: 'SURFACE_PARSE_FAILED', path: file,
        detail: (err as Error).message, impact: '1 surface not loaded'
      })
      continue
    }

    const problem = validate(parsed)
    if (problem) {
      degraded.push({
        code: 'SURFACE_INVALID', path: file,
        detail: `Surface "${parsed.id ?? entry}": ${problem}`,
        impact: '1 surface not loaded'
      })
      continue
    }

    surfaces.push(parsed)
  }

  return { surfaces, degraded }
}

/**
 * Accepts an id, an alias, or a route-like path. Paths are reduced to their
 * most meaningful segment, so `src/app/settings/page.tsx` matches `settings`
 * rather than `page`.
 */
export const matchSurface = (
  name: string, surfaces: SurfaceDef[]
): SurfaceDef | null => {
  const raw = name.trim().toLowerCase()

  const candidates = new Set<string>([raw])
  if (raw.includes('/')) {
    const file = basename(raw).replace(/\.[jt]sx?$/, '')
    candidates.add(file)
    candidates.add(basename(dirname(raw)))
  }

  for (const candidate of candidates) {
    const hit = surfaces.find(
      s => s.id === candidate || s.aliases.some(a => a.toLowerCase() === candidate)
    )
    if (hit) return hit
  }
  return null
}

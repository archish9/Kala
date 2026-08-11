import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Degraded } from '@fe-design/kernel/engine/rule-types.js'
import { AXIS_NAMES, type DesignSystem } from './types.js'

const isRange = (v: unknown): boolean =>
  Array.isArray(v) && v.length === 2 &&
  v.every(n => typeof n === 'number' && n >= 0 && n <= 1) &&
  (v[0] as number) <= (v[1] as number)

/** Returns the first schema problem found, or null when the system is valid. */
const validate = (s: Partial<DesignSystem>): string | null => {
  if (!s.id) return 'missing id'
  if (!s.axes) return 'missing axes'
  for (const axis of AXIS_NAMES) {
    if (!isRange(s.axes[axis])) return `axes.${axis} must be [low, high] within 0..1, low <= high`
  }
  if (!s.type?.families?.sans) return 'missing type.families.sans'
  if (typeof s.type?.ratio !== 'number') return 'missing type.ratio'
  if (typeof s.type?.baseSize !== 'number') return 'missing type.baseSize'
  if (typeof s.space?.base !== 'number') return 'missing space.base'
  if (typeof s.shape?.radius !== 'number') return 'missing shape.radius'
  if (typeof s.color?.neutralHue !== 'number') return 'missing color.neutralHue'
  if (typeof s.color?.chromaCeiling !== 'number') return 'missing color.chromaCeiling'
  if (typeof s.motion?.duration !== 'number') return 'missing motion.duration'
  if (!Array.isArray(s.signature) || s.signature.length < 3) {
    return 'signature needs at least 3 entries — it is what stops output reading generic'
  }
  if (!Array.isArray(s.antiDefaults) || s.antiDefaults.length < 1) {
    return 'antiDefaults needs at least 1 entry'
  }
  return null
}

export const loadSystems = async (
  dir: string
): Promise<{ systems: DesignSystem[]; degraded: Degraded[] }> => {
  const systems: DesignSystem[] = []
  const degraded: Degraded[] = []

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch (err) {
    degraded.push({
      code: 'SYSTEMS_DIR_MISSING', path: dir,
      detail: (err as Error).message, impact: 'no systems available'
    })
    return { systems, degraded }
  }

  for (const entry of entries.sort()) {
    if (!entry.endsWith('.json')) continue
    const file = join(dir, entry)

    let parsed: DesignSystem
    try {
      parsed = JSON.parse(await readFile(file, 'utf8')) as DesignSystem
    } catch (err) {
      degraded.push({
        code: 'SYSTEM_PARSE_FAILED', path: file,
        detail: (err as Error).message, impact: '1 system not loaded'
      })
      continue
    }

    const problem = validate(parsed)
    if (problem) {
      degraded.push({
        code: 'SYSTEM_INVALID', path: file,
        detail: `System "${parsed.id ?? entry}": ${problem}`,
        impact: '1 system not loaded'
      })
      continue
    }

    systems.push(parsed)
  }

  return { systems, degraded }
}

import { resolve } from 'node:path'
import { loadSurfaces, matchSurface, loadSystems } from '@fe-design/taste'
import type { RequiredState } from '@fe-design/taste'
import { SURFACES_DIR, SYSTEMS_DIR } from '@fe-design/packs'
import { deriveLock } from '@fe-design/kernel/lock/derive.js'
import type { Degraded } from '@fe-design/kernel/engine/rule-types.js'

export type SurfaceBriefResult = {
  surface: string | null
  purpose: string
  requiredStates: RequiredState[]
  requirements: string[]
  antiPatterns: string[]
  primaryAction: string | null
  system: { id: string; signature: string[]; banned: string[] } | null
  tokens: { space: number[]; typeSteps: number[]; components: string[] } | null
  degraded: Degraded[]
}

export const surfaceBrief = async (
  dir: string, surface: string
): Promise<SurfaceBriefResult> => {
  const root = resolve(dir)
  const degraded: Degraded[] = []

  const { surfaces, degraded: surfaceDegraded } = await loadSurfaces(SURFACES_DIR)
  degraded.push(...surfaceDegraded)

  const match = matchSurface(surface, surfaces)
  if (!match) {
    degraded.push({
      code: 'SURFACE_UNKNOWN',
      detail: `No surface matches "${surface}". Known surfaces: ` +
        surfaces.map(s => s.id).join(', ') + '.',
      impact: 'no surface requirements returned'
    })
  }

  // Ground the brief in this project rather than returning generic prose.
  const { lock, degraded: lockDegraded } = await deriveLock(root)
  degraded.push(...lockDegraded)

  let system: SurfaceBriefResult['system'] = null
  if (lock?.intent.system) {
    const { systems } = await loadSystems(SYSTEMS_DIR)
    const found = systems.find(s => s.id === lock.intent.system)
    if (found) {
      system = {
        id: found.id,
        signature: found.signature,
        banned: [...lock.intent.banned.patterns, ...lock.intent.banned.fonts]
      }
    }
  }

  const tokens = lock
    ? {
        space: lock.derived.space,
        typeSteps: lock.derived.type.steps,
        components: Object.keys(lock.derived.components)
      }
    : null

  return {
    surface: match?.id ?? null,
    purpose: match?.purpose ?? '',
    requiredStates: match?.requiredStates ?? [],
    requirements: match?.requirements ?? [],
    antiPatterns: match?.antiPatterns ?? [],
    primaryAction: match?.primaryAction ?? null,
    system,
    tokens,
    degraded
  }
}

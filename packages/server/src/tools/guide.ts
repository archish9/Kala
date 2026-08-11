import { resolve } from 'node:path'
import { loadGuides, loadSystems, GUIDE_ACTIONS } from '@fe-design/taste'
import type { TokenGroup } from '@fe-design/taste'
import { GUIDES_DIR, SYSTEMS_DIR } from '@fe-design/packs'
import { deriveLock } from '@fe-design/kernel/lock/derive.js'
import type { Lock } from '@fe-design/kernel/lock/types.js'
import type { Degraded } from '@fe-design/kernel/engine/rule-types.js'

export type GuideResult = {
  action: string
  intent: string
  moves: string[]
  avoid: string[]
  system: string | null
  signature: string[]
  banned: string[]
  available: Partial<Record<TokenGroup, unknown>>
  degraded: Degraded[]
}

/** Only the groups the playbook declares, so the response stays small. */
const tokensFor = (
  groups: TokenGroup[], lock: Lock
): Partial<Record<TokenGroup, unknown>> => {
  const out: Partial<Record<TokenGroup, unknown>> = {}
  for (const g of groups) {
    if (g === 'space') out.space = lock.derived.space
    if (g === 'type') out.type = lock.derived.type.steps
    if (g === 'color') out.color = lock.derived.color
    if (g === 'radius') out.radius = lock.derived.radius
    if (g === 'motion') out.motion = lock.intent.motion
  }
  return out
}

export const guide = async (
  dir: string, action: string, target?: string
): Promise<GuideResult> => {
  const root = resolve(dir)
  const degraded: Degraded[] = []
  void target

  const { guides, degraded: guideDegraded } = await loadGuides(GUIDES_DIR)
  degraded.push(...guideDegraded)

  const match = guides.find(g => g.id === action.trim().toLowerCase())
  if (!match) {
    degraded.push({
      code: 'GUIDE_UNKNOWN',
      detail: `No playbook for "${action}". Known actions: ` +
        GUIDE_ACTIONS.join(', ') + '.',
      impact: 'no guidance returned'
    })
  }

  const { lock, degraded: lockDegraded } = await deriveLock(root)
  degraded.push(...lockDegraded)

  let system: string | null = null
  let signature: string[] = []
  let banned: string[] = []

  if (lock?.intent.system) {
    system = lock.intent.system
    banned = [...lock.intent.banned.patterns, ...lock.intent.banned.fonts]
    const { systems } = await loadSystems(SYSTEMS_DIR)
    signature = systems.find(s => s.id === lock.intent.system)?.signature ?? []
  }

  return {
    action: match?.id ?? action,
    intent: match?.intent ?? '',
    moves: match?.moves ?? [],
    avoid: match?.avoid ?? [],
    system,
    signature,
    banned,
    available: match && lock ? tokensFor(match.usesTokens, lock) : {},
    degraded
  }
}

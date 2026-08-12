import { deriveLock } from '@kala/kernel/lock/derive.js'
import { checkStale } from '@kala/kernel/lock/staleness.js'
import type { Degraded } from '@kala/kernel/engine/rule-types.js'

export type StatusResult = {
  hasLock: boolean
  stale: boolean
  changed: string[]
  space: number[]
  typeSteps: number[]
  palette: string[]
  components: string[]
  degraded: Degraded[]
}

export const systemStatus = async (dir: string): Promise<StatusResult> => {
  const { lock, degraded } = await deriveLock(dir)
  if (!lock) {
    return {
      hasLock: false, stale: false, changed: [], space: [],
      typeSteps: [], palette: [], components: [], degraded
    }
  }
  const { stale, changed } = await checkStale(lock, dir)
  return {
    hasLock: true,
    stale,
    changed,
    space: lock.derived.space,
    typeSteps: lock.derived.type.steps,
    palette: Object.keys(lock.derived.color),
    components: Object.keys(lock.derived.components),
    degraded
  }
}

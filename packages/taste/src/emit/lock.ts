import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deriveLock } from '@kala/kernel/lock/derive.js'
import { emitTailwindConfig } from './tailwind.js'
import { emitGlobalsCss } from './css.js'
import type { ComposedTokens } from '../compose.js'

/**
 * Fonts a model reaches for by default. Banning the ones this system does not
 * itself use is what stops a later session drifting back to the defaults the
 * curated system was chosen to avoid.
 */
const OVERUSED_FONTS = ['Inter', 'Roboto', 'Open Sans', 'Arial', 'Helvetica']

export const emitLock = async (
  dir: string, t: ComposedTokens
): Promise<string> => {
  // Derive from the files just written, so the lock's derived zone is a true
  // function of project config rather than a second, divergent source.
  const { lock } = await deriveLock(dir, {
    system: t.system.id,
    density: t.system.space.rhythm,
    hierarchy: { headingJump: 2, maxWeightsPerSurface: t.system.type.maxWeights },
    motion: { budget: t.system.motion.budget, maxDurationMs: t.system.motion.duration },
    banned: {
      fonts: OVERUSED_FONTS.filter(
        f => f !== t.system.type.families.sans && f !== t.system.type.families.serif
      ),
      patterns: t.system.antiDefaults
    },
    rationale: `${t.system.color.strategy}. ${t.system.signature.join(' ')}`
  })

  if (!lock) {
    throw new Error(
      'emitLock: config was written but deriveLock found no design source. ' +
      'The emitted tailwind config shape and deriveLock have diverged.'
    )
  }

  const path = join(dir, 'design.lock.json')
  await writeFile(path, JSON.stringify(lock, null, 2) + '\n', 'utf8')
  return path
}

export const emitAll = async (
  dir: string, t: ComposedTokens
): Promise<{ files: string[] }> => {
  const files = [
    await emitTailwindConfig(dir, t),
    await emitGlobalsCss(dir, t),
    await emitLock(dir, t)
  ]
  return { files }
}

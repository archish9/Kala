import { join } from 'node:path'
import { writeBlock } from './markers.js'
import { RAMP_STEPS } from '../color/ramp.js'
import type { ComposedTokens } from '../compose.js'

const q = (s: string): string => JSON.stringify(s)

/**
 * Shape matters: Phase 1's deriveLock reads theme.extend.spacing, .fontSize,
 * .colors and .borderRadius. Changing these keys silently breaks derivation.
 */
export const emitTailwindConfig = async (
  dir: string, t: ComposedTokens
): Promise<string> => {
  const spacing = t.space
    .map((px, i) => `      ${q(String(i))}: '${px}px'`).join(',\n')

  const fontSize = t.type.steps
    .map(px => `      ${q(`s${px}`)}: '${px}px'`).join(',\n')

  const radius = t.radius
    .map(px => `      ${q(String(px))}: '${px}px'`).join(',\n')

  const ramp = (name: string, r: Record<number, string>): string =>
    `      ${name}: {\n` +
    RAMP_STEPS.map(s => `        ${q(String(s))}: '${r[s]}'`).join(',\n') +
    `\n      }`

  const semantic = Object.entries(t.light)
    .map(([k, v]) => `      ${q(k)}: '${v}'`).join(',\n')

  const body = `export default {
  theme: {
    extend: {
      spacing: {
${spacing}
      },
      fontSize: {
${fontSize}
      },
      borderRadius: {
${radius}
      },
      fontFamily: {
        sans: [${q(t.type.families.sans)}, ${t.type.fallbacks.map(q).join(', ')}],
        serif: [${q(t.type.families.serif)}, 'Georgia', 'serif']
      },
      colors: {
${ramp('accent', t.ramps.accent)},
${ramp('neutral', t.ramps.neutral)},
${semantic}
      }
    }
  }
}`

  const path = join(dir, 'tailwind.config.mjs')
  await writeBlock(path, 'tailwind', body, 'js')
  return path
}

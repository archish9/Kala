import { join } from 'node:path'
import { writeBlock } from './markers.js'
import type { ComposedTokens } from '../compose.js'
import type { Semantics } from '../color/solve.js'

const vars = (s: Semantics, indent: string): string =>
  Object.entries(s).map(([k, v]) => `${indent}--color-${k}: ${v};`).join('\n')

export const emitGlobalsCss = async (
  dir: string, t: ComposedTokens
): Promise<string> => {
  const space = t.space.map((px, i) => `    --space-${i}: ${px}px;`).join('\n')
  const type = t.type.steps.map(px => `    --text-${px}: ${px}px;`).join('\n')

  const body = `:root {
${vars(t.light, '    ')}
${space}
${type}
    --radius: ${t.system.shape.radius}px;
    --motion-duration: ${t.system.motion.duration}ms;
    --motion-easing: ${t.system.motion.easing};
  }

  /* Derived from the light scheme by remapping lightness and reducing chroma,
     not by inversion. Surfaces rise by lightness because shadows do not read
     on a dark ground. */
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
${vars(t.dark, '      ')}
    }
  }

  :root[data-theme="dark"] {
${vars(t.dark, '    ')}
  }

  @media (prefers-reduced-motion: reduce) {
    :root { --motion-duration: 0ms; }
  }`

  const path = join(dir, 'src', 'styles', 'globals.css')
  await writeBlock(path, 'tokens', body, 'css')
  return path
}

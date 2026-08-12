import { emptyStyleFacts, type StyleFacts } from '@kala/kernel/ir/types.js'
import type { Fact } from '@kala/kernel/ir/fact.js'

type Group = keyof Omit<StyleFacts, 'raw'>

const GROUPS: Group[] = ['space', 'type', 'color', 'shape', 'layout']

/**
 * Later layers win, but uncertainty is contagious: once a layer says a value
 * is unknown, no earlier certainty can restore it, because the later rule may
 * or may not override. Treating it as known would invent a finding.
 */
const pick = (a: Fact<unknown>, b: Fact<unknown>): Fact<unknown> => {
  if (b.state === 'unknown' || a.state === 'unknown') {
    return b.state === 'unknown' ? b : a
  }
  return b.state === 'known' ? b : a
}

export const mergeFacts = (layers: StyleFacts[]): StyleFacts => {
  const out = emptyStyleFacts()
  if (layers.length === 0) return out

  for (const layer of layers) {
    for (const group of GROUPS) {
      const target = out[group] as Record<string, Fact<unknown>>
      const source = layer[group] as Record<string, Fact<unknown>>
      for (const key of Object.keys(source)) {
        target[key] = pick(target[key]!, source[key]!)
      }
    }
    out.raw.push(...layer.raw)
  }

  return out
}

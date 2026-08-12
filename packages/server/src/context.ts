import { readdir } from 'node:fs/promises'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { RULES_DIR } from '@kala/packs'
import { loadPack } from '@kala/kernel/engine/pack-loader.js'
import type { RuleDef, Degraded } from '@kala/kernel/engine/rule-types.js'
import type { PredicateFn } from '@kala/kernel/engine/runner.js'

export const PACKS_DIR = RULES_DIR

type Pack = {
  rules: RuleDef[]
  degraded: Degraded[]
  predicates: Record<string, PredicateFn>
}

let cache: Pack | null = null

export const getPack = async (): Promise<Pack> => {
  if (cache) return cache
  const { rules, degraded } = await loadPack(PACKS_DIR)
  const predicates: Record<string, PredicateFn> = {}
  try {
    const pdir = join(PACKS_DIR, 'predicates')
    for (const f of await readdir(pdir)) {
      if (!f.endsWith('.mjs')) continue
      const mod = await import(join(pdir, f)) as { default: PredicateFn }
      predicates[f.replace(/\.mjs$/, '')] = mod.default
    }
  } catch { /* no predicates directory is fine */ }
  cache = { rules, degraded, predicates }
  return cache
}

/** Throws on path escape. One of the three hard errors in the spec. */
export const safeJoin = (root: string, p: string): string => {
  const abs = isAbsolute(p) ? p : resolve(root, p)
  const rel = relative(resolve(root), abs)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path "${p}" is outside the project root.`)
  }
  return abs
}

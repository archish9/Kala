import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Absolute path to the rule pack.
 *
 * The pack ships as data at the package root, but this module runs from `src/`
 * under test and `dist/src/` once built, so a fixed number of `..` segments is
 * wrong in one of those cases. Walking up to the directory that actually holds
 * `rules/` is correct from either.
 */
const findRules = (): string => {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'rules')
    if (existsSync(candidate)) return candidate
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  throw new Error('@fe-design/packs: could not locate the rules directory.')
}

export const RULES_DIR = findRules()

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Pack data ships at the package root, but this module runs from `src/` under
 * test and `dist/src/` once built, so a fixed number of `..` segments is wrong
 * in one of those cases. Walking up to the directory that actually holds the
 * data is correct from either.
 */
const findPackDir = (name: string): string => {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, name)
    if (existsSync(candidate)) return candidate
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`@kala/packs: could not locate the ${name} directory.`)
}

export const RULES_DIR = findPackDir('rules')
export const SYSTEMS_DIR = findPackDir('systems')
export const SURFACES_DIR = findPackDir('surfaces')
export const GUIDES_DIR = findPackDir('guides')

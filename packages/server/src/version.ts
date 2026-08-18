import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The version reported in the MCP handshake. Hardcoding it meant the published
 * `kala-mcp` announced whatever number was last typed here rather than the one
 * it was published under.
 *
 * The nearest `package.json` above this module is the right answer in all three
 * layouts: `packages/server/package.json` from source and from `dist/src/`, and
 * the staged manifest sitting beside `bundle.js` in the published package,
 * which `scripts/bundle.mjs` writes with this same version.
 */
const readVersion = (): string => {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'package.json')
    if (existsSync(candidate)) {
      const version = JSON.parse(readFileSync(candidate, 'utf8')).version
      if (typeof version === 'string') return version
    }
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  throw new Error('@kala/server: could not locate the package manifest to read the version from.')
}

export const SERVER_VERSION = readVersion()

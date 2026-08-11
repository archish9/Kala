import { readdir, readFile } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'

export const UI_DIRS = ['src/ui', 'src/components/ui', 'components/ui', 'app/ui']

export const scanComponents = async (
  dir: string
): Promise<Record<string, { file: string; variants: string[] }>> => {
  const out: Record<string, { file: string; variants: string[] }> = {}

  for (const rel of UI_DIRS) {
    let entries: string[]
    try { entries = await readdir(join(dir, rel)) } catch { continue }

    for (const entry of entries) {
      if (!['.tsx', '.jsx', '.vue', '.svelte'].includes(extname(entry))) continue
      const name = basename(entry, extname(entry))
      const src = await readFile(join(dir, rel, entry), 'utf8')

      const variants: string[] = []
      const vm = /variants\s*[:=]\s*\{([^}]*)\}/s.exec(src)
      if (vm?.[1]) {
        for (const km of vm[1].matchAll(/(\w+)\s*:/g)) {
          const key = km[1]
          if (key) variants.push(key)
        }
      }
      out[name] = { file: join(rel, entry), variants }
    }
  }
  return out
}

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..', '..')

const markdownFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return markdownFiles(full)
    return full.endsWith('.md') ? [full] : []
  })

/** GitHub's anchor rule: lowercase, strip anything but word chars/spaces/hyphens. */
const slug = (heading: string): string =>
  heading.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')

const anchorsIn = (file: string): Set<string> =>
  new Set(
    (readFileSync(file, 'utf8').match(/^#{1,6} .+$/gm) ?? [])
      .map(h => slug(h.replace(/^#+ /, '')))
  )

describe('documentation links', () => {
  const files = [
    join(ROOT, 'README.md'),
    ...markdownFiles(join(ROOT, 'Documentation'))
  ]

  it('resolves every relative markdown link to a file that exists', () => {
    const broken: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const [, target] of text.matchAll(/\]\((?!https?:|#|mailto:)([^)]+)\)/g)) {
        const [path] = (target ?? '').split('#')
        if (!path) continue
        const resolved = resolve(dirname(file), path)
        if (!existsSync(resolved)) {
          broken.push(`${file.replace(ROOT + '/', '')} → ${target}`)
        }
      }
    }
    expect(broken, `broken links:\n${broken.join('\n')}`).toEqual([])
  })

  it('resolves every anchor to a heading in the target file', () => {
    const broken: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const [, target] of text.matchAll(/\]\((?!https?:|mailto:)([^)]+#[^)]+)\)/g)) {
        const [path, anchor] = (target ?? '').split('#')
        const resolved = path ? resolve(dirname(file), path) : file
        if (!existsSync(resolved)) continue // reported by the previous test
        if (!anchorsIn(resolved).has(anchor!)) {
          broken.push(`${file.replace(ROOT + '/', '')} → ${target}`)
        }
      }
    }
    expect(broken, `broken anchors:\n${broken.join('\n')}`).toEqual([])
  })
})

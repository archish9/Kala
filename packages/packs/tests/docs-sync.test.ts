import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..', '..')
const USERS = join(ROOT, 'Documentation', 'users')

/** Count the markdown table body rows inside one generated marker region. */
const rowsIn = (file: string, id: string): number => {
  const text = readFileSync(join(USERS, file), 'utf8')
  const start = text.indexOf(`<!-- kala:docs:${id}:start`)
  const end = text.indexOf(`<!-- kala:docs:${id}:end -->`)
  expect(start, `${file}: missing start marker for "${id}"`).toBeGreaterThan(-1)
  expect(end, `${file}: missing end marker for "${id}"`).toBeGreaterThan(start)

  const body = text.slice(text.indexOf('\n', start) + 1, end)
  // A table body row starts with "|" and is not the "|---|" separator.
  return body
    .split('\n')
    .filter(l => l.trimStart().startsWith('|') && !/^\s*\|[\s:|-]+\|\s*$/.test(l))
    .length
}

const jsonCount = (dir: string): number =>
  readdirSync(join(ROOT, 'packages', 'packs', dir)).filter(f => f.endsWith('.json')).length

/** Rule JSON lives in per-category folders; fixtures and predicates are not rules. */
const ruleCount = (): number => {
  const base = join(ROOT, 'packages', 'packs', 'rules')
  let n = 0
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name !== 'fixtures' && e.name !== 'predicates') walk(join(dir, e.name))
      } else if (e.name.endsWith('.json')) n++
    }
  }
  walk(base)
  return n
}

const catalogCount = (file: string): number =>
  JSON.parse(readFileSync(join(ROOT, 'packages', 'packs', 'catalog', file), 'utf8')).length

describe('generated documentation stays in sync with the packs', () => {
  it('lists every catalog style and typography pairing', () => {
    // Each table has one header row on top of its data rows.
    expect(rowsIn('05-catalog.md', 'styles')).toBe(catalogCount('styles.json') + 1)
    expect(rowsIn('05-catalog.md', 'typography')).toBe(catalogCount('typography.json') + 1)
  })

  it('lists every catalog palette across its grouped tables', () => {
    // Palettes render as one table per letter group, so subtract one header per group.
    const text = readFileSync(join(USERS, '05-catalog.md'), 'utf8')
    const groups = (text.match(/<summary>/g) ?? []).length
    expect(rowsIn('05-catalog.md', 'palettes') - groups).toBe(catalogCount('palettes.json'))
  })

  it('lists every design system, twice — tokens and signatures', () => {
    expect(rowsIn('06-design-systems.md', 'systems')).toBe(jsonCount('systems') + 1)
    expect(rowsIn('06-design-systems.md', 'signatures')).toBe(jsonCount('systems') + 1)
  })

  it('lists every surface and every guide action', () => {
    expect(rowsIn('07-surfaces-and-actions.md', 'surfaces')).toBe(jsonCount('surfaces') + 1)
    expect(rowsIn('07-surfaces-and-actions.md', 'actions')).toBe(jsonCount('guides') + 1)
  })

  it('lists every rule', () => {
    expect(rowsIn('08-what-kala-checks.md', 'rules')).toBe(ruleCount() + 1)
  })

  it('lists the union of every system anti-default', () => {
    const bans = new Set<string>()
    for (const f of readdirSync(join(ROOT, 'packages', 'packs', 'systems'))) {
      const sys = JSON.parse(
        readFileSync(join(ROOT, 'packages', 'packs', 'systems', f), 'utf8')
      ) as { antiDefaults: string[] }
      for (const a of sys.antiDefaults) bans.add(a)
    }
    expect(rowsIn('08-what-kala-checks.md', 'anti-patterns')).toBe(bans.size + 1)
  })
})

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PACKS = join(ROOT, 'packages', 'packs')
const USERS = join(ROOT, 'Documentation', 'users')

// ---------- helpers ----------

/** Markdown table cells cannot contain a raw pipe or newline. */
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim()
const list = (a, max = Infinity) => {
  const items = (a ?? []).slice(0, max)
  const rest = (a ?? []).length - items.length
  return cell(items.join(', ') + (rest > 0 ? `, +${rest} more` : '')) || '—'
}
const table = (headers, rows) => [
  `| ${headers.join(' | ')} |`,
  `|${headers.map(() => '---').join('|')}|`,
  ...rows.map(r => `| ${r.join(' | ')} |`)
].join('\n')

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const readDirJson = (dir) =>
  readdirSync(join(PACKS, dir))
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => readJson(join(PACKS, dir, f)))

/** Recursively collect rule JSON, skipping the fixtures and predicates folders. */
const readRules = () => {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'fixtures' || entry.name === 'predicates') continue
        walk(full)
      } else if (entry.name.endsWith('.json')) {
        out.push(readJson(full))
      }
    }
  }
  walk(join(PACKS, 'rules'))
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * Replace one marker-delimited region. Hard-errors rather than writing a partial
 * file: a silently half-updated document is worse than a failed run.
 */
const replaceRegion = (text, id, body) => {
  const startTag = `<!-- kala:docs:${id}:start`
  const endTag = `<!-- kala:docs:${id}:end -->`
  const si = text.indexOf(startTag)
  const ei = text.indexOf(endTag)
  if (si === -1) throw new Error(`missing start marker for "${id}"`)
  if (ei === -1) throw new Error(`missing end marker for "${id}"`)
  if (ei < si) throw new Error(`end marker precedes start marker for "${id}"`)
  const afterStartLine = text.indexOf('\n', si) + 1
  return text.slice(0, afterStartLine) + body + '\n' + text.slice(ei)
}

const writeRegions = (file, regions) => {
  const path = join(USERS, file)
  let text = readFileSync(path, 'utf8')
  for (const [id, body] of Object.entries(regions)) {
    try {
      text = replaceRegion(text, id, body)
    } catch (err) {
      throw new Error(`${file}: ${err.message}`)
    }
  }
  writeFileSync(path, text)
  console.log(`wrote ${Object.keys(regions).length} region(s) to ${file}`)
}

// ---------- 05-catalog.md ----------

const styles = readJson(join(PACKS, 'catalog', 'styles.json'))
const palettes = readJson(join(PACKS, 'catalog', 'palettes.json'))
const typography = readJson(join(PACKS, 'catalog', 'typography.json'))

const stylesTable = table(
  ['Style', 'Best for', 'Avoid for'],
  styles.map(s => [`\`${s.id}\``, list(s.fitFor, 4), list(s.avoidFor, 3)])
)

// 192 rows is too many for one flat table, so group alphabetically by id into
// collapsed blocks. Grouping on the id's first character is deterministic;
// splitting on the first hyphen would break ids like "e-commerce-luxury-4".
const paletteGroups = new Map()
for (const p of [...palettes].sort((a, b) => a.id.localeCompare(b.id))) {
  const key = p.id[0].toUpperCase()
  if (!paletteGroups.has(key)) paletteGroups.set(key, [])
  paletteGroups.get(key).push(p)
}
const palettesTable = [...paletteGroups.entries()]
  .map(([letter, rows]) => [
    `<details>`,
    `<summary><b>${letter}</b> — ${rows.length} palettes</summary>`,
    ``,
    table(
      ['Palette', 'Built for', 'Accent', 'Scheme'],
      rows.map(p => [
        `\`${p.id}\``,
        list(p.fitFor, 2),
        `\`${p.defaultAccent}\``,
        p.darkPrimary ? 'dark' : 'light'
      ])
    ),
    ``,
    `</details>`
  ].join('\n'))
  .join('\n\n')

const typographyTable = table(
  ['Pairing', 'Sans', 'Serif', 'Feels like'],
  typography.map(t => [
    `\`${t.id}\``,
    cell(t.families.sans),
    cell(t.families.serif),
    list(t.keywords, 4)
  ])
)

writeRegions('05-catalog.md', {
  styles: stylesTable,
  palettes: palettesTable,
  typography: typographyTable
})

// ---------- 06-design-systems.md ----------

const systems = readDirJson('systems')

const systemsTable = table(
  ['System', 'Built for', 'Sans / Serif', 'Base', 'Ratio', 'Space', 'Radius', 'Depth', 'Motion'],
  systems.map(s => [
    `\`${s.id}\``,
    list(s.fitFor, 3),
    cell(`${s.type.families.sans} / ${s.type.families.serif ?? '—'}`),
    `${s.type.baseSize}px`,
    String(s.type.ratio),
    `${s.space.base}px ${s.space.rhythm}`,
    `${s.shape.radius}px`,
    cell(s.shape.depth),
    cell(`${s.motion.budget}, ${s.motion.duration}ms`)
  ])
)

const signaturesTable = table(
  ['System', 'Signature rules', 'Will not use'],
  systems.map(s => [
    `\`${s.id}\``,
    cell(s.signature.map(x => `• ${x}`).join(' ')),
    list(s.antiDefaults.map(a => `\`${a}\``))
  ])
)

writeRegions('06-design-systems.md', {
  systems: systemsTable,
  signatures: signaturesTable
})

// ---------- 07-surfaces-and-actions.md ----------

const surfaces = readDirJson('surfaces')
const guides = readDirJson('guides')

const surfacesTable = table(
  ['Surface', 'Also called', 'Required states', 'Primary action'],
  surfaces.map(s => [
    `\`${s.id}\``,
    list((s.aliases ?? []).map(a => `\`${a}\``), 4),
    list((s.requiredStates ?? []).map(x => `\`${x}\``)),
    cell(s.primaryAction ?? '—')
  ])
)

const actionsTable = table(
  ['Action', 'What it does', 'Grounded in'],
  guides.map(g => [
    `\`${g.id}\``,
    cell(g.intent),
    list((g.usesTokens ?? []).map(t => `\`${t}\``))
  ])
)

writeRegions('07-surfaces-and-actions.md', {
  surfaces: surfacesTable,
  actions: actionsTable
})

// ---------- 08-what-kala-checks.md ----------

const rules = readRules()

const rulesTable = table(
  ['Rule', 'Severity', 'Scope', 'What it catches'],
  rules.map(r => [
    `\`${r.id}\``,
    cell(r.severity),
    cell(r.kind),
    cell(r.message)
  ])
)

const bans = new Map()
for (const s of systems) {
  for (const a of s.antiDefaults) {
    if (!bans.has(a)) bans.set(a, [])
    bans.get(a).push(s.id)
  }
}
const antiTable = table(
  ['Pattern', 'Banned by'],
  [...bans.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([pattern, ids]) => [`\`${pattern}\``, list(ids.map(i => `\`${i}\``), 4)])
)

writeRegions('08-what-kala-checks.md', {
  rules: rulesTable,
  'anti-patterns': antiTable
})

console.log('documentation regenerated')

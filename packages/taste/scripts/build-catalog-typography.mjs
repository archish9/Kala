import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { csvToObjects, slugify, deriveAxesRange } from './lib.mjs'

const [, , inputPath] = process.argv
if (!inputPath) {
  console.error('Usage: node build-catalog-typography.mjs <path-to-typography.csv>')
  process.exit(1)
}

const splitList = (s) => (s ?? '').split(',').map(x => x.trim()).filter(Boolean)

const rows = csvToObjects(readFileSync(inputPath, 'utf8'))

const typography = rows.map(row => {
  const [headingRole, bodyRole] = (row['Category'] || 'Sans + Sans')
    .split('+').map(s => s.trim().toLowerCase())
  const heading = row['Heading Font']
  const body = row['Body Font']
  const sans = headingRole === 'sans' ? heading : (bodyRole === 'sans' ? body : heading)
  const serif = headingRole === 'serif' ? heading : (bodyRole === 'serif' ? body : sans)

  return {
    id: slugify(row['Font Pairing Name']),
    axes: deriveAxesRange(`${row['Mood/Style Keywords']} ${row['Best For']}`),
    fitFor: splitList(row['Best For']).map(f => f.toLowerCase()),
    avoidFor: [],
    keywords: splitList(row['Mood/Style Keywords']).map(k => k.toLowerCase()),
    families: { sans, serif },
    ratio: 1.25,
    baseSize: 16,
    maxWeights: 3,
    ...(row['Google Fonts URL'] ? { googleFontsUrl: row['Google Fonts URL'] } : {})
  }
})

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packs', 'catalog')
writeFileSync(join(outDir, 'typography.json'), JSON.stringify(typography, null, 2) + '\n')
console.log(`wrote ${typography.length} typography pairs to ${join(outDir, 'typography.json')}`)

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { oklch } from 'culori'
import { csvToObjects, slugify, deriveAxesRange } from './lib.mjs'

const [, , inputPath] = process.argv
if (!inputPath) {
  console.error('Usage: node build-catalog-palettes.mjs <path-to-colors.csv>')
  process.exit(1)
}

const rows = csvToObjects(readFileSync(inputPath, 'utf8'))

const palettes = rows.map(row => {
  const bg = oklch(row['Background'])
  const accent = oklch(row['Accent'])
  if (!bg || !accent) {
    throw new Error(`row ${row['No']} (${row['Product Type']}): could not parse Background/Accent hex`)
  }
  return {
    id: `${slugify(row['Product Type'])}-${row['No']}`,
    axes: deriveAxesRange(`${row['Product Type']} ${row['Notes']}`),
    fitFor: [row['Product Type'].toLowerCase()],
    avoidFor: [],
    neutralHue: bg.h ?? 0,
    chromaCeiling: Math.min(0.22, Math.max(0.02, accent.c)),
    defaultAccent: row['Accent'],
    darkPrimary: bg.l < 0.35
  }
})

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packs', 'catalog')
writeFileSync(join(outDir, 'palettes.json'), JSON.stringify(palettes, null, 2) + '\n')
console.log(`wrote ${palettes.length} palettes to ${join(outDir, 'palettes.json')}`)

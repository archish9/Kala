import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { csvToObjects, slugify, deriveAxesRange } from './lib.mjs'

const [, , inputPath] = process.argv
if (!inputPath) {
  console.error('Usage: node build-catalog-styles.mjs <path-to-styles.csv>')
  process.exit(1)
}

const splitList = (s) => (s ?? '').split(',').map(x => x.trim()).filter(Boolean)

const DARK_PRIMARY_MARKERS = [
  'dark mode primary', 'dark primary', 'dark-only', 'dark only',
  'dark preferred', 'dark focused', 'dark-first', 'dark rich',
  'light mode only as exception'
]

const isDarkPrimary = (light, dark) => {
  const text = `${light ?? ''} ${dark ?? ''}`.toLowerCase()
  if (DARK_PRIMARY_MARKERS.some(m => text.includes(m))) return true
  return /partial|none|✗/i.test(light ?? '') && /full|✓/i.test(dark ?? '')
}

const extractRadius = (cssKeywords) => {
  const m = /border-radius:\s*(\d+)/.exec(cssKeywords ?? '')
  return m ? Number(m[1]) : 8
}

// A declared box-shadow value (with an offset/blur number after the colon)
// is real signal; "no box-shadow unless necessary" is not, so a bare
// substring match on "shadow" over-fires for shadow-averse styles like
// Minimalism, whose Effects & Animation text says "sharp shadows if any".
const depthOf = (cssKeywords) => /box-shadow:\s*-?\d/i.test(cssKeywords ?? '') ? 'shadows' : 'borders'

const extractDuration = (effects) => {
  const m = /(\d+)(?:-\d+)?\s*ms/.exec(effects ?? '')
  return m ? Number(m[1]) : 200
}

const budgetFromComplexity = (complexity) => {
  const c = (complexity ?? '').toLowerCase()
  if (c.includes('low')) return 'minimal'
  if (c.includes('high')) return 'expressive'
  return 'moderate'
}

const rows = csvToObjects(readFileSync(inputPath, 'utf8'))

const styles = rows.map(row => {
  const text = [row['Keywords'], row['Best For'], row['Effects & Animation']].join(' ')
  return {
    id: slugify(row['Style Category']),
    axes: deriveAxesRange(text),
    fitFor: splitList(row['Best For']).map(f => f.toLowerCase()),
    avoidFor: splitList(row['Do Not Use For']).map(f => f.toLowerCase()),
    keywords: splitList(row['Keywords']).map(k => k.toLowerCase()),
    shape: {
      radius: extractRadius(row['CSS/Technical Keywords']),
      depth: depthOf(row['CSS/Technical Keywords'])
    },
    motion: {
      budget: budgetFromComplexity(row['Complexity']),
      duration: extractDuration(row['Effects & Animation']),
      easing: 'ease-out'
    },
    color: {
      strategy: `${row['Primary Colors']}; ${row['Secondary Colors']}`.slice(0, 200),
      darkPrimary: isDarkPrimary(row['Light Mode ✓'], row['Dark Mode ✓'])
    },
    signature: [],
    antiDefaults: []
  }
})

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packs', 'catalog')
writeFileSync(join(outDir, 'styles.json'), JSON.stringify(styles, null, 2) + '\n')
console.log(`wrote ${styles.length} styles to ${join(outDir, 'styles.json')}`)

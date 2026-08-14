import { briefToAxes } from '@kala/taste'

export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (c === '\r') {
      // skip; the following \n performs the row push
    } else {
      field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.length > 1 || r[0] !== '')
}

export function csvToObjects(text) {
  const rows = parseCsv(text)
  const header = rows[0]
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}

export function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const AXIS_NAMES = ['formality', 'density', 'energy', 'expressiveness']
const clamp01 = (n) => Math.min(1, Math.max(0, n))

export function deriveAxesRange(text) {
  const { axes } = briefToAxes(text)
  const range = {}
  for (const axis of AXIS_NAMES) {
    range[axis] = [clamp01(axes[axis] - 0.15), clamp01(axes[axis] + 0.15)]
  }
  return range
}

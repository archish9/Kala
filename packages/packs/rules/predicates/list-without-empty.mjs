/**
 * A rendered list with no empty branch, even without a data source — a list
 * fed by props still shows nothing when the array is empty.
 */
export default function listWithoutEmpty(doc) {
  const branches = doc.branches ?? []
  const loops = branches.filter(b => b.kind === 'loop')
  if (loops.length === 0) return []
  if (branches.some(b => b.semantic === 'empty')) return []

  return [{
    rule: 'list-without-empty',
    sev: 'warn',
    file: doc.file,
    line: 1,
    msg: `A list is rendered from ${loops[0].condition.slice(0, 40)} with no empty case.`,
    fix: 'Handle the zero-item case explicitly, even when the data is a prop.'
  }]
}

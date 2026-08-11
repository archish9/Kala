/**
 * A file that both fetches and renders a list, with no empty branch. Fires
 * once per file rather than once per source: the empty state belongs to the
 * list, and one is enough.
 */
export default function missingEmptyState(doc) {
  if (doc.dataSources.length === 0) return []

  const branches = doc.branches ?? []
  const hasLoop = branches.some(b => b.kind === 'loop')
  if (!hasLoop) return []

  const hasEmpty = branches.some(b => b.semantic === 'empty')
  if (hasEmpty) return []

  return [{
    rule: 'missing-empty-state',
    sev: 'error',
    file: doc.file,
    line: 1,
    msg: 'This surface fetches a list and renders it, but has no empty state.',
    fix: 'Render an empty state. Zero items is a normal outcome, not an error.'
  }]
}

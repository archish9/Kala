/** Any data source with no error branch anywhere in the same file. */
export default function missingErrorState(doc) {
  const hasSemantic = (src, semantic) =>
    src.branches.some(id =>
      (doc.branches ?? []).find(b => b.id === id)?.semantic === semantic)

  return doc.dataSources
    .filter(src => !hasSemantic(src, 'error'))
    .map(src => ({
      rule: 'missing-error-state',
      sev: 'error',
      file: doc.file,
      line: 1,
      msg: `${src.kind} has no error branch: ${src.raw.slice(0, 60)}`,
      fix: 'Render an error state when the request fails. Real data fails.'
    }))
}

/** Any data source with no loading branch anywhere in the same file. */
export default function missingLoadingState(doc) {
  const hasSemantic = (src, semantic) =>
    src.branches.some(id =>
      (doc.branches ?? []).find(b => b.id === id)?.semantic === semantic)

  return doc.dataSources
    .filter(src => !hasSemantic(src, 'loading'))
    .map(src => ({
      rule: 'missing-loading-state',
      sev: 'warn',
      file: doc.file,
      line: 1,
      msg: `${src.kind} has no loading branch: ${src.raw.slice(0, 60)}`,
      fix: 'Render a loading state. The happy path is never instant.'
    }))
}

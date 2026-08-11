import _traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import type { DataSource } from '@fe-design/kernel/ir/types.js'
import type { BranchRecord } from './branches.js'

type TraverseFn = typeof import('@babel/traverse').default
const traverse = ((_traverse as unknown as { default?: TraverseFn }).default
  ?? _traverse) as unknown as TraverseFn

/** Exact callee names. A prefix match would catch `fetchLabel()`. */
const KINDS: Record<string, DataSource['kind']> = {
  fetch: 'fetch',
  useQuery: 'query',
  useSuspenseQuery: 'query',
  useSWR: 'query',
  useMutation: 'query',
  useLoaderData: 'load',
  load: 'load'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const collectDataSources = (
  ast: any, source: string, branches: BranchRecord[]
): DataSource[] => {
  const out: DataSource[] = []
  let seq = 0

  // Every branch in the file is considered downstream of every source in it.
  // Narrower dataflow analysis would need cross-statement tracking, which the
  // IR deliberately excludes; over-linking risks missing a finding, never
  // inventing one.
  const allBranchIds = branches.map(b => b.branch.id)

  traverse(ast, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    CallExpression(path: NodePath<any>) {
      const callee = path.node.callee
      const name = callee.type === 'Identifier'
        ? callee.name
        : callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
          ? callee.property.name
          : null
      if (!name) return

      const kind = KINDS[name]
      if (!kind) return

      out.push({
        id: `d${++seq}`,
        kind,
        raw: source.slice(path.node.start ?? 0, path.node.end ?? 0),
        branches: allBranchIds
      })
    }
  })

  return out
}

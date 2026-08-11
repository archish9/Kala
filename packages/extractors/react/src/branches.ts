import _traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import type { Branch, BranchSemantic } from '@fe-design/kernel/ir/types.js'

type TraverseFn = typeof import('@babel/traverse').default
const traverse = ((_traverse as unknown as { default?: TraverseFn }).default
  ?? _traverse) as unknown as TraverseFn

export type BranchRecord = { branch: Branch; start: number; end: number }

/**
 * Patterns are anchored on identifier boundaries so `errorlessMode` does not
 * read as an error branch. Order matters: `empty` is checked before `loading`
 * because `!data?.length` contains neither, and the loading patterns are the
 * broadest.
 */
const PATTERNS: Array<{ semantic: BranchSemantic; re: RegExp }> = [
  // `!data?.length` and `!data.length` both appear in the wild, so the optional
  // chain and the plain member access are alternatives, not a prefix.
  { semantic: 'empty', re: /\b(isEmpty|length\s*===?\s*0|length\s*<\s*1)\b|!\s*\w+(\?\.|\.)length\b/ },
  { semantic: 'error', re: /\b(is)?[Ee]rror\b|\berr\b/ },
  { semantic: 'loading', re: /\b(is)?(Loading|Pending|Fetching)\b/i },
  // Deliberately narrow: a bare /\bcan\w*\b/ would classify `cancel` as a
  // permission branch, which is a false positive in almost every form.
  { semantic: 'permission', re: /\b(can[A-Z]\w*|isAllowed|hasPermission|permitted|unauthoriz(ed)?|forbidden)\b/ },
  { semantic: 'disabled', re: /\bdisabled\b/i }
]

export const inferSemantic = (condition: string): BranchSemantic | null => {
  for (const { semantic, re } of PATTERNS) {
    if (re.test(condition)) return semantic
  }
  return null
}

const LOOP_METHODS = new Set(['map', 'flatMap'])

// The AST is typed loosely on purpose. Naming @babel/types here pulls a second
// copy of its declarations into the build, and TypeScript then treats the two
// as distinct types. jsx.ts takes the same approach.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const collectBranches = (ast: any, source: string): BranchRecord[] => {
  const records: BranchRecord[] = []
  let seq = 0

  const text = (node: { start?: number | null; end?: number | null }): string =>
    source.slice(node.start ?? 0, node.end ?? 0)

  const push = (
    kind: Branch['kind'], condition: string,
    start: number | null | undefined, end: number | null | undefined
  ): void => {
    records.push({
      branch: {
        id: `b${++seq}`,
        kind,
        condition,
        semantic: inferSemantic(condition)
      },
      start: start ?? 0,
      end: end ?? 0
    })
  }

  traverse(ast, {
    IfStatement(path: NodePath<any>) {
      push('conditional', text(path.node.test), path.node.start, path.node.end)
    },
    ConditionalExpression(path: NodePath<any>) {
      push('conditional', text(path.node.test), path.node.start, path.node.end)
    },
    LogicalExpression(path: NodePath<any>) {
      if (path.node.operator !== '&&') return
      push('conditional', text(path.node.left), path.node.start, path.node.end)
    },
    CallExpression(path: NodePath<any>) {
      const callee = path.node.callee
      if (callee.type !== 'MemberExpression') return
      const prop = callee.property
      if (prop.type !== 'Identifier' || !LOOP_METHODS.has(prop.name)) return
      push('loop', text(callee.object), path.node.start, path.node.end)
    }
  })

  return records
}

/**
 * The innermost branch containing a position. Ranges nest, so the narrowest
 * match is the one the element actually renders under.
 */
export const branchIdAt = (
  records: BranchRecord[], pos: number
): string | null => {
  let best: BranchRecord | null = null
  for (const r of records) {
    if (pos < r.start || pos > r.end) continue
    if (!best || (r.end - r.start) < (best.end - best.start)) best = r
  }
  return best?.branch.id ?? null
}

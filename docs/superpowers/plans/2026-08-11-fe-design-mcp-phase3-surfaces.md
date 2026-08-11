# Frontend Design MCP — Phase 3 (Surfaces, States, Guidance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catch the two failure modes Phases 1 and 2 cannot — missing real-world states, and weak UX judgement — by giving the agent a concrete requirement list before it builds and checking the mechanical half of that list afterwards.

**Architecture:** The React extractor starts populating `Branch` and `DataSource`, which Phase 1 defined but left empty. A new `document` rule kind runs once per file with access to those, so "this fetch has no error branch" becomes a deterministic finding. Two new data packs — surfaces and guides — are served through `surface_brief` and `guide`, both grounded in the project's own lock rather than returning generic prose.

**Tech Stack:** TypeScript, Node 20+, pnpm workspaces, Vitest, `@babel/parser` + `@babel/traverse`, `@modelcontextprotocol/sdk`.

## Global Constraints

Every task's requirements implicitly include this section.

- **Phases 1 and 2 must keep passing.** `pnpm test` is 213 tests across 28 files. Never weaken an existing test to make new code fit.
- **`system_bootstrap` stays the only tool that writes.** `surface_brief` and `guide` are read-only.
- **Rules never fire on `unknown`.** Enforced in the evaluator; document predicates must honour it too, via the same three-state facts.
- **Every rule requires both a `pass` and a `fail` fixture.** A rule missing either does not load.
- **Degrade, never throw** except for the three hard errors: path escape, unwritable bootstrap target, existing lock without `force`.
- **`packs/` stays data.** Surfaces and guides are JSON; the only code in a pack is a predicate module.
- **Guidance is grounded, never generic.** `guide` and `surface_brief` must read the lock and name real values from it. Returning the same prose to every project is the impeccable failure this replaces.
- **Spec:** `docs/superpowers/specs/2026-08-11-fe-design-mcp-design.md`. Where this plan and the spec disagree, the spec wins — stop and flag it.

## Prior art in this repo (read before starting)

- `packages/kernel/src/ir/types.ts` — `Branch`, `BranchSemantic`, `DataSource`, `IRDoc.branches` are defined and currently unused
- `packages/extractors/react/src/jsx.ts` — returns `dataSources: []` and never sets `node.branch`
- `packages/kernel/src/engine/runner.ts` — `runRules(docs, rules, lock, predicates)`, the `PredicateFn` escape hatch, and the `unknown` skip contract
- `packages/kernel/src/surface/resolve.ts` — `resolveSurface(file, overrides)`, whose `overrides` argument nothing populates yet
- `packages/packs/src/index.ts` — the `findPackDir` walk-up that `SURFACES_DIR` and `GUIDES_DIR` follow
- `packages/taste/src/load.ts` — the pack loader shape to mirror (validate, degrade, never throw)

## Two halves, one plan

Tasks 1–4 are state completeness: extractor, a new rule kind, and four rules.
Tasks 5–8 are guidance: two data packs and two tools.

Each half ships working software on its own. They are kept in one plan because
the guidance half is small and both halves land in the same tool surface.

## File Structure

```
packages/extractors/react/
  src/branches.ts               JSX conditionals/loops -> Branch[] + semantic inference
  src/datasources.ts            fetch/useQuery/useSWR/await -> DataSource[]
  src/jsx.ts                    modified: populate branches, dataSources, node.branch

packages/kernel/
  src/engine/rule-types.ts      modified: add 'document' to RuleDef.kind
  src/engine/runner.ts          modified: document rule kind + DocPredicateFn

packages/packs/
  rules/states/*.json           four state-completeness rules
  rules/predicates/*.mjs        their document predicates
  rules/fixtures/*.tsx          pass/fail per rule
  surfaces/*.json               six surface requirement sets
  guides/*.json                 thirteen action playbooks
  src/index.ts                  modified: SURFACES_DIR, GUIDES_DIR

packages/server/
  src/tools/surface-brief.ts    requirements before building
  src/tools/guide.ts            action playbooks grounded in the lock
  src/index.ts                  modified: register both
```

---

### Task 1: Extract branches from JSX

**Files:**
- Create: `packages/extractors/react/src/branches.ts`
- Modify: `packages/extractors/react/src/jsx.ts` — populate `doc.branches` and `node.branch`
- Test: `packages/extractors/react/tests/branches.test.ts`

**Interfaces:**
- Consumes: `Branch`, `BranchSemantic` from `@fe-design/kernel/ir/types.js`
- Produces:
  - `inferSemantic(condition: string): BranchSemantic | null`
  - `type BranchRecord = { branch: Branch; start: number; end: number }`
  - `collectBranches(ast: ParseResult<File>, source: string): BranchRecord[]`
  - `branchIdAt(records: BranchRecord[], pos: number): string | null`

A branch is a conditional path that renders something. The `start`/`end` byte
offsets let `jsx.ts` decide which branch a given JSX element sits inside, which
is how `node.branch` gets filled without a second traversal.

- [ ] **Step 1: Write the failing test**

`packages/extractors/react/tests/branches.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractReact } from '../src/index.js'
import { inferSemantic } from '../src/branches.js'

describe('inferSemantic', () => {
  it('recognises loading conditions', () => {
    expect(inferSemantic('isLoading')).toBe('loading')
    expect(inferSemantic('isPending')).toBe('loading')
    expect(inferSemantic('query.isFetching')).toBe('loading')
  })

  it('recognises error conditions', () => {
    expect(inferSemantic('error')).toBe('error')
    expect(inferSemantic('isError')).toBe('error')
    expect(inferSemantic('err !== null')).toBe('error')
  })

  it('recognises empty conditions', () => {
    expect(inferSemantic('items.length === 0')).toBe('empty')
    expect(inferSemantic('!data?.length')).toBe('empty')
    expect(inferSemantic('isEmpty')).toBe('empty')
  })

  it('recognises disabled and permission conditions', () => {
    expect(inferSemantic('disabled')).toBe('disabled')
    expect(inferSemantic('!canEdit')).toBe('permission')
  })

  it('returns null for a condition it cannot classify', () => {
    expect(inferSemantic('ok')).toBeNull()
    expect(inferSemantic('user.name === "bob"')).toBeNull()
  })

  it('does not classify on a substring match', () => {
    expect(inferSemantic('errorlessMode')).toBeNull()
  })

  it('does not read "cancel" as a permission branch', () => {
    expect(inferSemantic('cancel')).toBeNull()
    expect(inferSemantic('isCancelled')).toBeNull()
  })

  it('recognises an optional-chained length check', () => {
    expect(inferSemantic('!data?.length')).toBe('empty')
    expect(inferSemantic('!data.length')).toBe('empty')
  })
})

describe('extractReact — branches', () => {
  it('records an early-return guard as a conditional branch', () => {
    const doc = extractReact(
      `export default function P({ isLoading }: { isLoading: boolean }) {
         if (isLoading) return <Spinner/>
         return <div>done</div>
       }`, 'p.tsx')
    const loading = doc.branches!.find(b => b.semantic === 'loading')
    expect(loading).toBeDefined()
    expect(loading!.kind).toBe('conditional')
  })

  it('records a logical-and guard', () => {
    const doc = extractReact(
      'export default ({items}: any) => <div>{items.length === 0 && <Empty/>}</div>',
      'p.tsx')
    expect(doc.branches!.some(b => b.semantic === 'empty')).toBe(true)
  })

  it('records a ternary as one conditional branch', () => {
    const doc = extractReact(
      'export default ({ok}: any) => <div>{ok ? <A/> : <B/>}</div>', 'p.tsx')
    expect(doc.branches!.filter(b => b.kind === 'conditional').length)
      .toBeGreaterThanOrEqual(1)
  })

  it('records a map call as a loop branch', () => {
    const doc = extractReact(
      'export default ({items}: any) => <ul>{items.map((i: any) => <li key={i}/>)}</ul>',
      'p.tsx')
    expect(doc.branches!.some(b => b.kind === 'loop')).toBe(true)
  })

  it('attaches the branch id to elements rendered inside it', () => {
    const doc = extractReact(
      'export default ({items}: any) => <div>{items.length === 0 && <Empty/>}</div>',
      'p.tsx')
    const empty = doc.nodes.find(n => n.name === 'Empty')!
    expect(empty.branch).not.toBeNull()
    const branch = doc.branches!.find(b => b.id === empty.branch)
    expect(branch?.semantic).toBe('empty')
  })

  it('leaves unconditional elements with a null branch', () => {
    const doc = extractReact('export default () => <div>always</div>', 'p.tsx')
    expect(doc.nodes[0]?.branch).toBeNull()
  })

  it('keeps the condition source text for the finding message', () => {
    const doc = extractReact(
      'export default ({items}: any) => <div>{items.length === 0 && <Empty/>}</div>',
      'p.tsx')
    expect(doc.branches!.some(b => b.condition.includes('items.length'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/extractors/react/tests/branches.test.ts`
Expected: FAIL — cannot find module `branches.js`

- [ ] **Step 3: Write the branch collector**

`packages/extractors/react/src/branches.ts`:

```ts
import type { ParseResult } from '@babel/parser'
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

export const collectBranches = (
  ast: ParseResult<import('@babel/types').File>, source: string
): BranchRecord[] => {
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
    IfStatement(path: NodePath<import('@babel/types').IfStatement>) {
      push('conditional', text(path.node.test), path.node.start, path.node.end)
    },
    ConditionalExpression(path: NodePath<import('@babel/types').ConditionalExpression>) {
      push('conditional', text(path.node.test), path.node.start, path.node.end)
    },
    LogicalExpression(path: NodePath<import('@babel/types').LogicalExpression>) {
      if (path.node.operator !== '&&') return
      push('conditional', text(path.node.left), path.node.start, path.node.end)
    },
    CallExpression(path: NodePath<import('@babel/types').CallExpression>) {
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
```

- [ ] **Step 4: Populate branches in the extractor**

In `packages/extractors/react/src/jsx.ts`, add the import:

```ts
import { collectBranches, branchIdAt } from './branches.js'
```

Immediately after the `parse(...)` call that produces `ast`, add:

```ts
  const branchRecords = collectBranches(ast, source)
```

In the `nodes.push(makeNode({...}))` call, replace the `text:` line's neighbours
by adding a `branch` property:

```ts
        branch: branchIdAt(branchRecords, path.node.start ?? 0),
```

And change the return statement to carry the branches:

```ts
  return {
    file,
    framework: 'react',
    nodes,
    imports: [],
    dataSources: [],
    branches: branchRecords.map(r => r.branch)
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/extractors/react/tests/branches.test.ts`
Expected: PASS — 14 tests

- [ ] **Step 6: Run the whole suite**

Run: `pnpm test`
Expected: Phases 1 and 2 still pass. `node.branch` was already typed as
`string | null`, so filling it changes no existing assertion.

- [ ] **Step 7: Commit**

```bash
git add packages/extractors/react
git commit -m "feat(extractor-react): populate IR branches with inferred semantics"
```

---

### Task 2: Extract data sources and link them to branches

**Files:**
- Create: `packages/extractors/react/src/datasources.ts`
- Modify: `packages/extractors/react/src/jsx.ts` — populate `doc.dataSources`
- Test: `packages/extractors/react/tests/datasources.test.ts`

**Interfaces:**
- Consumes: `DataSource` from `@fe-design/kernel/ir/types.js`; `BranchRecord` (Task 1)
- Produces: `collectDataSources(ast, source, branches: BranchRecord[]): DataSource[]`

A data source is anything that can fail or be slow. Linking it to the branches
in the same component is what lets a rule say "this query has no error path"
without cross-file analysis.

- [ ] **Step 1: Write the failing test**

`packages/extractors/react/tests/datasources.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractReact } from '../src/index.js'

describe('extractReact — data sources', () => {
  it('finds a bare fetch call', () => {
    const doc = extractReact(
      `export default function P() {
         const go = () => fetch('/api/x')
         return <button onClick={go}>go</button>
       }`, 'p.tsx')
    expect(doc.dataSources.map(d => d.kind)).toContain('fetch')
  })

  it('finds a react-query hook', () => {
    const doc = extractReact(
      `export default function P() {
         const { data } = useQuery(['k'], load)
         return <div>{data}</div>
       }`, 'p.tsx')
    expect(doc.dataSources.map(d => d.kind)).toContain('query')
  })

  it('finds useSWR and a SvelteKit-style load', () => {
    const swr = extractReact(
      'export default function P() { const { data } = useSWR("/k", f); return <div/> }',
      'p.tsx')
    expect(swr.dataSources.map(d => d.kind)).toContain('query')
  })

  it('keeps the call source text for the finding message', () => {
    const doc = extractReact(
      'export default function P() { const { data } = useQuery(["users"], load); return <div/> }',
      'p.tsx')
    expect(doc.dataSources[0]?.raw).toContain('useQuery')
  })

  it('links every branch in the component to the source', () => {
    const doc = extractReact(
      `export default function P() {
         const { data, isLoading, error } = useQuery(['k'], load)
         if (isLoading) return <Spinner/>
         if (error) return <Err/>
         return <div>{data}</div>
       }`, 'p.tsx')
    const ds = doc.dataSources[0]!
    const semantics = ds.branches
      .map(id => doc.branches!.find(b => b.id === id)?.semantic)
    expect(semantics).toContain('loading')
    expect(semantics).toContain('error')
  })

  it('reports no branches when the component has none', () => {
    const doc = extractReact(
      'export default function P() { const { data } = useQuery(["k"], load); return <div>{data}</div> }',
      'p.tsx')
    expect(doc.dataSources[0]?.branches).toEqual([])
  })

  it('finds nothing in a component that fetches nothing', () => {
    expect(extractReact('export default () => <div>static</div>', 'p.tsx').dataSources)
      .toEqual([])
  })

  it('does not treat a local helper named fetchLabel as a fetch', () => {
    const doc = extractReact(
      'export default function P() { const x = fetchLabel(); return <div>{x}</div> }',
      'p.tsx')
    expect(doc.dataSources).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/extractors/react/tests/datasources.test.ts`
Expected: FAIL — `dataSources` is an empty array

- [ ] **Step 3: Write the collector**

`packages/extractors/react/src/datasources.ts`:

```ts
import type { ParseResult } from '@babel/parser'
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

export const collectDataSources = (
  ast: ParseResult<import('@babel/types').File>,
  source: string,
  branches: BranchRecord[]
): DataSource[] => {
  const out: DataSource[] = []
  let seq = 0

  // Every branch in the file is considered downstream of every source in it.
  // Narrower dataflow analysis would need cross-statement tracking, which the
  // IR deliberately excludes; over-linking risks missing a finding, never
  // inventing one.
  const allBranchIds = branches.map(b => b.branch.id)

  traverse(ast, {
    CallExpression(path: NodePath<import('@babel/types').CallExpression>) {
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
```

- [ ] **Step 4: Populate data sources in the extractor**

In `packages/extractors/react/src/jsx.ts`, add the import:

```ts
import { collectDataSources } from './datasources.js'
```

and change the return statement's `dataSources` field:

```ts
    dataSources: collectDataSources(ast, source, branchRecords),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/extractors/react/tests/datasources.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 6: Run the whole suite**

Run: `pnpm test && pnpm typecheck`
Expected: everything passes.

- [ ] **Step 7: Commit**

```bash
git add packages/extractors/react
git commit -m "feat(extractor-react): populate IR data sources linked to branches"
```

---

### Task 3: A `document` rule kind

**Files:**
- Modify: `packages/kernel/src/engine/rule-types.ts` — add `'document'` to `RuleDef.kind`
- Modify: `packages/kernel/src/engine/runner.ts` — run document predicates once per doc
- Test: `packages/kernel/tests/engine/runner-document.test.ts`

**Interfaces:**
- Consumes: `IRDoc`, `RuleDef`, `Finding`, `Degraded`, `PredicateFn` (Phase 1)
- Produces:
  - `type DocPredicateCtx = { lock: unknown; surface: string }`
  - `type DocPredicateFn = (doc: IRDoc, ctx: DocPredicateCtx) => Omit<Finding, 'id'>[]`
  - `runRules(docs, rules, lock, predicates?: Record<string, PredicateFn | DocPredicateFn>)`

State completeness is a property of a whole file, not of one node: "this query
has no error branch" needs the source list and the branch list together. Node,
relation, and aggregate rules all select nodes first, so none of them can ask
that question. A document rule runs once per file with the whole `IRDoc`.

Returning an array matters — one file can have three queries each missing a
different state.

- [ ] **Step 1: Write the failing test**

`packages/kernel/tests/engine/runner-document.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { runRules } from '../../src/engine/runner.js'
import { makeNode } from '../../src/ir/types.js'
import type { IRDoc } from '../../src/ir/types.js'
import type { RuleDef } from '../../src/engine/rule-types.js'

const rule: RuleDef = {
  id: 'missing-error-state', kind: 'document', severity: 'error',
  select: {},
  predicate: 'missing-error-state',
  message: 'A data source has no error branch.',
  fixtures: { pass: 'p.tsx', fail: 'f.tsx' }
}

const doc = (opts: { sources: number; errorBranch: boolean }): IRDoc => ({
  file: 'src/app/settings/page.tsx',
  framework: 'react',
  imports: [],
  nodes: [makeNode({ id: 'n1', name: 'div' })],
  branches: opts.errorBranch
    ? [{ id: 'b1', kind: 'conditional', condition: 'error', semantic: 'error' }]
    : [],
  dataSources: Array.from({ length: opts.sources }, (_, i) => ({
    id: `d${i + 1}`, kind: 'query' as const, raw: 'useQuery()',
    branches: opts.errorBranch ? ['b1'] : []
  }))
})

const predicates = {
  'missing-error-state': (d: IRDoc) =>
    d.dataSources
      .filter(src => !src.branches.some(
        id => d.branches?.find(b => b.id === id)?.semantic === 'error'
      ))
      .map(src => ({
        rule: 'missing-error-state', sev: 'error' as const,
        file: d.file, line: 1,
        msg: `Data source ${src.id} has no error branch.`
      }))
}

describe('runRules — document kind', () => {
  it('reports one finding per unhandled source', () => {
    const r = runRules([doc({ sources: 3, errorBranch: false })], [rule], {}, predicates)
    expect(r.findings).toHaveLength(3)
    expect(r.findings.every(f => f.rule === 'missing-error-state')).toBe(true)
  })

  it('reports nothing when the state is handled', () => {
    expect(runRules([doc({ sources: 2, errorBranch: true })], [rule], {}, predicates).findings)
      .toEqual([])
  })

  it('reports nothing for a document with no data sources', () => {
    expect(runRules([doc({ sources: 0, errorBranch: false })], [rule], {}, predicates).findings)
      .toEqual([])
  })

  it('gives every finding a unique id', () => {
    const ids = runRules([doc({ sources: 3, errorBranch: false })], [rule], {}, predicates)
      .findings.map(f => f.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('runs once per document, not once per node', () => {
    const many: IRDoc = {
      ...doc({ sources: 1, errorBranch: false }),
      nodes: Array.from({ length: 20 }, (_, i) => makeNode({ id: `n${i}`, name: 'div' }))
    }
    expect(runRules([many], [rule], {}, predicates).findings).toHaveLength(1)
  })

  it('counts a missing predicate as degraded, not as a finding', () => {
    const r = runRules([doc({ sources: 1, errorBranch: false })], [rule], {}, {})
    expect(r.findings).toEqual([])
    expect(r.degraded.some(d => d.code === 'PREDICATE_NOT_FOUND')).toBe(true)
  })

  it('survives a document predicate that throws', () => {
    const boom = { 'missing-error-state': () => { throw new Error('boom') } }
    const r = runRules([doc({ sources: 1, errorBranch: false })], [rule], {}, boom as never)
    expect(r.findings).toEqual([])
    expect(r.degraded.some(d => d.code === 'PREDICATE_THREW')).toBe(true)
  })

  it('passes the resolved surface to the predicate', () => {
    let seen = ''
    const spy = { 'missing-error-state': (_d: IRDoc, ctx: { surface: string }) => {
      seen = ctx.surface
      return []
    } }
    runRules([doc({ sources: 1, errorBranch: false })], [rule], {}, spy as never)
    expect(seen).toBe('settings')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/kernel/tests/engine/runner-document.test.ts`
Expected: FAIL — `'document'` is not assignable to `RuleDef['kind']`

- [ ] **Step 3: Widen the rule kind**

In `packages/kernel/src/engine/rule-types.ts`, change the `kind` field:

```ts
  kind: 'node' | 'relation' | 'aggregate' | 'document'
```

- [ ] **Step 4: Add the document branch to the runner**

In `packages/kernel/src/engine/runner.ts`, add these types beside `PredicateFn`:

```ts
export type DocPredicateCtx = { lock: unknown; surface: string }

export type DocPredicateFn = (
  doc: IRDoc, ctx: DocPredicateCtx
) => Omit<Finding, 'id'>[]
```

Widen the `predicates` parameter:

```ts
  predicates: Record<string, PredicateFn | DocPredicateFn> = {}
```

Then, inside `for (const rule of rules) {`, immediately before the existing
`if (rule.kind === 'aggregate') {` block, insert:

```ts
      if (rule.kind === 'document') {
        if (!rule.predicate) continue
        const fn = predicates[rule.predicate] as DocPredicateFn | undefined
        if (!fn) {
          degraded.push({
            code: 'PREDICATE_NOT_FOUND',
            detail: `Predicate "${rule.predicate}" for rule "${rule.id}" is not registered.`,
            impact: '1 rule not run'
          })
          continue
        }
        try {
          const hits = fn(doc, { lock, surface: resolveSurface(doc.file) })
          for (const hit of hits) findings.push({ id: `f${++seq}`, ...hit })
        } catch (err) {
          degraded.push({
            code: 'PREDICATE_THREW',
            detail: `Rule "${rule.id}": ${(err as Error).message}`,
            impact: '1 rule not run'
          })
        }
        continue
      }
```

The existing node-level predicate call site casts its lookup, so widen it too:

```ts
          const fn = predicates[rule.predicate] as PredicateFn | undefined
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/kernel/tests/engine/`
Expected: PASS — the new 8 plus every existing engine test

- [ ] **Step 6: Commit**

```bash
git add packages/kernel
git commit -m "feat(kernel): add a document rule kind for whole-file assertions"
```

---

### Task 4: State-completeness rules

**Files:**
- Create: `packages/packs/rules/states/{missing-error-state,missing-loading-state,missing-empty-state,list-without-empty}.json`
- Create: `packages/packs/rules/predicates/{missing-error-state,missing-loading-state,missing-empty-state,list-without-empty}.mjs`
- Create: `packages/packs/rules/fixtures/states-*.tsx` — eight fixtures
- Modify: `packages/packs/tests/rules.test.ts` — load document predicates too
- Test: covered by the existing pack enforcement test

**Interfaces:**
- Consumes: `DocPredicateFn` (Task 3), populated `branches` and `dataSources` (Tasks 1–2)
- Produces: four loadable document rules

- [ ] **Step 1: Write the fixtures**

Create these under `packages/packs/rules/fixtures/`.

`states-error-pass.tsx`:
```tsx
export default function P({ q }: any) {
  const { data, error } = useQuery(['k'], q)
  if (error) return <Err/>
  return <div>{data}</div>
}
```

`states-error-fail.tsx`:
```tsx
export default function P({ q }: any) {
  const { data } = useQuery(['k'], q)
  return <div>{data}</div>
}
```

`states-loading-pass.tsx`:
```tsx
export default function P({ q }: any) {
  const { data, isLoading, error } = useQuery(['k'], q)
  if (isLoading) return <Spinner/>
  if (error) return <Err/>
  return <div>{data}</div>
}
```

`states-loading-fail.tsx`:
```tsx
export default function P({ q }: any) {
  const { data, error } = useQuery(['k'], q)
  if (error) return <Err/>
  return <div>{data}</div>
}
```

`states-empty-pass.tsx`:
```tsx
export default function P({ q }: any) {
  const { items, isLoading, error } = useQuery(['k'], q)
  if (isLoading) return <Spinner/>
  if (error) return <Err/>
  if (items.length === 0) return <Empty/>
  return <ul>{items.map((i: any) => <li key={i}/>)}</ul>
}
```

`states-empty-fail.tsx`:
```tsx
export default function P({ q }: any) {
  const { items, isLoading, error } = useQuery(['k'], q)
  if (isLoading) return <Spinner/>
  if (error) return <Err/>
  return <ul>{items.map((i: any) => <li key={i}/>)}</ul>
}
```

`states-list-pass.tsx`:
```tsx
export default function P({ items }: any) {
  if (items.length === 0) return <Empty/>
  return <ul>{items.map((i: any) => <li key={i}/>)}</ul>
}
```

`states-list-fail.tsx`:
```tsx
export default function P({ items }: any) {
  return <ul>{items.map((i: any) => <li key={i}/>)}</ul>
}
```

- [ ] **Step 2: Run the pack test to verify it fails**

Run: `pnpm vitest run packages/packs/tests/rules.test.ts`
Expected: PASS still — no new rules yet. This step confirms the baseline before
adding rules that the same test will then enforce.

- [ ] **Step 3: Write the predicates**

`packages/packs/rules/predicates/missing-error-state.mjs`:

```js
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
```

`packages/packs/rules/predicates/missing-loading-state.mjs`:

```js
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
```

`packages/packs/rules/predicates/missing-empty-state.mjs`:

```js
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
```

`packages/packs/rules/predicates/list-without-empty.mjs`:

```js
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
```

- [ ] **Step 4: Write the rule definitions**

`packages/packs/rules/states/missing-error-state.json`:

```json
{
  "id": "missing-error-state",
  "kind": "document",
  "severity": "error",
  "select": {},
  "predicate": "missing-error-state",
  "message": "A data source has no error branch.",
  "fixtures": { "pass": "../fixtures/states-error-pass.tsx", "fail": "../fixtures/states-error-fail.tsx" }
}
```

`packages/packs/rules/states/missing-loading-state.json`:

```json
{
  "id": "missing-loading-state",
  "kind": "document",
  "severity": "warn",
  "select": {},
  "predicate": "missing-loading-state",
  "message": "A data source has no loading branch.",
  "fixtures": { "pass": "../fixtures/states-loading-pass.tsx", "fail": "../fixtures/states-loading-fail.tsx" }
}
```

`packages/packs/rules/states/missing-empty-state.json`:

```json
{
  "id": "missing-empty-state",
  "kind": "document",
  "severity": "error",
  "select": {},
  "predicate": "missing-empty-state",
  "message": "This surface fetches a list and renders it, but has no empty state.",
  "fixtures": { "pass": "../fixtures/states-empty-pass.tsx", "fail": "../fixtures/states-empty-fail.tsx" }
}
```

`packages/packs/rules/states/list-without-empty.json`:

```json
{
  "id": "list-without-empty",
  "kind": "document",
  "severity": "warn",
  "select": {},
  "predicate": "list-without-empty",
  "message": "A list is rendered with no empty case.",
  "fixtures": { "pass": "../fixtures/states-list-pass.tsx", "fail": "../fixtures/states-list-fail.tsx" }
}
```

- [ ] **Step 5: Run the pack enforcement test**

Run: `pnpm vitest run packages/packs/tests/rules.test.ts`
Expected: PASS — every rule fires on its fail fixture, stays silent on its pass
fixture, and produces nothing on `all-unknown.tsx`.

If `missing-empty-state` also fires on `states-list-pass.tsx`, check that the
fixture's `if (items.length === 0)` guard is present — the predicate needs an
`empty` semantic in `doc.branches`, which Task 1's `inferSemantic` provides.

- [ ] **Step 6: Verify the rules behave on real Phase 2 output**

Run:

```bash
pnpm --filter @fe-design/server build
```

Then add a temporary check that a fetching component with no error path is
caught end to end, and remove it once seen:

```bash
node --input-type=module -e "
import { extractReact } from './packages/extractors/react/dist/src/index.js'
const doc = extractReact(\`
export default function P() {
  const { data } = useQuery(['k'], load)
  return <ul>{data.map(d => <li key={d}/>)}</ul>
}\`, 'src/app/list/page.tsx')
console.log('sources:', doc.dataSources.length)
console.log('branch semantics:', (doc.branches ?? []).map(b => b.semantic))
"
```

Expected: one source, and no `error`, `loading`, or `empty` semantic — which is
exactly what the four rules are meant to catch.

- [ ] **Step 7: Run the whole suite and commit**

Run: `pnpm test && pnpm typecheck`

```bash
git add packages/packs
git commit -m "feat(packs): add state-completeness rules over data sources and branches"
```

---

### Task 5: Surface pack — schema, loader, and six surfaces

**Files:**
- Create: `packages/taste/src/surfaces.ts` — types and loader
- Create: `packages/packs/surfaces/{landing,dashboard,settings,form,list,auth}.json`
- Modify: `packages/packs/src/index.ts` — add `SURFACES_DIR`
- Modify: `packages/packs/package.json` — add `surfaces` to `files`
- Modify: `packages/taste/src/index.ts` — export the surface API
- Test: `packages/taste/tests/surfaces.test.ts`

**Interfaces:**
- Consumes: `Degraded` from `@fe-design/kernel/engine/rule-types.js`
- Produces:
  - `type RequiredState = 'loading' | 'error' | 'empty' | 'success' | 'disabled' | 'permission'`
  - `type SurfaceDef = { id, aliases: string[], purpose: string, requiredStates: RequiredState[], requirements: string[], antiPatterns: string[], primaryAction: string | null }`
  - `loadSurfaces(dir: string): Promise<{ surfaces: SurfaceDef[]; degraded: Degraded[] }>`
  - `matchSurface(name: string, surfaces: SurfaceDef[]): SurfaceDef | null`
  - `SURFACES_DIR` from `@fe-design/packs`

`requiredStates` is the machine-checkable half — it maps directly onto the
semantics Task 1 infers. `requirements` and `antiPatterns` are the judgement
half, which the agent reads and satisfies but no rule can verify.

- [ ] **Step 1: Write the failing test**

`packages/taste/tests/surfaces.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSurfaces, matchSurface } from '../src/surfaces.js'
import { SURFACES_DIR } from '@fe-design/packs'

const load = async () => (await loadSurfaces(SURFACES_DIR)).surfaces

describe('loadSurfaces', () => {
  it('loads all six shipped surfaces without degradation', async () => {
    const { surfaces, degraded } = await loadSurfaces(SURFACES_DIR)
    expect(degraded).toEqual([])
    expect(surfaces).toHaveLength(6)
  })

  it('gives every surface a purpose and at least three requirements', async () => {
    for (const s of await load()) {
      expect(s.purpose.length, `${s.id} purpose`).toBeGreaterThan(10)
      expect(s.requirements.length, `${s.id} requirements`).toBeGreaterThanOrEqual(3)
    }
  })

  it('gives every surface at least one anti-pattern', async () => {
    for (const s of await load()) {
      expect(s.antiPatterns.length, `${s.id}`).toBeGreaterThanOrEqual(1)
    }
  })

  it('only uses state names the extractor can infer', async () => {
    const known = ['loading', 'error', 'empty', 'success', 'disabled', 'permission']
    for (const s of await load()) {
      for (const st of s.requiredStates) {
        expect(known, `${s.id} requires unknown state ${st}`).toContain(st)
      }
    }
  })

  it('rejects a surface missing required fields, keeping the rest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'surf-'))
    await writeFile(join(dir, 'bad.json'), JSON.stringify({ id: 'bad' }))
    await writeFile(join(dir, 'ok.json'), JSON.stringify({
      id: 'ok', aliases: [], purpose: 'a purpose long enough',
      requiredStates: ['error'], requirements: ['a', 'b', 'c'],
      antiPatterns: ['x'], primaryAction: null
    }))
    const { surfaces, degraded } = await loadSurfaces(dir)
    expect(surfaces.map(s => s.id)).toEqual(['ok'])
    expect(degraded.some(d => d.code === 'SURFACE_INVALID')).toBe(true)
  })

  it('survives a malformed surface file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'surf-'))
    await writeFile(join(dir, 'broken.json'), '{ not json')
    const { surfaces, degraded } = await loadSurfaces(dir)
    expect(surfaces).toEqual([])
    expect(degraded.some(d => d.code === 'SURFACE_PARSE_FAILED')).toBe(true)
  })
})

describe('matchSurface', () => {
  it('matches on the exact id', async () => {
    expect(matchSurface('settings', await load())?.id).toBe('settings')
  })

  it('matches case-insensitively', async () => {
    expect(matchSurface('Settings', await load())?.id).toBe('settings')
  })

  it('matches on an alias', async () => {
    expect(matchSurface('sign-in', await load())?.id).toBe('auth')
  })

  it('matches a route-like path by its last segment', async () => {
    expect(matchSurface('src/app/settings/page.tsx', await load())?.id).toBe('settings')
  })

  it('returns null for something it does not know', async () => {
    expect(matchSurface('wormhole', await load())).toBeNull()
  })
})
```

- [ ] **Step 2: Add `SURFACES_DIR`**

In `packages/packs/src/index.ts`, add below the existing exports:

```ts
export const SURFACES_DIR = findPackDir('surfaces')
```

In `packages/packs/package.json`, change `files` to:

```json
  "files": ["dist", "rules", "systems", "surfaces"]
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run packages/taste/tests/surfaces.test.ts`
Expected: FAIL — cannot find module `surfaces.js`

- [ ] **Step 4: Write the types and loader**

`packages/taste/src/surfaces.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { Degraded } from '@fe-design/kernel/engine/rule-types.js'

export type RequiredState =
  | 'loading' | 'error' | 'empty' | 'success' | 'disabled' | 'permission'

export const REQUIRED_STATES: RequiredState[] = [
  'loading', 'error', 'empty', 'success', 'disabled', 'permission'
]

export type SurfaceDef = {
  id: string
  aliases: string[]
  purpose: string
  requiredStates: RequiredState[]
  requirements: string[]
  antiPatterns: string[]
  primaryAction: string | null
}

const validate = (s: Partial<SurfaceDef>): string | null => {
  if (!s.id) return 'missing id'
  if (!Array.isArray(s.aliases)) return 'missing aliases'
  if (!s.purpose || s.purpose.length < 10) return 'purpose must be a real sentence'
  if (!Array.isArray(s.requiredStates)) return 'missing requiredStates'
  for (const st of s.requiredStates) {
    if (!REQUIRED_STATES.includes(st)) return `unknown required state "${st}"`
  }
  if (!Array.isArray(s.requirements) || s.requirements.length < 3) {
    return 'requirements needs at least 3 entries'
  }
  if (!Array.isArray(s.antiPatterns) || s.antiPatterns.length < 1) {
    return 'antiPatterns needs at least 1 entry'
  }
  if (s.primaryAction === undefined) return 'primaryAction must be set, or null'
  return null
}

export const loadSurfaces = async (
  dir: string
): Promise<{ surfaces: SurfaceDef[]; degraded: Degraded[] }> => {
  const surfaces: SurfaceDef[] = []
  const degraded: Degraded[] = []

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch (err) {
    degraded.push({
      code: 'SURFACES_DIR_MISSING', path: dir,
      detail: (err as Error).message, impact: 'no surfaces available'
    })
    return { surfaces, degraded }
  }

  for (const entry of entries.sort()) {
    if (!entry.endsWith('.json')) continue
    const file = join(dir, entry)

    let parsed: SurfaceDef
    try {
      parsed = JSON.parse(await readFile(file, 'utf8')) as SurfaceDef
    } catch (err) {
      degraded.push({
        code: 'SURFACE_PARSE_FAILED', path: file,
        detail: (err as Error).message, impact: '1 surface not loaded'
      })
      continue
    }

    const problem = validate(parsed)
    if (problem) {
      degraded.push({
        code: 'SURFACE_INVALID', path: file,
        detail: `Surface "${parsed.id ?? entry}": ${problem}`,
        impact: '1 surface not loaded'
      })
      continue
    }

    surfaces.push(parsed)
  }

  return { surfaces, degraded }
}

/**
 * Accepts an id, an alias, or a route-like path. Paths are reduced to their
 * most meaningful segment, so `src/app/settings/page.tsx` matches `settings`
 * rather than `page`.
 */
export const matchSurface = (
  name: string, surfaces: SurfaceDef[]
): SurfaceDef | null => {
  const raw = name.trim().toLowerCase()

  const candidates = new Set<string>([raw])
  if (raw.includes('/')) {
    const file = basename(raw).replace(/\.[jt]sx?$/, '')
    candidates.add(file)
    candidates.add(basename(dirname(raw)))
  }

  for (const candidate of candidates) {
    const hit = surfaces.find(
      s => s.id === candidate || s.aliases.some(a => a.toLowerCase() === candidate)
    )
    if (hit) return hit
  }
  return null
}
```

In `packages/taste/src/index.ts`, add:

```ts
export {
  loadSurfaces, matchSurface, REQUIRED_STATES,
  type SurfaceDef, type RequiredState
} from './surfaces.js'
```

- [ ] **Step 5: Write the six surfaces**

`packages/packs/surfaces/landing.json`:

```json
{
  "id": "landing",
  "aliases": ["marketing", "home", "index", "hero"],
  "purpose": "A visitor decides whether this product is for them, and acts.",
  "requiredStates": [],
  "requirements": [
    "State what the product does in the first viewport, in the user's words, not the company's.",
    "One primary call to action, repeated at most twice down the page.",
    "Every claim that implies proof carries the proof next to it.",
    "Anything above the fold must render without waiting on data.",
    "Reads top to bottom on a 375px viewport with no horizontal scroll."
  ],
  "antiPatterns": [
    "A carousel hero — visitors see slide one and nothing else.",
    "Competing primary buttons in the same viewport.",
    "Fake urgency: countdowns or stock counts that are not real."
  ],
  "primaryAction": "The single action the visitor should take, placed above the fold"
}
```

`packages/packs/surfaces/dashboard.json`:

```json
{
  "id": "dashboard",
  "aliases": ["analytics", "overview", "home-app", "metrics"],
  "purpose": "A returning user checks state and finds what needs attention.",
  "requiredStates": ["loading", "error", "empty"],
  "requirements": [
    "The most decision-relevant number is the largest thing on the screen.",
    "Every metric states its period and its unit.",
    "First-run shows a real empty state, not a zeroed-out chart.",
    "Data that can fail renders an error state scoped to its own panel, not the page.",
    "Nothing animates on data refresh — movement means something changed."
  ],
  "antiPatterns": [
    "A wall of equally weighted cards with no hierarchy.",
    "Sparklines with no axis, scale, or comparison.",
    "Colour as the only carrier of status."
  ],
  "primaryAction": null
}
```

`packages/packs/surfaces/settings.json`:

```json
{
  "id": "settings",
  "aliases": ["preferences", "account", "profile", "config"],
  "purpose": "A user changes something about their account and trusts that it saved.",
  "requiredStates": ["loading", "error", "success", "permission"],
  "requirements": [
    "Saving shows a pending state and then a confirmed state; silence is not confirmation.",
    "Destructive actions are separated from ordinary ones and require confirmation.",
    "Unsaved changes warn before navigation.",
    "Fields a user cannot edit explain why, rather than being silently disabled.",
    "Labels sit outside the field so they survive being filled in."
  ],
  "antiPatterns": [
    "A single Save button at the bottom of forty fields.",
    "Placeholder text used as the label.",
    "Delete sitting next to Save in the same button group."
  ],
  "primaryAction": "Save, made available only when something actually changed"
}
```

`packages/packs/surfaces/form.json`:

```json
{
  "id": "form",
  "aliases": ["create", "edit", "new", "checkout", "submit"],
  "purpose": "A user supplies information and completes a task.",
  "requiredStates": ["loading", "error", "disabled", "success"],
  "requirements": [
    "Validation happens on blur and on submit, never on every keystroke.",
    "Errors name the field and say how to fix it, not just that it is invalid.",
    "The submit button shows a pending state and cannot be double-fired.",
    "Required fields are marked before submission, not discovered after it.",
    "Field order matches the order the user thinks in, not the database schema."
  ],
  "antiPatterns": [
    "Clearing entered data when validation fails.",
    "A generic 'Something went wrong' with no recovery path.",
    "Placeholder text used as the label."
  ],
  "primaryAction": "Submit, disabled only while pending or genuinely invalid"
}
```

`packages/packs/surfaces/list.json`:

```json
{
  "id": "list",
  "aliases": ["table", "index-page", "results", "search", "inbox", "feed"],
  "purpose": "A user finds one item among many, or confirms none exists.",
  "requiredStates": ["loading", "error", "empty"],
  "requirements": [
    "The empty state distinguishes 'nothing yet' from 'nothing matched your filter'.",
    "Loading shows the shape of the result, not a centred spinner over blank space.",
    "Row actions are reachable by keyboard, not revealed on hover alone.",
    "Long values truncate with the full value still available.",
    "Sort and filter state is visible without opening a menu."
  ],
  "antiPatterns": [
    "Hover-only row actions, which do not exist on touch.",
    "An empty state that is a shrug emoji and nothing actionable.",
    "Pagination controls that hide the total count."
  ],
  "primaryAction": null
}
```

`packages/packs/surfaces/auth.json`:

```json
{
  "id": "auth",
  "aliases": ["login", "sign-in", "signin", "signup", "sign-up", "register"],
  "purpose": "A user proves who they are and gets in, or recovers when they cannot.",
  "requiredStates": ["loading", "error", "disabled"],
  "requirements": [
    "Errors never reveal whether the account exists.",
    "Password recovery is visible on the same screen as the password field.",
    "The submit button shows pending state; repeated submits do nothing.",
    "Fields carry the right autocomplete attributes so password managers work.",
    "After success, the user lands where they were going, not on a generic home."
  ],
  "antiPatterns": [
    "Rejecting a pasted password.",
    "Composition rules hidden until after a failed submit.",
    "An error that says only 'Invalid credentials' with no next step."
  ],
  "primaryAction": "Sign in, disabled only while pending"
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run packages/taste/tests/surfaces.test.ts`
Expected: PASS — 11 tests

- [ ] **Step 7: Commit**

```bash
git add packages/packs packages/taste
git commit -m "feat(packs): add surface requirement sets for six common screens"
```

---

### Task 6: The `surface_brief` tool

**Files:**
- Create: `packages/server/src/tools/surface-brief.ts`
- Modify: `packages/server/src/index.ts` — register the tool
- Test: `packages/server/tests/surface-brief.test.ts`

**Interfaces:**
- Consumes: `loadSurfaces`, `matchSurface`, `SurfaceDef` (Task 5); `deriveLock` (Phase 1); `loadSystems` (Phase 2); `SURFACES_DIR`, `SYSTEMS_DIR`
- Produces:
  - `type SurfaceBriefResult = { surface: string | null; purpose: string; requiredStates: RequiredState[]; requirements: string[]; antiPatterns: string[]; primaryAction: string | null; system: { id: string; signature: string[]; banned: string[] } | null; tokens: { space: number[]; typeSteps: number[]; components: string[] } | null; degraded: Degraded[] }`
  - `surfaceBrief(dir: string, surface: string): Promise<SurfaceBriefResult>`

The brief is the surface's requirements plus this project's own constraints.
Returning the requirements alone would be generic prose; the point is that the
agent gets the states it must handle *and* the scale it must build them from,
in one call, before it writes anything.

- [ ] **Step 1: Write the failing test**

`packages/server/tests/surface-brief.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { surfaceBrief } from '../src/tools/surface-brief.js'
import { systemBootstrap } from '../src/tools/system-bootstrap.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'brief-')) })

describe('surface_brief', () => {
  it('returns the requirements for a known surface', async () => {
    const r = await surfaceBrief(dir, 'settings')
    expect(r.surface).toBe('settings')
    expect(r.requiredStates).toContain('error')
    expect(r.requirements.length).toBeGreaterThanOrEqual(3)
    expect(r.antiPatterns.length).toBeGreaterThanOrEqual(1)
  })

  it('resolves an alias to its surface', async () => {
    expect((await surfaceBrief(dir, 'sign-in')).surface).toBe('auth')
  })

  it('resolves a route path to its surface', async () => {
    expect((await surfaceBrief(dir, 'src/app/settings/page.tsx')).surface).toBe('settings')
  })

  it('degrades rather than throwing on an unknown surface', async () => {
    const r = await surfaceBrief(dir, 'wormhole')
    expect(r.surface).toBeNull()
    expect(r.degraded.some(d => d.code === 'SURFACE_UNKNOWN')).toBe(true)
    expect(r.requirements).toEqual([])
  })

  it('lists the known surfaces when it cannot match one', async () => {
    const r = await surfaceBrief(dir, 'wormhole')
    const detail = r.degraded.find(d => d.code === 'SURFACE_UNKNOWN')!.detail
    expect(detail).toContain('settings')
  })

  it('reports no system on a project with no design system', async () => {
    const r = await surfaceBrief(dir, 'settings')
    expect(r.system).toBeNull()
    expect(r.tokens).toBeNull()
    expect(r.degraded.some(d => d.code === 'NO_DESIGN_SOURCE')).toBe(true)
  })

  it('grounds the brief in the project system once bootstrapped', async () => {
    await systemBootstrap(dir, 'settings for a banking portal', { choice: 1 })
    const r = await surfaceBrief(dir, 'settings')
    expect(r.system).not.toBeNull()
    expect(r.system!.signature.length).toBeGreaterThanOrEqual(3)
    expect(r.system!.banned.length).toBeGreaterThanOrEqual(1)
    expect(r.tokens!.space.length).toBeGreaterThan(4)
    expect(r.tokens!.typeSteps.length).toBeGreaterThan(4)
  })

  it('is read-only', async () => {
    await surfaceBrief(dir, 'settings')
    const { readdir } = await import('node:fs/promises')
    expect(await readdir(dir)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/server/tests/surface-brief.test.ts`
Expected: FAIL — cannot find module `surface-brief.js`

- [ ] **Step 3: Write the tool**

`packages/server/src/tools/surface-brief.ts`:

```ts
import { resolve } from 'node:path'
import { loadSurfaces, matchSurface, loadSystems } from '@fe-design/taste'
import type { RequiredState } from '@fe-design/taste'
import { SURFACES_DIR, SYSTEMS_DIR } from '@fe-design/packs'
import { deriveLock } from '@fe-design/kernel/lock/derive.js'
import type { Degraded } from '@fe-design/kernel/engine/rule-types.js'

export type SurfaceBriefResult = {
  surface: string | null
  purpose: string
  requiredStates: RequiredState[]
  requirements: string[]
  antiPatterns: string[]
  primaryAction: string | null
  system: { id: string; signature: string[]; banned: string[] } | null
  tokens: { space: number[]; typeSteps: number[]; components: string[] } | null
  degraded: Degraded[]
}

const EMPTY = {
  purpose: '',
  requiredStates: [] as RequiredState[],
  requirements: [] as string[],
  antiPatterns: [] as string[],
  primaryAction: null
}

export const surfaceBrief = async (
  dir: string, surface: string
): Promise<SurfaceBriefResult> => {
  const root = resolve(dir)
  const degraded: Degraded[] = []

  const { surfaces, degraded: surfaceDegraded } = await loadSurfaces(SURFACES_DIR)
  degraded.push(...surfaceDegraded)

  const match = matchSurface(surface, surfaces)
  if (!match) {
    degraded.push({
      code: 'SURFACE_UNKNOWN',
      detail: `No surface matches "${surface}". Known surfaces: ` +
        surfaces.map(s => s.id).join(', ') + '.',
      impact: 'no surface requirements returned'
    })
  }

  // Ground the brief in this project rather than returning generic prose.
  const { lock, degraded: lockDegraded } = await deriveLock(root)
  degraded.push(...lockDegraded)

  let system: SurfaceBriefResult['system'] = null
  if (lock?.intent.system) {
    const { systems } = await loadSystems(SYSTEMS_DIR)
    const found = systems.find(s => s.id === lock.intent.system)
    if (found) {
      system = {
        id: found.id,
        signature: found.signature,
        banned: [...lock.intent.banned.patterns, ...lock.intent.banned.fonts]
      }
    }
  }

  const tokens = lock
    ? {
        space: lock.derived.space,
        typeSteps: lock.derived.type.steps,
        components: Object.keys(lock.derived.components)
      }
    : null

  return {
    surface: match?.id ?? null,
    purpose: match?.purpose ?? EMPTY.purpose,
    requiredStates: match?.requiredStates ?? EMPTY.requiredStates,
    requirements: match?.requirements ?? EMPTY.requirements,
    antiPatterns: match?.antiPatterns ?? EMPTY.antiPatterns,
    primaryAction: match?.primaryAction ?? EMPTY.primaryAction,
    system,
    tokens,
    degraded
  }
}
```

- [ ] **Step 4: Register the tool**

In `packages/server/src/index.ts`, add the import:

```ts
import { surfaceBrief } from './tools/surface-brief.js'
```

and register it before the `system_bootstrap` registration:

```ts
server.tool(
  'surface_brief',
  'Get the requirements for a screen before building it: which real-world states it must handle, what it must do, what to avoid, and the project design constraints it must work within. Call this before writing a new surface. Read-only.',
  {
    dir: z.string().describe('Absolute path to the project root'),
    surface: z.string()
      .describe('Surface name, alias, or route path — e.g. "settings", "sign-in", "src/app/settings/page.tsx"')
  },
  async ({ dir, surface }) => asText(await surfaceBrief(dir, surface))
)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/server/tests/surface-brief.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 6: Commit**

```bash
git add packages/server
git commit -m "feat(server): add surface_brief, grounded in the project system"
```

---

### Task 7: Guide pack — schema, loader, and thirteen playbooks

**Files:**
- Create: `packages/taste/src/guides.ts` — types and loader
- Create: `packages/packs/guides/*.json` — thirteen playbooks
- Modify: `packages/packs/src/index.ts` — add `GUIDES_DIR`
- Modify: `packages/packs/package.json` — add `guides` to `files`
- Modify: `packages/taste/src/index.ts` — export the guide API
- Test: `packages/taste/tests/guides.test.ts`

**Interfaces:**
- Consumes: `Degraded`
- Produces:
  - `type GuideAction = 'bolder' | 'quieter' | 'distill' | 'harden' | 'animate' | 'typeset' | 'layout' | 'colorize' | 'delight' | 'clarify' | 'adapt' | 'optimize' | 'onboard'`
  - `GUIDE_ACTIONS: GuideAction[]`
  - `type GuideDef = { id: GuideAction, intent: string, moves: string[], avoid: string[], usesTokens: Array<'space'|'type'|'color'|'radius'|'motion'> }`
  - `loadGuides(dir: string): Promise<{ guides: GuideDef[]; degraded: Degraded[] }>`
  - `GUIDES_DIR` from `@fe-design/packs`

`usesTokens` is what makes grounding mechanical: `bolder` declares that it works
in `type` and `color`, so the tool knows which scales to quote back from the
lock.

- [ ] **Step 1: Write the failing test**

`packages/taste/tests/guides.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadGuides, GUIDE_ACTIONS } from '../src/guides.js'
import { GUIDES_DIR } from '@fe-design/packs'

const load = async () => (await loadGuides(GUIDES_DIR)).guides

describe('loadGuides', () => {
  it('ships one playbook per action, all valid', async () => {
    const { guides, degraded } = await loadGuides(GUIDES_DIR)
    expect(degraded).toEqual([])
    expect(guides).toHaveLength(GUIDE_ACTIONS.length)
    expect(guides.map(g => g.id).sort()).toEqual([...GUIDE_ACTIONS].sort())
  })

  it('gives every playbook at least three moves and one thing to avoid', async () => {
    for (const g of await load()) {
      expect(g.moves.length, `${g.id} moves`).toBeGreaterThanOrEqual(3)
      expect(g.avoid.length, `${g.id} avoid`).toBeGreaterThanOrEqual(1)
    }
  })

  it('declares at least one token group per playbook', async () => {
    for (const g of await load()) {
      expect(g.usesTokens.length, `${g.id}`).toBeGreaterThanOrEqual(1)
    }
  })

  it('only declares token groups the lock actually carries', async () => {
    const known = ['space', 'type', 'color', 'radius', 'motion']
    for (const g of await load()) {
      for (const t of g.usesTokens) expect(known, `${g.id}`).toContain(t)
    }
  })

  it('rejects a playbook with an unknown action id', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'guide-'))
    await writeFile(join(dir, 'nope.json'), JSON.stringify({
      id: 'sparkle', intent: 'x'.repeat(12), moves: ['a', 'b', 'c'],
      avoid: ['y'], usesTokens: ['color']
    }))
    const { guides, degraded } = await loadGuides(dir)
    expect(guides).toEqual([])
    expect(degraded.some(d => d.code === 'GUIDE_INVALID')).toBe(true)
  })

  it('survives a malformed playbook file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'guide-'))
    await writeFile(join(dir, 'broken.json'), '{ not json')
    const { degraded } = await loadGuides(dir)
    expect(degraded.some(d => d.code === 'GUIDE_PARSE_FAILED')).toBe(true)
  })
})
```

- [ ] **Step 2: Add `GUIDES_DIR`**

In `packages/packs/src/index.ts`:

```ts
export const GUIDES_DIR = findPackDir('guides')
```

In `packages/packs/package.json`, change `files` to:

```json
  "files": ["dist", "rules", "systems", "surfaces", "guides"]
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run packages/taste/tests/guides.test.ts`
Expected: FAIL — cannot find module `guides.js`

- [ ] **Step 4: Write the types and loader**

`packages/taste/src/guides.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Degraded } from '@fe-design/kernel/engine/rule-types.js'

export const GUIDE_ACTIONS = [
  'bolder', 'quieter', 'distill', 'harden', 'animate', 'typeset', 'layout',
  'colorize', 'delight', 'clarify', 'adapt', 'optimize', 'onboard'
] as const

export type GuideAction = typeof GUIDE_ACTIONS[number]

export type TokenGroup = 'space' | 'type' | 'color' | 'radius' | 'motion'

export const TOKEN_GROUPS: TokenGroup[] =
  ['space', 'type', 'color', 'radius', 'motion']

export type GuideDef = {
  id: GuideAction
  intent: string
  moves: string[]
  avoid: string[]
  usesTokens: TokenGroup[]
}

const validate = (g: Partial<GuideDef>): string | null => {
  if (!g.id) return 'missing id'
  if (!(GUIDE_ACTIONS as readonly string[]).includes(g.id)) {
    return `"${g.id}" is not a known action`
  }
  if (!g.intent || g.intent.length < 10) return 'intent must be a real sentence'
  if (!Array.isArray(g.moves) || g.moves.length < 3) {
    return 'moves needs at least 3 entries'
  }
  if (!Array.isArray(g.avoid) || g.avoid.length < 1) {
    return 'avoid needs at least 1 entry'
  }
  if (!Array.isArray(g.usesTokens) || g.usesTokens.length < 1) {
    return 'usesTokens needs at least 1 entry'
  }
  for (const t of g.usesTokens) {
    if (!TOKEN_GROUPS.includes(t)) return `unknown token group "${t}"`
  }
  return null
}

export const loadGuides = async (
  dir: string
): Promise<{ guides: GuideDef[]; degraded: Degraded[] }> => {
  const guides: GuideDef[] = []
  const degraded: Degraded[] = []

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch (err) {
    degraded.push({
      code: 'GUIDES_DIR_MISSING', path: dir,
      detail: (err as Error).message, impact: 'no guides available'
    })
    return { guides, degraded }
  }

  for (const entry of entries.sort()) {
    if (!entry.endsWith('.json')) continue
    const file = join(dir, entry)

    let parsed: GuideDef
    try {
      parsed = JSON.parse(await readFile(file, 'utf8')) as GuideDef
    } catch (err) {
      degraded.push({
        code: 'GUIDE_PARSE_FAILED', path: file,
        detail: (err as Error).message, impact: '1 guide not loaded'
      })
      continue
    }

    const problem = validate(parsed)
    if (problem) {
      degraded.push({
        code: 'GUIDE_INVALID', path: file,
        detail: `Guide "${parsed.id ?? entry}": ${problem}`,
        impact: '1 guide not loaded'
      })
      continue
    }

    guides.push(parsed)
  }

  return { guides, degraded }
}
```

In `packages/taste/src/index.ts`, add:

```ts
export {
  loadGuides, GUIDE_ACTIONS, TOKEN_GROUPS,
  type GuideDef, type GuideAction, type TokenGroup
} from './guides.js'
```

- [ ] **Step 5: Write the thirteen playbooks**

Write one file per action in `packages/packs/guides/`. Here are three complete;
write the remaining ten in exactly this shape, using the table that follows.

`packages/packs/guides/bolder.json`:

```json
{
  "id": "bolder",
  "intent": "Amplify a design that reads as safe or timid, without abandoning the system.",
  "moves": [
    "Raise the primary heading two steps on the type scale, not one — one step reads as a mistake.",
    "Increase the contrast between the largest and smallest text, rather than enlarging everything.",
    "Give the single most important element more space around it than anything else on the surface.",
    "Commit the accent colour to one element instead of spreading it across several.",
    "Let one element break the grid deliberately, and only one."
  ],
  "avoid": [
    "Adding gradients, glows, or shadows to manufacture emphasis.",
    "Making every heading bigger, which restores the flatness you started with.",
    "Introducing a second accent colour."
  ],
  "usesTokens": ["type", "color", "space"]
}
```

`packages/packs/guides/harden.json`:

```json
{
  "id": "harden",
  "intent": "Make a surface survive real data, real networks, and real people.",
  "moves": [
    "Render every state the surface can reach: loading, error, empty, and success.",
    "Test each text container with a value three times longer than the design assumes.",
    "Give every interactive control a disabled and a pending appearance.",
    "Make error messages name the field and the fix, not just the failure.",
    "Confirm destructive actions, and make the confirmation name what is being destroyed."
  ],
  "avoid": [
    "A single page-level error state that hides which part actually failed.",
    "Truncating text without leaving the full value reachable.",
    "Assuming a list is never empty and never enormous."
  ],
  "usesTokens": ["space", "type", "color"]
}
```

`packages/packs/guides/animate.json`:

```json
{
  "id": "animate",
  "intent": "Add motion that carries meaning, and only where it earns its cost.",
  "moves": [
    "Ask how often the user triggers this. High-frequency interactions get faster motion or none.",
    "Animate what changed, not the whole container.",
    "Use one duration for entering and a shorter one for leaving; exits should feel quicker.",
    "Ease out for things arriving, ease in for things leaving.",
    "Honour prefers-reduced-motion by removing motion, not by shortening it."
  ],
  "avoid": [
    "Motion on content that is simply present at mount.",
    "Bounce or elastic easing on utility actions.",
    "Staggering every child in a list, which multiplies the wait by the row count."
  ],
  "usesTokens": ["motion"]
}
```

Write the remaining ten from this table. Each needs `id`, an `intent` sentence,
at least three concrete `moves`, at least one `avoid`, and its `usesTokens`.

**This step is design authoring, not transcription.** The table fixes the intent
and the token groups; the `moves` and `avoid` lines are the actual product and
have to be written with the same specificity as the three worked examples above
— "raise the heading two steps, not one" rather than "improve hierarchy". The
loader rejects a playbook with fewer than three moves, so thin content fails the
build rather than shipping quietly, but it cannot judge whether a move is
concrete. That judgement is the work.

| id | intent, in one line | usesTokens |
|---|---|---|
| `quieter` | Calm a surface that overstimulates, by removing emphasis rather than shrinking it | `type`, `color`, `motion` |
| `distill` | Remove everything that is not carrying weight, until what remains is obvious | `space`, `type` |
| `typeset` | Fix hierarchy, measure, and rhythm in the text itself | `type`, `space` |
| `layout` | Give the surface a spatial structure a reader can predict | `space` |
| `colorize` | Introduce colour with intent into a surface that is flat or monochrome | `color` |
| `delight` | Add one memorable moment where it costs the user nothing | `motion`, `color` |
| `clarify` | Rewrite interface copy so it says what happens, in the user's words | `type` |
| `adapt` | Make the surface work at the sizes it will actually be used at | `space`, `type` |
| `optimize` | Reduce what the browser has to do before the surface is usable | `motion` |
| `onboard` | Design the first run, when there is no data and no habit yet | `space`, `type`, `color` |

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run packages/taste/tests/guides.test.ts`
Expected: PASS — 6 tests

If the count assertion fails, one action file is missing or its `id` does not
match its intended action — the loader validates ids against `GUIDE_ACTIONS`.

- [ ] **Step 7: Commit**

```bash
git add packages/packs packages/taste
git commit -m "feat(packs): add thirteen action playbooks as data"
```

---

### Task 8: The `guide` tool, server wiring, and the companion skill

**Files:**
- Create: `packages/server/src/tools/guide.ts`
- Modify: `packages/server/src/index.ts` — register `guide`
- Modify: `packages/server/tests/built-binary.test.ts` — six tools, and exercise both new tools
- Modify: `skill/SKILL.md` — teach the before-and-after loop
- Test: `packages/server/tests/guide.test.ts`

**Interfaces:**
- Consumes: `loadGuides`, `GuideDef`, `GuideAction`, `TokenGroup` (Task 7); `loadSystems` (Phase 2); `deriveLock` (Phase 1)
- Produces:
  - `type GuideResult = { action: string; intent: string; moves: string[]; avoid: string[]; system: string | null; signature: string[]; banned: string[]; available: Partial<Record<TokenGroup, unknown>>; degraded: Degraded[] }`
  - `guide(dir: string, action: string, target?: string): Promise<GuideResult>`

The playbook is generic; the response must not be. `available` quotes back the
real values from this project's lock for exactly the token groups the playbook
declares it works in, and `banned` carries the system's own anti-defaults. That
is the difference between this and returning the same prose to every project.

- [ ] **Step 1: Write the failing test**

`packages/server/tests/guide.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { guide } from '../src/tools/guide.js'
import { systemBootstrap } from '../src/tools/system-bootstrap.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'guide-')) })

describe('guide', () => {
  it('returns the playbook for a known action', async () => {
    const r = await guide(dir, 'bolder')
    expect(r.action).toBe('bolder')
    expect(r.moves.length).toBeGreaterThanOrEqual(3)
    expect(r.avoid.length).toBeGreaterThanOrEqual(1)
  })

  it('degrades rather than throwing on an unknown action', async () => {
    const r = await guide(dir, 'sparkle')
    expect(r.degraded.some(d => d.code === 'GUIDE_UNKNOWN')).toBe(true)
    expect(r.moves).toEqual([])
  })

  it('lists the known actions when it cannot match one', async () => {
    const r = await guide(dir, 'sparkle')
    expect(r.degraded.find(d => d.code === 'GUIDE_UNKNOWN')!.detail).toContain('bolder')
  })

  it('reports no system on a project without one', async () => {
    const r = await guide(dir, 'bolder')
    expect(r.system).toBeNull()
    expect(r.available).toEqual({})
  })

  it('quotes the project type scale back for a type-using action', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1 })
    const r = await guide(dir, 'bolder')
    expect(r.system).not.toBeNull()
    expect(Array.isArray(r.available.type)).toBe(true)
    expect((r.available.type as number[]).length).toBeGreaterThan(4)
  })

  it('only returns the token groups the playbook declares', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1 })
    const animate = await guide(dir, 'animate')
    expect(Object.keys(animate.available)).toEqual(['motion'])
    const layout = await guide(dir, 'layout')
    expect(Object.keys(layout.available)).toEqual(['space'])
  })

  it('carries the system signature and bans so guidance stays in-system', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1 })
    const r = await guide(dir, 'bolder')
    expect(r.signature.length).toBeGreaterThanOrEqual(3)
    expect(r.banned.length).toBeGreaterThanOrEqual(1)
  })

  it('returns different grounding for two different projects', async () => {
    const a = await mkdtemp(join(tmpdir(), 'ga-'))
    const b = await mkdtemp(join(tmpdir(), 'gb-'))
    await systemBootstrap(a, 'dense analytics dashboard', { choice: 1 })
    await systemBootstrap(b, 'playful game for kids', { choice: 1 })
    const ra = await guide(a, 'bolder')
    const rb = await guide(b, 'bolder')
    expect(ra.system).not.toBe(rb.system)
    expect(ra.signature).not.toEqual(rb.signature)
  })

  it('accepts an optional target without changing the contract', async () => {
    const r = await guide(dir, 'bolder', 'src/pages/Pricing.tsx')
    expect(r.action).toBe('bolder')
  })

  it('is read-only', async () => {
    await guide(dir, 'bolder')
    expect(await readdir(dir)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/server/tests/guide.test.ts`
Expected: FAIL — cannot find module `guide.js`

- [ ] **Step 3: Write the tool**

`packages/server/src/tools/guide.ts`:

```ts
import { resolve } from 'node:path'
import { loadGuides, loadSystems, GUIDE_ACTIONS } from '@fe-design/taste'
import type { TokenGroup } from '@fe-design/taste'
import { GUIDES_DIR, SYSTEMS_DIR } from '@fe-design/packs'
import { deriveLock } from '@fe-design/kernel/lock/derive.js'
import type { Lock } from '@fe-design/kernel/lock/types.js'
import type { Degraded } from '@fe-design/kernel/engine/rule-types.js'

export type GuideResult = {
  action: string
  intent: string
  moves: string[]
  avoid: string[]
  system: string | null
  signature: string[]
  banned: string[]
  available: Partial<Record<TokenGroup, unknown>>
  degraded: Degraded[]
}

/** Only the groups the playbook declares, so the response stays small. */
const tokensFor = (groups: TokenGroup[], lock: Lock): Partial<Record<TokenGroup, unknown>> => {
  const out: Partial<Record<TokenGroup, unknown>> = {}
  for (const g of groups) {
    if (g === 'space') out.space = lock.derived.space
    if (g === 'type') out.type = lock.derived.type.steps
    if (g === 'color') out.color = lock.derived.color
    if (g === 'radius') out.radius = lock.derived.radius
    if (g === 'motion') out.motion = lock.intent.motion
  }
  return out
}

export const guide = async (
  dir: string, action: string, target?: string
): Promise<GuideResult> => {
  const root = resolve(dir)
  const degraded: Degraded[] = []
  void target

  const { guides, degraded: guideDegraded } = await loadGuides(GUIDES_DIR)
  degraded.push(...guideDegraded)

  const match = guides.find(g => g.id === action.trim().toLowerCase())
  if (!match) {
    degraded.push({
      code: 'GUIDE_UNKNOWN',
      detail: `No playbook for "${action}". Known actions: ` +
        GUIDE_ACTIONS.join(', ') + '.',
      impact: 'no guidance returned'
    })
  }

  const { lock, degraded: lockDegraded } = await deriveLock(root)
  degraded.push(...lockDegraded)

  let system: string | null = null
  let signature: string[] = []
  let banned: string[] = []

  if (lock?.intent.system) {
    system = lock.intent.system
    banned = [...lock.intent.banned.patterns, ...lock.intent.banned.fonts]
    const { systems } = await loadSystems(SYSTEMS_DIR)
    signature = systems.find(s => s.id === lock.intent.system)?.signature ?? []
  }

  return {
    action: match?.id ?? action,
    intent: match?.intent ?? '',
    moves: match?.moves ?? [],
    avoid: match?.avoid ?? [],
    system,
    signature,
    banned,
    available: match && lock ? tokensFor(match.usesTokens, lock) : {},
    degraded
  }
}
```

- [ ] **Step 4: Register the tool**

In `packages/server/src/index.ts`, add the import:

```ts
import { guide } from './tools/guide.js'
```

and register it after `surface_brief`:

```ts
server.tool(
  'guide',
  'Get a playbook for a design action — bolder, quieter, distill, harden, animate, typeset, layout, colorize, delight, clarify, adapt, optimize, or onboard — grounded in this project design system rather than generic advice. Read-only.',
  {
    dir: z.string().describe('Absolute path to the project root'),
    action: z.enum([
      'bolder', 'quieter', 'distill', 'harden', 'animate', 'typeset', 'layout',
      'colorize', 'delight', 'clarify', 'adapt', 'optimize', 'onboard'
    ]).describe('Which design action to get a playbook for'),
    target: z.string().optional().describe('Optional file or surface the action applies to')
  },
  async ({ dir, action, target }) =>
    asText(await guide(dir, action, target))
)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/server/tests/guide.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 6: Extend the built-binary test to six tools**

In `packages/server/tests/built-binary.test.ts`, replace the tool-list
assertion — it currently expects exactly four names:

```ts
  it('completes an MCP handshake and lists all six tools', async () => {
    const out = await rpc([
      INIT, READY,
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    ])
    const listed = out.trim().split('\n').map(l => JSON.parse(l))
      .find(m => m.id === 2)
    expect(listed.result.tools.map((t: { name: string }) => t.name).sort())
      .toEqual([
        'explain', 'guide', 'surface_brief',
        'system_bootstrap', 'system_status', 'verify'
      ])
  }, 15000)
```

and add, inside the same `describe.skipIf(!existsSync(BIN))` block:

```ts
  it('returns a surface brief through the shipped binary', async () => {
    const out = await rpc([
      INIT, READY,
      JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'surface_brief', arguments: { dir: PROJECT, surface: 'settings' } }
      })
    ])
    const call = out.trim().split('\n').map(l => JSON.parse(l)).find(m => m.id === 2)
    const payload = JSON.parse(call.result.content[0].text)
    expect(payload.error).toBeUndefined()
    expect(payload.surface).toBe('settings')
    expect(payload.requiredStates).toContain('error')
  }, 15000)

  it('returns a grounded guide through the shipped binary', async () => {
    const out = await rpc([
      INIT, READY,
      JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'guide', arguments: { dir: PROJECT, action: 'bolder' } }
      })
    ])
    const call = out.trim().split('\n').map(l => JSON.parse(l)).find(m => m.id === 2)
    const payload = JSON.parse(call.result.content[0].text)
    expect(payload.error).toBeUndefined()
    expect(payload.moves.length).toBeGreaterThanOrEqual(3)
  }, 15000)
```

- [ ] **Step 7: Update the companion skill**

Replace the body of `skill/SKILL.md` below the frontmatter with:

```markdown
# Frontend design

This project has an `fe-design` MCP server holding its design system. Use it.

## Before writing any UI

Call `system_status` with the project root.

- `hasLock: false` — the project has no design system yet. Call
  `system_bootstrap` with a brief describing the product, its audience, and how
  it should feel. It returns three directions and writes nothing; show them to
  the user and let them choose, then call it again with `choice`. Never invent
  colors, fonts, or spacing yourself.
- `stale: true` — the config changed since the lock was derived. The values
  returned are already refreshed; use them as-is.
- Treat `space`, `typeSteps`, and `palette` as hard constraints.
- If `components` already lists something that does the job, use it rather than
  writing a new one.

## Before building a new screen

Call `surface_brief` with the screen name or its route path.

- `requiredStates` lists the states this kind of screen must handle. Build all
  of them, not just the happy path.
- `requirements` and `antiPatterns` are the brief. Satisfy the first, avoid the
  second.
- `system.signature` describes how this project does things. Follow it.

## When changing the character of a design

Call `guide` with one of: bolder, quieter, distill, harden, animate, typeset,
layout, colorize, delight, clarify, adapt, optimize, onboard.

The response is grounded in this project: `available` holds the real scales to
work within, and `banned` lists what this system does not do.

## After writing any UI

Call `verify` with the files you touched.

- Fix every `error`. Fix `warn` unless it conflicts with an explicit instruction
  from the user.
- `coverage.skipped` counts nodes that could not be analyzed statically — usually
  dynamic class expressions. It is information, not a failure.
- Call `explain` with a finding id when the message alone is not enough to act on.

## Rules

- Never introduce a color, size, or spacing value that is not in `system_status`.
- Do not add a value to the config purely to silence a finding without saying so.
- `verify` is read-only and cheap. Call it after every UI change.
```

- [ ] **Step 8: Run everything and commit**

Run: `pnpm test && pnpm typecheck && pnpm --filter @fe-design/server build`
Expected: all pass, including Phase 1 and 2.

```bash
git add packages/server packages/taste skill
git commit -m "feat(server): add the guide tool and wire the Phase 3 surface"
```

---

## Definition of done for Phase 3

- [ ] `pnpm test` passes, with Phase 1 and Phase 2 tests included
- [ ] `pnpm typecheck` is clean under `strict` and `exactOptionalPropertyTypes`
- [ ] `doc.branches` and `doc.dataSources` are populated for React files
- [ ] Four state rules fire on their fail fixtures and stay silent on their pass fixtures
- [ ] No rule fires on `all-unknown.tsx`
- [ ] Six surfaces and thirteen playbooks load with zero degradation
- [ ] `surface_brief` and `guide` return different grounding for two different projects
- [ ] Both new tools are read-only; `system_bootstrap` is still the only writer
- [ ] The built binary lists six tools and answers both new ones over real stdio

## Deferred to Phase 4

| Contents |
|---|
| Vue, Svelte, and HTML extractors |
| The cross-framework equivalence suite that proves one rule works across all four |
| Browser `inspect` — computed contrast, overflow at real viewports, screenshots |
| `critique` and its HTML report with looping CSS demos |

Two Phase 3 simplifications worth naming so they are not mistaken for finished
work. Branch-to-source linking is file-scoped: every branch in a file is treated
as downstream of every data source in it, because narrower dataflow analysis
would need cross-statement tracking the IR deliberately excludes. That can miss
a finding in a file with several independent queries; it cannot invent one.
And `resolveSurface`'s `overrides` argument still has no caller — wiring it to
project config remains open.

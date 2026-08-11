# Frontend Design MCP — Phase 1 (Kernel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working MCP server that verifies React+Tailwind source against a project's derived design system and reports findings without false positives.

**Architecture:** A kernel that owns the IR, the lock file, and a rule engine, plus one framework extractor. Design knowledge lives in JSON rule packs with no code dependency on the kernel. Rules are evaluated against a three-state fact model where anything unresolvable yields `unknown` and silently skips, so the engine never guesses.

**Tech Stack:** TypeScript, Node 20+, pnpm workspaces, Vitest, `@babel/parser` + `@babel/traverse`, `jiti`, `@modelcontextprotocol/sdk`, `culori`.

## Global Constraints

Every task's requirements implicitly include this section.

- **Runtime:** TypeScript on Node 20 or later. ESM only (`"type": "module"`).
- **Package manager:** pnpm workspaces.
- **Rules never fire on `unknown`.** Enforced in the expression evaluator, never in rule files. A rule author cannot opt out.
- **`packs/` is data.** Rule JSON must not import kernel internals. The only code allowed in a pack is a `predicate` escape-hatch module.
- **Every rule requires both a `pass` and a `fail` fixture.** A rule missing either does not load.
- **Degrade, never throw.** Every tool returns a valid response with a `degraded[]` array. Hard errors only for: path escape, unwritable bootstrap target, existing lock without `force`.
- **`system_bootstrap` is the only tool that writes.** Phase 1 does not implement it, so in Phase 1 the server is entirely read-only.
- **Contrast target:** WCAG 2.1 AA — 4.5:1 for text, 3.0:1 for non-text.
- **Dependency direction:** `kernel` imports nothing from `extractors` or `packs`; it receives them as inputs.
- **Spec:** `docs/superpowers/specs/2026-08-11-fe-design-mcp-design.md`. Where this plan and the spec disagree, the spec wins — stop and flag it.

## File Structure

```
pnpm-workspace.yaml
package.json                          root scripts, devDeps
tsconfig.base.json
vitest.config.ts

packages/kernel/
  src/ir/types.ts                     IRDoc, IRNode, StyleFacts, Branch, DataSource
  src/ir/fact.ts                      Fact<T> constructors + guards
  src/ir/query.ts                     node lookup helpers (ancestors, byId)
  src/engine/expr.ts                  expression evaluator + unknown propagation
  src/engine/builtins.ts              contrast, distinct, nearest, count, median, stddev
  src/engine/rule-types.ts            RuleDef, Finding, VerifyResult, Degraded
  src/engine/pack-loader.ts           loadPack() + fixture gate
  src/engine/runner.ts                runRules() — node, relation, aggregate, predicate
  src/lock/types.ts                   Lock, DerivedZone, IntentZone, SourceRef
  src/lock/derive.ts                  deriveLock()
  src/lock/staleness.ts               hashSources(), checkStale()
  src/lock/registry.ts                scanComponents()
  src/surface/resolve.ts              resolveSurface()
  tests/**                            mirrors src/

packages/extractors/react/
  src/index.ts                        extractReact()
  src/tailwind.ts                     resolveTailwindClasses()
  src/jsx.ts                          JSX walk -> IRNode[]
  tests/fixtures/**                   .tsx fixture files

packages/packs/
  rules/scale/*.json                  off-scale space, type, radius
  rules/consistency/*.json            off-palette color
  rules/craft/*.json                  flat hierarchy, monotonous spacing, nested card
  rules/a11y/*.json                   contrast, tiny text
  rules/predicates/*.mjs              escape-hatch predicates
  rules/fixtures/**                   pass/fail .tsx per rule

packages/server/
  src/context.ts                      pack cache + safeJoin
  src/tools/{system-status,verify,explain}.ts
  src/index.ts                        MCP stdio server
```

---

### Task 1: Workspace scaffold with a running test suite

**Files:**
- Create: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `vitest.config.ts`
- Create: `packages/kernel/package.json`, `packages/kernel/tsconfig.json`
- Create: `packages/kernel/src/version.ts`
- Test: `packages/kernel/tests/version.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `KERNEL_VERSION: string`; a working `pnpm test` command for all later tasks

- [ ] **Step 1: Write the failing test**

`packages/kernel/tests/version.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { KERNEL_VERSION } from '../src/version.js'

describe('kernel', () => {
  it('exposes a semver version string', () => {
    expect(KERNEL_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
```

- [ ] **Step 2: Create the workspace files**

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'packages/extractors/*'
```

Root `package.json`:

```json
{
  "name": "fe-design-mcp",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "skipLibCheck": true
  }
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/tests/**/*.test.ts'],
    environment: 'node'
  }
})
```

`packages/kernel/package.json`:

```json
{
  "name": "@fe-design/kernel",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

`packages/kernel/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "tests"] }
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm install && pnpm test`
Expected: FAIL — `Cannot find module '../src/version.js'`

- [ ] **Step 4: Write the minimal implementation**

`packages/kernel/src/version.ts`:

```ts
export const KERNEL_VERSION = '0.1.0'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS — 1 test

- [ ] **Step 6: Commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json vitest.config.ts packages/
git commit -m "chore: scaffold pnpm workspace with vitest"
```

---

### Task 2: Three-state Fact model

**Files:**
- Create: `packages/kernel/src/ir/fact.ts`
- Test: `packages/kernel/tests/ir/fact.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type Fact<T> = KnownFact<T> | AbsentFact | UnknownFact`
  - `known<T>(value: T, origin: StyleOrigin): Fact<T>`
  - `absent(): Fact<never>`
  - `unknown(reason: UnknownReason): Fact<never>`
  - `isKnown<T>(f: Fact<T>): f is KnownFact<T>`
  - `isUnknown<T>(f: Fact<T>): f is UnknownFact`
  - `type UnknownReason = 'dynamic-expression' | 'external-stylesheet' | 'unresolved-call' | 'prop-flow' | 'parse-limit'`
  - `type StyleOrigin = { kind: 'class' | 'inline' | 'stylesheet' | 'attribute'; raw: string }`

- [ ] **Step 1: Write the failing test**

`packages/kernel/tests/ir/fact.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { known, absent, unknown, isKnown, isUnknown } from '../../src/ir/fact.js'

describe('Fact', () => {
  it('known carries a value and its origin', () => {
    const f = known(16, { kind: 'class', raw: 'p-4' })
    expect(isKnown(f)).toBe(true)
    if (isKnown(f)) {
      expect(f.value).toBe(16)
      expect(f.origin.raw).toBe('p-4')
    }
  })

  it('absent is distinguishable from unknown', () => {
    expect(isKnown(absent())).toBe(false)
    expect(isUnknown(absent())).toBe(false)
    expect(isUnknown(unknown('dynamic-expression'))).toBe(true)
  })

  it('unknown records why it could not be determined', () => {
    const f = unknown('unresolved-call')
    if (isUnknown(f)) expect(f.reason).toBe('unresolved-call')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/kernel/tests/ir/fact.test.ts`
Expected: FAIL — cannot find module `fact.js`

- [ ] **Step 3: Write the minimal implementation**

`packages/kernel/src/ir/fact.ts`:

```ts
export type UnknownReason =
  | 'dynamic-expression'
  | 'external-stylesheet'
  | 'unresolved-call'
  | 'prop-flow'
  | 'parse-limit'

export type StyleOrigin = {
  kind: 'class' | 'inline' | 'stylesheet' | 'attribute'
  raw: string
}

export type KnownFact<T> = { state: 'known'; value: T; origin: StyleOrigin }
export type AbsentFact = { state: 'absent' }
export type UnknownFact = { state: 'unknown'; reason: UnknownReason }

export type Fact<T> = KnownFact<T> | AbsentFact | UnknownFact

export const known = <T>(value: T, origin: StyleOrigin): Fact<T> =>
  ({ state: 'known', value, origin })

export const absent = (): Fact<never> => ({ state: 'absent' })

export const unknown = (reason: UnknownReason): Fact<never> =>
  ({ state: 'unknown', reason })

export const isKnown = <T>(f: Fact<T>): f is KnownFact<T> => f.state === 'known'
export const isUnknown = <T>(f: Fact<T>): f is UnknownFact => f.state === 'unknown'
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/kernel/tests/ir/fact.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/ir/fact.ts packages/kernel/tests/ir/fact.test.ts
git commit -m "feat(kernel): add three-state Fact model"
```

---

### Task 3: IR types and node query helpers

**Files:**
- Create: `packages/kernel/src/ir/types.ts`
- Create: `packages/kernel/src/ir/query.ts`
- Test: `packages/kernel/tests/ir/query.test.ts`

**Interfaces:**
- Consumes: `Fact`, `absent` from Task 2
- Produces:
  - `type IRDoc`, `type IRNode`, `type StyleFacts`, `type Box`, `type Len`, `type Color`, `type Branch`, `type DataSource`
  - `emptyStyleFacts(): StyleFacts` — every slot set to `absent()`
  - `makeNode(p: Partial<IRNode> & { id: string; name: string }): IRNode`
  - `ancestors(doc: IRDoc, nodeId: string): IRNode[]` — nearest first
  - `nodeById(doc: IRDoc, id: string): IRNode | undefined`

- [ ] **Step 1: Write the failing test**

`packages/kernel/tests/ir/query.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { emptyStyleFacts, makeNode } from '../../src/ir/types.js'
import { ancestors, nodeById } from '../../src/ir/query.js'
import type { IRDoc } from '../../src/ir/types.js'

const doc: IRDoc = {
  file: 'a.tsx',
  framework: 'react',
  imports: [],
  dataSources: [],
  nodes: [
    makeNode({ id: 'n1', name: 'section', children: ['n2'] }),
    makeNode({ id: 'n2', name: 'div', parent: 'n1', children: ['n3'] }),
    makeNode({ id: 'n3', name: 'p', parent: 'n2' })
  ]
}

describe('ir/query', () => {
  it('emptyStyleFacts marks every slot absent, never missing', () => {
    const s = emptyStyleFacts()
    expect(s.space.padding.state).toBe('absent')
    expect(s.color.bg.state).toBe('absent')
    expect(s.type.size.state).toBe('absent')
  })

  it('ancestors returns nearest first', () => {
    expect(ancestors(doc, 'n3').map(n => n.id)).toEqual(['n2', 'n1'])
  })

  it('ancestors of a root node is empty', () => {
    expect(ancestors(doc, 'n1')).toEqual([])
  })

  it('nodeById finds a node', () => {
    expect(nodeById(doc, 'n2')?.name).toBe('div')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/kernel/tests/ir/query.test.ts`
Expected: FAIL — cannot find module `types.js`

- [ ] **Step 3: Write the IR types**

`packages/kernel/src/ir/types.ts`:

```ts
import { absent, type Fact } from './fact.js'

export type Len = { px: number }
export type Box = { top: number; right: number; bottom: number; left: number }
export type Color = { hex: string }
export type ShadowSpec = { raw: string }

export type StyleFacts = {
  space: { padding: Fact<Box>; margin: Fact<Box>; gap: Fact<Len> }
  type: {
    size: Fact<Len>; weight: Fact<number>; leading: Fact<Len>
    tracking: Fact<Len>; family: Fact<string>
  }
  color: { fg: Fact<Color>; bg: Fact<Color>; border: Fact<Color> }
  shape: { radius: Fact<Len>; borderWidth: Fact<Len>; shadow: Fact<ShadowSpec> }
  layout: { display: Fact<string>; direction: Fact<string>; align: Fact<string> }
  raw: string[]
}

export const emptyStyleFacts = (): StyleFacts => ({
  space: { padding: absent(), margin: absent(), gap: absent() },
  type: {
    size: absent(), weight: absent(), leading: absent(),
    tracking: absent(), family: absent()
  },
  color: { fg: absent(), bg: absent(), border: absent() },
  shape: { radius: absent(), borderWidth: absent(), shadow: absent() },
  layout: { display: absent(), direction: absent(), align: absent() },
  raw: []
})

export type BranchSemantic =
  | 'loading' | 'error' | 'empty' | 'success' | 'disabled' | 'permission'

export type Branch = {
  id: string
  kind: 'conditional' | 'loop' | 'error-boundary' | 'suspense'
  condition: string
  semantic: BranchSemantic | null
}

export type DataSource = {
  id: string
  kind: 'fetch' | 'query' | 'load'
  raw: string
  branches: string[]
}

export type ImportRec = { name: string; from: string }

export type IRNode = {
  id: string
  kind: 'element' | 'component' | 'text' | 'slot'
  name: string
  parent: string | null
  children: string[]
  style: StyleFacts
  text: string | null
  branch: string | null
  loc: { line: number; col: number }
}

export type IRDoc = {
  file: string
  framework: 'react' | 'vue' | 'svelte' | 'html'
  nodes: IRNode[]
  imports: ImportRec[]
  dataSources: DataSource[]
  branches?: Branch[]
}

export const makeNode = (
  p: Partial<IRNode> & { id: string; name: string }
): IRNode => ({
  kind: 'element',
  parent: null,
  children: [],
  style: emptyStyleFacts(),
  text: null,
  branch: null,
  loc: { line: 1, col: 0 },
  ...p
})
```

`packages/kernel/src/ir/query.ts`:

```ts
import type { IRDoc, IRNode } from './types.js'

export const nodeById = (doc: IRDoc, id: string): IRNode | undefined =>
  doc.nodes.find(n => n.id === id)

export const ancestors = (doc: IRDoc, nodeId: string): IRNode[] => {
  const out: IRNode[] = []
  let cur = nodeById(doc, nodeId)
  while (cur?.parent) {
    const parent = nodeById(doc, cur.parent)
    if (!parent) break
    out.push(parent)
    cur = parent
  }
  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/kernel/tests/ir/query.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/ir packages/kernel/tests/ir
git commit -m "feat(kernel): add IR types and node query helpers"
```

---

### Task 4: Expression evaluator with the unknown contract

The most important task in the plan. If `unknown` leaks through as a value, every rule
becomes capable of false positives.

**Files:**
- Create: `packages/kernel/src/engine/builtins.ts`
- Create: `packages/kernel/src/engine/expr.ts`
- Test: `packages/kernel/tests/engine/expr.test.ts`

**Interfaces:**
- Consumes: `Fact`, `isKnown`, `isUnknown` from Task 2
- Produces:
  - `type EvalResult = { state: 'value'; value: unknown } | { state: 'unknown' }`
  - `type EvalContext = { self?: unknown; other?: unknown; collected?: unknown[]; lock?: unknown; surface?: unknown }`
  - `type Expr`
  - `evaluate(expr: Expr, ctx: EvalContext): EvalResult`
  - from builtins: `contrastRatio(a: string, b: string): number`, `distinct(xs: unknown[]): number`, `nearest(list: number[], v: number): number`, `count`, `median`, `stddev`

- [ ] **Step 1: Write the failing test**

`packages/kernel/tests/engine/expr.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluate } from '../../src/engine/expr.js'
import { known, absent, unknown } from '../../src/ir/fact.js'

const origin = { kind: 'class' as const, raw: 'p-4' }

describe('evaluate — unknown contract', () => {
  it('returns unknown when any operand is an unknown Fact', () => {
    const ctx = { self: { style: { space: { padding: unknown('dynamic-expression') } } } }
    expect(evaluate({ gte: ['self.style.space.padding', 4] }, ctx).state).toBe('unknown')
  })

  it('propagates unknown through and/or, never short-circuiting past it', () => {
    const ctx = { self: { a: known(1, origin), b: unknown('prop-flow') } }
    expect(evaluate({ and: [{ gte: ['self.a', 0] }, { gte: ['self.b', 0] }] }, ctx).state)
      .toBe('unknown')
    expect(evaluate({ or: [{ gte: ['self.a', 0] }, { gte: ['self.b', 0] }] }, ctx).state)
      .toBe('unknown')
  })

  it('treats absent as a real value, not as unknown', () => {
    const ctx = { self: { a: absent() } }
    expect(evaluate({ eq: ['self.a', null] }, ctx)).toEqual({ state: 'value', value: true })
  })

  it('resolves a path that reaches through an absent fact to undefined', () => {
    const ctx = { self: { style: { type: { size: absent() } } } }
    expect(evaluate({ in: ['self.style.type.size.px', [12, 16]] }, ctx))
      .toEqual({ state: 'value', value: false })
  })
})

describe('evaluate — operators', () => {
  it('gte compares numbers', () => {
    const ctx = { self: { a: known(16, origin) } }
    expect(evaluate({ gte: ['self.a', 12] }, ctx)).toEqual({ state: 'value', value: true })
    expect(evaluate({ gte: ['self.a', 20] }, ctx)).toEqual({ state: 'value', value: false })
  })

  it('in checks membership against a list', () => {
    const ctx = { self: { a: known(16, origin) }, lock: { space: [4, 8, 16] } }
    expect(evaluate({ in: ['self.a', '$lock.space'] }, ctx))
      .toEqual({ state: 'value', value: true })
  })

  it('allIn requires every member of a Box to be in the list', () => {
    const box = { top: 16, right: 16, bottom: 13, left: 16 }
    const ctx = { self: { p: known(box, origin) }, lock: { space: [4, 8, 16] } }
    expect(evaluate({ allIn: ['self.p', '$lock.space'] }, ctx))
      .toEqual({ state: 'value', value: false })
  })
})

describe('evaluate — builtins', () => {
  it('contrast computes a WCAG ratio', () => {
    const ctx = {
      self: { fg: known({ hex: '#000000' }, origin) },
      other: { bg: known({ hex: '#ffffff' }, origin) }
    }
    expect(evaluate({ gte: ['contrast(self.fg, other.bg)', 20] }, ctx))
      .toEqual({ state: 'value', value: true })
  })

  it('distinct counts unique collected values', () => {
    expect(evaluate({ gte: ['distinct(collected)', 3] }, { collected: [12, 12, 16, 20] }))
      .toEqual({ state: 'value', value: true })
  })

  it('a builtin over an unknown operand yields unknown', () => {
    const ctx = {
      self: { fg: unknown('external-stylesheet') },
      other: { bg: known({ hex: '#fff' }, origin) }
    }
    expect(evaluate({ gte: ['contrast(self.fg, other.bg)', 4.5] }, ctx).state)
      .toBe('unknown')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/kernel/tests/engine/expr.test.ts`
Expected: FAIL — cannot find module `expr.js`

- [ ] **Step 3: Add the color dependency**

Run: `pnpm --filter @fe-design/kernel add culori`

- [ ] **Step 4: Write the builtins**

`packages/kernel/src/engine/builtins.ts`:

```ts
import { parse, wcagContrast } from 'culori'

export const contrastRatio = (a: string, b: string): number => {
  const ca = parse(a), cb = parse(b)
  if (!ca || !cb) return NaN
  return wcagContrast(ca, cb)
}

export const distinct = (xs: unknown[]): number =>
  new Set(xs.map(x => JSON.stringify(x))).size

export const count = (xs: unknown[]): number => xs.length

export const nearest = (list: number[], v: number): number =>
  list.reduce((best, x) => Math.abs(x - v) < Math.abs(best - v) ? x : best, list[0] ?? v)

export const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2
}

export const stddev = (xs: number[]): number => {
  if (xs.length === 0) return 0
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length)
}
```

- [ ] **Step 5: Write the evaluator**

`packages/kernel/src/engine/expr.ts`:

```ts
import { isKnown, isUnknown, type Fact } from '../ir/fact.js'
import * as B from './builtins.js'

export type EvalResult = { state: 'value'; value: unknown } | { state: 'unknown' }

export type EvalContext = {
  self?: unknown
  other?: unknown
  collected?: unknown[]
  lock?: unknown
  surface?: unknown
}

export type Expr =
  | string | number | boolean | null
  | { gte: [Expr, Expr] } | { lte: [Expr, Expr] } | { eq: [Expr, Expr] }
  | { in: [Expr, Expr] } | { allIn: [Expr, Expr] } | { anyIn: [Expr, Expr] }
  | { not: Expr } | { and: Expr[] } | { or: Expr[] }

const UNKNOWN: EvalResult = { state: 'unknown' }
const val = (value: unknown): EvalResult => ({ state: 'value', value })

const isFact = (x: unknown): x is Fact<unknown> =>
  typeof x === 'object' && x !== null && 'state' in x

/** known -> value, absent -> null, unknown -> UNKNOWN. */
const unwrap = (x: unknown): EvalResult => {
  if (!isFact(x)) return val(x)
  if (isUnknown(x)) return UNKNOWN
  if (isKnown(x)) return val(x.value)
  return val(null)
}

const BUILTIN_RE = /^(\w+)\((.*)\)$/

const resolvePath = (path: string, ctx: EvalContext): EvalResult => {
  if (path === 'collected') return val(ctx.collected)

  const root = path.startsWith('$lock.') ? ctx.lock
    : path.startsWith('$surface.') ? ctx.surface
    : path.startsWith('self.') ? ctx.self
    : path.startsWith('other.') ? ctx.other
    : undefined
  if (root === undefined) return val(undefined)

  const rest = path.replace(/^(\$lock|\$surface|self|other)\./, '')

  let cur: unknown = root
  for (const seg of rest.split('.')) {
    if (cur === null || cur === undefined) return val(undefined)
    if (isFact(cur)) {
      const u = unwrap(cur)
      if (u.state === 'unknown') return UNKNOWN
      cur = u.value
      // An `absent` Fact unwraps to null. Indexing into it would throw, so a
      // path that reaches through an unset fact resolves to undefined instead.
      if (cur === null || cur === undefined) return val(undefined)
    }
    cur = (cur as Record<string, unknown>)[seg]
  }
  return unwrap(cur)
}

const callBuiltin = (name: string, args: EvalResult[]): EvalResult => {
  if (args.some(a => a.state === 'unknown')) return UNKNOWN
  const v = args.map(a => (a as { value: unknown }).value)
  switch (name) {
    case 'contrast': {
      const a = v[0] as { hex: string } | string | undefined
      const b = v[1] as { hex: string } | string | undefined
      const ax = typeof a === 'string' ? a : a?.hex
      const bx = typeof b === 'string' ? b : b?.hex
      if (!ax || !bx) return UNKNOWN
      return val(B.contrastRatio(ax, bx))
    }
    case 'distinct': return val(B.distinct(v[0] as unknown[]))
    case 'count':    return val(B.count(v[0] as unknown[]))
    case 'nearest':  return val(B.nearest(v[0] as number[], v[1] as number))
    case 'median':   return val(B.median(v[0] as number[]))
    case 'stddev':   return val(B.stddev(v[0] as number[]))
    default:         return UNKNOWN
  }
}

const toList = (v: unknown): unknown[] => {
  if (Array.isArray(v)) return v
  if (v && typeof v === 'object') return Object.values(v as Record<string, unknown>)
  return [v]
}

export const evaluate = (expr: Expr, ctx: EvalContext): EvalResult => {
  if (typeof expr === 'number' || typeof expr === 'boolean' || expr === null) {
    return val(expr)
  }

  if (typeof expr === 'string') {
    const m = BUILTIN_RE.exec(expr)
    if (m) {
      const name = m[1] as string
      const argSrc = (m[2] ?? '').trim()
      const args = argSrc === ''
        ? []
        : argSrc.split(',').map(a => evaluate(a.trim() as Expr, ctx))
      return callBuiltin(name, args)
    }
    if (/^(self|other|collected|\$lock|\$surface)\b/.test(expr)) {
      return resolvePath(expr, ctx)
    }
    return val(expr)
  }

  for (const k of ['gte', 'lte', 'eq', 'in', 'allIn', 'anyIn'] as const) {
    if (!(k in expr)) continue
    const [l, r] = (expr as Record<string, [Expr, Expr]>)[k] as [Expr, Expr]
    const a = evaluate(l, ctx), b = evaluate(r, ctx)
    if (a.state === 'unknown' || b.state === 'unknown') return UNKNOWN
    const av = a.value, bv = b.value
    if (k === 'gte') return val((av as number) >= (bv as number))
    if (k === 'lte') return val((av as number) <= (bv as number))
    if (k === 'eq')  return val(JSON.stringify(av) === JSON.stringify(bv))
    if (k === 'in')  return val(toList(bv).includes(av))
    if (k === 'allIn') {
      const list = toList(bv)
      return val(toList(av).every(x => list.includes(x)))
    }
    if (k === 'anyIn') {
      const list = toList(bv)
      return val(toList(av).some(x => list.includes(x)))
    }
  }

  if ('not' in expr) {
    const r = evaluate(expr.not, ctx)
    return r.state === 'unknown' ? UNKNOWN : val(!r.value)
  }

  // and/or evaluate every branch: an unknown anywhere makes the whole
  // expression unknown, so short-circuiting would hide it.
  if ('and' in expr) {
    const rs = expr.and.map(e => evaluate(e, ctx))
    if (rs.some(r => r.state === 'unknown')) return UNKNOWN
    return val(rs.every(r => (r as { value: unknown }).value))
  }
  if ('or' in expr) {
    const rs = expr.or.map(e => evaluate(e, ctx))
    if (rs.some(r => r.state === 'unknown')) return UNKNOWN
    return val(rs.some(r => (r as { value: unknown }).value))
  }

  return UNKNOWN
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run packages/kernel/tests/engine/expr.test.ts`
Expected: PASS — 9 tests

- [ ] **Step 7: Commit**

```bash
git add packages/kernel/src/engine packages/kernel/tests/engine
git commit -m "feat(kernel): add expression evaluator with unknown propagation"
```

---

### Task 5: Rule pack loader with the fixture gate

**Files:**
- Create: `packages/kernel/src/engine/rule-types.ts`
- Create: `packages/kernel/src/engine/pack-loader.ts`
- Test: `packages/kernel/tests/engine/pack-loader.test.ts`

**Interfaces:**
- Consumes: `Expr` from Task 4
- Produces:
  - `type RuleDef = { id, kind, severity, select, against?, assert?, predicate?, collect?, scope?, minSample?, message, fix?, fixtures: { pass, fail }, source?, modified? }`
  - `type Selector = { hasFact?: string; name?: string; kind?: string }`
  - `type Finding = { id, rule, sev, file, line, msg, fix?, surface? }`
  - `type Degraded = { code: string; path?: string; detail: string; impact: string }`
  - `type Coverage = { analyzed: number; skipped: number; reason?: string }`
  - `type VerifyResult = { findings: Finding[]; coverage: Coverage; degraded: Degraded[] }`
  - `loadPack(dir: string): Promise<{ rules: RuleDef[]; degraded: Degraded[] }>`

- [ ] **Step 1: Write the failing test**

`packages/kernel/tests/engine/pack-loader.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadPack } from '../../src/engine/pack-loader.js'

let dir: string

const RULE_OK = {
  id: 'space-off-scale', kind: 'node', severity: 'error',
  select: { hasFact: 'style.space.padding' },
  assert: { allIn: ['self.style.space.padding', '$lock.derived.space'] },
  message: 'Padding {value} is not on the spacing scale.',
  fixtures: { pass: 'fixtures/space-pass.tsx', fail: 'fixtures/space-fail.tsx' }
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pack-'))
  await mkdir(join(dir, 'fixtures'), { recursive: true })
  await writeFile(join(dir, 'fixtures/space-pass.tsx'), 'export default () => <div/>')
  await writeFile(join(dir, 'fixtures/space-fail.tsx'), 'export default () => <div/>')
  await writeFile(join(dir, 'ok.json'), JSON.stringify(RULE_OK))
  await writeFile(join(dir, 'no-fixtures.json'), JSON.stringify({
    ...RULE_OK, id: 'no-fixtures', fixtures: { pass: 'fixtures/space-pass.tsx' }
  }))
  await writeFile(join(dir, 'missing-file.json'), JSON.stringify({
    ...RULE_OK, id: 'missing-file',
    fixtures: { pass: 'fixtures/nope.tsx', fail: 'fixtures/space-fail.tsx' }
  }))
  await writeFile(join(dir, 'broken.json'), '{ not json')
})

describe('loadPack', () => {
  it('loads a rule that has both fixtures', async () => {
    const { rules } = await loadPack(dir)
    expect(rules.map(r => r.id)).toContain('space-off-scale')
  })

  it('rejects a rule missing the fail fixture', async () => {
    const { rules, degraded } = await loadPack(dir)
    expect(rules.map(r => r.id)).not.toContain('no-fixtures')
    expect(degraded.some(d => d.code === 'RULE_MISSING_FIXTURE')).toBe(true)
  })

  it('rejects a rule whose fixture file does not exist', async () => {
    const { rules, degraded } = await loadPack(dir)
    expect(rules.map(r => r.id)).not.toContain('missing-file')
    expect(degraded.some(d => d.code === 'RULE_FIXTURE_NOT_FOUND')).toBe(true)
  })

  it('survives a malformed rule file and still loads the good ones', async () => {
    const { rules, degraded } = await loadPack(dir)
    expect(rules.length).toBe(1)
    expect(degraded.some(d => d.code === 'RULE_PARSE_FAILED')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/kernel/tests/engine/pack-loader.test.ts`
Expected: FAIL — cannot find module `pack-loader.js`

- [ ] **Step 3: Write the rule types**

`packages/kernel/src/engine/rule-types.ts`:

```ts
import type { Expr } from './expr.js'

export type Severity = 'error' | 'warn' | 'info'

export type Selector = {
  hasFact?: string
  name?: string
  kind?: 'element' | 'component' | 'text' | 'slot'
}

export type AgainstSelector = { nearestAncestor: Selector }

export type RuleDef = {
  id: string
  kind: 'node' | 'relation' | 'aggregate'
  severity: Severity
  select: Selector
  against?: AgainstSelector
  assert?: Expr
  predicate?: string
  collect?: string
  scope?: 'file' | 'surface'
  minSample?: number
  message: string
  fix?: string
  fixtures: { pass: string; fail: string }
  source?: string
  modified?: boolean
}

export type Finding = {
  id: string
  rule: string
  sev: Severity
  file: string
  line: number
  msg: string
  fix?: string
  surface?: string
}

export type Degraded = {
  code: string
  path?: string
  detail: string
  impact: string
}

export type Coverage = { analyzed: number; skipped: number; reason?: string }

export type VerifyResult = {
  findings: Finding[]
  coverage: Coverage
  degraded: Degraded[]
}
```

- [ ] **Step 4: Write the loader**

`packages/kernel/src/engine/pack-loader.ts`:

```ts
import { readdir, readFile, access } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import type { RuleDef, Degraded } from './rule-types.js'

const exists = async (p: string): Promise<boolean> => {
  try { await access(p); return true } catch { return false }
}

export const loadPack = async (
  dir: string
): Promise<{ rules: RuleDef[]; degraded: Degraded[] }> => {
  const rules: RuleDef[] = []
  const degraded: Degraded[] = []

  const walk = async (d: string): Promise<string[]> => {
    const entries = await readdir(d, { withFileTypes: true })
    const out: string[] = []
    for (const e of entries) {
      const p = join(d, e.name)
      if (e.isDirectory()) out.push(...await walk(p))
      else if (e.name.endsWith('.json')) out.push(p)
    }
    return out
  }

  for (const file of await walk(dir)) {
    let parsed: RuleDef
    try {
      parsed = JSON.parse(await readFile(file, 'utf8')) as RuleDef
    } catch (err) {
      degraded.push({
        code: 'RULE_PARSE_FAILED', path: file,
        detail: (err as Error).message, impact: '1 rule not loaded'
      })
      continue
    }

    const fx = parsed.fixtures
    if (!fx?.pass || !fx?.fail) {
      degraded.push({
        code: 'RULE_MISSING_FIXTURE', path: file,
        detail: `Rule "${parsed.id}" needs both a pass and a fail fixture.`,
        impact: '1 rule not loaded'
      })
      continue
    }

    const base = dirname(file)
    const missing: string[] = []
    for (const rel of [fx.pass, fx.fail]) {
      if (!await exists(resolve(base, rel))) missing.push(rel)
    }
    if (missing.length > 0) {
      degraded.push({
        code: 'RULE_FIXTURE_NOT_FOUND', path: file,
        detail: `Fixture file(s) not found: ${missing.join(', ')}`,
        impact: '1 rule not loaded'
      })
      continue
    }

    rules.push(parsed)
  }

  return { rules, degraded }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/kernel/tests/engine/pack-loader.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 6: Commit**

```bash
git add packages/kernel/src/engine/rule-types.ts packages/kernel/src/engine/pack-loader.ts packages/kernel/tests/engine/pack-loader.test.ts
git commit -m "feat(kernel): add rule pack loader with fixture gate"
```

---

### Task 6: Rule runner — node, relation, aggregate, and predicate kinds

**Files:**
- Create: `packages/kernel/src/surface/resolve.ts`
- Create: `packages/kernel/src/engine/runner.ts`
- Test: `packages/kernel/tests/engine/runner.test.ts`
- Test: `packages/kernel/tests/surface/resolve.test.ts`

**Interfaces:**
- Consumes: `evaluate` (Task 4), rule types (Task 5), `IRDoc`/`ancestors` (Task 3)
- Produces:
  - `resolveSurface(file: string, overrides?: Record<string, string>): string`
  - `type PredicateCtx = { doc: IRDoc; lock: unknown; fact: (path: string) => Fact<unknown> | undefined }`
  - `type PredicateFn = (node: IRNode, ctx: PredicateCtx) => Omit<Finding, 'id'> | null`
  - `getFactPath(node: IRNode, path: string): Fact<unknown> | undefined`
  - `selectNodes(doc: IRDoc, sel: Selector): IRNode[]`
  - `runRules(docs: IRDoc[], rules: RuleDef[], lock: unknown, predicates?: Record<string, PredicateFn>): VerifyResult`

- [ ] **Step 1: Write the surface resolver test**

`packages/kernel/tests/surface/resolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveSurface } from '../../src/surface/resolve.js'

describe('resolveSurface', () => {
  it('derives a surface id from an app-router page path', () => {
    expect(resolveSurface('src/app/settings/page.tsx')).toBe('settings')
  })

  it('derives a surface id from a pages-router path', () => {
    expect(resolveSurface('pages/dashboard.tsx')).toBe('dashboard')
  })

  it('derives a surface id from a SvelteKit route', () => {
    expect(resolveSurface('src/routes/billing/+page.svelte')).toBe('billing')
  })

  it('honours an explicit override', () => {
    expect(resolveSurface('src/x/Weird.tsx', { 'src/x/Weird.tsx': 'checkout' }))
      .toBe('checkout')
  })

  it('falls back to the file path when no route pattern matches', () => {
    expect(resolveSurface('src/components/Card.tsx')).toBe('src/components/Card.tsx')
  })
})
```

- [ ] **Step 2: Write the runner test**

`packages/kernel/tests/engine/runner.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { runRules } from '../../src/engine/runner.js'
import { makeNode, emptyStyleFacts } from '../../src/ir/types.js'
import { known, unknown } from '../../src/ir/fact.js'
import type { IRDoc } from '../../src/ir/types.js'
import type { RuleDef } from '../../src/engine/rule-types.js'

const origin = { kind: 'class' as const, raw: 'p-[13px]' }
const lock = { derived: { space: [0, 4, 8, 12, 16, 24] } }
const base = emptyStyleFacts()

const spaceRule: RuleDef = {
  id: 'space-off-scale', kind: 'node', severity: 'error',
  select: { hasFact: 'style.space.padding' },
  assert: { allIn: ['self.style.space.padding', '$lock.derived.space'] },
  message: 'Padding is not on the spacing scale.',
  fixtures: { pass: 'p.tsx', fail: 'f.tsx' }
}

const contrastRule: RuleDef = {
  id: 'text-contrast', kind: 'relation', severity: 'error',
  select: { hasFact: 'style.color.fg' },
  against: { nearestAncestor: { hasFact: 'style.color.bg' } },
  assert: { gte: ['contrast(self.style.color.fg, other.style.color.bg)', 4.5] },
  message: 'Contrast is below 4.5:1.',
  fixtures: { pass: 'p.tsx', fail: 'f.tsx' }
}

const flatRule: RuleDef = {
  id: 'flat-type-hierarchy', kind: 'aggregate', scope: 'file', severity: 'warn',
  select: { hasFact: 'style.type.size' },
  collect: 'style.type.size',
  assert: { gte: ['distinct(collected)', 3] },
  minSample: 4,
  message: 'Only {distinct} distinct text sizes. Hierarchy is flat.',
  fixtures: { pass: 'p.tsx', fail: 'f.tsx' }
}

const padDoc = (padding: ReturnType<typeof known<any>>): IRDoc => ({
  file: 'a.tsx', framework: 'react', imports: [], dataSources: [],
  nodes: [makeNode({
    id: 'n1', name: 'div',
    style: { ...base, space: { ...base.space, padding } }
  })]
})

describe('runRules — node kind', () => {
  it('reports a finding when the assertion is false', () => {
    const doc = padDoc(known({ top: 13, right: 13, bottom: 13, left: 13 }, origin))
    const r = runRules([doc], [spaceRule], lock)
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0]?.rule).toBe('space-off-scale')
  })

  it('reports nothing when the assertion is true', () => {
    const doc = padDoc(known({ top: 16, right: 16, bottom: 16, left: 16 }, origin))
    expect(runRules([doc], [spaceRule], lock).findings).toHaveLength(0)
  })

  it('skips silently and counts coverage when the fact is unknown', () => {
    const doc = padDoc(unknown('dynamic-expression') as any)
    const r = runRules([doc], [spaceRule], lock)
    expect(r.findings).toHaveLength(0)
    expect(r.coverage.skipped).toBe(1)
  })

  it('does not select nodes whose fact is absent', () => {
    const doc: IRDoc = {
      file: 'a.tsx', framework: 'react', imports: [], dataSources: [],
      nodes: [makeNode({ id: 'n1', name: 'div' })]
    }
    const r = runRules([doc], [spaceRule], lock)
    expect(r.findings).toHaveLength(0)
    expect(r.coverage.skipped).toBe(0)
  })
})

describe('runRules — relation kind', () => {
  const relDoc = (fg: string, bgFact: unknown): IRDoc => ({
    file: 'a.tsx', framework: 'react', imports: [], dataSources: [],
    nodes: [
      makeNode({
        id: 'p1', name: 'section', children: ['c1'],
        style: { ...base, color: { ...base.color, bg: bgFact as any } }
      }),
      makeNode({
        id: 'c1', name: 'p', parent: 'p1',
        style: { ...base, color: { ...base.color, fg: known({ hex: fg }, origin) } }
      })
    ]
  })

  it('flags low contrast against the nearest ancestor background', () => {
    const r = runRules([relDoc('#9ca3af', known({ hex: '#ffffff' }, origin))], [contrastRule], lock)
    expect(r.findings).toHaveLength(1)
  })

  it('passes high contrast', () => {
    const r = runRules([relDoc('#111827', known({ hex: '#ffffff' }, origin))], [contrastRule], lock)
    expect(r.findings).toHaveLength(0)
  })

  it('skips when the ancestor background is unknown', () => {
    const r = runRules([relDoc('#9ca3af', unknown('external-stylesheet'))], [contrastRule], lock)
    expect(r.findings).toHaveLength(0)
    expect(r.coverage.skipped).toBe(1)
  })
})

describe('runRules — aggregate kind', () => {
  const sizedDoc = (sizes: (number | 'u')[]): IRDoc => ({
    file: 'src/app/settings/page.tsx', framework: 'react',
    imports: [], dataSources: [],
    nodes: sizes.map((s, i) => makeNode({
      id: `n${i}`, name: 'p',
      style: {
        ...base,
        type: {
          ...base.type,
          size: s === 'u' ? unknown('dynamic-expression') as any : known({ px: s }, origin)
        }
      }
    }))
  })

  it('flags a flat hierarchy', () => {
    const r = runRules([sizedDoc([16, 16, 16, 16, 16])], [flatRule], lock)
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0]?.msg).toContain('Only 1 distinct')
  })

  it('passes a varied hierarchy', () => {
    expect(runRules([sizedDoc([12, 16, 24, 40])], [flatRule], lock).findings).toHaveLength(0)
  })

  it('does not fire below minSample', () => {
    expect(runRules([sizedDoc([16, 16])], [flatRule], lock).findings).toHaveLength(0)
  })

  it('excludes unknown values and counts them skipped', () => {
    const r = runRules([sizedDoc([12, 16, 24, 40, 'u'])], [flatRule], lock)
    expect(r.findings).toHaveLength(0)
    expect(r.coverage.skipped).toBe(1)
  })

  it('emits one finding per document, not per node', () => {
    const r = runRules([sizedDoc([16, 16, 16, 16]), sizedDoc([14, 14, 14, 14])], [flatRule], lock)
    expect(r.findings).toHaveLength(2)
  })

  it('attaches a surface id when scope is surface', () => {
    const surfaceRule = { ...flatRule, scope: 'surface' as const }
    const r = runRules([sizedDoc([16, 16, 16, 16])], [surfaceRule], lock)
    expect(r.findings[0]?.surface).toBe('settings')
  })
})

describe('runRules — predicate rules', () => {
  const cardRule: RuleDef = {
    id: 'nested-card', kind: 'node', severity: 'warn',
    select: { hasFact: 'style.shape.radius' },
    predicate: 'nested-card',
    message: 'Card nested inside a card.',
    fixtures: { pass: 'p.tsx', fail: 'f.tsx' }
  }

  const card = (id: string, parent: string | null, children: string[] = []) =>
    makeNode({
      id, name: 'div', parent, children,
      style: { ...base, shape: { ...base.shape, radius: known({ px: 12 }, origin) } }
    })

  const doc = (nodes: ReturnType<typeof card>[]): IRDoc =>
    ({ file: 'a.tsx', framework: 'react', imports: [], dataSources: [], nodes })

  const predicates = {
    'nested-card': (node: any, ctx: any) => {
      const parent = ctx.doc.nodes.find((n: any) => n.id === node.parent)
      if (!parent || parent.style.shape.radius.state !== 'known') return null
      return {
        rule: 'nested-card', sev: 'warn' as const, file: ctx.doc.file,
        line: node.loc.line, msg: 'Card nested inside a card.'
      }
    }
  }

  it('reports what the predicate returns', () => {
    const d = doc([card('a', null, ['b']), card('b', 'a')])
    expect(runRules([d], [cardRule], {}, predicates).findings.map(f => f.rule))
      .toEqual(['nested-card'])
  })

  it('reports nothing when the predicate returns null', () => {
    expect(runRules([doc([card('a', null)])], [cardRule], {}, predicates).findings).toEqual([])
  })

  it('counts a missing predicate as degraded, not as a finding', () => {
    const d = doc([card('a', null, ['b']), card('b', 'a')])
    const r = runRules([d], [cardRule], {}, {})
    expect(r.findings).toEqual([])
    expect(r.degraded.some(x => x.code === 'PREDICATE_NOT_FOUND')).toBe(true)
  })

  it('survives a predicate that throws', () => {
    const d = doc([card('a', null, ['b']), card('b', 'a')])
    const boom = { 'nested-card': () => { throw new Error('boom') } }
    const r = runRules([d], [cardRule], {}, boom as any)
    expect(r.findings).toEqual([])
    expect(r.degraded.some(x => x.code === 'PREDICATE_THREW')).toBe(true)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run packages/kernel/tests/engine/runner.test.ts packages/kernel/tests/surface/resolve.test.ts`
Expected: FAIL — cannot find modules `runner.js` and `resolve.js`

- [ ] **Step 4: Write the surface resolver**

`packages/kernel/src/surface/resolve.ts`:

```ts
const PATTERNS: RegExp[] = [
  /(?:^|\/)app\/(.+?)\/page\.[jt]sx?$/,      // Next app router
  /(?:^|\/)routes\/(.+?)\/\+page\.svelte$/,  // SvelteKit
  /(?:^|\/)pages\/(.+?)\.[jt]sx?$/           // Next pages router
]

export const resolveSurface = (
  file: string,
  overrides: Record<string, string> = {}
): string => {
  const direct = overrides[file]
  if (direct) return direct

  const norm = file.replace(/\\/g, '/')
  for (const re of PATTERNS) {
    const captured = re.exec(norm)?.[1]
    if (captured) return captured.replace(/\/index$/, '')
  }
  return file
}
```

- [ ] **Step 5: Write the runner**

`packages/kernel/src/engine/runner.ts`:

```ts
import { evaluate } from './expr.js'
import { distinct as distinctFn } from './builtins.js'
import { ancestors } from '../ir/query.js'
import { resolveSurface } from '../surface/resolve.js'
import { isKnown, isUnknown, type Fact } from '../ir/fact.js'
import type { IRDoc, IRNode } from '../ir/types.js'
import type {
  RuleDef, Selector, Finding, VerifyResult, Degraded
} from './rule-types.js'

export type PredicateCtx = {
  doc: IRDoc
  lock: unknown
  fact: (path: string) => Fact<unknown> | undefined
}

export type PredicateFn = (
  node: IRNode, ctx: PredicateCtx
) => Omit<Finding, 'id'> | null

export const getFactPath = (
  node: IRNode, path: string
): Fact<unknown> | undefined => {
  const rel = path.replace(/^self\./, '')
  let cur: unknown = node
  for (const seg of rel.split('.')) {
    if (cur === null || cur === undefined) return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur as Fact<unknown> | undefined
}

export const selectNodes = (doc: IRDoc, sel: Selector): IRNode[] =>
  doc.nodes.filter(n => {
    if (sel.name && n.name !== sel.name) return false
    if (sel.kind && n.kind !== sel.kind) return false
    if (sel.hasFact) {
      const f = getFactPath(n, sel.hasFact)
      // `absent` means provably unstyled — not a candidate.
      // `unknown` IS a candidate, so it gets counted as skipped coverage.
      if (!f || f.state === 'absent') return false
    }
    return true
  })

const render = (tpl: string, vars: Record<string, unknown>): string =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : `{${k}}`)

export const runRules = (
  docs: IRDoc[],
  rules: RuleDef[],
  lock: unknown,
  predicates: Record<string, PredicateFn> = {}
): VerifyResult => {
  const findings: Finding[] = []
  const degraded: Degraded[] = []
  let analyzed = 0
  let skipped = 0
  let seq = 0

  for (const doc of docs) {
    for (const rule of rules) {

      if (rule.kind === 'aggregate') {
        const collected: unknown[] = []
        for (const n of selectNodes(doc, rule.select)) {
          const f = rule.collect ? getFactPath(n, rule.collect) : undefined
          if (!f) continue
          if (isUnknown(f)) { skipped++; continue }
          if (isKnown(f)) { analyzed++; collected.push(f.value) }
        }

        if (collected.length < (rule.minSample ?? 1)) continue
        if (!rule.assert) continue

        const r = evaluate(rule.assert, { collected, lock })
        if (r.state === 'unknown' || r.value === true) continue

        const surface = rule.scope === 'surface' ? resolveSurface(doc.file) : undefined
        findings.push({
          id: `f${++seq}`,
          rule: rule.id,
          sev: rule.severity,
          file: doc.file,
          line: 1,
          msg: render(rule.message, { distinct: distinctFn(collected) }),
          ...(rule.fix ? { fix: rule.fix } : {}),
          ...(surface ? { surface } : {})
        })
        continue
      }

      for (const node of selectNodes(doc, rule.select)) {
        analyzed++

        if (rule.predicate) {
          const fn = predicates[rule.predicate]
          if (!fn) {
            degraded.push({
              code: 'PREDICATE_NOT_FOUND',
              detail: `Predicate "${rule.predicate}" for rule "${rule.id}" is not registered.`,
              impact: '1 rule not run'
            })
            continue
          }
          try {
            const hit = fn(node, {
              doc, lock, fact: (p: string) => getFactPath(node, p)
            })
            if (hit) findings.push({ id: `f${++seq}`, ...hit })
          } catch (err) {
            degraded.push({
              code: 'PREDICATE_THREW',
              detail: `Rule "${rule.id}": ${(err as Error).message}`,
              impact: '1 rule not run'
            })
          }
          continue
        }

        let other: IRNode | undefined
        if (rule.kind === 'relation') {
          const want = rule.against?.nearestAncestor
          if (!want) { skipped++; continue }
          other = ancestors(doc, node.id).find(a => {
            if (!want.hasFact) return true
            const f = getFactPath(a, want.hasFact)
            return !!f && f.state !== 'absent'
          })
          if (!other) { skipped++; continue }
        }

        if (!rule.assert) { skipped++; continue }

        const r = evaluate(rule.assert, { self: node, other, lock })
        if (r.state === 'unknown') { skipped++; continue }
        if (r.value === true) continue

        const f = rule.select.hasFact ? getFactPath(node, rule.select.hasFact) : undefined
        const value = f && isKnown(f) ? JSON.stringify(f.value) : ''

        findings.push({
          id: `f${++seq}`,
          rule: rule.id,
          sev: rule.severity,
          file: doc.file,
          line: node.loc.line,
          msg: render(rule.message, { value }),
          ...(rule.fix ? { fix: render(rule.fix, { value }) } : {})
        })
      }
    }
  }

  const seen = new Set<string>()
  const uniqueDegraded = degraded.filter(d => {
    const k = `${d.code}|${d.detail}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  return {
    findings,
    coverage: skipped > 0
      ? { analyzed, skipped, reason: 'facts that could not be resolved statically' }
      : { analyzed, skipped },
    degraded: uniqueDegraded
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run packages/kernel/tests/`
Expected: PASS — all kernel tests

- [ ] **Step 7: Commit**

```bash
git add packages/kernel/src/engine/runner.ts packages/kernel/src/surface packages/kernel/tests
git commit -m "feat(kernel): add rule runner for node, relation, aggregate, and predicate rules"
```

---

### Task 7: Tailwind class resolver

**Files:**
- Create: `packages/extractors/react/package.json`, `packages/extractors/react/tsconfig.json`
- Create: `packages/extractors/react/src/tailwind.ts`
- Modify: `packages/kernel/package.json` — add subpath exports
- Test: `packages/extractors/react/tests/tailwind.test.ts`

**Interfaces:**
- Consumes: `StyleFacts`, `emptyStyleFacts`, `Box` (Task 3); `known`, `StyleOrigin` (Task 2)
- Produces:
  - `type TailwindScale = { spacing: Record<string, number>; text: Record<string, number>; radius: Record<string, number>; weight: Record<string, number>; colors: Record<string, string> }`
  - `DEFAULT_SCALE: TailwindScale`
  - `resolveTailwindClasses(classes: string, scale?: TailwindScale): StyleFacts`

- [ ] **Step 1: Write the failing test**

`packages/extractors/react/tests/tailwind.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveTailwindClasses } from '../src/tailwind.js'
import { isKnown } from '@fe-design/kernel/ir/fact.js'

describe('resolveTailwindClasses', () => {
  it('resolves uniform padding', () => {
    const s = resolveTailwindClasses('p-4')
    expect(isKnown(s.space.padding)).toBe(true)
    if (isKnown(s.space.padding)) {
      expect(s.space.padding.value).toEqual({ top: 16, right: 16, bottom: 16, left: 16 })
    }
  })

  it('resolves axis padding, with later classes overriding earlier ones', () => {
    const s = resolveTailwindClasses('p-4 px-2')
    if (isKnown(s.space.padding)) {
      expect(s.space.padding.value).toEqual({ top: 16, right: 8, bottom: 16, left: 8 })
    }
  })

  it('resolves an arbitrary px value', () => {
    const s = resolveTailwindClasses('p-[13px]')
    if (isKnown(s.space.padding)) expect(s.space.padding.value.top).toBe(13)
  })

  it('converts rem arbitrary values to px', () => {
    const s = resolveTailwindClasses('p-[1.5rem]')
    if (isKnown(s.space.padding)) expect(s.space.padding.value.top).toBe(24)
  })

  it('resolves text size and font weight', () => {
    const s = resolveTailwindClasses('text-lg font-semibold')
    if (isKnown(s.type.size)) expect(s.type.size.value.px).toBe(18)
    if (isKnown(s.type.weight)) expect(s.type.weight.value).toBe(600)
  })

  it('resolves text and background colors', () => {
    const s = resolveTailwindClasses('text-gray-400 bg-white')
    if (isKnown(s.color.fg)) expect(s.color.fg.value.hex).toBe('#9ca3af')
    if (isKnown(s.color.bg)) expect(s.color.bg.value.hex).toBe('#ffffff')
  })

  it('resolves an arbitrary text size and an arbitrary text color', () => {
    const size = resolveTailwindClasses('text-[13px]')
    if (isKnown(size.type.size)) expect(size.type.size.value.px).toBe(13)
    const color = resolveTailwindClasses('text-[#22543D]')
    if (isKnown(color.color.fg)) expect(color.color.fg.value.hex).toBe('#22543D')
  })

  it('resolves border radius and border width', () => {
    const s = resolveTailwindClasses('rounded-xl border')
    if (isKnown(s.shape.radius)) expect(s.shape.radius.value.px).toBe(12)
    if (isKnown(s.shape.borderWidth)) expect(s.shape.borderWidth.value.px).toBe(1)
  })

  it('leaves unrecognised classes absent, not unknown', () => {
    expect(resolveTailwindClasses('grid-flow-dense').space.padding.state).toBe('absent')
  })

  it('records the raw class list', () => {
    expect(resolveTailwindClasses('p-4 text-lg').raw).toEqual(['p-4', 'text-lg'])
  })
})
```

- [ ] **Step 2: Create the package and add kernel subpath exports**

`packages/extractors/react/package.json`:

```json
{
  "name": "@fe-design/extractor-react",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@fe-design/kernel": "workspace:*",
    "@babel/parser": "^7.25.0",
    "@babel/traverse": "^7.25.0"
  },
  "devDependencies": { "@types/babel__traverse": "^7.20.0" }
}
```

`packages/extractors/react/tsconfig.json`:

```json
{ "extends": "../../../tsconfig.base.json", "include": ["src", "tests"] }
```

Replace `packages/kernel/package.json` with:

```json
{
  "name": "@fe-design/kernel",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./ir/fact.js": "./src/ir/fact.ts",
    "./ir/types.js": "./src/ir/types.ts",
    "./ir/query.js": "./src/ir/query.ts",
    "./engine/expr.js": "./src/engine/expr.ts",
    "./engine/runner.js": "./src/engine/runner.ts",
    "./engine/rule-types.js": "./src/engine/rule-types.ts",
    "./engine/pack-loader.js": "./src/engine/pack-loader.ts",
    "./lock/types.js": "./src/lock/types.ts",
    "./lock/derive.js": "./src/lock/derive.ts",
    "./lock/staleness.js": "./src/lock/staleness.ts",
    "./surface/resolve.js": "./src/surface/resolve.ts"
  }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm install && pnpm vitest run packages/extractors/react/tests/tailwind.test.ts`
Expected: FAIL — cannot find module `tailwind.js`

- [ ] **Step 4: Write the resolver**

`packages/extractors/react/src/tailwind.ts`:

```ts
import { emptyStyleFacts, type StyleFacts, type Box } from '@fe-design/kernel/ir/types.js'
import { known, type StyleOrigin } from '@fe-design/kernel/ir/fact.js'

export type TailwindScale = {
  spacing: Record<string, number>
  text: Record<string, number>
  radius: Record<string, number>
  weight: Record<string, number>
  colors: Record<string, string>
}

export const DEFAULT_SCALE: TailwindScale = {
  spacing: {
    '0': 0, '0.5': 2, '1': 4, '1.5': 6, '2': 8, '2.5': 10, '3': 12,
    '3.5': 14, '4': 16, '5': 20, '6': 24, '8': 32, '10': 40, '12': 48,
    '16': 64, '20': 80, '24': 96
  },
  text: {
    xs: 12, sm: 14, base: 16, lg: 18, xl: 20,
    '2xl': 24, '3xl': 30, '4xl': 36, '5xl': 48, '6xl': 60
  },
  radius: {
    none: 0, sm: 2, DEFAULT: 4, md: 6, lg: 8,
    xl: 12, '2xl': 16, '3xl': 24, full: 9999
  },
  weight: {
    thin: 100, light: 300, normal: 400, medium: 500,
    semibold: 600, bold: 700, extrabold: 800, black: 900
  },
  colors: {
    white: '#ffffff', black: '#000000',
    'gray-50': '#f9fafb', 'gray-100': '#f3f4f6', 'gray-200': '#e5e7eb',
    'gray-300': '#d1d5db', 'gray-400': '#9ca3af', 'gray-500': '#6b7280',
    'gray-600': '#4b5563', 'gray-700': '#374151', 'gray-800': '#1f2937',
    'gray-900': '#111827'
  }
}

const toPx = (raw: string): number | null => {
  const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(raw.trim())
  if (!m) return null
  const n = Number(m[1])
  if (Number.isNaN(n)) return null
  return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n
}

const arbitrary = (token: string): string | null =>
  /^\[(.+)\]$/.exec(token)?.[1] ?? null

const box = (v: number): Box => ({ top: v, right: v, bottom: v, left: v })

export const resolveTailwindClasses = (
  classes: string,
  scale: TailwindScale = DEFAULT_SCALE
): StyleFacts => {
  const facts = emptyStyleFacts()
  const list = classes.split(/\s+/).filter(Boolean)
  facts.raw = list

  let pad: Box | null = null
  let padOrigin: StyleOrigin | null = null

  const spacingValue = (token: string): number | null => {
    const arb = arbitrary(token)
    return arb ? toPx(arb) : scale.spacing[token] ?? null
  }

  for (const cls of list) {
    const origin: StyleOrigin = { kind: 'class', raw: cls }

    const padM = /^p([xytrbl])?-(.+)$/.exec(cls)
    if (padM) {
      const v = spacingValue(padM[2] as string)
      if (v !== null) {
        pad ??= box(0)
        const axis = padM[1]
        if (!axis) pad = box(v)
        else if (axis === 'x') { pad.left = v; pad.right = v }
        else if (axis === 'y') { pad.top = v; pad.bottom = v }
        else if (axis === 't') pad.top = v
        else if (axis === 'r') pad.right = v
        else if (axis === 'b') pad.bottom = v
        else if (axis === 'l') pad.left = v
        padOrigin = origin
      }
      continue
    }

    const gapM = /^gap-(.+)$/.exec(cls)
    if (gapM) {
      const v = spacingValue(gapM[1] as string)
      if (v !== null) facts.space.gap = known({ px: v }, origin)
      continue
    }

    if (cls === 'border') {
      facts.shape.borderWidth = known({ px: 1 }, origin)
      continue
    }
    const borderM = /^border-(\d+)$/.exec(cls)
    if (borderM) {
      facts.shape.borderWidth = known({ px: Number(borderM[1]) }, origin)
      continue
    }

    const roundM = /^rounded(?:-(.+))?$/.exec(cls)
    if (roundM) {
      const key = roundM[1] ?? 'DEFAULT'
      const arb = arbitrary(key)
      const v = arb ? toPx(arb) : scale.radius[key] ?? null
      if (v !== null) facts.shape.radius = known({ px: v }, origin)
      continue
    }

    const weightM = /^font-(.+)$/.exec(cls)
    if (weightM) {
      const w = scale.weight[weightM[1] as string]
      if (w !== undefined) { facts.type.weight = known(w, origin); continue }
    }

    const textM = /^text-(.+)$/.exec(cls)
    if (textM) {
      const key = textM[1] as string
      const arb = arbitrary(key)
      if (arb) {
        if (arb.startsWith('#')) facts.color.fg = known({ hex: arb }, origin)
        else {
          const px = toPx(arb)
          if (px !== null) facts.type.size = known({ px }, origin)
        }
      } else if (scale.text[key] !== undefined) {
        facts.type.size = known({ px: scale.text[key] as number }, origin)
      } else if (scale.colors[key] !== undefined) {
        facts.color.fg = known({ hex: scale.colors[key] as string }, origin)
      }
      continue
    }

    const bgM = /^bg-(.+)$/.exec(cls)
    if (bgM) {
      const key = bgM[1] as string
      const hex = arbitrary(key) ?? scale.colors[key]
      if (hex) facts.color.bg = known({ hex }, origin)
      continue
    }
  }

  if (pad && padOrigin) facts.space.padding = known(pad, padOrigin)
  return facts
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/extractors/react/tests/tailwind.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 6: Commit**

```bash
git add packages/extractors/react packages/kernel/package.json
git commit -m "feat(extractor-react): resolve Tailwind classes into StyleFacts"
```

---

### Task 8: React JSX extractor

**Files:**
- Create: `packages/extractors/react/src/jsx.ts`
- Create: `packages/extractors/react/src/index.ts`
- Create: `packages/extractors/react/tests/fixtures/simple.tsx`
- Create: `packages/extractors/react/tests/fixtures/dynamic.tsx`
- Test: `packages/extractors/react/tests/extract.test.ts`

**Interfaces:**
- Consumes: `resolveTailwindClasses` (Task 7), `makeNode`/`emptyStyleFacts`/`IRDoc` (Task 3), `unknown` (Task 2)
- Produces: `extractReact(source: string, file: string): IRDoc`

- [ ] **Step 1: Write the fixtures**

`packages/extractors/react/tests/fixtures/simple.tsx`:

```tsx
export default function Card() {
  return (
    <section className="bg-white p-6">
      <h2 className="text-2xl font-semibold">Title</h2>
      <p className="text-gray-400 text-base">Body copy</p>
    </section>
  )
}
```

`packages/extractors/react/tests/fixtures/dynamic.tsx`:

```tsx
declare function cn(...a: unknown[]): string

export default function Card({ tone }: { tone: string }) {
  return (
    <div className={`p-4 ${tone}`}>
      <span className={cn('text-sm', tone)}>Hi</span>
    </div>
  )
}
```

- [ ] **Step 2: Write the failing test**

`packages/extractors/react/tests/extract.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { extractReact } from '../src/index.js'
import { isKnown, isUnknown } from '@fe-design/kernel/ir/fact.js'

const fixture = (n: string) =>
  readFile(join(import.meta.dirname, 'fixtures', n), 'utf8')

describe('extractReact', () => {
  it('produces one node per JSX element with parent links', async () => {
    const doc = extractReact(await fixture('simple.tsx'), 'simple.tsx')
    expect(doc.nodes.map(n => n.name)).toEqual(['section', 'h2', 'p'])
    expect(doc.nodes[1]?.parent).toBe(doc.nodes[0]?.id)
    expect(doc.nodes[0]?.children).toHaveLength(2)
  })

  it('resolves a static className into StyleFacts', async () => {
    const doc = extractReact(await fixture('simple.tsx'), 'simple.tsx')
    const section = doc.nodes[0]!
    if (isKnown(section.style.space.padding)) {
      expect(section.style.space.padding.value.top).toBe(24)
    } else {
      throw new Error('padding should be known')
    }
    if (isKnown(section.style.color.bg)) {
      expect(section.style.color.bg.value.hex).toBe('#ffffff')
    }
  })

  it('records line numbers', async () => {
    const doc = extractReact(await fixture('simple.tsx'), 'simple.tsx')
    expect(doc.nodes[0]?.loc.line).toBe(3)
  })

  it('marks a template-literal className as unknown, not absent', async () => {
    const doc = extractReact(await fixture('dynamic.tsx'), 'dynamic.tsx')
    const div = doc.nodes.find(n => n.name === 'div')!
    expect(isUnknown(div.style.space.padding)).toBe(true)
  })

  it('marks a cn()/clsx() className as unknown', async () => {
    const doc = extractReact(await fixture('dynamic.tsx'), 'dynamic.tsx')
    const span = doc.nodes.find(n => n.name === 'span')!
    expect(isUnknown(span.style.type.size)).toBe(true)
  })

  it('classifies capitalised tags as components', () => {
    const doc = extractReact(
      'export default () => <Button className="p-4">Go</Button>', 'x.tsx'
    )
    expect(doc.nodes[0]?.kind).toBe('component')
  })

  it('captures literal text children', async () => {
    const doc = extractReact(await fixture('simple.tsx'), 'simple.tsx')
    expect(doc.nodes.find(n => n.name === 'h2')?.text).toBe('Title')
  })

  it('leaves an element with no className fully absent', () => {
    const doc = extractReact('export default () => <div>x</div>', 'x.tsx')
    expect(doc.nodes[0]?.style.space.padding.state).toBe('absent')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run packages/extractors/react/tests/extract.test.ts`
Expected: FAIL — cannot find module `index.js`

- [ ] **Step 4: Write the extractor**

`packages/extractors/react/src/jsx.ts`:

```ts
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import {
  makeNode, emptyStyleFacts, type IRDoc, type IRNode, type StyleFacts
} from '@fe-design/kernel/ir/types.js'
import { unknown, type UnknownReason } from '@fe-design/kernel/ir/fact.js'
import { resolveTailwindClasses } from './tailwind.js'

// @babel/traverse ships CJS; under ESM the callable sits on `.default`.
const traverse = ((_traverse as unknown as { default?: typeof _traverse }).default
  ?? _traverse) as typeof _traverse

const allUnknown = (reason: UnknownReason): StyleFacts => {
  const s = emptyStyleFacts()
  const u = () => unknown(reason)
  s.space.padding = u(); s.space.margin = u(); s.space.gap = u()
  s.type.size = u(); s.type.weight = u(); s.type.leading = u()
  s.type.tracking = u(); s.type.family = u()
  s.color.fg = u(); s.color.bg = u(); s.color.border = u()
  s.shape.radius = u(); s.shape.borderWidth = u(); s.shape.shadow = u()
  return s
}

export const extractReact = (source: string, file: string): IRDoc => {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript']
  })

  const nodes: IRNode[] = []
  const idOf = new Map<object, string>()
  let seq = 0

  traverse(ast, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    JSXElement(path: NodePath<any>) {
      const opening = path.node.openingElement
      const nameNode = opening.name
      const name = nameNode.type === 'JSXIdentifier'
        ? nameNode.name
        : nameNode.type === 'JSXMemberExpression'
          ? `${nameNode.object.name}.${nameNode.property.name}`
          : 'unknown'

      const id = `n${++seq}`
      idOf.set(path.node, id)

      let style = emptyStyleFacts()
      const attr = opening.attributes.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a: any) => a.type === 'JSXAttribute' && a.name.name === 'className'
      )
      if (attr) {
        const v = attr.value
        if (v?.type === 'StringLiteral') {
          style = resolveTailwindClasses(v.value)
        } else if (v?.type === 'JSXExpressionContainer') {
          const e = v.expression
          if (e.type === 'StringLiteral') style = resolveTailwindClasses(e.value)
          else if (e.type === 'CallExpression') style = allUnknown('unresolved-call')
          else style = allUnknown('dynamic-expression')
        }
      }

      const textChild = path.node.children.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (c: any) => c.type === 'JSXText' && c.value.trim().length > 0
      )

      const parentEl = path.findParent(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: NodePath<any>) => p.isJSXElement()
      )
      const parentId = parentEl ? idOf.get(parentEl.node) ?? null : null

      nodes.push(makeNode({
        id,
        name,
        kind: /^[A-Z]/.test(name) ? 'component' : 'element',
        parent: parentId,
        style,
        text: textChild ? textChild.value.trim() : null,
        loc: {
          line: path.node.loc?.start.line ?? 1,
          col: path.node.loc?.start.column ?? 0
        }
      }))

      if (parentId) {
        const parent = nodes.find(n => n.id === parentId)
        if (parent) parent.children.push(id)
      }
    }
  })

  return { file, framework: 'react', nodes, imports: [], dataSources: [] }
}
```

`packages/extractors/react/src/index.ts`:

```ts
export { extractReact } from './jsx.js'
export { resolveTailwindClasses, DEFAULT_SCALE } from './tailwind.js'
export type { TailwindScale } from './tailwind.js'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/extractors/react/tests/extract.test.ts`
Expected: PASS — 8 tests

If the line-number test fails, read the actual `loc.line` from the failure output and
correct the expectation to match the fixture — do not change the extractor to satisfy it.

- [ ] **Step 6: Commit**

```bash
git add packages/extractors/react/src packages/extractors/react/tests
git commit -m "feat(extractor-react): extract JSX into IR with unknown-safe className handling"
```

---

### Task 9: Lock derivation, staleness, and component registry

**Files:**
- Create: `packages/kernel/src/lock/types.ts`
- Create: `packages/kernel/src/lock/staleness.ts`
- Create: `packages/kernel/src/lock/registry.ts`
- Create: `packages/kernel/src/lock/derive.ts`
- Test: `packages/kernel/tests/lock/derive.test.ts`

**Interfaces:**
- Consumes: `Degraded` (Task 5)
- Produces:
  - `type SourceRef = { path: string; hash: string }`
  - `type DerivedZone = { space: number[]; type: { steps: number[]; families: Record<string,string> }; color: Record<string,string>; radius: number[]; components: Record<string,{ file: string; variants: string[] }>; inferred?: boolean }`
  - `type IntentZone`, `emptyIntent(): IntentZone`
  - `type Lock = { version: 1; sources: SourceRef[]; derived: DerivedZone; intent: IntentZone }`
  - `hashSources(dir: string, paths: string[]): Promise<SourceRef[]>`
  - `checkStale(lock: Lock, dir: string): Promise<{ stale: boolean; changed: string[] }>`
  - `scanComponents(dir: string): Promise<Record<string, { file: string; variants: string[] }>>`
  - `deriveLock(dir: string, intent?: Partial<IntentZone>): Promise<{ lock: Lock | null; degraded: Degraded[] }>`

- [ ] **Step 1: Write the failing test**

`packages/kernel/tests/lock/derive.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deriveLock } from '../../src/lock/derive.js'
import { checkStale } from '../../src/lock/staleness.js'
import { scanComponents } from '../../src/lock/registry.js'

let dir: string

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'lock-')) })

const writeTailwind = (d: string, body: string) =>
  writeFile(join(d, 'tailwind.config.mjs'), body)

describe('deriveLock', () => {
  it('derives the spacing scale from tailwind config', async () => {
    await writeTailwind(dir, `export default {
      theme: { extend: { spacing: { xs: '4px', sm: '8px', md: '16px' } } }
    }`)
    const { lock } = await deriveLock(dir)
    expect(lock?.derived.space).toEqual([4, 8, 16])
  })

  it('derives the type scale from tailwind fontSize', async () => {
    await writeTailwind(dir, `export default {
      theme: { extend: { fontSize: { sm: '14px', base: '16px', xl: '24px' } } }
    }`)
    const { lock } = await deriveLock(dir)
    expect(lock?.derived.type.steps).toEqual([14, 16, 24])
  })

  it('flattens nested colors into dashed keys', async () => {
    await writeTailwind(dir, `export default {
      theme: { extend: { colors: { primary: { 500: '#1F4B3F' }, white: '#ffffff' } } }
    }`)
    const { lock } = await deriveLock(dir)
    expect(lock?.derived.color['primary-500']).toBe('#1F4B3F')
    expect(lock?.derived.color['white']).toBe('#ffffff')
  })

  it('falls back to CSS custom properties when no tailwind config exists', async () => {
    await mkdir(join(dir, 'src'), { recursive: true })
    await writeFile(join(dir, 'src/globals.css'),
      ':root { --space-1: 4px; --space-2: 8px; --color-primary: #1F4B3F; }')
    const { lock } = await deriveLock(dir)
    expect(lock?.derived.space).toEqual([4, 8])
    expect(lock?.derived.color['primary']).toBe('#1F4B3F')
  })

  it('returns null when there is nothing to derive from', async () => {
    const { lock, degraded } = await deriveLock(dir)
    expect(lock).toBeNull()
    expect(degraded.some(d => d.code === 'NO_DESIGN_SOURCE')).toBe(true)
  })

  it('preserves the intent zone it is given', async () => {
    await writeTailwind(dir, `export default { theme: { extend: { spacing: { a: '4px' } } } }`)
    const { lock } = await deriveLock(dir, { system: 'quiet-precision' })
    expect(lock?.intent.system).toBe('quiet-precision')
  })
})

describe('checkStale', () => {
  it('reports stale after a source file changes', async () => {
    await writeTailwind(dir, `export default { theme: { extend: { spacing: { a: '4px' } } } }`)
    const { lock } = await deriveLock(dir)
    expect((await checkStale(lock!, dir)).stale).toBe(false)

    await writeTailwind(dir, `export default { theme: { extend: { spacing: { a: '8px' } } } }`)
    const after = await checkStale(lock!, dir)
    expect(after.stale).toBe(true)
    expect(after.changed).toContain('tailwind.config.mjs')
  })
})

describe('scanComponents', () => {
  it('registers components and their variant names', async () => {
    await mkdir(join(dir, 'src/ui'), { recursive: true })
    await writeFile(join(dir, 'src/ui/Button.tsx'),
      `const variants = { primary: '', ghost: '' }
       export const Button = () => null`)
    const reg = await scanComponents(dir)
    expect(reg['Button']?.file).toContain('Button.tsx')
    expect(reg['Button']?.variants).toEqual(['primary', 'ghost'])
  })

  it('returns an empty registry when no ui directory exists', async () => {
    expect(await scanComponents(dir)).toEqual({})
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/kernel/tests/lock/derive.test.ts`
Expected: FAIL — cannot find module `derive.js`

- [ ] **Step 3: Add the config-loading dependency**

Run: `pnpm --filter @fe-design/kernel add jiti`

- [ ] **Step 4: Write the lock types and staleness**

`packages/kernel/src/lock/types.ts`:

```ts
export type SourceRef = { path: string; hash: string }

export type DerivedZone = {
  space: number[]
  type: { steps: number[]; families: Record<string, string> }
  color: Record<string, string>
  radius: number[]
  components: Record<string, { file: string; variants: string[] }>
  inferred?: boolean
}

export type IntentZone = {
  system: string | null
  density: string | null
  hierarchy: { headingJump: number; maxWeightsPerSurface: number } | null
  motion: { budget: string; maxDurationMs: number } | null
  banned: { fonts: string[]; patterns: string[] }
  rationale: string | null
}

export type Lock = {
  version: 1
  sources: SourceRef[]
  derived: DerivedZone
  intent: IntentZone
}

export const emptyIntent = (): IntentZone => ({
  system: null, density: null, hierarchy: null, motion: null,
  banned: { fonts: [], patterns: [] }, rationale: null
})
```

`packages/kernel/src/lock/staleness.ts`:

```ts
import { createHash } from 'node:crypto'
import { readFile, stat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Lock, SourceRef } from './types.js'

const hashPath = async (abs: string): Promise<string> => {
  const s = await stat(abs)
  if (s.isDirectory()) {
    const entries = (await readdir(abs)).sort()
    const h = createHash('sha256')
    for (const e of entries) h.update(e).update(await hashPath(join(abs, e)))
    return `sha256:${h.digest('hex')}`
  }
  const buf = await readFile(abs)
  return `sha256:${createHash('sha256').update(buf).digest('hex')}`
}

export const hashSources = async (
  dir: string, paths: string[]
): Promise<SourceRef[]> => {
  const out: SourceRef[] = []
  for (const p of paths) {
    try { out.push({ path: p, hash: await hashPath(join(dir, p)) }) }
    catch { /* source vanished; omit so the next derive notices */ }
  }
  return out
}

export const checkStale = async (
  lock: Lock, dir: string
): Promise<{ stale: boolean; changed: string[] }> => {
  const changed: string[] = []
  for (const src of lock.sources) {
    let current: string | null = null
    try { current = await hashPath(join(dir, src.path)) } catch { current = null }
    if (current !== src.hash) changed.push(src.path)
  }
  return { stale: changed.length > 0, changed }
}
```

- [ ] **Step 5: Write the component registry**

`packages/kernel/src/lock/registry.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'

export const UI_DIRS = ['src/ui', 'src/components/ui', 'components/ui', 'app/ui']

export const scanComponents = async (
  dir: string
): Promise<Record<string, { file: string; variants: string[] }>> => {
  const out: Record<string, { file: string; variants: string[] }> = {}

  for (const rel of UI_DIRS) {
    let entries: string[]
    try { entries = await readdir(join(dir, rel)) } catch { continue }

    for (const entry of entries) {
      if (!['.tsx', '.jsx', '.vue', '.svelte'].includes(extname(entry))) continue
      const name = basename(entry, extname(entry))
      const src = await readFile(join(dir, rel, entry), 'utf8')

      const variants: string[] = []
      const vm = /variants\s*[:=]\s*\{([^}]*)\}/s.exec(src)
      if (vm?.[1]) {
        for (const km of vm[1].matchAll(/(\w+)\s*:/g)) {
          const key = km[1]
          if (key) variants.push(key)
        }
      }
      out[name] = { file: join(rel, entry), variants }
    }
  }
  return out
}
```

- [ ] **Step 6: Write the derivation**

`packages/kernel/src/lock/derive.ts`:

```ts
import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import createJiti from 'jiti'
import { hashSources } from './staleness.js'
import { scanComponents, UI_DIRS } from './registry.js'
import { emptyIntent, type Lock, type IntentZone, type DerivedZone } from './types.js'
import type { Degraded } from '../engine/rule-types.js'

const CONFIG_NAMES = [
  'tailwind.config.ts', 'tailwind.config.js',
  'tailwind.config.mjs', 'tailwind.config.cjs'
]

const CSS_CANDIDATES = [
  'src/globals.css', 'src/styles/globals.css',
  'app/globals.css', 'styles/globals.css'
]

const exists = async (p: string): Promise<boolean> => {
  try { await access(p); return true } catch { return false }
}

const toPx = (raw: string): number | null => {
  const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(raw.trim())
  if (!m) return null
  const n = Number(m[1])
  if (Number.isNaN(n)) return null
  return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n
}

const sortedPx = (obj: Record<string, string>): number[] =>
  [...new Set(Object.values(obj).map(toPx).filter((n): n is number => n !== null))]
    .sort((a, b) => a - b)

const flattenColors = (
  obj: Record<string, unknown>, prefix = ''
): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}-${k}` : k
    if (typeof v === 'string') out[key] = v
    else if (v && typeof v === 'object') {
      Object.assign(out, flattenColors(v as Record<string, unknown>, key))
    }
  }
  return out
}

const emptyDerived = (): DerivedZone => ({
  space: [], type: { steps: [], families: {} }, color: {},
  radius: [], components: {}
})

export const deriveLock = async (
  dir: string, intent: Partial<IntentZone> = {}
): Promise<{ lock: Lock | null; degraded: Degraded[] }> => {
  const degraded: Degraded[] = []
  const sourcePaths: string[] = []
  const derived = emptyDerived()
  let found = false

  const configName = (await Promise.all(
    CONFIG_NAMES.map(async n => (await exists(join(dir, n))) ? n : null)
  )).find(Boolean)

  if (configName) {
    try {
      const jiti = createJiti(dir, { interopDefault: true, esmResolve: true })
      const cfg = jiti(join(dir, configName)) as {
        theme?: { extend?: Record<string, unknown> }
      }
      const ext = cfg.theme?.extend ?? {}

      const spacing = ext['spacing'] as Record<string, string> | undefined
      if (spacing) derived.space = sortedPx(spacing)

      const fontSize = ext['fontSize'] as Record<string, string> | undefined
      if (fontSize) derived.type.steps = sortedPx(fontSize)

      const colors = ext['colors'] as Record<string, unknown> | undefined
      if (colors) derived.color = flattenColors(colors)

      const radius = ext['borderRadius'] as Record<string, string> | undefined
      if (radius) derived.radius = sortedPx(radius)

      sourcePaths.push(configName)
      found = true
    } catch (err) {
      degraded.push({
        code: 'CONFIG_LOAD_FAILED', path: configName,
        detail: (err as Error).message,
        impact: 'tailwind config not used for derivation'
      })
    }
  }

  if (!found) {
    for (const rel of CSS_CANDIDATES) {
      if (!await exists(join(dir, rel))) continue
      const css = await readFile(join(dir, rel), 'utf8')

      const space: number[] = []
      for (const m of css.matchAll(/--space[-\w]*:\s*([^;]+);/g)) {
        const px = toPx((m[1] ?? '').trim())
        if (px !== null) space.push(px)
      }
      for (const m of css.matchAll(/--color-([\w-]+):\s*([^;]+);/g)) {
        const key = m[1]
        if (key) derived.color[key] = (m[2] ?? '').trim()
      }
      if (space.length > 0) derived.space = [...new Set(space)].sort((a, b) => a - b)

      sourcePaths.push(rel)
      found = true
      break
    }
  }

  if (!found) {
    degraded.push({
      code: 'NO_DESIGN_SOURCE',
      detail: 'No tailwind config and no CSS custom properties found.',
      impact: 'lock cannot be derived; project needs bootstrap'
    })
    return { lock: null, degraded }
  }

  derived.components = await scanComponents(dir)
  for (const rel of UI_DIRS) {
    if (await exists(join(dir, rel))) { sourcePaths.push(rel); break }
  }

  return {
    lock: {
      version: 1,
      sources: await hashSources(dir, sourcePaths),
      derived,
      intent: { ...emptyIntent(), ...intent }
    },
    degraded
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm vitest run packages/kernel/tests/lock/derive.test.ts`
Expected: PASS — 9 tests

- [ ] **Step 8: Commit**

```bash
git add packages/kernel/src/lock packages/kernel/tests/lock
git commit -m "feat(kernel): derive design lock from project config with staleness detection"
```

---

### Task 10: Rule pack — scale, consistency, a11y, and craft rules

**Files:**
- Create: `packages/packs/package.json`
- Create: `packages/packs/rules/scale/{space,type,radius}-off-scale.json`
- Create: `packages/packs/rules/consistency/color-off-palette.json`
- Create: `packages/packs/rules/a11y/{text-contrast,tiny-text}.json`
- Create: `packages/packs/rules/craft/{flat-type-hierarchy,monotonous-spacing,nested-card}.json`
- Create: `packages/packs/rules/predicates/nested-card.mjs`
- Create: `packages/packs/rules/fixtures/*.tsx` (19 files)
- Test: `packages/packs/tests/rules.test.ts`

**Interfaces:**
- Consumes: `loadPack` (Task 5), `runRules` (Task 6), `extractReact` (Task 8)
- Produces: nine loadable rules and one predicate module

- [ ] **Step 1: Write the failing test**

This test is the enforcement mechanism for the entire pack system.

`packages/packs/tests/rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { loadPack } from '@fe-design/kernel/engine/pack-loader.js'
import { runRules } from '@fe-design/kernel/engine/runner.js'
import { extractReact } from '@fe-design/extractor-react'

const PACKS = join(import.meta.dirname, '..', 'rules')

const LOCK = {
  derived: {
    space: [0, 4, 8, 12, 16, 24, 32, 48],
    type: { steps: [12, 14, 16, 18, 24, 30] },
    radius: [0, 2, 6, 12],
    color: { white: '#ffffff', 'gray-900': '#111827', 'gray-400': '#9ca3af' }
  }
}

const loadPredicates = async (): Promise<Record<string, unknown>> => {
  const dir = join(PACKS, 'predicates')
  const out: Record<string, unknown> = {}
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.mjs')) continue
    const mod = await import(join(dir, f)) as { default: unknown }
    out[f.replace(/\.mjs$/, '')] = mod.default
  }
  return out
}

const runOne = async (rule: any, fixtureRel: string, predicates: any) => {
  const abs = resolve(PACKS, fixtureRel)
  const doc = extractReact(await readFile(abs, 'utf8'), abs)
  return runRules([doc], [rule], LOCK, predicates)
}

describe('rule pack', () => {
  it('loads every rule without degradation', async () => {
    const { rules, degraded } = await loadPack(PACKS)
    expect(degraded).toEqual([])
    expect(rules.length).toBeGreaterThanOrEqual(9)
  })

  it('every rule fires on its own fail fixture', async () => {
    const { rules } = await loadPack(PACKS)
    const predicates = await loadPredicates()
    for (const rule of rules) {
      const r = await runOne(rule, rule.fixtures.fail, predicates)
      expect(r.findings.map(f => f.rule), `${rule.id} must fire on its fail fixture`)
        .toContain(rule.id)
    }
  })

  it('no rule fires on its own pass fixture', async () => {
    const { rules } = await loadPack(PACKS)
    const predicates = await loadPredicates()
    for (const rule of rules) {
      const r = await runOne(rule, rule.fixtures.pass, predicates)
      expect(r.findings.map(f => f.rule), `${rule.id} must stay silent on its pass fixture`)
        .not.toContain(rule.id)
    }
  })

  it('no rule fires on the all-unknown fixture', async () => {
    const { rules } = await loadPack(PACKS)
    const predicates = await loadPredicates()
    const abs = resolve(PACKS, 'fixtures/all-unknown.tsx')
    const doc = extractReact(await readFile(abs, 'utf8'), abs)
    const r = runRules([doc], rules, LOCK, predicates as any)
    expect(r.findings).toEqual([])
    expect(r.coverage.skipped).toBeGreaterThan(0)
  })

  it('every rule with a source also declares modified', async () => {
    const { rules } = await loadPack(PACKS)
    for (const r of rules) {
      if (r.source) expect(r.modified, `${r.id}`).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Create the package and the fixtures**

`packages/packs/package.json`:

```json
{
  "name": "@fe-design/packs",
  "version": "0.1.0",
  "type": "module",
  "devDependencies": {
    "@fe-design/kernel": "workspace:*",
    "@fe-design/extractor-react": "workspace:*"
  }
}
```

Create all of these under `packages/packs/rules/fixtures/`:

`space-pass.tsx`
```tsx
export default () => <div className="p-4">ok</div>
```

`space-fail.tsx`
```tsx
export default () => <div className="p-[13px]">off scale</div>
```

`type-pass.tsx`
```tsx
export default () => <p className="text-base">ok</p>
```

`type-fail.tsx`
```tsx
export default () => <p className="text-[13px]">off scale</p>
```

`radius-pass.tsx`
```tsx
export default () => <div className="rounded-xl">ok</div>
```

`radius-fail.tsx`
```tsx
export default () => <div className="rounded-[7px]">off scale</div>
```

`color-pass.tsx`
```tsx
export default () => <p className="text-gray-900">ok</p>
```

`color-fail.tsx`
```tsx
export default () => <p className="text-[#22543D]">off palette</p>
```

`contrast-pass.tsx`
```tsx
export default () => (
  <section className="bg-white">
    <p className="text-gray-900">readable</p>
  </section>
)
```

`contrast-fail.tsx`
```tsx
export default () => (
  <section className="bg-white">
    <p className="text-gray-400">too faint</p>
  </section>
)
```

`tiny-pass.tsx`
```tsx
export default () => <span className="text-sm">ok</span>
```

`tiny-fail.tsx`
```tsx
export default () => <span className="text-[10px]">too small</span>
```

`nested-pass.tsx`
```tsx
export default () => (
  <div className="rounded-xl border p-4">
    <p className="text-base">flat inside</p>
  </div>
)
```

`nested-fail.tsx`
```tsx
export default () => (
  <div className="rounded-xl border p-4">
    <div className="rounded-xl border p-4">nested</div>
  </div>
)
```

`hierarchy-pass.tsx`
```tsx
export default () => (
  <div>
    <h1 className="text-3xl">A</h1>
    <h2 className="text-xl">B</h2>
    <p className="text-base">C</p>
    <p className="text-base">D</p>
    <p className="text-base">E</p>
    <small className="text-sm">F</small>
    <small className="text-sm">G</small>
    <small className="text-sm">H</small>
  </div>
)
```

`hierarchy-fail.tsx`
```tsx
export default () => (
  <div>
    <h1 className="text-base">A</h1>
    <h2 className="text-base">B</h2>
    <p className="text-base">C</p>
    <p className="text-base">D</p>
    <p className="text-base">E</p>
    <p className="text-base">F</p>
    <p className="text-base">G</p>
    <p className="text-base">H</p>
  </div>
)
```

`spacing-pass.tsx`
```tsx
export default () => (
  <div className="p-8">
    <div className="p-4">a</div>
    <div className="p-4">b</div>
    <div className="p-2">c</div>
    <div className="p-2">d</div>
    <div className="p-6">e</div>
  </div>
)
```

`spacing-fail.tsx`
```tsx
export default () => (
  <div className="p-4">
    <div className="p-4">a</div>
    <div className="p-4">b</div>
    <div className="p-4">c</div>
    <div className="p-4">d</div>
    <div className="p-4">e</div>
  </div>
)
```

`all-unknown.tsx`
```tsx
declare function cn(...a: unknown[]): string

export default function X({ tone }: { tone: string }) {
  return (
    <div className={`p-4 ${tone}`}>
      <p className={cn('text-sm text-gray-400', tone)}>hi</p>
    </div>
  )
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm install && pnpm vitest run packages/packs/tests/rules.test.ts`
Expected: FAIL — `loadPack` finds no rule JSON files

- [ ] **Step 4: Write the rule definitions**

`packages/packs/rules/scale/space-off-scale.json`:

```json
{
  "id": "space-off-scale",
  "kind": "node",
  "severity": "error",
  "select": { "hasFact": "style.space.padding" },
  "assert": { "allIn": ["self.style.space.padding", "$lock.derived.space"] },
  "message": "Padding {value} is not on the project spacing scale.",
  "fix": "Use the nearest value from derived.space in design.lock.json.",
  "fixtures": { "pass": "../fixtures/space-pass.tsx", "fail": "../fixtures/space-fail.tsx" },
  "source": "impeccable@0.x/cramped-padding",
  "modified": true
}
```

`packages/packs/rules/scale/type-off-scale.json`:

```json
{
  "id": "type-off-scale",
  "kind": "node",
  "severity": "error",
  "select": { "hasFact": "style.type.size" },
  "assert": { "in": ["self.style.type.size.px", "$lock.derived.type.steps"] },
  "message": "Text size {value} is not on the project type scale.",
  "fixtures": { "pass": "../fixtures/type-pass.tsx", "fail": "../fixtures/type-fail.tsx" }
}
```

`packages/packs/rules/scale/radius-off-scale.json`:

```json
{
  "id": "radius-off-scale",
  "kind": "node",
  "severity": "warn",
  "select": { "hasFact": "style.shape.radius" },
  "assert": { "in": ["self.style.shape.radius.px", "$lock.derived.radius"] },
  "message": "Border radius {value} is not on the project radius scale.",
  "fixtures": { "pass": "../fixtures/radius-pass.tsx", "fail": "../fixtures/radius-fail.tsx" }
}
```

`packages/packs/rules/consistency/color-off-palette.json`:

```json
{
  "id": "color-off-palette",
  "kind": "node",
  "severity": "error",
  "select": { "hasFact": "style.color.fg" },
  "assert": { "in": ["self.style.color.fg.hex", "$lock.derived.color"] },
  "message": "Color {value} is not in the project palette.",
  "fix": "Use an existing token, or add this color to the palette deliberately.",
  "fixtures": { "pass": "../fixtures/color-pass.tsx", "fail": "../fixtures/color-fail.tsx" }
}
```

`packages/packs/rules/a11y/text-contrast.json`:

```json
{
  "id": "text-contrast",
  "kind": "relation",
  "severity": "error",
  "select": { "hasFact": "style.color.fg" },
  "against": { "nearestAncestor": { "hasFact": "style.color.bg" } },
  "assert": { "gte": ["contrast(self.style.color.fg, other.style.color.bg)", 4.5] },
  "message": "Text contrast is below the 4.5:1 WCAG 2.1 AA minimum.",
  "fixtures": { "pass": "../fixtures/contrast-pass.tsx", "fail": "../fixtures/contrast-fail.tsx" }
}
```

`packages/packs/rules/a11y/tiny-text.json`:

```json
{
  "id": "tiny-text",
  "kind": "node",
  "severity": "warn",
  "select": { "hasFact": "style.type.size" },
  "assert": { "gte": ["self.style.type.size.px", 12] },
  "message": "Text size {value} is below the 12px legibility floor.",
  "fixtures": { "pass": "../fixtures/tiny-pass.tsx", "fail": "../fixtures/tiny-fail.tsx" },
  "source": "impeccable@0.x/tiny-text",
  "modified": true
}
```

`packages/packs/rules/craft/flat-type-hierarchy.json`:

```json
{
  "id": "flat-type-hierarchy",
  "kind": "aggregate",
  "scope": "surface",
  "severity": "warn",
  "select": { "hasFact": "style.type.size" },
  "collect": "style.type.size",
  "assert": { "gte": ["distinct(collected)", 3] },
  "minSample": 8,
  "message": "Only {distinct} distinct text sizes on this surface. Hierarchy is flat.",
  "fixtures": { "pass": "../fixtures/hierarchy-pass.tsx", "fail": "../fixtures/hierarchy-fail.tsx" },
  "source": "impeccable@0.x/flat-type-hierarchy",
  "modified": true
}
```

`packages/packs/rules/craft/monotonous-spacing.json`:

```json
{
  "id": "monotonous-spacing",
  "kind": "aggregate",
  "scope": "surface",
  "severity": "info",
  "select": { "hasFact": "style.space.padding" },
  "collect": "style.space.padding.top",
  "assert": { "gte": ["distinct(collected)", 2] },
  "minSample": 6,
  "message": "Every element uses the same padding. Spacing carries no rhythm.",
  "fixtures": { "pass": "../fixtures/spacing-pass.tsx", "fail": "../fixtures/spacing-fail.tsx" },
  "source": "impeccable@0.x/monotonous-spacing",
  "modified": true
}
```

`packages/packs/rules/craft/nested-card.json`:

```json
{
  "id": "nested-card",
  "kind": "node",
  "severity": "warn",
  "select": { "hasFact": "style.shape.radius" },
  "predicate": "nested-card",
  "message": "A bordered, rounded container sits directly inside another one.",
  "fixtures": { "pass": "../fixtures/nested-pass.tsx", "fail": "../fixtures/nested-fail.tsx" },
  "source": "impeccable@0.x/nested-cards",
  "modified": true
}
```

`packages/packs/rules/predicates/nested-card.mjs`:

```js
/**
 * A card inside a card. Both the node and its parent must have a known radius
 * AND a known border width, so a rounded button inside a card does not trip it.
 */
export default function nestedCard(node, ctx) {
  const parent = ctx.doc.nodes.find(n => n.id === node.parent)
  if (!parent) return null

  const isCard = n =>
    n.style.shape.radius.state === 'known' &&
    n.style.shape.borderWidth.state === 'known'

  if (!isCard(node) || !isCard(parent)) return null

  return {
    rule: 'nested-card',
    sev: 'warn',
    file: ctx.doc.file,
    line: node.loc.line,
    msg: 'A bordered, rounded container sits directly inside another one.',
    fix: 'Remove the inner border, or flatten one level of nesting.'
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/packs/tests/rules.test.ts`
Expected: PASS — 5 tests

If a rule fails its own pass fixture, fix the rule or the fixture — never weaken the test.

- [ ] **Step 6: Commit**

```bash
git add packages/packs
git commit -m "feat(packs): add scale, consistency, a11y, and craft rules with fixtures"
```

---

### Task 11: MCP server with system_status, verify, and explain

**Files:**
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`
- Create: `packages/server/src/context.ts`
- Create: `packages/server/src/tools/{system-status,verify,explain}.ts`
- Create: `packages/server/src/index.ts`
- Test: `packages/server/tests/tools.test.ts`

**Interfaces:**
- Consumes: `deriveLock`/`checkStale` (Task 9), `loadPack` (Task 5), `runRules` (Task 6), `extractReact` (Task 8)
- Produces:
  - `PACKS_DIR: string`, `getPack()`, `safeJoin(root, p)`
  - `systemStatus(dir: string): Promise<StatusResult>`
  - `verify(dir: string, paths: string[]): Promise<VerifyResult>`
  - `explain(id: string, lastRun: VerifyResult | null): Promise<ExplainResult>`

- [ ] **Step 1: Write the failing test**

`packages/server/tests/tools.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { systemStatus } from '../src/tools/system-status.js'
import { verify } from '../src/tools/verify.js'
import { explain } from '../src/tools/explain.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'proj-'))
  await writeFile(join(dir, 'tailwind.config.mjs'), `export default {
    theme: { extend: {
      spacing: { 1: '4px', 2: '8px', 4: '16px', 6: '24px' },
      fontSize: { sm: '14px', base: '16px', xl: '24px' },
      colors: { gray: { 400: '#9ca3af', 900: '#111827' }, white: '#ffffff' }
    } }
  }`)
  await mkdir(join(dir, 'src'), { recursive: true })
})

describe('system_status', () => {
  it('reports a derived lock as fresh', async () => {
    const s = await systemStatus(dir)
    expect(s.hasLock).toBe(true)
    expect(s.stale).toBe(false)
    expect(s.space).toEqual([4, 8, 16, 24])
  })

  it('reports no lock on an empty project', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'empty-'))
    const s = await systemStatus(empty)
    expect(s.hasLock).toBe(false)
    expect(s.degraded.some(d => d.code === 'NO_DESIGN_SOURCE')).toBe(true)
  })

  it('picks up new values after the config changes', async () => {
    await systemStatus(dir)
    await writeFile(join(dir, 'tailwind.config.mjs'),
      `export default { theme: { extend: { spacing: { 1: '5px' } } } }`)
    const s = await systemStatus(dir)
    expect(s.space).toEqual([5])
  })
})

describe('verify', () => {
  it('finds an off-scale padding violation', async () => {
    await writeFile(join(dir, 'src/Bad.tsx'),
      'export default () => <div className="p-[13px]">x</div>')
    const r = await verify(dir, ['src/Bad.tsx'])
    expect(r.findings.map(f => f.rule)).toContain('space-off-scale')
  })

  it('finds nothing in compliant code', async () => {
    await writeFile(join(dir, 'src/Good.tsx'),
      'export default () => <div className="p-4">x</div>')
    expect((await verify(dir, ['src/Good.tsx'])).findings).toEqual([])
  })

  it('reports a parse failure as degraded and keeps going', async () => {
    await writeFile(join(dir, 'src/Broken.tsx'), 'export default () => <div')
    await writeFile(join(dir, 'src/Good.tsx'),
      'export default () => <div className="p-4">x</div>')
    const r = await verify(dir, ['src/Broken.tsx', 'src/Good.tsx'])
    expect(r.degraded.some(d => d.code === 'PARSE_FAILED')).toBe(true)
    expect(r.findings).toEqual([])
  })

  it('refuses a path outside the project root', async () => {
    await expect(verify(dir, ['../../etc/passwd'])).rejects.toThrow(/outside/i)
  })

  it('reports coverage including skipped nodes', async () => {
    await writeFile(join(dir, 'src/Dyn.tsx'),
      'export default ({t}: {t: string}) => <div className={`p-4 ${t}`}>x</div>')
    expect((await verify(dir, ['src/Dyn.tsx'])).coverage.skipped).toBeGreaterThan(0)
  })

  it('skips a non-React file with a clear degraded entry', async () => {
    await writeFile(join(dir, 'src/style.css'), '.a { padding: 13px }')
    const r = await verify(dir, ['src/style.css'])
    expect(r.degraded.some(d => d.code === 'UNSUPPORTED_FRAMEWORK')).toBe(true)
  })
})

describe('explain', () => {
  it('expands a finding from the last run', async () => {
    await writeFile(join(dir, 'src/Bad.tsx'),
      'export default () => <div className="p-[13px]">x</div>')
    const run = await verify(dir, ['src/Bad.tsx'])
    const e = await explain(run.findings[0]!.id, run)
    expect(e.found).toBe(true)
    expect(e.rule).toBe('space-off-scale')
    expect(e.severity).toBe('error')
  })

  it('returns a not-found result for an unknown id rather than throwing', async () => {
    expect((await explain('f999', null)).found).toBe(false)
  })
})
```

- [ ] **Step 2: Create the package and run the test to verify it fails**

`packages/server/package.json`:

```json
{
  "name": "@fe-design/server",
  "version": "0.1.0",
  "type": "module",
  "bin": { "fe-design-mcp": "./src/index.ts" },
  "dependencies": {
    "@fe-design/kernel": "workspace:*",
    "@fe-design/extractor-react": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  }
}
```

`packages/server/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "tests"] }
```

Run: `pnpm install && pnpm vitest run packages/server/tests/tools.test.ts`
Expected: FAIL — cannot find module `system-status.js`

- [ ] **Step 3: Write the shared context**

`packages/server/src/context.ts`:

```ts
import { readdir } from 'node:fs/promises'
import { join, resolve, relative, isAbsolute, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPack } from '@fe-design/kernel/engine/pack-loader.js'
import type { RuleDef, Degraded } from '@fe-design/kernel/engine/rule-types.js'
import type { PredicateFn } from '@fe-design/kernel/engine/runner.js'

const HERE = dirname(fileURLToPath(import.meta.url))
export const PACKS_DIR = resolve(HERE, '../../packs/rules')

type Pack = {
  rules: RuleDef[]
  degraded: Degraded[]
  predicates: Record<string, PredicateFn>
}

let cache: Pack | null = null

export const getPack = async (): Promise<Pack> => {
  if (cache) return cache
  const { rules, degraded } = await loadPack(PACKS_DIR)
  const predicates: Record<string, PredicateFn> = {}
  try {
    const pdir = join(PACKS_DIR, 'predicates')
    for (const f of await readdir(pdir)) {
      if (!f.endsWith('.mjs')) continue
      const mod = await import(join(pdir, f)) as { default: PredicateFn }
      predicates[f.replace(/\.mjs$/, '')] = mod.default
    }
  } catch { /* no predicates directory is fine */ }
  cache = { rules, degraded, predicates }
  return cache
}

/** Throws on path escape. One of the three hard errors in the spec. */
export const safeJoin = (root: string, p: string): string => {
  const abs = isAbsolute(p) ? p : resolve(root, p)
  const rel = relative(resolve(root), abs)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path "${p}" is outside the project root.`)
  }
  return abs
}
```

- [ ] **Step 4: Write the three tools**

`packages/server/src/tools/system-status.ts`:

```ts
import { deriveLock } from '@fe-design/kernel/lock/derive.js'
import { checkStale } from '@fe-design/kernel/lock/staleness.js'
import type { Degraded } from '@fe-design/kernel/engine/rule-types.js'

export type StatusResult = {
  hasLock: boolean
  stale: boolean
  changed: string[]
  space: number[]
  typeSteps: number[]
  palette: string[]
  components: string[]
  degraded: Degraded[]
}

export const systemStatus = async (dir: string): Promise<StatusResult> => {
  const { lock, degraded } = await deriveLock(dir)
  if (!lock) {
    return {
      hasLock: false, stale: false, changed: [], space: [],
      typeSteps: [], palette: [], components: [], degraded
    }
  }
  const { stale, changed } = await checkStale(lock, dir)
  return {
    hasLock: true,
    stale,
    changed,
    space: lock.derived.space,
    typeSteps: lock.derived.type.steps,
    palette: Object.keys(lock.derived.color),
    components: Object.keys(lock.derived.components),
    degraded
  }
}
```

`packages/server/src/tools/verify.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { relative } from 'node:path'
import { deriveLock } from '@fe-design/kernel/lock/derive.js'
import { runRules } from '@fe-design/kernel/engine/runner.js'
import { extractReact } from '@fe-design/extractor-react'
import type { IRDoc } from '@fe-design/kernel/ir/types.js'
import type { VerifyResult, Degraded } from '@fe-design/kernel/engine/rule-types.js'
import { getPack, safeJoin } from '../context.js'

const MAX_BYTES = 2 * 1024 * 1024

export const verify = async (
  dir: string, paths: string[]
): Promise<VerifyResult> => {
  // safeJoin throws on escape — a hard error, deliberately not degraded.
  const abs = paths.map(p => safeJoin(dir, p))

  const degraded: Degraded[] = []
  const docs: IRDoc[] = []

  const { lock, degraded: lockDegraded } = await deriveLock(dir)
  degraded.push(...lockDegraded)

  const { rules, degraded: packDegraded, predicates } = await getPack()
  degraded.push(...packDegraded)

  for (const file of abs) {
    const rel = relative(dir, file)

    let src: string
    try {
      src = await readFile(file, 'utf8')
    } catch (err) {
      degraded.push({
        code: 'READ_FAILED', path: rel,
        detail: (err as Error).message, impact: '1 file not analyzed'
      })
      continue
    }

    if (Buffer.byteLength(src) > MAX_BYTES) {
      degraded.push({
        code: 'FILE_TOO_LARGE', path: rel,
        detail: 'Larger than 2MB; treated as a bundle, not source.',
        impact: '1 file not analyzed'
      })
      continue
    }

    if (!/\.(tsx|jsx)$/.test(file)) {
      degraded.push({
        code: 'UNSUPPORTED_FRAMEWORK', path: rel,
        detail: 'Phase 1 analyzes .tsx and .jsx only.',
        impact: '1 file not analyzed'
      })
      continue
    }

    try {
      docs.push(extractReact(src, rel))
    } catch (err) {
      degraded.push({
        code: 'PARSE_FAILED', path: rel,
        detail: (err as Error).message, impact: '1 file not analyzed'
      })
    }
  }

  const result = runRules(docs, rules, lock ?? { derived: {} }, predicates)
  return { ...result, degraded: [...degraded, ...result.degraded] }
}
```

`packages/server/src/tools/explain.ts`:

```ts
import { getPack } from '../context.js'
import type { VerifyResult, Severity } from '@fe-design/kernel/engine/rule-types.js'

export type ExplainResult = {
  found: boolean
  rule?: string
  severity?: Severity
  detail: string
  fix?: string
  source?: string
}

export const explain = async (
  id: string, lastRun: VerifyResult | null
): Promise<ExplainResult> => {
  const finding = lastRun?.findings.find(f => f.id === id || f.rule === id)
  const { rules } = await getPack()
  const rule = rules.find(r => r.id === (finding?.rule ?? id))

  if (!rule) {
    return { found: false, detail: `No finding or rule matches "${id}".` }
  }

  return {
    found: true,
    rule: rule.id,
    severity: rule.severity,
    detail: [
      rule.message,
      `Kind: ${rule.kind}${rule.scope ? ` (scope: ${rule.scope})` : ''}`,
      rule.source ? `Adapted from: ${rule.source}` : null
    ].filter(Boolean).join('\n'),
    ...(rule.fix ? { fix: rule.fix } : {}),
    ...(rule.source ? { source: rule.source } : {})
  }
}
```

- [ ] **Step 5: Run the tool tests to verify they pass**

Run: `pnpm vitest run packages/server/tests/tools.test.ts`
Expected: PASS — 11 tests

- [ ] **Step 6: Write the MCP entry point**

`packages/server/src/index.ts`:

```ts
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { systemStatus } from './tools/system-status.js'
import { verify } from './tools/verify.js'
import { explain } from './tools/explain.js'
import type { VerifyResult } from '@fe-design/kernel/engine/rule-types.js'

let lastRun: VerifyResult | null = null

const server = new McpServer({ name: 'fe-design', version: '0.1.0' })

const asText = (v: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }]
})

server.tool(
  'system_status',
  'Report this project design system: spacing scale, type scale, palette, component registry, and whether it is stale. Call before building or changing UI.',
  { dir: z.string().describe('Absolute path to the project root') },
  async ({ dir }) => asText(await systemStatus(dir))
)

server.tool(
  'verify',
  'Check frontend source files against the project design system. Returns findings with file and line, plus coverage showing what could not be analyzed statically. Read-only.',
  {
    dir: z.string().describe('Absolute path to the project root'),
    paths: z.array(z.string()).describe('Project-relative file paths to check')
  },
  async ({ dir, paths }) => {
    try {
      lastRun = await verify(dir, paths)
      return asText(lastRun)
    } catch (err) {
      // Only path escape reaches here; everything else degrades.
      return asText({ error: (err as Error).message })
    }
  }
)

server.tool(
  'explain',
  'Expand one finding id or rule id from the most recent verify run into its full rationale, fix guidance, and provenance.',
  { id: z.string().describe('A finding id such as "f7", or a rule id') },
  async ({ id }) => asText(await explain(id, lastRun))
)

await server.connect(new StdioServerTransport())
```

- [ ] **Step 7: Run the full suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all tests PASS, typecheck clean

- [ ] **Step 8: Commit**

```bash
git add packages/server
git commit -m "feat(server): expose system_status, verify, and explain over MCP"
```

---

### Task 12: Attribution files and the companion skill

**Files:**
- Create: `LICENSES/Apache-2.0.txt`, `LICENSES/MIT.txt`
- Create: `NOTICE`, `ATTRIBUTION.md`
- Create: `skill/SKILL.md`
- Test: `packages/packs/tests/provenance.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: license compliance artifacts and a harness-agnostic activation skill

- [ ] **Step 1: Write the failing test**

`packages/packs/tests/provenance.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFile, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..', '..')

describe('attribution', () => {
  it('ships both license texts', async () => {
    await expect(access(join(ROOT, 'LICENSES/Apache-2.0.txt'))).resolves.toBeUndefined()
    await expect(access(join(ROOT, 'LICENSES/MIT.txt'))).resolves.toBeUndefined()
  })

  it('NOTICE names impeccable and states modification', async () => {
    const n = await readFile(join(ROOT, 'NOTICE'), 'utf8')
    expect(n).toMatch(/impeccable/i)
    expect(n).toMatch(/modif/i)
  })

  it('NOTICE disclaims trademark use', async () => {
    const n = await readFile(join(ROOT, 'NOTICE'), 'utf8')
    expect(n).toMatch(/trademark/i)
  })

  it('the companion skill tells the agent to call system_status and verify', async () => {
    const s = await readFile(join(ROOT, 'skill/SKILL.md'), 'utf8')
    expect(s).toContain('system_status')
    expect(s).toContain('verify')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/packs/tests/provenance.test.ts`
Expected: FAIL — `LICENSES/Apache-2.0.txt` does not exist

- [ ] **Step 3: Add the license texts**

Run:

```bash
mkdir -p LICENSES
curl -sSL https://www.apache.org/licenses/LICENSE-2.0.txt -o LICENSES/Apache-2.0.txt
```

Write `LICENSES/MIT.txt`:

```
MIT License

Copyright (c) nextlevelbuilder — ui-ux-pro-max-skill
Copyright (c) kylezantos — design-motion-principles

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: Write NOTICE and ATTRIBUTION.md**

`NOTICE`:

```
fe-design-mcp
Copyright 2026 the fe-design-mcp authors

This product includes software developed as part of Impeccable
(https://github.com/pbakaus/impeccable), licensed under the Apache License,
Version 2.0. See LICENSES/Apache-2.0.txt.

Files derived from Impeccable have been modified. Detection heuristics and
thresholds were re-expressed as declarative rule definitions evaluated against
an intermediate representation, replacing the original regular-expression
implementation. Per-rule provenance is recorded in the "source" and "modified"
fields of the rule JSON under packages/packs/rules/.

Apache License 2.0 Section 6 grants no trademark rights. This project is not
affiliated with, endorsed by, or branded as Impeccable.

This product also includes data and guidance derived from:
  - ui-ux-pro-max-skill (https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), MIT
  - design-motion-principles (https://github.com/kylezantos/design-motion-principles), MIT
See LICENSES/MIT.txt.
```

`ATTRIBUTION.md`:

```markdown
# Attribution

Per-pack provenance. Rule-level provenance lives in the `source` and `modified`
fields of each rule JSON under `packages/packs/rules/`.

| Ours | Upstream | License | What changed |
|---|---|---|---|
| `rules/scale/space-off-scale.json` | impeccable `cramped-padding` | Apache-2.0 | Regex detection replaced by an IR assertion against the project scale |
| `rules/a11y/tiny-text.json` | impeccable `tiny-text` | Apache-2.0 | Threshold kept; detection re-expressed as an IR assertion |
| `rules/craft/nested-card.json` | impeccable `nested-cards` | Apache-2.0 | Rewritten as a predicate over IR parent links |
| `rules/craft/monotonous-spacing.json` | impeccable `monotonous-spacing` | Apache-2.0 | Rewritten as an aggregate rule with a minimum sample size |
| `rules/craft/flat-type-hierarchy.json` | impeccable `flat-type-hierarchy` | Apache-2.0 | Rewritten as a surface-scoped aggregate rule |

## Deliberately not carried over

The three designer names from design-motion-principles are omitted. That project
states its subjects neither authored nor endorsed it; carrying the names into a
different product would imply an endorsement that does not exist. The motion
principles themselves are retained, expressed through the `motion` field of
design systems in Phase 2.
```

- [ ] **Step 5: Write the companion skill**

`skill/SKILL.md`:

```markdown
---
name: fe-design
description: Use when building, reviewing, or changing frontend UI — pages, components, layouts, styling, or design systems. Connects UI work to this project's own design system so pages stay consistent and production-grade.
---

# Frontend design

This project has an `fe-design` MCP server holding its design system. Use it.

## Before writing any UI

Call `system_status` with the project root.

- `hasLock: false` — the project has no design system yet. Say so and stop.
  Do not invent colors, fonts, or spacing.
- `stale: true` — the config changed since the lock was derived. The values
  returned are already refreshed; use them as-is.
- Treat `space`, `typeSteps`, and `palette` as hard constraints.
- If `components` already lists something that does the job, use it rather than
  writing a new one.

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

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run packages/packs/tests/provenance.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 7: Commit**

```bash
git add LICENSES NOTICE ATTRIBUTION.md skill packages/packs/tests/provenance.test.ts
git commit -m "docs: add license, attribution, and companion activation skill"
```

---

### Task 13: End-to-end smoke test on a realistic project

**Files:**
- Create: `packages/server/tests/fixtures/project/tailwind.config.mjs`
- Create: `packages/server/tests/fixtures/project/src/ui/Button.tsx`
- Create: `packages/server/tests/fixtures/project/src/app/settings/page.tsx`
- Test: `packages/server/tests/e2e.test.ts`

**Interfaces:**
- Consumes: everything
- Produces: nothing new — this task proves the assembled system works

- [ ] **Step 1: Write the fixture project**

`packages/server/tests/fixtures/project/tailwind.config.mjs`:

```js
export default {
  theme: {
    extend: {
      spacing: { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 6: '24px', 8: '32px' },
      fontSize: { sm: '14px', base: '16px', xl: '20px', '3xl': '30px' },
      colors: {
        white: '#ffffff',
        gray: { 400: '#9ca3af', 900: '#111827' },
        primary: { 500: '#1F4B3F' }
      },
      borderRadius: { sm: '2px', md: '6px', xl: '12px' }
    }
  }
}
```

`packages/server/tests/fixtures/project/src/ui/Button.tsx`:

```tsx
const variants = { primary: 'bg-primary-500', ghost: 'bg-white' }
export const Button = () => null
```

`packages/server/tests/fixtures/project/src/app/settings/page.tsx`:

```tsx
export default function Settings() {
  return (
    <section className="bg-white p-6">
      <h1 className="text-[31px]">Settings</h1>
      <p className="text-gray-400">Manage your account</p>
      <div className="rounded-xl border p-4">
        <div className="rounded-xl border p-4">nested</div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Write the test**

`packages/server/tests/e2e.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { systemStatus } from '../src/tools/system-status.js'
import { verify } from '../src/tools/verify.js'

const PROJECT = join(import.meta.dirname, 'fixtures', 'project')

describe('end to end', () => {
  it('derives the system from the fixture project', async () => {
    const s = await systemStatus(PROJECT)
    expect(s.hasLock).toBe(true)
    expect(s.space).toEqual([4, 8, 12, 16, 24, 32])
    expect(s.typeSteps).toEqual([14, 16, 20, 30])
    expect(s.components).toContain('Button')
  })

  it('finds the seeded violations on the settings page', async () => {
    const r = await verify(PROJECT, ['src/app/settings/page.tsx'])
    const ids = r.findings.map(f => f.rule)
    expect(ids).toContain('type-off-scale')  // text-[31px]
    expect(ids).toContain('text-contrast')   // gray-400 on white is 2.8:1
    expect(ids).toContain('nested-card')     // card inside card
  })

  it('attaches the surface id to aggregate findings', async () => {
    const r = await verify(PROJECT, ['src/app/settings/page.tsx'])
    const agg = r.findings.find(f => f.surface !== undefined)
    if (agg) expect(agg.surface).toBe('settings')
  })

  it('reports no degradation on a clean file', async () => {
    const r = await verify(PROJECT, ['src/ui/Button.tsx'])
    expect(r.degraded).toEqual([])
  })
})
```

- [ ] **Step 3: Run the test**

Run: `pnpm vitest run packages/server/tests/e2e.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 4: Run the entire suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS, typecheck clean

- [ ] **Step 5: Commit**

```bash
git add packages/server/tests
git commit -m "test: add end-to-end smoke test over a realistic project"
```

---

## Definition of done for Phase 1

- [ ] `pnpm test` passes with zero failures
- [ ] `pnpm typecheck` is clean under `strict` and `exactOptionalPropertyTypes`
- [ ] Every rule fires on its fail fixture and stays silent on its pass fixture
- [ ] No rule produces a finding on `all-unknown.tsx`
- [ ] `verify` never throws except on path escape
- [ ] `NOTICE` and `ATTRIBUTION.md` exist and the provenance test passes
- [ ] The MCP server starts and responds to all three tools over stdio

## Deferred to later phases

| Phase | Contents |
|---|---|
| 2 | Curated design systems, OKLCH ramp generation, contrast solving, dark mode derivation, `system_bootstrap` |
| 3 | `surface_brief`, state-completeness rules over `DataSource` and `Branch`, `guide` and its 13 playbooks |
| 4 | Vue / Svelte / HTML extractors, cross-framework equivalence suite, browser `inspect`, `critique` HTML report |

`Branch` and `DataSource` are defined in Task 3 but unused in Phase 1. They are
deliberately present so Phase 3 does not require an IR migration.

`resolveSurface` accepts an `overrides` map that nothing populates in Phase 1. Phase 3
wires it to project config. The signature is fixed now so callers do not change later.

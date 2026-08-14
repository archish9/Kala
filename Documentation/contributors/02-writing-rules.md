# Writing rules

How to add a check, what the four rule kinds are for, and the one contract every rule must
honour.

The current rules are listed in [What kala checks](../users/08-what-kala-checks.md),
generated from the pack JSON — do not maintain a second copy of that list here.

- [Two kinds of check](#two-kinds-of-check)
- [The unknown contract](#the-unknown-contract)
- [The four rule kinds](#the-four-rule-kinds)
- [Rule anatomy](#rule-anatomy)
- [The expression language](#the-expression-language)
- [Add a rule](#add-a-rule)
- [Add a rule that needs code](#add-a-rule-that-needs-code)
- [Add a rendered check](#add-a-rendered-check)
- [Provenance requirements](#provenance-requirements)

---

## Two kinds of check

They work differently and are written differently:

| | Source rules | Rendered checks |
|---|---|---|
| Run by | `verify` | `inspect` |
| Defined as | JSON in `packs/rules/` | TypeScript in `packages/browser/src/checks/` |
| Need | nothing | a running page and Chromium |
| Fixtures | two, enforced at load | unit tests over fact objects |

Reach for a rendered check only when the question genuinely needs a render. If source
analysis can answer it, write a source rule — cheaper, no browser, runs on every `verify`.

---

## The unknown contract

**No rule fires on a fact it could not resolve.** This is enforced in the evaluator, so a
rule author cannot opt out of it.

```tsx
<div className={cn('p-4', tone)}>   →  padding unknown  →  no finding, coverage.skipped++
```

Cases that produce `unknown`:

| Situation | Why |
|---|---|
| `className={expr}` / `:class` / `class={expr}` | Runtime value |
| `cn()` / `clsx()` calls | Not statically resolvable |
| CSS via `.sidebar .card` | No ancestor context in a single file |
| CSS gated on `:hover` | Depends on runtime state |
| `padding: var(--x)` | Not statically resolvable |

Every response reports this honestly rather than hiding it:

```json
"coverage": { "analyzed": 61, "skipped": 9, "reason": "facts that could not be resolved statically" }
```

A high `skipped` count is not a failure. It means the tool declined to guess. This trade is
argued in full in [Design rationale](05-design-rationale.md#never-guessing).

---

## The four rule kinds

Each kind exists because it asks a question the others cannot.

### `node` — assert about one element

```jsonc
{
  "kind": "node",
  "select": { "hasFact": "style.space.padding" },
  "assert": { "allIn": ["self.style.space.padding", "$lock.derived.space"] }
}
```

### `relation` — assert about an element and an ancestor

```jsonc
{
  "kind": "relation",
  "select":  { "hasFact": "style.color.fg" },
  "against": { "nearestAncestor": { "hasFact": "style.color.bg" } },
  "assert":  { "gte": ["contrast(self.style.color.fg, other.style.color.bg)", 4.5] }
}
```

`nearestAncestor` resolves through nesting. If no ancestor has a known background, the fact
is `unknown` and the rule **does not fire**.

### `aggregate` — assert about a whole file or surface

Catches what is invisible per-node and obvious in aggregate:

```jsonc
{
  "kind": "aggregate",
  "scope": "surface",
  "collect": "style.type.size",
  "assert": { "gte": ["distinct(collected)", 3] },
  "minSample": 8
}
```

`minSample` stops it firing on a three-element stub.

### `document` — assert about a whole file

State completeness needs the data-source list and the branch list **together**. Every other
kind selects nodes first, so none of them can ask "does this query have an error path?"

```jsonc
{ "kind": "document", "predicate": "missing-error-state" }
```

Document rules return an array, because one file can have three queries each missing a
different state.

### How branch meaning is inferred

The state rules depend on the `Branch` and `DataSource` information the extractor infers:

```tsx
if (isLoading) return <Spinner/>       → loading
if (error) return <Err/>               → error
{items.length === 0 && <Empty/>}       → empty
{!data?.length && <Empty/>}            → empty
if (!canEdit) return <ReadOnly/>       → permission
{ok ? <A/> : <B/>}                     → null (unclassifiable)
```

Inference is deliberately narrow. A pattern like `/\bcan\w*\b/` would classify `cancel` as a
permission branch — a false positive in nearly every form — so the real pattern requires
`can[A-Z]`.

**Known limit:** branch-to-source linking is file-scoped, so every branch counts as
downstream of every source in the file. Narrower analysis would need cross-statement
tracking the IR deliberately excludes. This can miss a finding in a file with several
independent queries; it cannot invent one.

---

## Rule anatomy

A rule is a JSON file in `packages/packs/rules/<category>/`:

```jsonc
{
  "id": "space-off-scale",
  "kind": "node",
  "severity": "error",
  "select": { "hasFact": "style.space.padding" },
  "assert": { "allIn": ["self.style.space.padding", "$lock.derived.space"] },
  "message": "Padding {value} is not on the project spacing scale.",
  "fix": "Use the nearest value from derived.space in design.lock.json.",
  "fixtures": {
    "pass": "../fixtures/space-pass.tsx",
    "fail": "../fixtures/space-fail.tsx"
  },
  "source": "impeccable@0.x/cramped-padding",
  "modified": true
}
```

**A rule without both fixtures does not load.** The gate is at pack-load time, not in CI, so
an untested rule cannot ship.

Fixture paths are relative to the **rule file**. The loader resolves them to absolute paths
so consumers do not need to know the convention.

### Choosing a kind

| Question the rule asks | Kind |
|---|---|
| About one element | `node` |
| About an element and an ancestor | `relation` |
| About a whole file or surface in aggregate | `aggregate` |
| About the file's data sources and branches | `document` |

---

## The expression language

Deliberately small — no user functions, no loops, no recursion:

```
builtins:  contrast()  distinct()  count()  nearest()  ratio()
           median()  stddev()  has()  matches()
refs:      self.*   other.*   collected   $lock.*   $surface.*
operators: eq  gte  lte  in  allIn  anyIn  not  and  or
```

`and` and `or` evaluate every branch rather than short-circuiting, because short-circuiting
past an `unknown` would hide it.

If more than roughly 15% of rules need the code escape hatch, the language is wrong and
should be revisited rather than bypassed.

---

## Add a rule

One JSON file and two fixtures. No code.

### 1. Write the fixtures

`packages/packs/rules/fixtures/leading-pass.tsx`:

```tsx
export default () => <p className="leading-relaxed">ok</p>
```

`packages/packs/rules/fixtures/leading-fail.tsx`:

```tsx
export default () => <p className="leading-[1.1]">too tight</p>
```

### 2. Write the rule

`packages/packs/rules/craft/tight-leading.json`:

```jsonc
{
  "id": "tight-leading",
  "kind": "node",
  "severity": "warn",
  "select": { "hasFact": "style.type.leading" },
  "assert": { "gte": ["self.style.type.leading.px", 20] },
  "message": "Line height {value} is tight for body text.",
  "fix": "Give body text at least 1.5 line height.",
  "fixtures": {
    "pass": "../fixtures/leading-pass.tsx",
    "fail": "../fixtures/leading-fail.tsx"
  }
}
```

### 3. Run the gate

```bash
pnpm vitest run packages/packs/tests/rules.test.ts
```

The gate enforces four things automatically: the rule loads, it fires on its fail fixture,
it stays silent on its pass fixture, and it produces nothing on `all-unknown.tsx`.

### 4. Regenerate the documentation

The rule list in [What kala checks](../users/08-what-kala-checks.md) is generated:

```bash
node scripts/build-docs.mjs
pnpm vitest run packages/packs/tests/docs-sync.test.ts
```

---

## Add a rule that needs code

Some rules cannot be expressed declaratively. Those get a predicate module.

`packages/packs/rules/predicates/my-rule.mjs`:

```js
export default function myRule(node, ctx) {
  const parent = ctx.doc.nodes.find(n => n.id === node.parent)
  if (!parent) return null

  // Return null when it does not apply, or one finding when it does.
  return {
    rule: 'my-rule',
    sev: 'warn',
    file: ctx.doc.file,
    line: node.loc.line,
    msg: 'What is wrong.',
    fix: 'What to do about it.'
  }
}
```

Reference it from the rule JSON with `"predicate": "my-rule"` and no `assert`.

**A document predicate returns an array instead**, because one file can have several
independent problems:

```js
export default function missingErrorState(doc) {
  return doc.dataSources
    .filter(src => !src.branches.some(id =>
      (doc.branches ?? []).find(b => b.id === id)?.semantic === 'error'))
    .map(src => ({ rule: 'missing-error-state', sev: 'error', file: doc.file, line: 1,
                   msg: `${src.kind} has no error branch.` }))
}
```

**The `unknown` contract still applies.** Check `fact.state === 'known'` before using a
value. A predicate that reads `.value` off an unknown fact is inventing findings, which the
`all-unknown.tsx` fixture will catch.

---

## Add a rendered check

Rendered checks run inside `inspect` against a real page. They are **not** pack rules: no
JSON, no fixtures, just a pure function over collected browser facts.

### 1. Write the check

`packages/browser/src/checks/my-check.ts`:

```ts
import type { PageFacts } from '../facts.js'
import type { BrowserFinding } from './contrast.js'

export const checkMyThing = (facts: PageFacts): BrowserFinding[] => {
  const viewport = `${facts.viewport.width}x${facts.viewport.height}`
  const out: BrowserFinding[] = []

  for (const node of facts.nodes) {
    if (!node.someCondition) continue

    out.push({
      rule: 'my-check',
      sev: 'warn',
      selector: node.selector,
      viewport,
      msg: `${node.selector} does the wrong thing.`,
      fix: 'What to do about it.'
    })
  }

  return out
}
```

Every finding carries its `viewport`, because the same page can pass at 1440px and fail at
375px.

### 2. Collect any fact it needs

If `PageFacts` does not already carry what you need, extend `BrowserNode` in
`packages/browser/src/facts.ts` and gather it in `COLLECT_SCRIPT` in `collect.ts`.

That script runs **inside the page** and is serialised across the process boundary, so it
must be entirely self-contained — no imports, no closure over anything outside itself.

### 3. Register it

In `packages/browser/src/inspect.ts`:

```ts
import { checkMyThing } from './checks/my-check.js'

export const runChecks = (facts: PageFacts): BrowserFinding[] => {
  const all = [
    ...checkContrast(facts),
    ...checkOverflow(facts),
    ...checkTargets(facts),
    ...checkMyThing(facts)
  ]
  return all.sort((a, b) => SEVERITY_RANK[a.sev] - SEVERITY_RANK[b.sev])
}
```

### 4. Test it without a browser

This is why the checks are pure. Build fact objects directly:

```ts
import { describe, it, expect } from 'vitest'
import { checkMyThing } from '../../src/checks/my-check.js'
import type { BrowserNode, PageFacts } from '../../src/facts.js'

const node = (over: Partial<BrowserNode>): BrowserNode => ({
  id: 'b0', tag: 'p', selector: 'p', text: 'hi',
  color: 'rgb(17,24,39)', bg: 'rgb(255,255,255)', bgResolved: true,
  fontSize: 16, fontWeight: 400,
  rect: { x: 0, y: 0, w: 100, h: 20 }, interactive: false,
  ...over
})

const facts = (nodes: BrowserNode[]): PageFacts => ({
  viewport: { width: 375, height: 812 }, scrollWidth: 375, nodes
})

describe('checkMyThing', () => {
  it('reports nothing when the page is fine', () => {
    expect(checkMyThing(facts([node({})]))).toEqual([])
  })

  it('reports the problem when present', () => {
    expect(checkMyThing(facts([node({ /* the bad case */ })]))).toHaveLength(1)
  })
})
```

Add a case to `packages/browser/tests/smoke.test.ts` only if the check needs a real render
to exercise.

### 5. Group it in reviews

Add the rule id to `SECTION_FOR` in `packages/report/src/critique.ts`:

```ts
export const SECTION_FOR: Record<string, string> = {
  …,
  'my-check': 'Craft'
}
```

Skipping this is not fatal — an unrecognised rule lands in an `Other` section rather than
vanishing — but naming it puts the finding where a reader expects it.

Then document it by hand in
[What kala checks § rendered checks](../users/08-what-kala-checks.md#rendered-checks-3);
that table is hand-written, not generated, because rendered checks have no JSON to read.

### Two rules to honour

**Never invent a value.** If the fact needed to judge is missing, report that it could not be
judged, as `contrast-unresolved` does. Guessing produces false findings, which is the one
failure mode that makes people stop trusting the tool.

**Exempt what would be noise.** `checkTargets` skips zero-sized elements because those are
hidden rather than small, and only applies below 1024px. `checkContrast` relaxes its target
for large text. An exemption you can justify in one sentence is worth more than a finding
nobody acts on.

---

## Provenance requirements

Five rules adapt heuristics and thresholds from
[impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0). The detection logic was
re-expressed as declarative assertions over the IR, replacing the original regular
expressions.

| Ours | Upstream |
|---|---|
| `space-off-scale` | `cramped-padding` |
| `tiny-text` | `tiny-text` |
| `nested-card` | `nested-cards` |
| `monotonous-spacing` | `monotonous-spacing` |
| `flat-type-hierarchy` | `flat-type-hierarchy` |

**Every rule carrying a `source` must also carry `modified: true`**, and a test enforces that
pairing. Full detail in [Provenance](07-provenance.md).

---

**Next:** [Extending](03-extending.md).

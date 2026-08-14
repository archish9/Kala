# Architecture

Why the system is shaped this way, and the three decisions everything else follows from.

- [The shape](#the-shape)
- [Decision 1: three-state facts](#decision-1-three-state-facts)
- [Decision 2: the lock file has two zones](#decision-2-the-lock-file-has-two-zones)
- [Decision 3: kernel plus data packs](#decision-3-kernel-plus-data-packs)
- [The IR](#the-ir)
- [Packages](#packages)
- [Dependency rules](#dependency-rules)
- [How a verify call flows](#how-a-verify-call-flows)
- [Build and resolution](#build-and-resolution)

---

## The shape

```
                 ┌──────────────┐
   MCP client ──▶│    server    │  8 tools, extension registry
                 └──────┬───────┘
       ┌────────────┬───┴────────┬────────────┬───────────┐
       ▼            ▼            ▼            ▼           ▼
 ┌───────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
 │extractors │ │ kernel  │ │  taste  │ │ browser │ │ report  │
 │4 adapters │ │IR, lock │ │systems, │ │ opt-in  │ │ review, │
 │ + core    │ │ engine  │ │ colour  │ │ render  │ │  html   │
 └───────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
                                 │
                           ┌─────────┐
                           │  packs  │  data: rules, systems,
                           └─────────┘        surfaces, guides
```

The kernel knows nothing about frameworks or about design. Extractors know their framework
and the IR, nothing else. Packs are pure data. The server wires them together.

---

## Decision 1: three-state facts

Every style fact is one of three things:

```ts
type Fact<T> =
  | { state: 'known';   value: T; origin: StyleOrigin }
  | { state: 'absent' }                          // provably not set
  | { state: 'unknown'; reason: UnknownReason }  // cannot determine
```

`absent` and `unknown` are **not** the same, and collapsing them is the mistake this
design exists to prevent.

```tsx
<div className="p-4">          →  padding is known: 16px
<div>                          →  padding is absent: provably unstyled
<div className={cn('p-4', x)}> →  padding is unknown: cannot resolve statically
```

**Rules never fire on `unknown`.** This is enforced in the expression evaluator, not in
rule files, so a rule author cannot opt out:

```
evaluate(expr):
  any operand resolves to state='unknown'
    → rule yields SKIPPED, never a finding
    → increment coverage.skipped
```

Every `verify` response reports coverage honestly:

```
14 findings · 61 nodes analyzed · 9 skipped (unresolvable class expressions)
```

The reason is practical. A linter that reports things that are not true gets muted within
a week, and a muted linter is worth nothing. Under-reporting is recoverable;
over-reporting destroys trust permanently.

The same discipline appears everywhere the system cannot see enough:

| Situation | Answer |
|---|---|
| `class={expr}` in any framework | `unknown` |
| `cn()` / `clsx()` call | `unknown` |
| CSS rule reached via `.sidebar .card` | `unknown` — no ancestor context in source |
| No opaque background behind an element | `contrast-unresolved` — reported, not guessed |
| CSS rule gated on `:hover` | `unknown` — depends on runtime state |
| `padding: var(--x)` | `unknown` — not statically resolvable |

---

## Decision 2: the lock file has two zones

`design.lock.json` is the project's design truth. It has two zones that behave differently:

```jsonc
{
  "version": 1,
  "sources": [ { "path": "tailwind.config.mjs", "hash": "sha256:…" } ],

  "derived": {          // regenerated from project config every time
    "space":  [0, 4, 8, 12, 16, 24, 32, 48, 64],
    "type":   { "steps": [12, 13, 16, 20, 25, 31, 39] },
    "color":  { "accent-500": "#8f6755", … },
    "components": { "Button": { "file": "src/ui/Button.tsx", "variants": ["primary","ghost"] } }
  },

  "intent": {           // authored; regeneration never touches it
    "system": "warm-utility",
    "hierarchy": { "headingJump": 2, "maxWeightsPerSurface": 3 },
    "banned": { "fonts": ["Inter", "Roboto"], "patterns": ["pure-gray-neutrals"] },
    "rationale": "…"
  }
}
```

**Why the split.** `derived` is a pure function of the project's own config, so it can be
regenerated at any moment with zero loss. `intent` holds what no config file can express —
which system, what is banned, why. Regeneration must never lose it.

**Staleness is a hash comparison**, not a judgement call:

```
verify() called
  → rehash each source path
  → any mismatch = stale
  → regenerate `derived` (safe: pure function)
  → read `intent` back from the committed lock, untouched
```

Because drift is computable, it is checked on every call. There is no `doctor` command and
no ceremony.

---

## Decision 3: kernel plus data packs

The value of this system scales with **rule count** and **system count**. So both must be
cheap to add.

- A rule is a JSON file plus two fixtures. No code review of a 5,000-line file.
- A design system is a JSON file. Taste can improve without shipping code.
- A framework is one extractor. Rules do not change at all.

Rules are declarative and run against the IR, which is why one rule works in four
frameworks:

```jsonc
{
  "id": "space-off-scale",
  "kind": "node",
  "severity": "error",
  "select": { "hasFact": "style.space.padding" },
  "assert": { "allIn": ["self.style.space.padding", "$lock.derived.space"] },
  "message": "Padding {value} is not on the project spacing scale.",
  "fixtures": { "pass": "../fixtures/space-pass.tsx", "fail": "../fixtures/space-fail.tsx" }
}
```

**A rule that lacks either fixture does not load.** The gate runs at pack-load time, not in
CI, so an untested rule cannot ship.

---

## The IR

Every framework flattens into one shape. This is what makes a rule portable.

```ts
type IRDoc = {
  file: string
  framework: 'react' | 'vue' | 'svelte' | 'html'
  nodes: IRNode[]           // flat, parent-linked
  imports: ImportRec[]
  dataSources: DataSource[] // fetch / useQuery / load
  branches?: Branch[]       // conditionals and loops, with inferred meaning
}

type IRNode = {
  id: string
  kind: 'element' | 'component' | 'text' | 'slot'
  name: string
  parent: string | null
  children: string[]
  style: StyleFacts
  text: string | null
  branch: string | null     // which conditional path renders this
  loc: { line: number; col: number }
}
```

`StyleFacts` normalises every styling mechanism into one vocabulary:

```ts
type StyleFacts = {
  space:  { padding: Fact<Box>; margin: Fact<Box>; gap: Fact<Len> }
  type:   { size: Fact<Len>; weight: Fact<number>; leading: Fact<Len>
            tracking: Fact<Len>; family: Fact<string> }
  color:  { fg: Fact<Color>; bg: Fact<Color>; border: Fact<Color> }
  shape:  { radius: Fact<Len>; borderWidth: Fact<Len>; shadow: Fact<ShadowSpec> }
  layout: { display: Fact<string>; direction: Fact<string>; align: Fact<string> }
  raw:    string[]
}
```

All four of these produce **identical** `space.padding = 16px`:

```
React     className="p-4"
Vue       class="p-4"
Svelte    class="p-4"
HTML      style="padding: 1rem"
```

That claim is not asserted in prose — it is a test suite. See
[Testing](04-testing.md#the-equivalence-suite).

### Branches and data sources

`Branch` records a conditional path and infers what it means:

```tsx
if (isLoading) return <Spinner/>          → semantic: 'loading'
{items.length === 0 && <Empty/>}          → semantic: 'empty'
if (error) return <Err/>                  → semantic: 'error'
{ok ? <A/> : <B/>}                        → semantic: null (unclassifiable)
```

Inference is deliberately narrow. A pattern like `/\bcan\w*\b/` would classify `cancel` as
a permission branch, which is a false positive in nearly every form — so the real pattern
requires `can[A-Z]`.

`DataSource` records anything that can fail or be slow (`fetch`, `useQuery`, `useSWR`,
`load`). Together they let a rule ask "does this query have an error path?" — a question no
node-level rule can express.

---

## Packages

| Package | Responsibility | Depends on |
|---|---|---|
| `@kala/kernel` | IR, facts, lock, rule engine, surface resolution | nothing |
| `@kala/extractor-core` | Tailwind resolver, CSS resolver, selector matching, layer merge | kernel |
| `@kala/extractor-react` | JSX → IR | kernel, core |
| `@kala/extractor-vue` | Vue SFC → IR | kernel, core |
| `@kala/extractor-svelte` | Svelte → IR | kernel, core |
| `@kala/extractor-html` | HTML → IR | kernel, core |
| `@kala/extractor-equivalence` | Proves the four agree (tests only) | all four |
| `@kala/taste` | Design systems, colour maths, emission, surfaces, guides | kernel, packs |
| `@kala/browser` | Rendered facts and checks. Playwright is an optional peer. | kernel, taste |
| `@kala/report` | Grouped reviews and the self-contained HTML report | kernel, browser |
| `@kala/packs` | Data: rules, systems, surfaces, guides | nothing |
| `@kala/server` | MCP tools and the extractor registry | all of the above |

---

## Dependency rules

Two rules keep this from rotting:

**1. Dependencies point inward.** `kernel` imports nothing from `extractors` or `packs`; it
receives them as inputs. This is why the extractor registry lives in `server` — the only
package that legitimately knows about all frameworks.

**2. `packs/` is data.** Rule JSON cannot import kernel internals. The only code permitted
in a pack is a `predicate` escape-hatch module, and those get the same `unknown` contract.

A consequence worth knowing: the equivalence suite lives in its own package rather than in
`extractor-core`, because core cannot reference the extractors that already reference it —
TypeScript project references cannot be circular.

---

## How a verify call flows

```
verify(dir, paths)
  │
  ├─ safeJoin() ────────── path escape → hard error (the only kind here)
  ├─ deriveLock(dir) ───── hash sources, regenerate derived, read intent back
  ├─ getPack() ─────────── load rules; a rule missing fixtures does not load
  │
  ├─ for each path:
  │    extractorFor(ext) → no extractor?  degraded, continue
  │    read file         → too large?     degraded, continue
  │    extract           → parse failure? degraded, continue
  │
  └─ runRules(docs, rules, lock, predicates)
       ├─ document rules   → once per file, sees dataSources + branches
       ├─ aggregate rules  → once per file or surface, over collected values
       ├─ relation rules   → node vs nearest matching ancestor
       └─ node rules       → per node
          any operand unknown → skipped, never a finding
```

Everything degrades. The response always has the same shape, and `degraded[]` explains what
was not analysed and why.

---

## The browser pass

`inspect` exists because one thing is structurally impossible in source analysis.
`getComputedStyle` returns `rgba(0, 0, 0, 0)` for an element with no background of its
own, so judging its contrast requires walking ancestors to the first opaque colour — which
needs a real render.

The package is shaped so almost none of it needs a browser to test:

```
launch.ts   → Playwright imported dynamically, here and nowhere else
collect.ts  → one page.evaluate() gathering every fact at once
checks/*.ts → pure functions over that data
inspect.ts  → orchestration across viewports
```

Because the checks are pure, 27 of the browser tests run with no browser at all. One smoke
test drives real Chromium and skips when it is absent.

Two properties follow from the dynamic import: the package imports successfully when
Playwright is missing, and `inspect` degrades to install instructions while every other
tool is unaffected.

**Nothing writes into your project.** Screenshots and HTML reports go to the OS temp
directory and their paths are returned, so `system_bootstrap` remains the only tool that
writes where you work.

---

## Build and resolution

The workspace resolves differently at test time and at runtime, on purpose:

| Context | `@kala/kernel` resolves to |
|---|---|
| Tests (vitest) | `packages/kernel/src/index.ts` — via alias, no build needed |
| Runtime (node) | `packages/kernel/dist/src/index.js` — via package exports |

This is why `pnpm test` works on a fresh clone but the server needs
`pnpm --filter @kala/server build` first.

Two build details that cost real debugging time and are now locked down:

- **`outDir` and `rootDir` are set per package**, not in `tsconfig.base.json`. Paths in a
  shared config resolve relative to that file, which would collapse every package into one
  `dist/`.
- **Every tsconfig that sets `exclude` also excludes `dist`.** Specifying `exclude`
  overrides TypeScript's automatic `outDir` exclusion, so the build would otherwise treat
  its own output as input.

---

**Next:** [Writing rules](02-writing-rules.md).

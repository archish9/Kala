# Frontend Design MCP — Design Spec

**Date:** 2026-08-11
**Status:** Approved design, ready for implementation planning

---

## 1. Purpose

An MCP server that helps coding agents produce **production-grade frontend** — work that reads as though an experienced designer made it, not as though a template was filled in.

This is a greenfield product. Three existing projects (ui-ux-pro-max, impeccable, design-motion-principles) supply proven data, heuristics, and code, which are harvested directly (see §10). Their architectures are not carried over.

### Failure modes being solved

All four are in scope:

1. **Visual craft** — no spacing rhythm, flat type scale, uniform weight, color without intent, borders and shadows everywhere.
2. **Inconsistency across pages** — page 5 looks like a different product than page 1. Button styles drift, new colors appear, components get re-invented.
3. **Missing real-world states** — only the happy path. No loading, empty, error, disabled. Breaks on real data.
4. **Weak UX judgment** — wrong component for the job, unclear hierarchy, no primary action, copy that explains nothing.

### Explicit non-goal

Producing a *different* design each time. One project must be one coherent system. "Not generic" means a quality bar, not novelty.

---

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Four failure modes all in scope | User requirement |
| 2 | Web, source-level: React, Vue, Svelte, HTML | Thin per-framework extractors into a shared IR keep the cost linear |
| 3 | Lock file derived from project config, plus an intent layer, with staleness detection | Config holds values; nothing but a lock can hold intent |
| 4 | MCP bootstraps greenfield projects | Empty project has no config to derive from |
| 5 | Taste = curated whole systems + math adaptation | Curation supplies coherence math cannot; math supplies completeness curation cannot enumerate |
| 6 | Source analysis always; browser pass opt-in | Fast default loop; heavy dependency stays optional |
| 7 | Requirements before, checks during, critique after | Preventing is cheaper than critiquing |
| 8 | Kernel + data packs architecture | Value lives in rule count and system count; both must be cheap to add |
| 9 | TypeScript on Node | Framework parsers (`@babel/parser`, `@vue/compiler-sfc`, `svelte/compiler`) are Node-only |

### Approaches rejected

- **Layered monolith with rules in code.** How impeccable's `checks.mjs` reached 5,746 lines. Every rule costs a code review; a second framework touches every engine.
- **Two servers split by phase.** Clean seam, but the core loop (decide → build → check against decision) spans both, and crossing a process boundary mid-loop buys nothing.

---

## 3. Architecture

```
packages/
  kernel/          no knowledge of frameworks, rules, or design
    ir/            IR types + builders
    lock/          resolve, derive, sync, staleness
    engine/        rule runner (IR + rule defs -> findings)
    server/        MCP tool surface

  extractors/      source -> IR. one per framework, ~200 lines each
    react/  vue/  svelte/  html/

  packs/           pure data. no code dependency on kernel.
    systems/       curated design systems
    rules/         rule definitions
    surfaces/      per-surface requirement sets
    guides/        action playbooks

  browser/         opt-in, lazy dependency. render -> computed facts
```

**Dependency rule:** dependencies point inward, and `packs/` is data with no code dependency at all.

- `kernel` imports nothing from `extractors` or `packs` — it receives them as inputs.
- `extractors` know their framework and the IR, nothing else. An extractor cannot know a rule exists.
- `packs` are JSON. A rule cannot import kernel internals.
- `browser` is a separate optional package. Without Chromium, everything except `inspect` still works.

| Unit | Does | Depends on |
|---|---|---|
| `ir` | Defines the one shape all frameworks flatten into | nothing |
| `extractors/*` | Turn one framework's source into IR | ir + that framework's parser |
| `lock` | Owns the project's design truth; derive, detect drift | ir |
| `engine` | Run rule defs against IR + lock, emit findings | ir, lock |
| `packs/*` | The design knowledge, as data | nothing |
| `server` | Expose tools over MCP | all of the above |
| `browser` | Rendered facts when source cannot answer | nothing (optional) |

**Seams reserved now:** `browser` sits behind an interface so `inspect` degrades to a clear message rather than crashing; the extractor registry is a lookup by file extension so framework #5 is a registration, not a refactor.

---

## 4. The IR

The load-bearing decision. A React+Tailwind file and a Vue+scoped-CSS file must flatten into the same shape, so a rule is written once and fires correctly on both.

### Core types

```ts
type IRDoc = {
  file: string
  framework: 'react' | 'vue' | 'svelte' | 'html'
  nodes: IRNode[]           // flat, parent-linked — easier to query than nested
  imports: ImportRec[]
  dataSources: DataSource[] // fetch / useQuery / load — for state checks
}

type IRNode = {
  id: string                // stable: file + path, survives re-parse
  kind: 'element' | 'component' | 'text' | 'slot'
  name: string              // 'div' | 'Button' | 'RouterLink'
  parent: string | null
  children: string[]
  style: StyleFacts
  text: string | null       // literal text only
  branch: BranchRef | null
  loc: { line: number; col: number }
}
```

### StyleFacts

Every styling mechanism normalizes to one vocabulary:

```ts
type StyleFacts = {
  space:  { padding: Fact<Box>; margin: Fact<Box>; gap: Fact<Len> }
  type:   { size: Fact<Len>; weight: Fact<number>; leading: Fact<Len>
            tracking: Fact<Len>; family: Fact<string> }
  color:  { fg: Fact<Color>; bg: Fact<Color>; border: Fact<Color> }
  shape:  { radius: Fact<Len>; borderWidth: Fact<Len>; shadow: Fact<ShadowSpec> }
  layout: { display: Fact<string>; direction: Fact<string>; align: Fact<string> }
  raw:    RawDecl[]         // original source, for the fix message
}
```

All four produce identical `space.padding = 16px`:

```
React     className="p-4"
Vue       :style="{ padding: '16px' }"
Svelte    <style>.card { padding: 1rem }</style>
HTML      style="padding: 1rem"
```

A rule author never learns Tailwind. The rule says `space.padding not in lock.scale.space` and works in all four.

Every slot is always present. `absent` and `unknown` are *values*, never missing keys — an optional
field would let a rule silently treat "cannot determine" as "not set", which is the exact confusion
the three-state design exists to prevent. `origin` moves inside each `Fact`, since provenance is
per-fact, not per-node.

### Three-state facts

```ts
type Fact<T> =
  | { state: 'known';   value: T; origin: StyleOrigin }
  | { state: 'absent' }                          // provably not set
  | { state: 'unknown'; reason: UnknownReason }  // cannot determine
```

`unknown` applies when a class comes from a runtime expression, styles live in an external stylesheet not passed in, a `cva`/`clsx` call cannot be resolved statically, or styles flow through props.

**Rules never fire on `unknown`.** Enforced in the evaluator, not in rule files. A linter that cries wolf gets muted within a week, and then the product is worthless.

Findings carry the count of skipped nodes, so coverage is honest: *"12 findings, 4 nodes not statically analyzable."*

### Branches

```ts
type Branch = {
  id: string
  kind: 'conditional' | 'loop' | 'error-boundary' | 'suspense'
  condition: string
  semantic: BranchSemantic | null
}

type BranchSemantic =
  | 'loading' | 'error' | 'empty' | 'success'
  | 'disabled' | 'permission' | null
```

`semantic` is inferred from patterns (`isLoading`, `isPending`, `error`, `data.length === 0`, `?? []`) and is a guess, so it is `unknown`-tolerant. A `DataSource` with no downstream branch of semantic `error` is the finding.

### Surfaces

`surface` is used by aggregate rule scope, the `$surface.*` expression namespace, and
`surface_brief`, so it needs one definition rather than three implied ones.

**A surface is one screen a user lands on** — a route, a page, or a top-level view. Not a component,
not a file.

Resolution, in order:

1. Framework router entry, when one is detectable (`app/**/page.tsx`, `pages/**`, `routes/**`,
   `src/routes/**`, `<Route>` definitions)
2. Explicit `surfaces` mapping in project config, which overrides detection
3. Fallback: the entry file plus everything it imports transitively from within the project,
   bounded at depth 3

The bound matters. Without it a shared `Layout` import drags the whole app into one surface and every
aggregate rule becomes meaningless.

A component imported by two surfaces is analyzed within each. An aggregate finding therefore reports
which surface it belongs to, and the same shared component can legitimately produce a finding on one
surface and not the other — a heading scale that is fine on a dense dashboard can be flat on a
marketing page.

When no surface can be resolved, aggregate rules with `scope: "surface"` fall back to `scope: "file"`
and say so in `degraded[]`.

### Out of scope for the IR

- Full type inference
- Cross-file style resolution beyond direct imports
- Runtime values

Each exclusion resolves to `unknown`, which is safe by construction.

---

## 5. The lock file

### Two zones

```jsonc
{
  "version": 1,
  "sources": [
    { "path": "tailwind.config.ts", "hash": "sha256:a1b2…" },
    { "path": "src/styles/globals.css", "hash": "sha256:c3d4…" },
    { "path": "src/components/ui/", "hash": "sha256:e5f6…" }
  ],

  "derived": {
    "space":  [0, 4, 8, 12, 16, 24, 32, 48, 64],
    "type":   { "steps": [12, 14, 16, 20, 28, 40], "families": { } },
    "color":  { "primary": { "500": "#1F4B3F" } },
    "radius": [0, 2, 6, 12],
    "components": {
      "Button": { "file": "src/ui/Button.tsx", "variants": ["primary", "ghost"] }
    }
  },

  "intent": {
    "system": "quiet-precision",
    "density": "generous",
    "hierarchy": { "headingJump": 2, "maxWeightsPerSurface": 2 },
    "motion": { "budget": "minimal", "maxDurationMs": 200 },
    "banned": { "fonts": ["Inter"], "patterns": ["gradient-text", "nested-card"] },
    "rationale": "Financial tool. Restraint reads as trustworthy."
  }
}
```

`derived` regenerates from real config with zero loss. `intent` holds what no config file can express, and regeneration never touches it.

impeccable's `DESIGN.md` mixes both into prose, so refreshing it means an LLM rewrite that silently loses intent. This split makes refresh a pure function over one zone.

### Staleness

```
verify() called
  -> rehash each source path
  -> any mismatch = stale
  -> auto-regenerate `derived` (pure function of sources)
  -> leave `intent` untouched
  -> if intent now references something gone -> report conflict
```

Conflicts are the only case needing a human:

```
lock.intent.banned.fonts = ["Inter"]
tailwind.config sets fontFamily.sans = Inter
-> CONFLICT: config contradicts intent. Reported with both locations.
```

Because drift is a hash compare, it runs on every `verify`. No `doctor` command needed.

### Derivation order

1. `tailwind.config.*` if present — richest source
2. CSS custom properties in the entry stylesheet — non-Tailwind projects
3. Component scan of the ui directory — builds the registry
4. Fallback: cluster observed values across the codebase by frequency. Values used 20+ times are the de-facto scale; outliers become findings. Marked `"inferred": true`.
5. Nothing at all → *absent*, triggers bootstrap.

### Component registry

Scanning `src/ui/` yields `Button` with variants `primary | ghost`. A raw `<button className="px-4 py-2 bg-primary rounded">` then becomes a finding: a component already exists for this. Highest-value consistency rule, possible only because the registry is data.

### Sync direction

**The lock never writes to project config, except during bootstrap.** After bootstrap, config is upstream and the lock is downstream, permanently. One direction, no reconciliation, no write loops.

The lock file is committed to git — shared project truth, like a schema.

---

## 6. Rule DSL

Three rule kinds, because the four failure modes ask three shapes of question.

### Kind 1 — `node`

```jsonc
{
  "id": "space-off-scale",
  "kind": "node",
  "severity": "error",
  "select":  { "hasFact": "style.space.padding" },
  "assert":  { "allIn": ["style.space.padding.*", "$lock.derived.space"] },
  "message": "Padding {value} is not on the spacing scale.",
  "fix":     "Nearest on-scale value: {nearest($lock.derived.space, value)}",
  "fixtures": { "pass": "…/pass.tsx", "fail": "…/fail.tsx" }
}
```

### Kind 2 — `relation`

```jsonc
{
  "id": "text-contrast",
  "kind": "relation",
  "severity": "error",
  "select":  { "hasFact": "style.color.fg" },
  "against": { "nearestAncestor": { "hasFact": "style.color.bg" } },
  "assert":  { "gte": ["contrast(self.style.color.fg, other.style.color.bg)", 4.5] },
  "message": "Contrast {contrast} is below 4.5:1."
}
```

`nearestAncestor` resolves through nesting. If no ancestor has a known background, the fact is `unknown` and the rule does not fire.

### Kind 3 — `aggregate`

Catches the visual-craft failures, which are invisible per-node and obvious in aggregate.

```jsonc
{
  "id": "flat-type-hierarchy",
  "kind": "aggregate",
  "scope": "surface",
  "severity": "warn",
  "select":  { "hasFact": "style.type.size" },
  "collect": "style.type.size",
  "assert":  { "gte": ["distinct(collected)", 3] },
  "message": "Only {distinct} distinct text sizes across this surface. Hierarchy is flat.",
  "minSample": 8
}
```

`minSample` prevents firing on stubs.

### Expression language

Deliberately small — paths, literals, and a fixed builtin set. No user-defined functions, no loops, no recursion.

```
builtins: contrast() distinct() count() nearest() ratio()
          median() stddev() has() matches()
refs:     self.*  other.*  collected  $lock.*  $surface.*
ops:      eq gte lte in allIn anyIn not and or
```

Small enough to evaluate in roughly 200 lines, and small enough that a bad rule cannot hang the server.

### The `unknown` contract

```
evaluate(expr):
  any operand resolves to state='unknown'
    -> rule yields SKIPPED, never a finding
    -> increment coverage.skipped
```

Rule authors cannot opt out. Every `verify` reports coverage:

```
14 findings · 61 nodes analyzed · 9 skipped (unresolvable class expressions)
```

### Escape hatch

```jsonc
{ "id": "reinvented-component", "kind": "node",
  "predicate": "js:packs/rules/predicates/reinvented-component.mjs" }
```

Default export `(node, ctx) => Finding | null`. Same `unknown` contract — `ctx.fact()` returns three-state and the harness drops findings built from unknowns.

Budget: if custom predicates exceed roughly 15% of rules, the DSL is wrong and needs revisiting.

### Waivers

```
config:  rules.off, rules.files, rules.values
inline:  <!-- fe-disable space-off-scale: legacy vendor widget -->
         // fe-disable-next-line text-contrast
```

The required reason string after `:` keeps waivers honest. Design taken from impeccable; marker renamed.

### Quality gate

**A rule without both a passing and a failing fixture does not load.** Enforced at pack-load time. Rules are therefore testable without the parser and without a server. Adding rule #200 costs one JSON file and two fixtures.

---

## 7. Taste engine

### Curated system format

```jsonc
{
  "id": "quiet-precision",
  "axes": { "formality": [0.7, 1.0], "density": [0.4, 0.7],
            "energy": [0.0, 0.3],   "expressiveness": [0.1, 0.4] },
  "fitFor":   ["financial", "developer tools", "admin", "data-heavy"],
  "avoidFor": ["consumer social", "kids", "entertainment"],

  "type":   { "families": { "sans": "Söhne", "serif": "Tiempos" },
              "fallbacks": { "sans": ["Inter Tight", "system-ui"] },
              "ratio": 1.2, "baseSize": 15, "maxWeights": 2 },
  "space":  { "base": 4, "rhythm": "generous", "sectionGap": 96 },
  "shape":  { "radius": 2, "depth": "borders" },
  "color":  { "strategy": "warm-neutral + one deep accent",
              "neutralHue": 40, "chromaCeiling": 0.04 },
  "motion": { "budget": "minimal", "duration": 120, "easing": "ease-out" },

  "signature": [
    "Borders carry structure. Shadows are for overlays only.",
    "Numbers are tabular-lined, always right-aligned.",
    "One accent, used only for the single primary action per surface.",
    "Section breaks are space, never rules."
  ],
  "antiDefaults": ["card-in-card", "gradient-anything", "shadow-on-rest-state"]
}
```

`signature` is what stops output reading generic. Those lines are injected into every surface brief and become checkable rules. A system without opinions is a template.

### Selection — never a silent argmax

uupm ranks by BM25 and takes top-1, so every SaaS brief lands on the same row.

Here: brief → axis vector → distance to each system's axis ranges → **return the top 3 with genuine differences and a rationale each.** The agent or user picks.

```
brief: "invoicing tool for freelancers, feels trustworthy, not corporate"
  axes: formality 0.6 · density 0.5 · energy 0.25 · expressiveness 0.4

  1. quiet-precision   fit 0.89  restraint reads as trustworthy; borders not shadows
  2. warm-utility      fit 0.84  softer, warmer; friendlier for solo users
  3. editorial-clean   fit 0.71  type-led, more personality, less dense
```

### Math layer

**Color ramp in OKLCH, not HSL.** HSL goes muddy through the mids and its lightness is not perceptual, which is why generated palettes look cheap. Fixed perceptual lightness targets per step, chroma curve peaking mid-ramp, capped by `chromaCeiling`.

```
accent #1F4B3F -> oklch(0.34 0.06 162)
  -> steps 50…950, lightness targets fixed, hue held
  -> neutrals built at neutralHue for a warm gray, not #808080
```

**Contrast solved, not hoped for.** Each semantic pair is assigned by selecting the ramp step that satisfies its target, making WCAG 2.1 AA structural:

```
fg on bg          >= 7.0   (AAA body — cheap to hit)
muted on bg       >= 4.5
on-primary on 500 >= 4.5   -> if no step works, shift the pair
border on bg      >= 3.0   (non-text)
```

**Dark mode derived, not inverted.** Inversion is the tell. Lightness targets remap against a dark surface ladder, chroma drops roughly 15% (saturated colors glare on dark), and surfaces rise by lightness rather than shadow.

**Type scale** = `baseSize × ratio^n`, snapped to whole px, clamped to 6–7 steps. More steps and hierarchy stops meaning anything.

**Space scale** = `base × [0,1,2,3,4,6,8,12,16]`, stretched by `rhythm`.

### Emission

Three artifacts, all idempotent, all marker-delimited so hand edits survive regeneration:

```
tailwind.config.ts   → scales, palette, families (or CSS vars if not Tailwind)
globals.css          → custom properties, dark block, font faces
design.lock.json     → derived (from the two above) + intent (from the system)
```

The generated config becomes the upstream source the lock derives from. Bootstrap is the one moment the arrow points outward; afterwards config is upstream permanently, as §5 requires.

### Honest boundary

Quality is capped by the curated systems. Twelve well-authored systems beat eighty-four thin ones, but twelve mediocre ones make a mediocre product and no math layer rescues that. Authoring them is design work, not a coding task, and it is the piece most likely to be underestimated.

---

## 8. MCP tool surface

Every tool description occupies agent context permanently, so the surface stays at eight tools. impeccable's 23 commands collapse into one of them.

```
system_status(dir)                        → lock state, staleness, coverage
system_bootstrap(brief, choice?)          → 3 options, or apply one    [WRITES]
surface_brief(surface, framework)         → requirements before building
verify(paths[])                           → findings from source
inspect(url, viewports[])                 → findings from pixels        [opt-in]
guide(action, target?)                    → playbook, grounded in lock
critique(paths[]|url)                     → structured design review
explain(findingId|ruleId)                 → detail on demand
```

### Loop

```
system_status        → "no lock" → system_bootstrap
                     → "lock ok" → proceed
surface_brief        → requirements list
agent writes code
verify               → findings
agent fixes → verify → clean
inspect (optional)   → pixel-level findings
```

### `guide` and the 23 verbs

`guide` takes an action enum — `bolder | quieter | distill | harden | animate | typeset | layout | colorize | delight | clarify | adapt | optimize | onboard`. One tool, one description, thirteen playbooks as data.

It returns the playbook grounded in this project's lock:

```
guide("bolder", "src/pages/Pricing.tsx")
→ system: quiet-precision — restraint is intentional here
  bolder within this system means:
    ✓ jump 2 type steps on the plan name (20 → 40)
    ✓ accent-600 on the recommended plan border
    ✗ do NOT add gradients (antiDefaults)
    ✗ do NOT add shadows at rest (signature: borders carry structure)
```

impeccable's `bolder` returns identical prose to every project. This cannot, because it reads the lock.

### Output discipline

`verify` returns compact findings only:

```jsonc
{ "findings": [
    { "id": "f7", "rule": "space-off-scale", "sev": "error",
      "file": "src/pages/Settings.tsx", "line": 42,
      "msg": "Padding 13px is not on the spacing scale.",
      "fix": "Nearest: 12px" }],
  "coverage": { "analyzed": 61, "skipped": 9,
                "reason": "unresolvable class expressions" } }
```

No rationale, no philosophy. Depth comes from `explain("f7")` on demand. `verify` runs many times per session; leanness is the difference between usable and context-hostile.

### Write boundary

**`system_bootstrap` is the only tool that writes.** Every other tool is read-only, so an agent can call `verify`, `critique`, `guide`, and `inspect` freely with zero risk. Bootstrap refuses to overwrite an existing lock without `force`.

### Two-step bootstrap

```
system_bootstrap({brief})            → 3 options + rationale, writes nothing
system_bootstrap({brief, choice: 2}) → writes config + css + lock
```

The pause is deliberate: it is where a human steers, and it prevents silent-argmax sameness.

### Activation

Tool descriptions alone activate weakly — an agent mid-task will not reliably call `surface_brief` before writing. A roughly 40-line companion skill ships alongside: before building UI call `system_status` then `surface_brief`; after writing UI call `verify`.

That shim is one small file per harness, not impeccable's fifteen duplicated directories.

---

## 9. Errors and testing

### Degrade, never throw

A tool that throws costs the agent a turn and teaches it to stop calling the tool. Every failure returns a valid response with reduced coverage.

```jsonc
{ "findings": [ ],
  "coverage": { "analyzed": 61, "skipped": 9 },
  "degraded": [
    { "code": "PARSE_FAILED", "path": "src/Legacy.vue",
      "detail": "Unexpected token line 88", "impact": "1 file not analyzed" }
  ] }
```

| Failure | Response |
|---|---|
| File fails to parse | Skip file, record in `degraded[]`, analyze the rest |
| No lock file | Run system-independent rules only, say so |
| Lock stale | Auto-regenerate `derived`, note it, continue |
| Lock conflicts intent | Report both locations, continue, do not auto-resolve |
| Browser pack missing | `inspect` returns install instructions; other tools unaffected |
| Rule pack malformed | Skip that rule, load the rest, list what failed |
| Rule predicate throws | Skip rule, log, continue |
| Path outside project root | Refuse with explicit error |
| File > 2MB or minified | Skip, record in `degraded[]` — bundles are not source |

Hard errors only for: unwritable target on bootstrap, existing lock without `force`, path escape.

### Testing

Layered to match §3 boundaries. The default suite needs no network and no browser.

**Extractors** — fixture file in, IR snapshot out, per framework and per styling mechanism.

**Cross-framework equivalence** — the acceptance test for the whole thesis. The same card written four ways must produce identical `StyleFacts`:

```
fixtures/equivalence/card/{react.tsx, vue.vue, svelte.svelte, html.html}
  → assert all four IRs have identical StyleFacts
```

If this cannot pass, "write a rule once" is false, and that surfaces in week one rather than month three.

**Rules** — IR in, findings out. No parser, no server. Both fixtures required at pack-load, so the gate is enforced rather than aspirational.

**`unknown` contract** — a dedicated suite of nodes with unresolvable facts, asserting zero findings across every rule in every pack. The false-positive firewall, applied to every rule automatically.

**Taste engine** — property tests rather than snapshots:
- every generated semantic pair meets its contrast target, across all systems × all accent hues
- ramp lightness is monotonic
- dark mode derivation preserves all pair targets
- `bootstrap` run twice produces identical output

**Lock** — derive → mutate source → detect stale → regenerate → assert `intent` unchanged.

**Server** — tool contract tests over the real MCP transport. Every tool returns valid schema for happy path, empty project, and broken project.

**Browser pack** — separate opt-in suite, excluded from default CI.

---

## 10. Harvest and attribution

Good material is taken directly, not re-derived. Licenses permit it: MIT (ui-ux-pro-max, design-motion-principles) and Apache-2.0 (impeccable).

### From ui-ux-pro-max (MIT)

CSV data converted to typed JSON:

| Source | Rows | Becomes |
|---|---|---|
| `ux-guidelines.csv` | 98 | `packs/surfaces/` + rule seeds — already rule-shaped (Do/Don't, code examples, severity) |
| `ui-reasoning.csv` | 161 | brief→axes mapping + per-industry `banned` lists |
| `typography.csv` | 74 | font pairings with Google Fonts URLs and CSS imports |
| `landing.csv` | 34 | surface briefs: section order, CTA placement |
| `charts.csv` | 25 | chart guidance: when-to-use, a11y grade, library |
| `colors.csv` | 192 | palette seeds per product type |
| `icons.csv` | 104 | icon guidance and import snippets |
| `motion.csv`, `react-performance.csv` | — | motion presets, performance rules |
| `data/stacks/*.csv` | 22 files | `guide` grounding per stack |

Roughly 800 curated rows of existing work.

### From impeccable (Apache-2.0)

- **59 detector rules** from `checks.mjs` — heuristics and thresholds re-expressed as JSON rule defs. The distilled knowledge is the value; regex implementation is replaced by IR queries.
- **`css-cascade.mjs`** — cascade resolution, needed by the HTML and Svelte extractors. Ported.
- **`screenshot-contrast.mjs`** — visual contrast sampling for the browser pack. Ported.
- **`detect-url.mjs`** — Puppeteer harness for `inspect`.
- **23 command playbooks** (`skill/reference/*.md`) → `packs/guides/`, re-grounded against the lock.
- **`craft-floor.md`** — the quality floor.
- **Waiver syntax** — design kept, marker renamed.

### From design-motion-principles (MIT)

- `motion-cookbook.md` — recipes
- `anti-checklist.md` — AI-slop motion categories and frequency heuristics → motion rules
- The **frequency gate** framework
- `report-template.html` and `demo-shell.html` — HTML report with looping CSS demos → `critique` report mode

### Left behind

- uupm's Python runtime and BM25-argmax selection (replaced by axis matching)
- impeccable's 15 duplicated harness directories, CLI installer, live mode, Chrome extension
- The three-designer personal names from design-motion-principles (see below)

### Attribution requirements

Apache-2.0 obliges three things when shipping impeccable's code:

1. Ship the Apache-2.0 license text
2. Ship a `NOTICE` file carrying its attribution
3. State that files were modified

Apache-2.0 §6 grants no trademark rights: the code is usable, the "Impeccable" name is not.

MIT obliges the copyright line and permission notice.

```
LICENSES/
  Apache-2.0.txt
  MIT.txt
NOTICE                    # impeccable attribution + modification statement
ATTRIBUTION.md            # per-pack provenance
packs/rules/*.json        # each carries "source": "impeccable@<ver>", "modified": true
```

Per-file provenance in pack JSON is cheap and makes compliance auditable.

**Judgment call:** design-motion-principles names three real designers and states they neither authored nor endorsed it. Recommendation is to take the principles and drop the personal names — the systems already carry `motion.budget`, so the substance survives without implying endorsement. Flagged as the one harvest item with a real downside.

---

## 11. Build order

Sequencing, not scope reduction. All four phases are in scope.

| Phase | Contents | Risk |
|---|---|---|
| 1 | Kernel: IR + lock derive/sync/staleness + React-Tailwind extractor + rule runner + ~20 rules | **High** — IR and rule DSL are unproven until cross-framework equivalence passes |
| 2 | Taste: curated systems + math adaptation + bootstrap emission | Medium — system authoring is design work, easily underestimated |
| 3 | Surfaces: briefs + state completeness checks | Low |
| 4 | Breadth: Vue/Svelte/HTML extractors, browser inspect, critique | Low — additive by construction |

Phase 1 carries the architectural risk. Everything after is additive.

---

## 12. Open items for implementation planning

Each carries a default so planning is never blocked; the default holds unless changed.

| Item | Default |
|---|---|
| Package manager and monorepo tooling | pnpm workspaces |
| WCAG target per semantic pair | 2.1 AA, taking AAA where it costs nothing. APCA deferred. |
| Curated system count for phase 2 | 12 |
| Surfaces shipping in phase 3's first cut | landing, dashboard, settings, form, list/table, auth |

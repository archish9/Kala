# 8. Extending

How to add a rule, a design system, a surface, a playbook, or a whole framework.

- [Add a rule](#add-a-rule)
- [Add a rule that needs code](#add-a-rule-that-needs-code)
- [Add a rendered check](#add-a-rendered-check)
- [Add a design system](#add-a-design-system)
- [Refresh the catalog data](#refresh-the-catalog-data)
- [Add a surface](#add-a-surface)
- [Add a playbook](#add-a-playbook)
- [Add a framework](#add-a-framework)
- [Add a tool](#add-a-tool)

---

## Add a rule

A rule is one JSON file and two fixtures. No code.

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

Fixture paths are relative to the **rule file**. The loader resolves them to absolute paths
so consumers do not need to know the convention.

### 3. Run the gate

```bash
pnpm vitest run packages/packs/tests/rules.test.ts
```

The gate enforces four things automatically: the rule loads, it fires on its fail fixture,
it stays silent on its pass fixture, and it produces nothing on `all-unknown.tsx`.

**A rule without both fixtures does not load** — the check is at pack-load time, so an
untested rule cannot ship.

### Choosing a kind

| Question the rule asks | Kind |
|---|---|
| About one element | `node` |
| About an element and an ancestor | `relation` |
| About a whole file or surface in aggregate | `aggregate` |
| About the file's data sources and branches | `document` |

### The expression language

```
builtins:  contrast()  distinct()  count()  nearest()  ratio()
           median()  stddev()  has()  matches()
refs:      self.*   other.*   collected   $lock.*   $surface.*
operators: eq  gte  lte  in  allIn  anyIn  not  and  or
```

Deliberately small. If more than roughly 15% of rules need the code escape hatch, the
language is wrong and should be revisited rather than bypassed.

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

Rendered checks run inside `inspect` against a real page. They are **not** pack rules:
no JSON, no fixtures, just a pure function over collected browser facts.

Reach for one only when the question genuinely needs a render. If source analysis can
answer it, write a [pack rule](#add-a-rule) instead — it is cheaper, needs no browser, and
runs on every `verify`.

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
to exercise — the seeded page there is the place for it.

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

### Two rules to honour

**Never invent a value.** If the fact needed to judge is missing, report that it could not
be judged, as `contrast-unresolved` does. Guessing produces false findings, which is the
one failure mode that makes people stop trusting the tool.

**Exempt what would be noise.** `checkTargets` skips zero-sized elements because those are
hidden rather than small, and only applies below 1024px. `checkContrast` relaxes its target
for large text. An exemption you can justify in one sentence is worth more than a finding
nobody acts on.

---

## Add a design system

This is design work, not coding. Quality of the catalogue caps the quality of every
bootstrap.

`packages/packs/systems/my-system.json`:

```jsonc
{
  "id": "my-system",
  "axes": { "formality": [0.4, 0.8], "density": [0.2, 0.5],
            "energy": [0.3, 0.6], "expressiveness": [0.5, 0.8] },
  "fitFor":   ["words a brief would actually contain"],
  "avoidFor": ["domains this would be wrong for"],

  "type":   { "families": { "sans": "…", "serif": "…" },
              "fallbacks": { "sans": ["system-ui", "sans-serif"] },
              "ratio": 1.25, "baseSize": 16, "maxWeights": 2 },
  "space":  { "base": 4, "rhythm": "normal", "sectionGap": 80 },
  "shape":  { "radius": 8, "depth": "borders" },
  "color":  { "strategy": "one line describing the palette",
              "neutralHue": 200, "chromaCeiling": 0.05 },
  "motion": { "budget": "minimal", "duration": 150, "easing": "ease-out" },

  "signature": [
    "At least three lines. Specific enough to constrain a decision.",
    "Borders carry structure. Shadows are for overlays only.",
    "One accent, used only for the single primary action per surface."
  ],
  "antiDefaults": ["patterns this system never uses"]
}
```

Then add a default accent in `packages/taste/src/compose.ts`:

```ts
export const DEFAULT_ACCENTS: Record<string, string> = {
  …,
  'my-system': '#1F4B3F'
}
```

### What makes a good system

**`signature` is the whole point.** Those lines are injected into every surface brief and
guide response. A system without opinions is a template. Write *"borders carry structure,
shadows are for overlays only"*, not *"clean and modern"*.

**`fitFor` and `avoidFor` feed selection.** Use words a brief would actually contain —
`invoicing`, `dashboard`, `kids` — not abstract categories.

**Axis ranges should not duplicate an existing system**, or briefs will not discriminate. A
property test asserts the catalogue covers both ends of every axis.

### Verify it

```bash
pnpm vitest run packages/taste/tests/systems.test.ts
```

This runs your system through every property: contrast at every hue in both schemes,
monotonic ramps, AAA body text, deterministic composition. Update the expected count in the
"ships twelve systems" test.

This only covers the **curated** twelve. The catalog fallback tier
([Design Systems § The catalog fallback tier](05-design-systems.md#the-catalog-fallback-tier))
is separate data entirely and is not touched by adding a curated system.

---

## Refresh the catalog data

The catalog fallback tier (`packages/packs/catalog/{styles,palettes,typography}.json`) is
generated, not hand-written — it is a one-time port of ui-ux-pro-max's `styles.csv`,
`colors.csv`, and `typography.csv` (MIT), reshaped into kala's schema. There is normally
**nothing to do here**: the generated JSON is committed to the repo like any other pack
data. Re-run the conversion only if the upstream ui-ux-pro-max data changes and you want
to pull that update in.

Each domain has its own script under `packages/taste/scripts/`, taking the source CSV's
path as its only argument:

```bash
# Build @kala/taste first — the scripts self-import briefToAxes from its built dist
pnpm typecheck

node packages/taste/scripts/build-catalog-styles.mjs     /path/to/ui-ux-pro-max/data/styles.csv
node packages/taste/scripts/build-catalog-palettes.mjs   /path/to/ui-ux-pro-max/data/colors.csv
node packages/taste/scripts/build-catalog-typography.mjs /path/to/ui-ux-pro-max/data/typography.csv
```

Each script overwrites the matching file under `packages/packs/catalog/` and prints how
many rows it wrote (84 / 192 / 74 today — the count will differ if upstream added or
removed rows). Verify the result:

```bash
pnpm vitest run packages/taste/tests/catalog-data.test.ts
```

**What the scripts do, briefly** (see `packages/taste/scripts/lib.mjs` for the shared
helpers): each CSV row's free-text fields (`Keywords`, `Best For`, `Mood/Style Keywords`,
…) are run through `deriveAxesRange`, which wraps the same `briefToAxes` lexicon used for
a real brief, so the reshape reuses the project's own scoring geometry rather than
inventing a second one. Colour rows are reduced to `neutralHue`/`chromaCeiling` via
`culori`, not carried over as literal hex — see
[Design Systems § Palettes are parameter presets, not literal hex](05-design-systems.md#palettes-are-parameter-presets-not-literal-hex)
for why. **These scripts are not part of `pnpm test`, `pnpm build`, or CI** — they are a
maintenance tool for an occasional, deliberate data refresh, not a build step.

If you update the CSVs, also update the row counts in
[ATTRIBUTION.md](../ATTRIBUTION.md) and in `catalog-data.test.ts`'s three `toHaveLength`
assertions.

---

## Add a surface

`packages/packs/surfaces/my-surface.json`:

```jsonc
{
  "id": "my-surface",
  "aliases": ["other names a caller might use"],
  "purpose": "One sentence: what success looks like for the user here.",
  "requiredStates": ["loading", "error", "empty"],
  "requirements": [
    "At least three. Specific and checkable by a human.",
    "Write 'saving shows pending then confirmed', not 'give feedback'."
  ],
  "antiPatterns": ["At least one thing this screen must not do."],
  "primaryAction": "The single action, or null"
}
```

`requiredStates` must come from the vocabulary the extractor can infer: `loading`, `error`,
`empty`, `success`, `disabled`, `permission`. A test enforces this — it is what keeps the
brief and the state rules speaking the same language.

Update the expected count in `packages/taste/tests/surfaces.test.ts`.

---

## Add a playbook

Playbooks are keyed to a fixed action list. To add a **new action**, extend
`GUIDE_ACTIONS` in `packages/taste/src/guides.ts` and the `z.enum` in the server's `guide`
registration, then add the JSON:

```jsonc
{
  "id": "my-action",
  "intent": "One sentence on what this action is for.",
  "moves": [
    "At least three, each concrete enough to act on without interpretation.",
    "'Raise the heading two steps, not one' — never 'improve hierarchy'."
  ],
  "avoid": ["At least one."],
  "usesTokens": ["type", "space"]
}
```

`usesTokens` is what makes grounding work: the tool returns this project's real values for
exactly those groups. Valid groups: `space`, `type`, `color`, `radius`, `motion`.

---

## Add a framework

Four steps. Rules do not change at all — that is the point of the IR.

### 1. Create the package

```
packages/extractors/mine/
  package.json      depends on kernel + extractor-core + your parser
  tsconfig.json     references ../../kernel and ../core
  src/index.ts      exports extractMine(source, file): IRDoc
```

### 2. Write the adapter

The adapter's whole job is finding styled nodes and handing their classes, inline styles,
and matching CSS rules to `extractor-core`:

```ts
import {
  resolveTailwindClasses, parseInlineStyle, parseStyleSheet,
  declsToStyleFacts, rulesFor, mergeFacts, type ElementKey, type CssRule
} from '@kala/extractor-core'

// Per element, build layers in cascade order and merge:
const layers: StyleFacts[] = []
if (sheet.length > 0) {
  const { certain, uncertain } = rulesFor(sheet, key)
  if (certain.length)   layers.push(declsToStyleFacts(certain, { kind: 'stylesheet', raw: tag }))
  if (uncertain.length) layers.push(uncertainFacts(...))   // these become unknown
}
if (classIsDynamic)  layers.push(allUnknown())
else if (className)  layers.push(resolveTailwindClasses(className))
if (inlineStyle)     layers.push(declsToStyleFacts(parseInlineStyle(inlineStyle), …))

style: mergeFacts(layers)
```

**The rule that matters:** anything the adapter cannot resolve statically becomes
`unknown`, never `absent`. A dynamic class expression, a CSS rule reached through
ancestors, a runtime value — all `unknown`.

### 3. Register it

`packages/server/src/extractors.ts`:

```ts
import { extractMine } from '@kala/extractor-mine'

export const EXTRACTORS: Record<string, ExtractorFn> = {
  …,
  '.mine': extractMine
}
```

Add the workspace dependency and tsconfig reference to the server. That is the entire
dispatch change.

### 4. Prove equivalence

Add `card.mine` to `packages/extractors/equivalence/tests/fixtures/`, expressing the same
card the other four express, and add it to the `load()` map in the test.

**This is the acceptance test.** If it cannot pass, the adapter is wrong.

---

## Add a tool

1. Write `packages/server/src/tools/my-tool.ts` — a plain async function taking `dir` first
2. Register it in `packages/server/src/index.ts` with a zod schema
3. Write `packages/server/tests/my-tool.test.ts`
4. Update the tool-count assertion in `built-binary.test.ts`

Two constraints:

**Keep it read-only.** `system_bootstrap` is the only tool that writes, and preserving that
means an agent can call everything else freely without risk.

**Degrade, never throw.** Return a valid response with `degraded[]` populated. The only
hard errors are path escape, unwritable bootstrap target, and existing lock without
`force`.

Tool descriptions occupy agent context permanently, so keep the surface small. Thirteen
guide actions collapse into one tool for exactly this reason.

---

**Next:** [Troubleshooting](09-troubleshooting.md).

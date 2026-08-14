# Extending

How to add a design system, a surface, a playbook, a whole framework, or a tool.

Adding a **rule** or a **rendered check** is covered separately in
[Writing rules](02-writing-rules.md).

- [Add a design system](#add-a-design-system)
- [Refresh the catalog data](#refresh-the-catalog-data)
- [Add a surface](#add-a-surface)
- [Add a playbook](#add-a-playbook)
- [Add a framework](#add-a-framework)
- [Add a tool](#add-a-tool)
- [Regenerate the documentation](#regenerate-the-documentation)

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
([Design systems § the catalog fallback tier](../users/06-design-systems.md#the-catalog-fallback-tier))
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
[Design systems § the catalog fallback tier](../users/06-design-systems.md#the-catalog-fallback-tier)
for why. **These scripts are not part of `pnpm test`, `pnpm build`, or CI** — they are a
maintenance tool for an occasional, deliberate data refresh, not a build step.

If you update the CSVs, also update the row counts in
[ATTRIBUTION.md](../../ATTRIBUTION.md) and in `catalog-data.test.ts`'s three `toHaveLength`
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

## Regenerate the documentation

Four user documents contain generated inventories. After changing any pack data — a new
rule, a new system, a new surface, a refreshed catalog — regenerate them:

```bash
node scripts/build-docs.mjs
pnpm vitest run packages/packs/tests/docs-sync.test.ts
```

The generator rewrites only the marker-delimited regions; prose outside the markers is yours
and survives. It is deliberately **not** part of `pnpm test` or CI, so the sync test is what
stops stale docs shipping.

| Document | Generated regions |
|---|---|
| [Catalog](../users/05-catalog.md) | `styles`, `palettes`, `typography` |
| [Design systems](../users/06-design-systems.md) | `systems`, `signatures` |
| [Surfaces and actions](../users/07-surfaces-and-actions.md) | `surfaces`, `actions` |
| [What kala checks](../users/08-what-kala-checks.md) | `rules`, `anti-patterns` |

The rendered-checks table in `08-what-kala-checks.md` is hand-written, since rendered checks
have no JSON to read.

---

**Next:** [Testing](04-testing.md).

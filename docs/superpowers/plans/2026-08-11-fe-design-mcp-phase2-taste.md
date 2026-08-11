# Frontend Design MCP — Phase 2 (Taste Engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the MCP bootstrap a greenfield project — pick a coherent design direction from a brief, compute complete accessible token values from it, and write the real config files the Phase 1 lock derives from.

**Architecture:** A new `taste` package holds the design knowledge as code; the curated systems themselves live in `packs` as data. Curation supplies coherence that math cannot produce (which direction, with what point of view); math supplies completeness that curation cannot enumerate (full ramps, solved contrast, dark mode). Selection never silently picks one system — it returns three with rationale so a human makes the call.

**Tech Stack:** TypeScript, Node 20+, pnpm workspaces, Vitest, `culori` (OKLCH + WCAG contrast), `@modelcontextprotocol/sdk`.

## Global Constraints

Every task's requirements implicitly include this section.

- **Phase 1 is done and must keep passing.** `pnpm test` is 103 tests across 16 files. Never weaken an existing test to make new code fit.
- **`system_bootstrap` is the only tool that writes.** Every other tool stays read-only.
- **Bootstrap refuses to overwrite an existing lock** unless passed `force`. Unwritable target and existing-lock-without-force are hard errors, not degraded results.
- **Contrast target:** WCAG 2.1 AA — 4.5:1 text, 3.0:1 non-text. Take AAA (7.0:1) for body text where it is free.
- **Selection returns three options, never one.** A silent argmax is the sameness failure this engine exists to avoid.
- **Emission is idempotent.** Running bootstrap twice with the same input produces byte-identical files.
- **Emitted files are marker-delimited** so hand edits outside the markers survive regeneration.
- **After bootstrap, project config is upstream and the lock is downstream.** Bootstrap is the single moment the arrow points outward.
- **`packs/` stays data.** Curated systems are JSON with no code dependency on kernel or taste.
- **Degrade, never throw** for anything except the three hard errors above.
- **Spec:** `docs/superpowers/specs/2026-08-11-fe-design-mcp-design.md` §7. Where this plan and the spec disagree, the spec wins — stop and flag it.

## Prior art in this repo (read before starting)

- `packages/kernel/src/lock/types.ts` — `Lock`, `DerivedZone`, `IntentZone`, `emptyIntent()`
- `packages/kernel/src/lock/derive.ts` — what bootstrap's output must be readable by
- `packages/packs/src/index.ts` — the `RULES_DIR` walk-up pattern; `SYSTEMS_DIR` follows it
- `packages/server/src/context.ts` — `safeJoin` path-escape guard, reused by bootstrap
- `vitest.config.ts` — workspace packages alias to `src` in tests, resolve to `dist` at runtime. A new package must be added to both that alias list and the root `tsconfig.json` references.

## File Structure

```
packages/taste/
  package.json                  exports ./dist/src/index.js, aliased to src in tests
  tsconfig.json                 outDir dist, rootDir ., references ../kernel
  src/types.ts                  DesignSystem, Axes, Brief, Proposal, ComposedTokens
  src/load.ts                   loadSystems() + schema gate
  src/axes.ts                   briefToAxes() — lexicon scoring
  src/select.ts                 selectSystems() — top 3 with rationale
  src/color/ramp.ts             buildRamp() — OKLCH, fixed lightness targets
  src/color/solve.ts            solveSemantics() — pick steps that meet targets
  src/color/dark.ts             deriveDark() — remap, not invert
  src/scales.ts                 typeScale(), spaceScale()
  src/compose.ts                composeSystem() — one system + accent -> ComposedTokens
  src/emit/markers.ts           marker-delimited idempotent file writing
  src/emit/tailwind.ts          emitTailwindConfig()
  src/emit/css.ts               emitGlobalsCss()
  src/emit/lock.ts              emitLock()
  src/index.ts                  public surface
  tests/**                      mirrors src/

packages/packs/
  systems/*.json                12 curated design systems (data)
  src/index.ts                  add SYSTEMS_DIR alongside RULES_DIR

packages/server/
  src/tools/system-bootstrap.ts the only writing tool
  src/index.ts                  register system_bootstrap
```

---

### Task 1: Taste package scaffold, system schema, and loader

**Files:**
- Create: `packages/taste/package.json`, `packages/taste/tsconfig.json`
- Create: `packages/taste/src/types.ts`, `packages/taste/src/load.ts`
- Create: `packages/packs/systems/quiet-precision.json`, `warm-utility.json`, `editorial-clean.json`
- Modify: `packages/packs/src/index.ts` — add `SYSTEMS_DIR`
- Modify: `vitest.config.ts` — alias `@fe-design/taste`
- Modify: `tsconfig.json` — reference `./packages/taste`
- Test: `packages/taste/tests/load.test.ts`

**Interfaces:**
- Consumes: nothing from Phase 1 beyond the `RULES_DIR` walk-up pattern
- Produces:
  - `type Axes = { formality: number; density: number; energy: number; expressiveness: number }`
  - `type AxisRange = [number, number]`
  - `type DesignSystem = { id, axes: Record<keyof Axes, AxisRange>, fitFor: string[], avoidFor: string[], type: {...}, space: {...}, shape: {...}, color: {...}, motion: {...}, signature: string[], antiDefaults: string[] }`
  - `loadSystems(dir: string): Promise<{ systems: DesignSystem[]; degraded: Degraded[] }>`
  - `SYSTEMS_DIR` from `@fe-design/packs`

- [ ] **Step 1: Write the failing test**

`packages/taste/tests/load.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSystems } from '../src/load.js'
import { SYSTEMS_DIR } from '@fe-design/packs'

describe('loadSystems', () => {
  it('loads every shipped system without degradation', async () => {
    const { systems, degraded } = await loadSystems(SYSTEMS_DIR)
    expect(degraded).toEqual([])
    expect(systems.length).toBeGreaterThanOrEqual(3)
    expect(systems.map(s => s.id)).toContain('quiet-precision')
  })

  it('gives every system a non-empty signature and antiDefaults', async () => {
    const { systems } = await loadSystems(SYSTEMS_DIR)
    for (const s of systems) {
      expect(s.signature.length, `${s.id} signature`).toBeGreaterThanOrEqual(3)
      expect(s.antiDefaults.length, `${s.id} antiDefaults`).toBeGreaterThanOrEqual(1)
    }
  })

  it('gives every system four axis ranges with low <= high inside 0..1', async () => {
    const { systems } = await loadSystems(SYSTEMS_DIR)
    for (const s of systems) {
      for (const axis of ['formality', 'density', 'energy', 'expressiveness'] as const) {
        const [lo, hi] = s.axes[axis]
        expect(lo, `${s.id}.${axis} low`).toBeGreaterThanOrEqual(0)
        expect(hi, `${s.id}.${axis} high`).toBeLessThanOrEqual(1)
        expect(lo, `${s.id}.${axis} ordering`).toBeLessThanOrEqual(hi)
      }
    }
  })

  it('rejects a system missing a required field, keeping the rest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sys-'))
    await writeFile(join(dir, 'bad.json'), JSON.stringify({ id: 'bad' }))
    await writeFile(join(dir, 'ok.json'), JSON.stringify({
      id: 'ok',
      axes: { formality: [0, 1], density: [0, 1], energy: [0, 1], expressiveness: [0, 1] },
      fitFor: ['x'], avoidFor: [],
      type: { families: { sans: 'A', serif: 'B' }, fallbacks: { sans: ['system-ui'] }, ratio: 1.2, baseSize: 16, maxWeights: 2 },
      space: { base: 4, rhythm: 'normal', sectionGap: 64 },
      shape: { radius: 4, depth: 'borders' },
      color: { strategy: 's', neutralHue: 250, chromaCeiling: 0.04 },
      motion: { budget: 'minimal', duration: 150, easing: 'ease-out' },
      signature: ['a', 'b', 'c'], antiDefaults: ['x']
    }))
    const { systems, degraded } = await loadSystems(dir)
    expect(systems.map(s => s.id)).toEqual(['ok'])
    expect(degraded.some(d => d.code === 'SYSTEM_INVALID')).toBe(true)
  })

  it('survives a malformed system file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sys-'))
    await writeFile(join(dir, 'broken.json'), '{ not json')
    const { systems, degraded } = await loadSystems(dir)
    expect(systems).toEqual([])
    expect(degraded.some(d => d.code === 'SYSTEM_PARSE_FAILED')).toBe(true)
  })
})
```

- [ ] **Step 2: Create the package**

`packages/taste/package.json`:

```json
{
  "name": "@fe-design/taste",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "exports": {
    ".": { "types": "./dist/src/index.d.ts", "import": "./dist/src/index.js" }
  },
  "dependencies": {
    "@fe-design/kernel": "workspace:*",
    "@fe-design/packs": "workspace:*",
    "culori": "^4.0.2"
  },
  "devDependencies": { "@types/culori": "^4.0.0" }
}
```

`packages/taste/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src", "tests"],
  "references": [{ "path": "../kernel" }, { "path": "../packs" }]
}
```

In `tsconfig.json` at the repo root, add `{ "path": "./packages/taste" }` to `references`.

In `vitest.config.ts`, add to the `alias` array:

```ts
      { find: '@fe-design/taste', replacement: src('packages/taste/src/index.ts') }
```

- [ ] **Step 3: Add `SYSTEMS_DIR` to the packs package**

In `packages/packs/src/index.ts`, generalise the existing walk-up. Replace the file with:

```ts
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Pack data ships at the package root, but this module runs from `src/` under
 * test and `dist/src/` once built, so a fixed number of `..` segments is wrong
 * in one of those cases. Walking up to the directory that actually holds the
 * data is correct from either.
 */
const findPackDir = (name: string): string => {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, name)
    if (existsSync(candidate)) return candidate
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`@fe-design/packs: could not locate the ${name} directory.`)
}

export const RULES_DIR = findPackDir('rules')
export const SYSTEMS_DIR = findPackDir('systems')
```

Add `"systems"` to the `files` array in `packages/packs/package.json`.

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm install && pnpm vitest run packages/taste`
Expected: FAIL — cannot find module `load.js`

- [ ] **Step 5: Write the types**

`packages/taste/src/types.ts`:

```ts
export type Axes = {
  formality: number
  density: number
  energy: number
  expressiveness: number
}

export const AXIS_NAMES = [
  'formality', 'density', 'energy', 'expressiveness'
] as const

export type AxisName = typeof AXIS_NAMES[number]
export type AxisRange = [number, number]

export type DesignSystem = {
  id: string
  axes: Record<AxisName, AxisRange>
  fitFor: string[]
  avoidFor: string[]
  type: {
    families: { sans: string; serif: string }
    fallbacks: { sans: string[] }
    ratio: number
    baseSize: number
    maxWeights: number
  }
  space: { base: number; rhythm: 'tight' | 'normal' | 'generous'; sectionGap: number }
  shape: { radius: number; depth: 'borders' | 'shadows' }
  color: { strategy: string; neutralHue: number; chromaCeiling: number }
  motion: { budget: string; duration: number; easing: string }
  signature: string[]
  antiDefaults: string[]
}

export type Brief = { text: string; accent?: string }

export type Proposal = {
  system: DesignSystem
  fit: number
  rationale: string
}
```

- [ ] **Step 6: Write the loader**

`packages/taste/src/load.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Degraded } from '@fe-design/kernel/engine/rule-types.js'
import { AXIS_NAMES, type DesignSystem } from './types.js'

const isRange = (v: unknown): boolean =>
  Array.isArray(v) && v.length === 2 &&
  v.every(n => typeof n === 'number' && n >= 0 && n <= 1) &&
  (v[0] as number) <= (v[1] as number)

/** Returns the first schema problem found, or null when the system is valid. */
const validate = (s: Partial<DesignSystem>): string | null => {
  if (!s.id) return 'missing id'
  if (!s.axes) return 'missing axes'
  for (const axis of AXIS_NAMES) {
    if (!isRange(s.axes[axis])) return `axes.${axis} must be [low, high] within 0..1, low <= high`
  }
  if (!s.type?.families?.sans) return 'missing type.families.sans'
  if (typeof s.type?.ratio !== 'number') return 'missing type.ratio'
  if (typeof s.type?.baseSize !== 'number') return 'missing type.baseSize'
  if (typeof s.space?.base !== 'number') return 'missing space.base'
  if (typeof s.shape?.radius !== 'number') return 'missing shape.radius'
  if (typeof s.color?.neutralHue !== 'number') return 'missing color.neutralHue'
  if (typeof s.color?.chromaCeiling !== 'number') return 'missing color.chromaCeiling'
  if (typeof s.motion?.duration !== 'number') return 'missing motion.duration'
  if (!Array.isArray(s.signature) || s.signature.length < 3) {
    return 'signature needs at least 3 entries — it is what stops output reading generic'
  }
  if (!Array.isArray(s.antiDefaults) || s.antiDefaults.length < 1) {
    return 'antiDefaults needs at least 1 entry'
  }
  return null
}

export const loadSystems = async (
  dir: string
): Promise<{ systems: DesignSystem[]; degraded: Degraded[] }> => {
  const systems: DesignSystem[] = []
  const degraded: Degraded[] = []

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch (err) {
    degraded.push({
      code: 'SYSTEMS_DIR_MISSING', path: dir,
      detail: (err as Error).message, impact: 'no systems available'
    })
    return { systems, degraded }
  }

  for (const entry of entries.sort()) {
    if (!entry.endsWith('.json')) continue
    const file = join(dir, entry)

    let parsed: DesignSystem
    try {
      parsed = JSON.parse(await readFile(file, 'utf8')) as DesignSystem
    } catch (err) {
      degraded.push({
        code: 'SYSTEM_PARSE_FAILED', path: file,
        detail: (err as Error).message, impact: '1 system not loaded'
      })
      continue
    }

    const problem = validate(parsed)
    if (problem) {
      degraded.push({
        code: 'SYSTEM_INVALID', path: file,
        detail: `System "${parsed.id ?? entry}": ${problem}`,
        impact: '1 system not loaded'
      })
      continue
    }

    systems.push(parsed)
  }

  return { systems, degraded }
}
```

- [ ] **Step 7: Write the three seed systems**

`packages/packs/systems/quiet-precision.json`:

```json
{
  "id": "quiet-precision",
  "axes": { "formality": [0.7, 1.0], "density": [0.4, 0.7], "energy": [0.0, 0.3], "expressiveness": [0.1, 0.4] },
  "fitFor": ["financial", "developer tools", "admin", "dashboard", "data-heavy", "enterprise"],
  "avoidFor": ["consumer social", "kids", "entertainment"],
  "type": {
    "families": { "sans": "Söhne", "serif": "Tiempos Text" },
    "fallbacks": { "sans": ["Inter Tight", "system-ui", "sans-serif"] },
    "ratio": 1.2, "baseSize": 15, "maxWeights": 2
  },
  "space": { "base": 4, "rhythm": "generous", "sectionGap": 96 },
  "shape": { "radius": 2, "depth": "borders" },
  "color": { "strategy": "warm neutral with one deep accent", "neutralHue": 40, "chromaCeiling": 0.04 },
  "motion": { "budget": "minimal", "duration": 120, "easing": "ease-out" },
  "signature": [
    "Borders carry structure. Shadows are for overlays only.",
    "Numbers are tabular-lined and right-aligned.",
    "One accent, used only for the single primary action per surface.",
    "Section breaks are space, never rules."
  ],
  "antiDefaults": ["card-in-card", "gradient-anything", "shadow-on-rest-state"]
}
```

`packages/packs/systems/warm-utility.json`:

```json
{
  "id": "warm-utility",
  "axes": { "formality": [0.3, 0.7], "density": [0.3, 0.6], "energy": [0.2, 0.5], "expressiveness": [0.3, 0.6] },
  "fitFor": ["small business", "invoicing", "booking", "productivity", "solo tools", "freelance"],
  "avoidFor": ["luxury", "enterprise procurement", "gaming"],
  "type": {
    "families": { "sans": "Public Sans", "serif": "Source Serif 4" },
    "fallbacks": { "sans": ["system-ui", "sans-serif"] },
    "ratio": 1.25, "baseSize": 16, "maxWeights": 3
  },
  "space": { "base": 4, "rhythm": "normal", "sectionGap": 72 },
  "shape": { "radius": 8, "depth": "borders" },
  "color": { "strategy": "warm sand neutral with a friendly saturated accent", "neutralHue": 60, "chromaCeiling": 0.06 },
  "motion": { "budget": "moderate", "duration": 180, "easing": "ease-out" },
  "signature": [
    "Rounded corners and warm neutrals; nothing clinical.",
    "Empty states speak in plain sentences, never in icons alone.",
    "Primary action is a filled button; everything else is text or outline.",
    "Errors are amber before they are red."
  ],
  "antiDefaults": ["pure-gray-neutrals", "all-caps-labels", "dense-data-grid"]
}
```

`packages/packs/systems/editorial-clean.json`:

```json
{
  "id": "editorial-clean",
  "axes": { "formality": [0.4, 0.8], "density": [0.1, 0.4], "energy": [0.2, 0.5], "expressiveness": [0.5, 0.9] },
  "fitFor": ["publishing", "documentation", "blog", "portfolio", "agency", "marketing"],
  "avoidFor": ["dashboard", "admin", "data-heavy"],
  "type": {
    "families": { "sans": "Inter Tight", "serif": "Newsreader" },
    "fallbacks": { "sans": ["system-ui", "sans-serif"] },
    "ratio": 1.333, "baseSize": 18, "maxWeights": 3
  },
  "space": { "base": 4, "rhythm": "generous", "sectionGap": 128 },
  "shape": { "radius": 0, "depth": "borders" },
  "color": { "strategy": "paper neutral with a single ink accent", "neutralHue": 30, "chromaCeiling": 0.03 },
  "motion": { "budget": "minimal", "duration": 200, "easing": "ease-out" },
  "signature": [
    "Type leads. Measure is capped near 68 characters.",
    "Headings use the serif; interface chrome uses the sans.",
    "Rules are hairlines, and there are very few of them.",
    "Images run full-measure or full-bleed, never in cards."
  ],
  "antiDefaults": ["card-grid-everything", "rounded-corners", "drop-shadows"]
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm vitest run packages/taste`
Expected: PASS — 5 tests

- [ ] **Step 9: Commit**

```bash
git add packages/taste packages/packs vitest.config.ts tsconfig.json
git commit -m "feat(taste): add design system schema, loader, and three curated systems"
```

---

### Task 2: Brief to axis vector

**Files:**
- Create: `packages/taste/src/axes.ts`
- Test: `packages/taste/tests/axes.test.ts`

**Interfaces:**
- Consumes: `Axes`, `AXIS_NAMES` from Task 1
- Produces: `briefToAxes(text: string): { axes: Axes; matched: string[] }`

A brief is prose. Scoring starts every axis at a neutral 0.5 and nudges it per
matched keyword, so an empty brief lands in the middle rather than nowhere.
`matched` is returned because the rationale in Task 3 has to explain itself.

- [ ] **Step 1: Write the failing test**

`packages/taste/tests/axes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { briefToAxes } from '../src/axes.js'

describe('briefToAxes', () => {
  it('returns a neutral vector for an empty brief', () => {
    const { axes } = briefToAxes('')
    expect(axes).toEqual({ formality: 0.5, density: 0.5, energy: 0.5, expressiveness: 0.5 })
  })

  it('raises formality for regulated, serious domains', () => {
    const { axes } = briefToAxes('banking compliance portal for auditors')
    expect(axes.formality).toBeGreaterThan(0.7)
  })

  it('lowers formality and raises energy for playful products', () => {
    const { axes } = briefToAxes('playful game for kids with fun rewards')
    expect(axes.formality).toBeLessThan(0.4)
    expect(axes.energy).toBeGreaterThan(0.7)
  })

  it('raises density for data-heavy products', () => {
    const { axes } = briefToAxes('analytics dashboard with dense data tables')
    expect(axes.density).toBeGreaterThan(0.7)
  })

  it('raises expressiveness for portfolio and editorial work', () => {
    const { axes } = briefToAxes('portfolio site for a photographer')
    expect(axes.expressiveness).toBeGreaterThan(0.65)
  })

  it('keeps every axis within 0..1 no matter how many keywords hit', () => {
    const { axes } = briefToAxes(
      'bank compliance audit enterprise regulated legal formal institutional serious'
    )
    for (const v of Object.values(axes)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('reports which keywords it matched', () => {
    const { matched } = briefToAxes('invoicing tool for freelancers, trustworthy not corporate')
    expect(matched).toContain('invoicing')
    expect(matched.length).toBeGreaterThan(0)
  })

  it('matches whole words only, so "gaming" does not fire on "imagining"', () => {
    expect(briefToAxes('imagining a calm tool').matched).not.toContain('gaming')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/taste/tests/axes.test.ts`
Expected: FAIL — cannot find module `axes.js`

- [ ] **Step 3: Write the lexicon and scorer**

`packages/taste/src/axes.ts`:

```ts
import { AXIS_NAMES, type Axes, type AxisName } from './types.js'

type Nudge = Partial<Record<AxisName, number>>

/**
 * Keyword lexicon. Each entry nudges one or more axes from the neutral 0.5
 * midpoint. Values are deliberately small: several weak signals agreeing should
 * outweigh one strong word, because briefs are prose and not a form.
 */
const LEXICON: Array<{ words: string[]; nudge: Nudge }> = [
  { words: ['bank', 'banking', 'compliance', 'audit', 'auditors', 'regulated', 'legal',
            'institutional', 'enterprise', 'procurement', 'formal', 'serious', 'government'],
    nudge: { formality: +0.12, energy: -0.06, expressiveness: -0.06 } },

  { words: ['fintech', 'invoice', 'invoicing', 'billing', 'accounting', 'payroll', 'tax'],
    nudge: { formality: +0.08, density: +0.05 } },

  { words: ['playful', 'fun', 'kids', 'children', 'game', 'gaming', 'toy', 'whimsical',
            'delightful', 'quirky'],
    nudge: { formality: -0.14, energy: +0.16, expressiveness: +0.10 } },

  { words: ['dashboard', 'analytics', 'admin', 'console', 'metrics', 'reporting',
            'table', 'tables', 'dense', 'grid', 'operational'],
    nudge: { density: +0.14, formality: +0.05, expressiveness: -0.05 } },

  { words: ['portfolio', 'editorial', 'magazine', 'publishing', 'gallery', 'showcase',
            'photographer', 'agency', 'creative', 'brand'],
    nudge: { expressiveness: +0.16, density: -0.10, energy: +0.05 } },

  { words: ['calm', 'quiet', 'minimal', 'restrained', 'focused', 'simple', 'clean'],
    nudge: { energy: -0.12, expressiveness: -0.06 } },

  { words: ['bold', 'loud', 'vibrant', 'energetic', 'striking', 'dramatic'],
    nudge: { energy: +0.14, expressiveness: +0.10 } },

  { words: ['wellness', 'health', 'meditation', 'care', 'therapy', 'mindful'],
    nudge: { energy: -0.08, formality: -0.05, expressiveness: +0.05 } },

  { words: ['developer', 'devtool', 'cli', 'api', 'infrastructure', 'engineering', 'terminal'],
    nudge: { formality: +0.08, density: +0.10, expressiveness: -0.08 } },

  { words: ['freelancer', 'freelancers', 'solo', 'indie', 'small', 'personal'],
    nudge: { formality: -0.08, density: -0.05 } },

  { words: ['luxury', 'premium', 'boutique', 'high-end', 'elegant'],
    nudge: { formality: +0.10, expressiveness: +0.10, density: -0.08 } },

  { words: ['marketing', 'landing', 'campaign', 'launch', 'conversion'],
    nudge: { expressiveness: +0.10, energy: +0.08, density: -0.08 } },

  { words: ['docs', 'documentation', 'guide', 'handbook', 'reference', 'blog'],
    nudge: { density: -0.08, expressiveness: +0.05, formality: +0.05 } },

  { words: ['trustworthy', 'trusted', 'secure', 'reliable', 'professional'],
    nudge: { formality: +0.08, energy: -0.05 } },

  { words: ['social', 'community', 'chat', 'messaging', 'feed'],
    nudge: { formality: -0.10, energy: +0.08 } }
]

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

export const briefToAxes = (text: string): { axes: Axes; matched: string[] } => {
  const axes: Axes = { formality: 0.5, density: 0.5, energy: 0.5, expressiveness: 0.5 }
  const matched: string[] = []

  const lower = text.toLowerCase()

  for (const entry of LEXICON) {
    for (const word of entry.words) {
      // Whole-word match: "gaming" must not fire inside "imagining".
      const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
      if (!re.test(lower)) continue
      matched.push(word)
      for (const axis of AXIS_NAMES) {
        const delta = entry.nudge[axis]
        if (delta !== undefined) axes[axis] += delta
      }
    }
  }

  for (const axis of AXIS_NAMES) axes[axis] = clamp01(axes[axis])
  return { axes, matched }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/taste/tests/axes.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add packages/taste/src/axes.ts packages/taste/tests/axes.test.ts
git commit -m "feat(taste): map a brief to a design axis vector"
```

---

### Task 3: System selection returning three options

**Files:**
- Create: `packages/taste/src/select.ts`
- Test: `packages/taste/tests/select.test.ts`

**Interfaces:**
- Consumes: `briefToAxes` (Task 2), `loadSystems`/`DesignSystem`/`Proposal` (Task 1)
- Produces: `selectSystems(brief: string, systems: DesignSystem[], limit?: number): Proposal[]`
  and `axisDistance(axes: Axes, system: DesignSystem): number`

Distance is zero when an axis value falls inside the system's range, and grows
with the gap otherwise. `fitFor` and `avoidFor` adjust the score after the
geometry, so an explicit domain match can outrank a marginally closer vector.

- [ ] **Step 1: Write the failing test**

`packages/taste/tests/select.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { selectSystems, axisDistance } from '../src/select.js'
import { loadSystems } from '../src/load.js'
import { briefToAxes } from '../src/axes.js'
import { SYSTEMS_DIR } from '@fe-design/packs'
import type { DesignSystem } from '../src/types.js'

const load = async (): Promise<DesignSystem[]> =>
  (await loadSystems(SYSTEMS_DIR)).systems

describe('axisDistance', () => {
  it('is zero when every axis falls inside the system range', async () => {
    const sys = (await load()).find(s => s.id === 'quiet-precision')!
    const axes = { formality: 0.8, density: 0.5, energy: 0.1, expressiveness: 0.2 }
    expect(axisDistance(axes, sys)).toBe(0)
  })

  it('grows as the vector moves further outside the range', async () => {
    const sys = (await load()).find(s => s.id === 'quiet-precision')!
    const near = { formality: 0.6, density: 0.5, energy: 0.1, expressiveness: 0.2 }
    const far = { formality: 0.1, density: 0.5, energy: 0.1, expressiveness: 0.2 }
    expect(axisDistance(far, sys)).toBeGreaterThan(axisDistance(near, sys))
  })
})

describe('selectSystems', () => {
  it('returns three proposals, never one', async () => {
    const proposals = selectSystems('invoicing tool for freelancers', await load())
    expect(proposals).toHaveLength(3)
  })

  it('returns them best fit first, with fit descending', async () => {
    const proposals = selectSystems('analytics dashboard for auditors', await load())
    const fits = proposals.map(p => p.fit)
    expect(fits).toEqual([...fits].sort((a, b) => b - a))
  })

  it('scores fit between 0 and 1', async () => {
    for (const p of selectSystems('anything at all', await load())) {
      expect(p.fit).toBeGreaterThanOrEqual(0)
      expect(p.fit).toBeLessThanOrEqual(1)
    }
  })

  it('prefers a system whose fitFor names the domain', async () => {
    const top = selectSystems('portfolio site for a photographer', await load())[0]!
    expect(top.system.id).toBe('editorial-clean')
  })

  it('demotes a system whose avoidFor names the domain', async () => {
    const proposals = selectSystems('dense admin dashboard', await load())
    const editorial = proposals.findIndex(p => p.system.id === 'editorial-clean')
    const quiet = proposals.findIndex(p => p.system.id === 'quiet-precision')
    expect(quiet).toBeLessThan(editorial)
  })

  it('gives every proposal a rationale mentioning the system', async () => {
    for (const p of selectSystems('banking portal', await load())) {
      expect(p.rationale.length).toBeGreaterThan(10)
    }
  })

  it('returns fewer than three only when fewer systems exist', async () => {
    const one = (await load()).slice(0, 1)
    expect(selectSystems('anything', one)).toHaveLength(1)
  })

  it('is deterministic for the same brief', async () => {
    const systems = await load()
    const a = selectSystems('calm banking tool', systems).map(p => p.system.id)
    const b = selectSystems('calm banking tool', systems).map(p => p.system.id)
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/taste/tests/select.test.ts`
Expected: FAIL — cannot find module `select.js`

- [ ] **Step 3: Write the selector**

`packages/taste/src/select.ts`:

```ts
import { briefToAxes } from './axes.js'
import { AXIS_NAMES, type Axes, type DesignSystem, type Proposal } from './types.js'

/** 0 when inside the range; otherwise the gap to the nearest edge. */
const gap = (v: number, [lo, hi]: [number, number]): number =>
  v < lo ? lo - v : v > hi ? v - hi : 0

export const axisDistance = (axes: Axes, system: DesignSystem): number => {
  let sum = 0
  for (const axis of AXIS_NAMES) sum += gap(axes[axis], system.axes[axis]) ** 2
  return Math.sqrt(sum)
}

const domainHits = (text: string, terms: string[]): string[] =>
  terms.filter(t => text.includes(t.toLowerCase()))

const describe = (
  system: DesignSystem, fitHits: string[], avoidHits: string[]
): string => {
  if (avoidHits.length > 0) {
    return `${system.color.strategy}; explicitly not intended for ${avoidHits.join(', ')}`
  }
  if (fitHits.length > 0) {
    return `${system.color.strategy}; built for ${fitHits.join(', ')}`
  }
  return `${system.color.strategy}; ${system.signature[0] ?? ''}`.trim()
}

export const selectSystems = (
  brief: string, systems: DesignSystem[], limit = 3
): Proposal[] => {
  const { axes } = briefToAxes(brief)
  const lower = brief.toLowerCase()

  const scored = systems.map(system => {
    const fitHits = domainHits(lower, system.fitFor)
    const avoidHits = domainHits(lower, system.avoidFor)

    // Geometry first, then domain evidence. A named domain match is worth more
    // than a small vector advantage, because the brief said it out loud.
    const distance = axisDistance(axes, system)
    const raw = 1 - Math.min(1, distance)
    const adjusted = raw + fitHits.length * 0.12 - avoidHits.length * 0.30

    return {
      system,
      fit: Math.round(Math.min(1, Math.max(0, adjusted)) * 100) / 100,
      rationale: describe(system, fitHits, avoidHits)
    }
  })

  // Ties break on id so the same brief always yields the same order.
  scored.sort((a, b) => b.fit - a.fit || a.system.id.localeCompare(b.system.id))
  return scored.slice(0, limit)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/taste/tests/select.test.ts`
Expected: PASS — 10 tests

If "prefers a system whose fitFor names the domain" fails, check that
`editorial-clean.json` lists `portfolio` in `fitFor` — the assertion depends on
that entry, not on tuning the weights.

- [ ] **Step 5: Commit**

```bash
git add packages/taste/src/select.ts packages/taste/tests/select.test.ts
git commit -m "feat(taste): select three candidate systems with rationale"
```

---

### Task 4: OKLCH ramp generation

**Files:**
- Create: `packages/taste/src/color/ramp.ts`
- Test: `packages/taste/tests/color/ramp.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `type Ramp = Record<RampStep, string>` where
    `type RampStep = 50|100|200|300|400|500|600|700|800|900|950`
  - `RAMP_STEPS: RampStep[]`
  - `LIGHTNESS: Record<RampStep, number>`
  - `buildRamp(seedHex: string, chromaCeiling: number): Ramp`
  - `buildNeutralRamp(hue: number, chromaCeiling: number): Ramp`
  - `lightnessOf(hex: string): number`

HSL is not used anywhere. Its lightness is not perceptual, which is why ramps
built from it go muddy through the mid range and read as cheap. OKLCH holds
perceived lightness fixed per step, so a ramp is even by construction.

- [ ] **Step 1: Write the failing test**

`packages/taste/tests/color/ramp.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { oklch } from 'culori'
import { buildRamp, buildNeutralRamp, RAMP_STEPS, LIGHTNESS } from '../../src/color/ramp.js'

describe('buildRamp', () => {
  it('produces every step as a hex string', () => {
    const ramp = buildRamp('#1F4B3F', 0.06)
    for (const step of RAMP_STEPS) {
      expect(ramp[step], `step ${step}`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('descends monotonically in perceived lightness', () => {
    const ramp = buildRamp('#1F4B3F', 0.06)
    const ls = RAMP_STEPS.map(s => oklch(ramp[s])!.l)
    for (let i = 1; i < ls.length; i++) {
      expect(ls[i]!, `step ${RAMP_STEPS[i]} vs ${RAMP_STEPS[i - 1]}`)
        .toBeLessThan(ls[i - 1]!)
    }
  })

  it('holds the seed hue across every step', () => {
    const seedHue = oklch('#1F4B3F')!.h!
    const ramp = buildRamp('#1F4B3F', 0.06)
    for (const step of RAMP_STEPS) {
      const h = oklch(ramp[step])!.h
      // Near-neutral ends can lose hue entirely; only check where chroma exists.
      if (h !== undefined && oklch(ramp[step])!.c > 0.01) {
        expect(Math.abs(h - seedHue), `step ${step}`).toBeLessThan(6)
      }
    }
  })

  it('never exceeds the chroma ceiling', () => {
    const ramp = buildRamp('#1F4B3F', 0.04)
    for (const step of RAMP_STEPS) {
      expect(oklch(ramp[step])!.c, `step ${step}`).toBeLessThanOrEqual(0.0401)
    }
  })

  it('is deterministic', () => {
    expect(buildRamp('#1F4B3F', 0.06)).toEqual(buildRamp('#1F4B3F', 0.06))
  })

  it('accepts a seed in any css color form', () => {
    expect(buildRamp('rgb(31, 75, 63)', 0.06)[500]).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('throws on an unparseable seed rather than emitting garbage', () => {
    expect(() => buildRamp('not-a-color', 0.06)).toThrow(/could not parse/i)
  })

  it('hits the documented lightness target at each step within tolerance', () => {
    const ramp = buildRamp('#1F4B3F', 0.06)
    for (const step of RAMP_STEPS) {
      expect(Math.abs(oklch(ramp[step])!.l - LIGHTNESS[step]), `step ${step}`)
        .toBeLessThan(0.04)
    }
  })
})

describe('buildNeutralRamp', () => {
  it('produces a tinted neutral, never pure gray', () => {
    const ramp = buildNeutralRamp(40, 0.04)
    // A mid step should carry a little chroma: pure #808080 is the tell.
    expect(oklch(ramp[500])!.c).toBeGreaterThan(0.002)
    expect(ramp[500]!.toLowerCase()).not.toBe('#808080')
  })

  it('stays far below the accent chroma ceiling', () => {
    const ramp = buildNeutralRamp(40, 0.04)
    for (const step of RAMP_STEPS) {
      expect(oklch(ramp[step])!.c, `step ${step}`).toBeLessThanOrEqual(0.0201)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/taste/tests/color/ramp.test.ts`
Expected: FAIL — cannot find module `ramp.js`

- [ ] **Step 3: Write the ramp builder**

`packages/taste/src/color/ramp.ts`:

```ts
import { oklch, formatHex, clampChroma } from 'culori'

export const RAMP_STEPS = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950
] as const

export type RampStep = typeof RAMP_STEPS[number]
export type Ramp = Record<RampStep, string>

/**
 * Perceived lightness per step, fixed rather than derived from the seed. Two
 * different accents therefore produce ramps that are equally light at 500,
 * which is what lets the contrast solver in solve.ts reason about steps.
 */
export const LIGHTNESS: Record<RampStep, number> = {
  50: 0.97, 100: 0.94, 200: 0.89, 300: 0.82, 400: 0.72, 500: 0.62,
  600: 0.55, 700: 0.47, 800: 0.39, 900: 0.32, 950: 0.24
}

/**
 * Chroma multiplier per step. Colour peaks through the middle and falls off at
 * both ends: near-white and near-black tints hold very little chroma before
 * they start to look dirty.
 */
const CHROMA_CURVE: Record<RampStep, number> = {
  50: 0.18, 100: 0.32, 200: 0.55, 300: 0.76, 400: 0.92, 500: 1.0,
  600: 0.98, 700: 0.90, 800: 0.78, 900: 0.62, 950: 0.48
}

export const lightnessOf = (hex: string): number => {
  const c = oklch(hex)
  if (!c) throw new Error(`could not parse color: ${hex}`)
  return c.l
}

const stepHex = (l: number, c: number, h: number): string => {
  // clampChroma pulls the colour back into sRGB while holding lightness and
  // hue, which is what keeps the ramp even instead of clipping to a corner.
  const hex = formatHex(clampChroma({ mode: 'oklch', l, c, h }, 'oklch'))
  if (!hex) throw new Error('could not format color step')
  return hex
}

export const buildRamp = (seedHex: string, chromaCeiling: number): Ramp => {
  const seed = oklch(seedHex)
  if (!seed) throw new Error(`could not parse color: ${seedHex}`)

  const hue = seed.h ?? 0
  const peak = Math.min(seed.c, chromaCeiling)

  const ramp = {} as Ramp
  for (const step of RAMP_STEPS) {
    ramp[step] = stepHex(LIGHTNESS[step], peak * CHROMA_CURVE[step], hue)
  }
  return ramp
}

export const buildNeutralRamp = (hue: number, chromaCeiling: number): Ramp => {
  // Neutrals carry roughly half the accent ceiling: enough to read as warm or
  // cool rather than as #808080, not enough to look like a colour.
  const peak = Math.min(chromaCeiling / 2, 0.02)

  const ramp = {} as Ramp
  for (const step of RAMP_STEPS) {
    ramp[step] = stepHex(LIGHTNESS[step], peak * CHROMA_CURVE[step], hue)
  }
  return ramp
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/taste/tests/color/ramp.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add packages/taste/src/color/ramp.ts packages/taste/tests/color/ramp.test.ts
git commit -m "feat(taste): generate perceptual OKLCH color ramps"
```

---

### Task 5: Contrast solving

**Files:**
- Create: `packages/taste/src/color/solve.ts`
- Test: `packages/taste/tests/color/solve.test.ts`

**Interfaces:**
- Consumes: `Ramp`, `RampStep`, `RAMP_STEPS` (Task 4)
- Produces:
  - `type SemanticName = 'fg' | 'muted' | 'bg' | 'surface' | 'border' | 'primary' | 'onPrimary'`
  - `TARGETS: Record<'fg'|'muted'|'border'|'onPrimary', number>`
  - `type Semantics = Record<SemanticName, string>`
  - `solveSemantics(neutral: Ramp, accent: Ramp): { semantics: Semantics; report: PairReport[] }`
  - `type PairReport = { pair: string; ratio: number; target: number; meets: boolean }`
  - `contrast(a: string, b: string): number`

Contrast is not checked after the fact; each role is filled by walking the ramp
for the first step that satisfies its target. Accessibility becomes a property
of construction rather than something to remember.

- [ ] **Step 1: Write the failing test**

`packages/taste/tests/color/solve.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildRamp, buildNeutralRamp } from '../../src/color/ramp.js'
import { solveSemantics, contrast, TARGETS } from '../../src/color/solve.js'

const neutral = buildNeutralRamp(40, 0.04)
const accent = buildRamp('#1F4B3F', 0.06)

describe('contrast', () => {
  it('matches known WCAG extremes', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 1)
  })
})

describe('solveSemantics', () => {
  it('fills every semantic role with a hex value', () => {
    const { semantics } = solveSemantics(neutral, accent)
    for (const [role, value] of Object.entries(semantics)) {
      expect(value, role).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('meets the body text target', () => {
    const { semantics } = solveSemantics(neutral, accent)
    expect(contrast(semantics.fg, semantics.bg)).toBeGreaterThanOrEqual(TARGETS.fg)
  })

  it('meets the muted text target', () => {
    const { semantics } = solveSemantics(neutral, accent)
    expect(contrast(semantics.muted, semantics.bg)).toBeGreaterThanOrEqual(TARGETS.muted)
  })

  it('meets the non-text border target', () => {
    const { semantics } = solveSemantics(neutral, accent)
    expect(contrast(semantics.border, semantics.bg)).toBeGreaterThanOrEqual(TARGETS.border)
  })

  it('meets the on-primary target', () => {
    const { semantics } = solveSemantics(neutral, accent)
    expect(contrast(semantics.onPrimary, semantics.primary))
      .toBeGreaterThanOrEqual(TARGETS.onPrimary)
  })

  it('reports every pair as meeting its target', () => {
    const { report } = solveSemantics(neutral, accent)
    expect(report.length).toBeGreaterThanOrEqual(4)
    for (const r of report) {
      expect(r.meets, `${r.pair} was ${r.ratio.toFixed(2)}, target ${r.target}`).toBe(true)
    }
  })

  it('holds for every hue around the wheel', () => {
    for (let hue = 0; hue < 360; hue += 15) {
      const a = buildRamp(`oklch(0.55 0.12 ${hue})`, 0.12)
      const { report } = solveSemantics(neutral, a)
      for (const r of report) {
        expect(r.meets, `hue ${hue}: ${r.pair} was ${r.ratio.toFixed(2)}`).toBe(true)
      }
    }
  })

  it('keeps surface distinct from bg so elevation is visible', () => {
    const { semantics } = solveSemantics(neutral, accent)
    expect(semantics.surface).not.toBe(semantics.bg)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/taste/tests/color/solve.test.ts`
Expected: FAIL — cannot find module `solve.js`

- [ ] **Step 3: Write the solver**

`packages/taste/src/color/solve.ts`:

```ts
import { wcagContrast, parse } from 'culori'
import { RAMP_STEPS, type Ramp, type RampStep } from './ramp.js'

export type SemanticName =
  | 'bg' | 'surface' | 'fg' | 'muted' | 'border' | 'primary' | 'onPrimary'

export type Semantics = Record<SemanticName, string>

export type PairReport = {
  pair: string
  ratio: number
  target: number
  meets: boolean
}

/**
 * WCAG 2.1 AA is the floor. Body text takes AAA because on a near-white
 * background it costs nothing — the darkest neutral steps clear 7:1 anyway.
 */
export const TARGETS = {
  fg: 7.0,
  muted: 4.5,
  border: 3.0,
  onPrimary: 4.5
} as const

export const contrast = (a: string, b: string): number => {
  const ca = parse(a), cb = parse(b)
  if (!ca || !cb) throw new Error(`could not parse color pair: ${a} / ${b}`)
  return wcagContrast(ca, cb)
}

/** Darkest-first, so the first hit is the lightest step that still passes. */
const LIGHT_TO_DARK: RampStep[] = [...RAMP_STEPS]
const DARK_TO_LIGHT: RampStep[] = [...RAMP_STEPS].reverse()

const firstMeeting = (
  ramp: Ramp, order: RampStep[], against: string, target: number
): string | null => {
  for (const step of order) {
    if (contrast(ramp[step], against) >= target) return ramp[step]
  }
  return null
}

export const solveSemantics = (
  neutral: Ramp, accent: Ramp
): { semantics: Semantics; report: PairReport[] } => {
  const bg = neutral[50]
  const surface = neutral[100]

  // Walk from the light end so text is the lightest value that still clears the
  // target — pinning everything to the darkest step would flatten hierarchy.
  const fg = firstMeeting(neutral, LIGHT_TO_DARK, bg, TARGETS.fg) ?? neutral[950]
  const muted = firstMeeting(neutral, LIGHT_TO_DARK, bg, TARGETS.muted) ?? neutral[700]
  const border = firstMeeting(neutral, LIGHT_TO_DARK, bg, TARGETS.border) ?? neutral[300]

  // Primary must carry legible text on top. Try each accent step and keep the
  // first that works with either the lightest or darkest neutral.
  let primary = accent[600]
  let onPrimary = neutral[50]
  for (const step of DARK_TO_LIGHT) {
    const candidate = accent[step]
    const light = contrast(neutral[50], candidate)
    const dark = contrast(neutral[950], candidate)
    if (light >= TARGETS.onPrimary || dark >= TARGETS.onPrimary) {
      primary = candidate
      onPrimary = light >= dark ? neutral[50] : neutral[950]
      break
    }
  }

  const semantics: Semantics = { bg, surface, fg, muted, border, primary, onPrimary }

  const report: PairReport[] = [
    { pair: 'fg on bg', ratio: contrast(fg, bg), target: TARGETS.fg, meets: false },
    { pair: 'muted on bg', ratio: contrast(muted, bg), target: TARGETS.muted, meets: false },
    { pair: 'border on bg', ratio: contrast(border, bg), target: TARGETS.border, meets: false },
    { pair: 'onPrimary on primary', ratio: contrast(onPrimary, primary), target: TARGETS.onPrimary, meets: false }
  ].map(r => ({ ...r, meets: r.ratio >= r.target }))

  return { semantics, report }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/taste/tests/color/solve.test.ts`
Expected: PASS — 9 tests

The all-hues test is the important one. If a hue fails `onPrimary`, the accent
ramp does not reach a dark enough step — widen the search rather than lowering
`TARGETS`. Lowering a contrast target to make a test pass defeats the point of
solving contrast structurally.

- [ ] **Step 5: Commit**

```bash
git add packages/taste/src/color/solve.ts packages/taste/tests/color/solve.test.ts
git commit -m "feat(taste): solve semantic color pairs against WCAG targets"
```

---

### Task 6: Dark mode derivation

**Files:**
- Create: `packages/taste/src/color/dark.ts`
- Test: `packages/taste/tests/color/dark.test.ts`

**Interfaces:**
- Consumes: `Ramp`, `RampStep`, `RAMP_STEPS` (Task 4); `Semantics`, `TARGETS`, `contrast`, `PairReport` (Task 5)
- Produces: `deriveDark(neutral: Ramp, accent: Ramp): { semantics: Semantics; report: PairReport[] }`

Inversion is the tell. Swapping light for dark keeps the same chroma, and
saturated colour glares on a dark ground; it also flattens elevation, because
shadows stop reading. Dark mode is derived instead: surfaces rise by lightness,
and chroma comes down.

- [ ] **Step 1: Write the failing test**

`packages/taste/tests/color/dark.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { oklch } from 'culori'
import { buildRamp, buildNeutralRamp } from '../../src/color/ramp.js'
import { solveSemantics, contrast, TARGETS } from '../../src/color/solve.js'
import { deriveDark } from '../../src/color/dark.js'

const neutral = buildNeutralRamp(40, 0.04)
const accent = buildRamp('#1F4B3F', 0.06)

describe('deriveDark', () => {
  it('produces a dark background', () => {
    const { semantics } = deriveDark(neutral, accent)
    expect(oklch(semantics.bg)!.l).toBeLessThan(0.3)
  })

  it('produces light foreground text', () => {
    const { semantics } = deriveDark(neutral, accent)
    expect(oklch(semantics.fg)!.l).toBeGreaterThan(0.85)
  })

  it('raises surface above bg by lightness, not by shadow', () => {
    const { semantics } = deriveDark(neutral, accent)
    expect(oklch(semantics.surface)!.l).toBeGreaterThan(oklch(semantics.bg)!.l)
  })

  it('meets every contrast target it reports', () => {
    const { report } = deriveDark(neutral, accent)
    for (const r of report) {
      expect(r.meets, `${r.pair} was ${r.ratio.toFixed(2)}, target ${r.target}`).toBe(true)
    }
  })

  it('reduces accent chroma relative to the light scheme', () => {
    const light = solveSemantics(neutral, accent).semantics
    const dark = deriveDark(neutral, accent).semantics
    expect(oklch(dark.primary)!.c).toBeLessThan(oklch(light.primary)!.c * 0.95)
  })

  it('is not a straight inversion of the light scheme', () => {
    const light = solveSemantics(neutral, accent).semantics
    const dark = deriveDark(neutral, accent).semantics
    expect(dark.bg).not.toBe(light.fg)
    expect(dark.primary).not.toBe(light.primary)
  })

  it('holds every target for every hue around the wheel', () => {
    for (let hue = 0; hue < 360; hue += 15) {
      const a = buildRamp(`oklch(0.55 0.12 ${hue})`, 0.12)
      for (const r of deriveDark(neutral, a).report) {
        expect(r.meets, `hue ${hue}: ${r.pair} was ${r.ratio.toFixed(2)}`).toBe(true)
      }
    }
  })

  it('is deterministic', () => {
    expect(deriveDark(neutral, accent).semantics)
      .toEqual(deriveDark(neutral, accent).semantics)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/taste/tests/color/dark.test.ts`
Expected: FAIL — cannot find module `dark.js`

- [ ] **Step 3: Write the derivation**

`packages/taste/src/color/dark.ts`:

```ts
import { oklch, formatHex, clampChroma } from 'culori'
import { RAMP_STEPS, type Ramp, type RampStep } from './ramp.js'
import { contrast, TARGETS, type Semantics, type PairReport } from './solve.js'

/** Saturated colour glares against a dark ground, so chroma comes down. */
const DARK_CHROMA_SCALE = 0.85

const desaturate = (hex: string, scale: number): string => {
  const c = oklch(hex)
  if (!c) throw new Error(`could not parse color: ${hex}`)
  const out = formatHex(clampChroma({ ...c, c: c.c * scale }, 'oklch'))
  if (!out) throw new Error(`could not format color: ${hex}`)
  return out
}

const DARK_TO_LIGHT: RampStep[] = [...RAMP_STEPS].reverse()

const firstMeeting = (
  ramp: Ramp, order: RampStep[], against: string, target: number
): string | null => {
  for (const step of order) {
    if (contrast(ramp[step], against) >= target) return ramp[step]
  }
  return null
}

export const deriveDark = (
  neutral: Ramp, accent: Ramp
): { semantics: Semantics; report: PairReport[] } => {
  // Elevation is lightness, not shadow: 950 is the page, 900 sits above it.
  const bg = neutral[950]
  const surface = neutral[900]

  // Walk from the dark end so text is the dimmest value that still clears the
  // target, which keeps a readable hierarchy instead of pinning all text white.
  const fg = firstMeeting(neutral, DARK_TO_LIGHT, bg, TARGETS.fg) ?? neutral[50]
  const muted = firstMeeting(neutral, DARK_TO_LIGHT, bg, TARGETS.muted) ?? neutral[300]
  const border = firstMeeting(neutral, DARK_TO_LIGHT, bg, TARGETS.border) ?? neutral[700]

  let primary = desaturate(accent[400], DARK_CHROMA_SCALE)
  let onPrimary = neutral[950]
  for (const step of RAMP_STEPS) {
    const candidate = desaturate(accent[step], DARK_CHROMA_SCALE)
    const light = contrast(neutral[50], candidate)
    const dark = contrast(neutral[950], candidate)
    if (light >= TARGETS.onPrimary || dark >= TARGETS.onPrimary) {
      primary = candidate
      onPrimary = dark >= light ? neutral[950] : neutral[50]
      break
    }
  }

  const semantics: Semantics = { bg, surface, fg, muted, border, primary, onPrimary }

  const report: PairReport[] = [
    { pair: 'dark fg on bg', ratio: contrast(fg, bg), target: TARGETS.fg, meets: false },
    { pair: 'dark muted on bg', ratio: contrast(muted, bg), target: TARGETS.muted, meets: false },
    { pair: 'dark border on bg', ratio: contrast(border, bg), target: TARGETS.border, meets: false },
    { pair: 'dark onPrimary on primary', ratio: contrast(onPrimary, primary), target: TARGETS.onPrimary, meets: false }
  ].map(r => ({ ...r, meets: r.ratio >= r.target }))

  return { semantics, report }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/taste/tests/color/dark.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add packages/taste/src/color/dark.ts packages/taste/tests/color/dark.test.ts
git commit -m "feat(taste): derive dark mode by remapping rather than inverting"
```

---

### Task 7: Type and space scales

**Files:**
- Create: `packages/taste/src/scales.ts`
- Test: `packages/taste/tests/scales.test.ts`

**Interfaces:**
- Consumes: `DesignSystem` (Task 1)
- Produces:
  - `typeScale(baseSize: number, ratio: number, steps?: number): number[]`
  - `spaceScale(base: number, rhythm: 'tight' | 'normal' | 'generous'): number[]`
  - `radiusScale(radius: number): number[]`

- [ ] **Step 1: Write the failing test**

`packages/taste/tests/scales.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { typeScale, spaceScale, radiusScale } from '../src/scales.js'

describe('typeScale', () => {
  it('produces whole pixel values', () => {
    for (const n of typeScale(16, 1.25)) expect(Number.isInteger(n)).toBe(true)
  })

  it('ascends strictly, so no two steps collide', () => {
    const s = typeScale(15, 1.2)
    for (let i = 1; i < s.length; i++) expect(s[i]!).toBeGreaterThan(s[i - 1]!)
  })

  it('includes the base size', () => {
    expect(typeScale(16, 1.25)).toContain(16)
  })

  it('caps at seven steps, because more stops meaning anything', () => {
    expect(typeScale(16, 1.25).length).toBeLessThanOrEqual(7)
  })

  it('keeps the smallest step legible', () => {
    expect(Math.min(...typeScale(16, 1.25))).toBeGreaterThanOrEqual(12)
  })

  it('produces a wider spread for a larger ratio', () => {
    const narrow = typeScale(16, 1.2)
    const wide = typeScale(16, 1.4)
    expect(Math.max(...wide)).toBeGreaterThan(Math.max(...narrow))
  })
})

describe('spaceScale', () => {
  it('starts at zero and ascends', () => {
    const s = spaceScale(4, 'normal')
    expect(s[0]).toBe(0)
    for (let i = 1; i < s.length; i++) expect(s[i]!).toBeGreaterThan(s[i - 1]!)
  })

  it('is a multiple of the base unit throughout', () => {
    for (const n of spaceScale(4, 'normal')) expect(n % 4).toBe(0)
  })

  it('stretches for a generous rhythm and compresses for a tight one', () => {
    const tight = spaceScale(4, 'tight')
    const generous = spaceScale(4, 'generous')
    expect(Math.max(...generous)).toBeGreaterThan(Math.max(...tight))
  })
})

describe('radiusScale', () => {
  it('always offers a square option', () => {
    expect(radiusScale(8)).toContain(0)
  })

  it('includes the system radius', () => {
    expect(radiusScale(8)).toContain(8)
  })

  it('ascends without duplicates even when the system radius is zero', () => {
    const s = radiusScale(0)
    expect(new Set(s).size).toBe(s.length)
    for (let i = 1; i < s.length; i++) expect(s[i]!).toBeGreaterThan(s[i - 1]!)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/taste/tests/scales.test.ts`
Expected: FAIL — cannot find module `scales.js`

- [ ] **Step 3: Write the scales**

`packages/taste/src/scales.ts`:

```ts
/**
 * Modular type scale, snapped to whole pixels and capped at seven steps.
 * Beyond that, adjacent steps stop being distinguishable and hierarchy loses
 * its meaning. Two steps below the base and four above covers caption through
 * display without inventing sizes nobody uses.
 */
export const typeScale = (baseSize: number, ratio: number, steps = 7): number[] => {
  const below = 2
  const out = new Set<number>()

  for (let i = -below; i < steps - below; i++) {
    const px = Math.round(baseSize * ratio ** i)
    out.add(Math.max(12, px))
  }

  return [...out].sort((a, b) => a - b).slice(0, steps)
}

const RHYTHM_MULTIPLIERS: Record<'tight' | 'normal' | 'generous', number[]> = {
  tight:    [0, 1, 2, 3, 4, 5, 6, 8, 10],
  normal:   [0, 1, 2, 3, 4, 6, 8, 12, 16],
  generous: [0, 1, 2, 4, 6, 8, 12, 16, 24]
}

export const spaceScale = (
  base: number, rhythm: 'tight' | 'normal' | 'generous'
): number[] => RHYTHM_MULTIPLIERS[rhythm].map(m => m * base)

/**
 * A square option always exists: some elements should not be rounded even in a
 * rounded system, and the alternative is an arbitrary value in the markup.
 */
export const radiusScale = (radius: number): number[] => {
  const out = new Set<number>([0, radius, radius * 2, 9999])
  return [...out].sort((a, b) => a - b)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/taste/tests/scales.test.ts`
Expected: PASS — 12 tests

- [ ] **Step 5: Commit**

```bash
git add packages/taste/src/scales.ts packages/taste/tests/scales.test.ts
git commit -m "feat(taste): generate type, space, and radius scales"
```

---

### Task 8: Compose a system into a full token set

**Files:**
- Create: `packages/taste/src/compose.ts`
- Test: `packages/taste/tests/compose.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4–7
- Produces:
  - `type ComposedTokens = { system: DesignSystem; accent: string; space: number[]; type: { steps: number[]; families: {...} }; radius: number[]; ramps: { neutral: Ramp; accent: Ramp }; light: Semantics; dark: Semantics; report: PairReport[] }`
  - `composeSystem(system: DesignSystem, accentHex?: string): ComposedTokens`
  - `DEFAULT_ACCENTS: Record<string, string>`

- [ ] **Step 1: Write the failing test**

`packages/taste/tests/compose.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { composeSystem } from '../src/compose.js'
import { loadSystems } from '../src/load.js'
import { contrast } from '../src/color/solve.js'
import { SYSTEMS_DIR } from '@fe-design/packs'
import type { DesignSystem } from '../src/types.js'

const load = async (): Promise<DesignSystem[]> =>
  (await loadSystems(SYSTEMS_DIR)).systems

describe('composeSystem', () => {
  it('fills every token group', async () => {
    const sys = (await load())[0]!
    const t = composeSystem(sys, '#1F4B3F')
    expect(t.space.length).toBeGreaterThan(4)
    expect(t.type.steps.length).toBeGreaterThan(4)
    expect(t.radius.length).toBeGreaterThan(1)
    expect(Object.keys(t.ramps.accent).length).toBe(11)
    expect(Object.keys(t.ramps.neutral).length).toBe(11)
  })

  it('carries the system through unchanged', async () => {
    const sys = (await load()).find(s => s.id === 'quiet-precision')!
    const t = composeSystem(sys, '#1F4B3F')
    expect(t.system.id).toBe('quiet-precision')
    expect(t.system.signature).toEqual(sys.signature)
  })

  it('honours an explicit accent', async () => {
    const sys = (await load())[0]!
    expect(composeSystem(sys, '#7C3AED').accent).toBe('#7C3AED')
  })

  it('falls back to a per-system default accent when none is given', async () => {
    const sys = (await load())[0]!
    expect(composeSystem(sys).accent).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('respects the system chroma ceiling', async () => {
    const sys = (await load()).find(s => s.id === 'quiet-precision')!
    const t = composeSystem(sys, '#7C3AED')
    const { oklch } = await import('culori')
    for (const hex of Object.values(t.ramps.accent)) {
      expect(oklch(hex)!.c).toBeLessThanOrEqual(sys.color.chromaCeiling + 0.001)
    }
  })

  it('meets every contrast target in both schemes, for every system', async () => {
    for (const sys of await load()) {
      const t = composeSystem(sys, '#1F4B3F')
      for (const r of t.report) {
        expect(r.meets, `${sys.id}: ${r.pair} was ${r.ratio.toFixed(2)}`).toBe(true)
      }
      expect(contrast(t.light.fg, t.light.bg)).toBeGreaterThanOrEqual(7)
      expect(contrast(t.dark.fg, t.dark.bg)).toBeGreaterThanOrEqual(7)
    }
  })

  it('is deterministic', async () => {
    const sys = (await load())[0]!
    expect(composeSystem(sys, '#1F4B3F')).toEqual(composeSystem(sys, '#1F4B3F'))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/taste/tests/compose.test.ts`
Expected: FAIL — cannot find module `compose.js`

- [ ] **Step 3: Write the composer**

`packages/taste/src/compose.ts`:

```ts
import { buildRamp, buildNeutralRamp, type Ramp } from './color/ramp.js'
import { solveSemantics, type Semantics, type PairReport } from './color/solve.js'
import { deriveDark } from './color/dark.js'
import { typeScale, spaceScale, radiusScale } from './scales.js'
import type { DesignSystem } from './types.js'

export type ComposedTokens = {
  system: DesignSystem
  accent: string
  space: number[]
  type: { steps: number[]; families: { sans: string; serif: string }; fallbacks: string[] }
  radius: number[]
  ramps: { neutral: Ramp; accent: Ramp }
  light: Semantics
  dark: Semantics
  report: PairReport[]
}

/**
 * Fallback accents per system, chosen to suit each one's character. A generic
 * default across all systems would undo the point of curating them.
 */
export const DEFAULT_ACCENTS: Record<string, string> = {
  'quiet-precision': '#1F4B3F',
  'warm-utility': '#B4531F',
  'editorial-clean': '#1B3A6B'
}

const FALLBACK_ACCENT = '#1F4B3F'

export const composeSystem = (
  system: DesignSystem, accentHex?: string
): ComposedTokens => {
  const accent = accentHex
    ?? DEFAULT_ACCENTS[system.id]
    ?? FALLBACK_ACCENT

  const ramps = {
    accent: buildRamp(accent, system.color.chromaCeiling),
    neutral: buildNeutralRamp(system.color.neutralHue, system.color.chromaCeiling)
  }

  const { semantics: light, report: lightReport } =
    solveSemantics(ramps.neutral, ramps.accent)
  const { semantics: dark, report: darkReport } =
    deriveDark(ramps.neutral, ramps.accent)

  return {
    system,
    accent,
    space: spaceScale(system.space.base, system.space.rhythm),
    type: {
      steps: typeScale(system.type.baseSize, system.type.ratio),
      families: system.type.families,
      fallbacks: system.type.fallbacks.sans
    },
    radius: radiusScale(system.shape.radius),
    ramps,
    light,
    dark,
    report: [...lightReport, ...darkReport]
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/taste/tests/compose.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add packages/taste/src/compose.ts packages/taste/tests/compose.test.ts
git commit -m "feat(taste): compose a curated system into a complete token set"
```

---

### Task 9: Marker-delimited idempotent emission

**Files:**
- Create: `packages/taste/src/emit/markers.ts`
- Test: `packages/taste/tests/emit/markers.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `START(tag: string): string`, `END(tag: string): string`
  - `spliceBlock(existing: string | null, tag: string, body: string, comment: 'js' | 'css'): string`
  - `writeBlock(path: string, tag: string, body: string, comment: 'js' | 'css'): Promise<'created' | 'updated' | 'unchanged'>`

Regeneration must not destroy hand edits, and running bootstrap twice must
produce byte-identical files. Both fall out of splicing a tagged block rather
than rewriting whole files.

- [ ] **Step 1: Write the failing test**

`packages/taste/tests/emit/markers.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spliceBlock, writeBlock } from '../../src/emit/markers.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'emit-')) })

describe('spliceBlock', () => {
  it('creates a tagged block in an empty file', () => {
    const out = spliceBlock(null, 'tokens', 'const a = 1', 'js')
    expect(out).toContain('fe-design:tokens:start')
    expect(out).toContain('const a = 1')
    expect(out).toContain('fe-design:tokens:end')
  })

  it('replaces only the block, preserving text around it', () => {
    const first = spliceBlock('// mine above\n', 'tokens', 'v1', 'js')
    const second = spliceBlock(first + '// mine below\n', 'tokens', 'v2', 'js')
    expect(second).toContain('// mine above')
    expect(second).toContain('// mine below')
    expect(second).toContain('v2')
    expect(second).not.toContain('v1')
  })

  it('is idempotent for identical input', () => {
    const once = spliceBlock(null, 'tokens', 'same', 'js')
    expect(spliceBlock(once, 'tokens', 'same', 'js')).toBe(once)
  })

  it('keeps two different tags independent', () => {
    const a = spliceBlock(null, 'one', 'A', 'js')
    const both = spliceBlock(a, 'two', 'B', 'js')
    expect(both).toContain('A')
    expect(both).toContain('B')
    const updated = spliceBlock(both, 'one', 'A2', 'js')
    expect(updated).toContain('A2')
    expect(updated).toContain('B')
  })

  it('uses css comment syntax when asked', () => {
    expect(spliceBlock(null, 'vars', ':root{}', 'css')).toContain('/* fe-design:vars:start')
  })
})

describe('writeBlock', () => {
  it('reports created, then unchanged, then updated', async () => {
    const p = join(dir, 'out.js')
    expect(await writeBlock(p, 'tokens', 'v1', 'js')).toBe('created')
    expect(await writeBlock(p, 'tokens', 'v1', 'js')).toBe('unchanged')
    expect(await writeBlock(p, 'tokens', 'v2', 'js')).toBe('updated')
  })

  it('leaves the file byte-identical when nothing changed', async () => {
    const p = join(dir, 'out.js')
    await writeBlock(p, 'tokens', 'v1', 'js')
    const before = await readFile(p, 'utf8')
    await writeBlock(p, 'tokens', 'v1', 'js')
    expect(await readFile(p, 'utf8')).toBe(before)
  })

  it('preserves hand-written content outside the block', async () => {
    const p = join(dir, 'out.js')
    await writeBlock(p, 'tokens', 'v1', 'js')
    await writeFile(p, (await readFile(p, 'utf8')) + '\nexport const mine = 1\n')
    await writeBlock(p, 'tokens', 'v2', 'js')
    const after = await readFile(p, 'utf8')
    expect(after).toContain('export const mine = 1')
    expect(after).toContain('v2')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/taste/tests/emit/markers.test.ts`
Expected: FAIL — cannot find module `markers.js`

- [ ] **Step 3: Write the splicer**

`packages/taste/src/emit/markers.ts`:

```ts
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

type CommentStyle = 'js' | 'css'

const wrap = (style: CommentStyle, text: string): string =>
  style === 'css' ? `/* ${text} */` : `// ${text}`

export const START = (tag: string): string => `fe-design:${tag}:start`
export const END = (tag: string): string => `fe-design:${tag}:end`

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const spliceBlock = (
  existing: string | null, tag: string, body: string, comment: CommentStyle
): string => {
  const open = wrap(comment, `${START(tag)} — generated; edits inside are overwritten`)
  const close = wrap(comment, END(tag))
  const block = `${open}\n${body}\n${close}`

  if (!existing || existing.trim() === '') return block + '\n'

  // Match from this tag's own start marker through its own end marker, so two
  // different tags in one file stay independent.
  const blockRe = new RegExp(
    `${comment === 'css' ? '/\\* ' : '// '}${escape(START(tag))}[\\s\\S]*?${escape(close)}`
  )

  if (blockRe.test(existing)) return existing.replace(blockRe, block)

  const sep = existing.endsWith('\n') ? '' : '\n'
  return `${existing}${sep}${block}\n`
}

export const writeBlock = async (
  path: string, tag: string, body: string, comment: CommentStyle
): Promise<'created' | 'updated' | 'unchanged'> => {
  let existing: string | null = null
  try { existing = await readFile(path, 'utf8') } catch { existing = null }

  const next = spliceBlock(existing, tag, body, comment)
  if (existing === next) return 'unchanged'

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, next, 'utf8')
  return existing === null ? 'created' : 'updated'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/taste/tests/emit/markers.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add packages/taste/src/emit/markers.ts packages/taste/tests/emit/markers.test.ts
git commit -m "feat(taste): add idempotent marker-delimited file emission"
```

---

### Task 10: Emit tailwind config, globals.css, and the lock

**Files:**
- Create: `packages/taste/src/emit/tailwind.ts`
- Create: `packages/taste/src/emit/css.ts`
- Create: `packages/taste/src/emit/lock.ts`
- Create: `packages/taste/src/index.ts`
- Test: `packages/taste/tests/emit/emit.test.ts`

**Interfaces:**
- Consumes: `ComposedTokens` (Task 8), `writeBlock` (Task 9), `emptyIntent`/`Lock` from `@fe-design/kernel/lock/types.js`
- Produces:
  - `emitTailwindConfig(dir: string, t: ComposedTokens): Promise<string>` — returns the written path
  - `emitGlobalsCss(dir: string, t: ComposedTokens): Promise<string>`
  - `emitLock(dir: string, t: ComposedTokens): Promise<string>`
  - `emitAll(dir: string, t: ComposedTokens): Promise<{ files: string[] }>`
  - `packages/taste/src/index.ts` re-exports the public surface

The emitted config is what Phase 1's `deriveLock` reads, so the two must agree
on shape: `theme.extend.spacing`, `.fontSize`, `.colors`, `.borderRadius`.

**Deviation from the spec, deliberate:** §7 names `tailwind.config.ts`; this
emits `tailwind.config.mjs`. `deriveLock` already accepts `.ts`, `.js`, `.mjs`,
and `.cjs`, and a generated config carries no types worth having, so `.mjs`
loads without a TypeScript transform in the consuming project. If a project
already has a `tailwind.config.ts`, bootstrap would leave it untouched and write
a second config beside it — which is why bootstrap refuses to run on a project
that already has a design system unless forced.

- [ ] **Step 1: Write the failing test**

`packages/taste/tests/emit/emit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emitAll } from '../../src/emit/lock.js'
import { composeSystem } from '../../src/compose.js'
import { loadSystems } from '../../src/load.js'
import { deriveLock } from '@fe-design/kernel/lock/derive.js'
import { SYSTEMS_DIR } from '@fe-design/packs'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'emit-proj-')) })

const compose = async (id = 'quiet-precision') => {
  const { systems } = await loadSystems(SYSTEMS_DIR)
  return composeSystem(systems.find(s => s.id === id)!, '#1F4B3F')
}

describe('emitAll', () => {
  it('writes all three artifacts', async () => {
    const { files } = await emitAll(dir, await compose())
    expect(files.some(f => f.endsWith('tailwind.config.mjs'))).toBe(true)
    expect(files.some(f => f.endsWith('globals.css'))).toBe(true)
    expect(files.some(f => f.endsWith('design.lock.json'))).toBe(true)
  })

  it('produces a config that Phase 1 deriveLock can read back', async () => {
    const t = await compose()
    await emitAll(dir, t)
    const { lock } = await deriveLock(dir)
    expect(lock).not.toBeNull()
    expect(lock!.derived.space).toEqual(t.space)
    expect(lock!.derived.type.steps).toEqual(t.type.steps)
  })

  it('round-trips the accent ramp into the derived palette', async () => {
    const t = await compose()
    await emitAll(dir, t)
    const { lock } = await deriveLock(dir)
    expect(Object.values(lock!.derived.color)).toContain(t.ramps.accent[500])
  })

  it('writes the intent zone with the system id and its bans', async () => {
    const t = await compose()
    await emitAll(dir, t)
    const parsed = JSON.parse(await readFile(join(dir, 'design.lock.json'), 'utf8'))
    expect(parsed.intent.system).toBe('quiet-precision')
    expect(parsed.intent.banned.patterns).toEqual(
      expect.arrayContaining(t.system.antiDefaults)
    )
    expect(parsed.intent.rationale.length).toBeGreaterThan(0)
  })

  it('bans overused fonts the system does not itself use', async () => {
    const t = await compose()
    await emitAll(dir, t)
    const parsed = JSON.parse(await readFile(join(dir, 'design.lock.json'), 'utf8'))
    expect(parsed.intent.banned.fonts).toContain('Inter')
  })

  it('emits a dark block in css', async () => {
    await emitAll(dir, await compose())
    const css = await readFile(join(dir, 'src/styles/globals.css'), 'utf8')
    expect(css).toContain('prefers-color-scheme: dark')
    expect(css).toContain('--color-bg')
  })

  it('is idempotent: running twice leaves files byte-identical', async () => {
    const t = await compose()
    await emitAll(dir, t)
    const before = await Promise.all([
      readFile(join(dir, 'tailwind.config.mjs'), 'utf8'),
      readFile(join(dir, 'src/styles/globals.css'), 'utf8'),
      readFile(join(dir, 'design.lock.json'), 'utf8')
    ])
    await emitAll(dir, t)
    const after = await Promise.all([
      readFile(join(dir, 'tailwind.config.mjs'), 'utf8'),
      readFile(join(dir, 'src/styles/globals.css'), 'utf8'),
      readFile(join(dir, 'design.lock.json'), 'utf8')
    ])
    expect(after).toEqual(before)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/taste/tests/emit/emit.test.ts`
Expected: FAIL — cannot find module `lock.js`

- [ ] **Step 3: Write the tailwind emitter**

`packages/taste/src/emit/tailwind.ts`:

```ts
import { join } from 'node:path'
import { writeBlock } from './markers.js'
import { RAMP_STEPS } from '../color/ramp.js'
import type { ComposedTokens } from '../compose.js'

const q = (s: string): string => JSON.stringify(s)

/**
 * Shape matters: Phase 1's deriveLock reads theme.extend.spacing, .fontSize,
 * .colors and .borderRadius. Changing these keys silently breaks derivation.
 */
export const emitTailwindConfig = async (
  dir: string, t: ComposedTokens
): Promise<string> => {
  const spacing = t.space
    .map((px, i) => `      ${q(String(i))}: '${px}px'`).join(',\n')

  const fontSize = t.type.steps
    .map(px => `      ${q(`s${px}`)}: '${px}px'`).join(',\n')

  const radius = t.radius
    .map(px => `      ${q(String(px))}: '${px}px'`).join(',\n')

  const ramp = (name: string, r: Record<number, string>): string =>
    `      ${name}: {\n` +
    RAMP_STEPS.map(s => `        ${q(String(s))}: '${r[s]}'`).join(',\n') +
    `\n      }`

  const semantic = Object.entries(t.light)
    .map(([k, v]) => `      ${q(k)}: '${v}'`).join(',\n')

  const body = `export default {
  theme: {
    extend: {
      // spacing scale — ${t.system.space.rhythm} rhythm on a ${t.system.space.base}px base
${spacing},
      // type scale — ${t.system.type.ratio} ratio from ${t.system.type.baseSize}px
${fontSize},
${radius},
      fontFamily: {
        sans: [${q(t.type.families.sans)}, ${t.type.fallbacks.map(q).join(', ')}],
        serif: [${q(t.type.families.serif)}, 'Georgia', 'serif']
      },
      colors: {
${ramp('accent', t.ramps.accent)},
${ramp('neutral', t.ramps.neutral)},
${semantic}
      }
    }
  }
}`

  const path = join(dir, 'tailwind.config.mjs')
  await writeBlock(path, 'tailwind', body, 'js')
  return path
}
```

- [ ] **Step 4: Write the css emitter**

`packages/taste/src/emit/css.ts`:

```ts
import { join } from 'node:path'
import { writeBlock } from './markers.js'
import type { ComposedTokens } from '../compose.js'
import type { Semantics } from '../color/solve.js'

const vars = (s: Semantics, indent: string): string =>
  Object.entries(s).map(([k, v]) => `${indent}--color-${k}: ${v};`).join('\n')

export const emitGlobalsCss = async (
  dir: string, t: ComposedTokens
): Promise<string> => {
  const space = t.space
    .map((px, i) => `    --space-${i}: ${px}px;`).join('\n')
  const type = t.type.steps
    .map(px => `    --text-${px}: ${px}px;`).join('\n')

  const body = `:root {
${vars(t.light, '    ')}
${space}
${type}
    --radius: ${t.system.shape.radius}px;
    --motion-duration: ${t.system.motion.duration}ms;
    --motion-easing: ${t.system.motion.easing};
  }

  /* Derived from the light scheme by remapping lightness and reducing chroma,
     not by inversion. Surfaces rise by lightness because shadows do not read
     on a dark ground. */
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
${vars(t.dark, '      ')}
    }
  }

  :root[data-theme="dark"] {
${vars(t.dark, '    ')}
  }

  @media (prefers-reduced-motion: reduce) {
    :root { --motion-duration: 0ms; }
  }`

  const path = join(dir, 'src', 'styles', 'globals.css')
  await writeBlock(path, 'tokens', body, 'css')
  return path
}
```

- [ ] **Step 5: Write the lock emitter and `emitAll`**

`packages/taste/src/emit/lock.ts`:

```ts
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deriveLock } from '@fe-design/kernel/lock/derive.js'
import { emitTailwindConfig } from './tailwind.js'
import { emitGlobalsCss } from './css.js'
import type { ComposedTokens } from '../compose.js'

/**
 * Fonts a model reaches for by default. Banning the ones this system does not
 * itself use is what stops a later session drifting back to the defaults the
 * curated system was chosen to avoid.
 */
const OVERUSED_FONTS = ['Inter', 'Roboto', 'Open Sans', 'Arial', 'Helvetica']

export const emitLock = async (
  dir: string, t: ComposedTokens
): Promise<string> => {
  // Derive from the files just written, so the lock's derived zone is a true
  // function of project config rather than a second, divergent source.
  const { lock } = await deriveLock(dir, {
    system: t.system.id,
    density: t.system.space.rhythm,
    hierarchy: { headingJump: 2, maxWeightsPerSurface: t.system.type.maxWeights },
    motion: { budget: t.system.motion.budget, maxDurationMs: t.system.motion.duration },
    banned: {
      fonts: OVERUSED_FONTS.filter(
        f => f !== t.system.type.families.sans && f !== t.system.type.families.serif
      ),
      patterns: t.system.antiDefaults
    },
    rationale: `${t.system.color.strategy}. ${t.system.signature.join(' ')}`
  })

  if (!lock) {
    throw new Error(
      'emitLock: config was written but deriveLock found no design source. ' +
      'The emitted tailwind config shape and deriveLock have diverged.'
    )
  }

  const path = join(dir, 'design.lock.json')
  await writeFile(path, JSON.stringify(lock, null, 2) + '\n', 'utf8')
  return path
}

export const emitAll = async (
  dir: string, t: ComposedTokens
): Promise<{ files: string[] }> => {
  const files = [
    await emitTailwindConfig(dir, t),
    await emitGlobalsCss(dir, t),
    await emitLock(dir, t)
  ]
  return { files }
}
```

`packages/taste/src/index.ts`:

```ts
export { loadSystems } from './load.js'
export { briefToAxes } from './axes.js'
export { selectSystems, axisDistance } from './select.js'
export { composeSystem, DEFAULT_ACCENTS, type ComposedTokens } from './compose.js'
export { emitAll, emitLock } from './emit/lock.js'
export { emitTailwindConfig } from './emit/tailwind.js'
export { emitGlobalsCss } from './emit/css.js'
export { buildRamp, buildNeutralRamp, RAMP_STEPS, type Ramp } from './color/ramp.js'
export {
  solveSemantics, contrast, TARGETS,
  type Semantics, type PairReport, type SemanticName
} from './color/solve.js'
export { deriveDark } from './color/dark.js'
export { typeScale, spaceScale, radiusScale } from './scales.js'
export * from './types.js'
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run packages/taste/tests/emit/emit.test.ts`
Expected: PASS — 7 tests

The "deriveLock can read it back" test is the contract between Phase 1 and
Phase 2. If it fails, the emitted config shape drifted — fix the emitter, not
`deriveLock`, since real projects write that shape by hand.

- [ ] **Step 7: Commit**

```bash
git add packages/taste/src/emit packages/taste/src/index.ts packages/taste/tests/emit
git commit -m "feat(taste): emit tailwind config, css tokens, and the design lock"
```

---

### Task 11: The `system_bootstrap` tool

**Files:**
- Create: `packages/server/src/tools/system-bootstrap.ts`
- Modify: `packages/server/src/index.ts` — register the tool
- Modify: `packages/server/package.json` — depend on `@fe-design/taste`
- Modify: `packages/server/tsconfig.json` — reference `../taste`
- Test: `packages/server/tests/bootstrap.test.ts`

**Interfaces:**
- Consumes: `selectSystems`, `composeSystem`, `emitAll`, `loadSystems` (Tasks 1–10); `safeJoin` from `packages/server/src/context.ts`
- Produces:
  - `type BootstrapProposal = { id: string; fit: number; rationale: string; signature: string[]; palettePreview: string[] }`
  - `type BootstrapResult = { mode: 'proposed'; proposals: BootstrapProposal[] } | { mode: 'applied'; system: string; files: string[]; contrastReport: PairReport[] }`
  - `systemBootstrap(dir: string, brief: string, opts?: { choice?: number; accent?: string; force?: boolean }): Promise<BootstrapResult>`

Two calls by design. The first writes nothing and returns three options; the
second applies one. The pause is where a human steers, and it is what keeps a
silent argmax from picking the same system for every similar brief.

- [ ] **Step 1: Write the failing test**

`packages/server/tests/bootstrap.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { systemBootstrap } from '../src/tools/system-bootstrap.js'
import { systemStatus } from '../src/tools/system-status.js'
import { verify } from '../src/tools/verify.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'boot-')) })

describe('system_bootstrap — propose', () => {
  it('returns three proposals and writes nothing', async () => {
    const r = await systemBootstrap(dir, 'invoicing tool for freelancers')
    expect(r.mode).toBe('proposed')
    if (r.mode !== 'proposed') throw new Error('expected proposals')
    expect(r.proposals).toHaveLength(3)
    await expect(readFile(join(dir, 'design.lock.json'), 'utf8')).rejects.toThrow()
  })

  it('gives each proposal a rationale, signature, and palette preview', async () => {
    const r = await systemBootstrap(dir, 'banking portal')
    if (r.mode !== 'proposed') throw new Error('expected proposals')
    for (const p of r.proposals) {
      expect(p.rationale.length).toBeGreaterThan(10)
      expect(p.signature.length).toBeGreaterThanOrEqual(3)
      expect(p.palettePreview.length).toBeGreaterThan(0)
      for (const hex of p.palettePreview) expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('system_bootstrap — apply', () => {
  it('writes config, css, and lock for the chosen system', async () => {
    const r = await systemBootstrap(dir, 'banking portal', { choice: 1 })
    expect(r.mode).toBe('applied')
    if (r.mode !== 'applied') throw new Error('expected applied')
    expect(r.files).toHaveLength(3)
    expect(JSON.parse(await readFile(join(dir, 'design.lock.json'), 'utf8')).version).toBe(1)
  })

  it('reports every contrast pair as meeting its target', async () => {
    const r = await systemBootstrap(dir, 'banking portal', { choice: 1 })
    if (r.mode !== 'applied') throw new Error('expected applied')
    for (const p of r.contrastReport) {
      expect(p.meets, `${p.pair} was ${p.ratio.toFixed(2)}`).toBe(true)
    }
  })

  it('produces a project that system_status reads as a fresh lock', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1 })
    const s = await systemStatus(dir)
    expect(s.hasLock).toBe(true)
    expect(s.stale).toBe(false)
    expect(s.space.length).toBeGreaterThan(4)
  })

  it('produces a project where compliant code verifies clean', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1 })
    const s = await systemStatus(dir)
    const pad = s.space[3]
    const size = s.typeSteps[1]
    await writeFile(join(dir, 'Ok.tsx'),
      `export default () => <div className="p-[${pad}px] text-[${size}px]">ok</div>`)
    const v = await verify(dir, ['Ok.tsx'])
    expect(v.findings.filter(f => f.rule === 'space-off-scale')).toEqual([])
    expect(v.findings.filter(f => f.rule === 'type-off-scale')).toEqual([])
  })

  it('honours an explicit accent', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1, accent: '#7C3AED' })
    const css = await readFile(join(dir, 'src/styles/globals.css'), 'utf8')
    expect(css).toContain('--color-primary')
  })

  it('refuses to overwrite an existing lock without force', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1 })
    await expect(systemBootstrap(dir, 'other brief', { choice: 1 }))
      .rejects.toThrow(/already has a design system/i)
  })

  it('overwrites when force is passed', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1 })
    const r = await systemBootstrap(dir, 'portfolio site', { choice: 1, force: true })
    expect(r.mode).toBe('applied')
  })

  it('rejects a choice outside the proposal range', async () => {
    await expect(systemBootstrap(dir, 'anything', { choice: 9 }))
      .rejects.toThrow(/choice/i)
  })

  it('refuses a directory outside the project root', async () => {
    await expect(systemBootstrap(join(dir, '..', '..', 'etc'), 'x', { choice: 1 }))
      .rejects.toThrow()
  })

  it('is idempotent when re-applied with force', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1 })
    const before = await readFile(join(dir, 'tailwind.config.mjs'), 'utf8')
    await systemBootstrap(dir, 'banking portal', { choice: 1, force: true })
    expect(await readFile(join(dir, 'tailwind.config.mjs'), 'utf8')).toBe(before)
  })
})
```

- [ ] **Step 2: Wire the dependency**

In `packages/server/package.json`, add to `dependencies`:

```json
    "@fe-design/taste": "workspace:*"
```

In `packages/server/tsconfig.json`, add to `references`:

```json
    { "path": "../taste" }
```

Run: `pnpm install`

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run packages/server/tests/bootstrap.test.ts`
Expected: FAIL — cannot find module `system-bootstrap.js`

- [ ] **Step 4: Write the tool**

`packages/server/src/tools/system-bootstrap.ts`:

```ts
import { access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  loadSystems, selectSystems, composeSystem, emitAll
} from '@fe-design/taste'
import { SYSTEMS_DIR } from '@fe-design/packs'
import type { PairReport, DesignSystem } from '@fe-design/taste'

export type BootstrapProposal = {
  id: string
  fit: number
  rationale: string
  signature: string[]
  palettePreview: string[]
}

export type BootstrapResult =
  | { mode: 'proposed'; proposals: BootstrapProposal[] }
  | {
      mode: 'applied'
      system: string
      files: string[]
      contrastReport: PairReport[]
    }

const exists = async (p: string): Promise<boolean> => {
  try { await access(p); return true } catch { return false }
}

/** Compose once and pull three representative swatches out of the result. */
const previewOf = (system: DesignSystem, accent?: string): string[] => {
  const t = composeSystem(system, accent)
  return [t.ramps.accent[500], t.light.bg, t.light.fg]
}

export const systemBootstrap = async (
  dir: string,
  brief: string,
  opts: { choice?: number; accent?: string; force?: boolean } = {}
): Promise<BootstrapResult> => {
  const root = resolve(dir)

  // Hard error, not degraded: refusing to write is the whole point.
  if (!await exists(root)) {
    throw new Error(`Bootstrap target does not exist: ${root}`)
  }

  const { systems, degraded } = await loadSystems(SYSTEMS_DIR)
  if (systems.length === 0) {
    throw new Error(
      `No design systems could be loaded: ${degraded.map(d => d.detail).join('; ')}`
    )
  }

  const proposals = selectSystems(brief, systems)

  if (opts.choice === undefined) {
    return {
      mode: 'proposed',
      proposals: proposals.map(p => ({
        id: p.system.id,
        fit: p.fit,
        rationale: p.rationale,
        signature: p.system.signature,
        palettePreview: previewOf(p.system, opts.accent)
      }))
    }
  }

  if (opts.choice < 1 || opts.choice > proposals.length) {
    throw new Error(
      `Invalid choice ${opts.choice}: expected 1..${proposals.length}.`
    )
  }

  if (!opts.force && await exists(join(root, 'design.lock.json'))) {
    throw new Error(
      'This project already has a design system (design.lock.json). ' +
      'Pass force to replace it — this rewrites the palette, type, and scales.'
    )
  }

  const chosen = proposals[opts.choice - 1]!
  const tokens = composeSystem(chosen.system, opts.accent)
  const { files } = await emitAll(root, tokens)

  return {
    mode: 'applied',
    system: chosen.system.id,
    files,
    contrastReport: tokens.report
  }
}
```

- [ ] **Step 5: Register the tool on the server**

In `packages/server/src/index.ts`, add the import:

```ts
import { systemBootstrap } from './tools/system-bootstrap.js'
```

and register it after the existing `explain` tool:

```ts
server.tool(
  'system_bootstrap',
  'Create a design system for a project that has none. Called with a brief alone it returns three candidate directions and writes nothing; call it again with choice to apply one. This is the only tool that writes files.',
  {
    dir: z.string().describe('Absolute path to the project root'),
    brief: z.string().describe('What the product is, who it is for, how it should feel'),
    choice: z.number().int().min(1).max(3).optional()
      .describe('Which proposal to apply, 1-3. Omit to see proposals first.'),
    accent: z.string().optional().describe('Accent color as hex, e.g. #1F4B3F'),
    force: z.boolean().optional()
      .describe('Replace an existing design system. Rewrites palette, type, and scales.')
  },
  async ({ dir, brief, choice, accent, force }) => {
    try {
      return asText(await systemBootstrap(dir, brief, { choice, accent, force }))
    } catch (err) {
      return asText({ error: (err as Error).message })
    }
  }
)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run packages/server/tests/bootstrap.test.ts`
Expected: PASS — 12 tests

- [ ] **Step 7: Run the whole suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: Phase 1's 103 tests still pass alongside the new ones.

- [ ] **Step 8: Commit**

```bash
git add packages/server packages/taste
git commit -m "feat(server): add system_bootstrap, the only writing tool"
```

---

### Task 12: Nine more curated systems and cross-system property tests

**Files:**
- Create: `packages/packs/systems/*.json` — nine more, twelve total
- Test: `packages/taste/tests/systems.test.ts`
- Modify: `packages/taste/src/compose.ts` — add default accents for the new systems
- Modify: `packages/server/tests/built-binary.test.ts` — cover `system_bootstrap`

**Interfaces:**
- Consumes: everything
- Produces: no new API — this task widens coverage and proves the invariants hold across the whole catalogue

The nine systems, each authored as a coherent whole rather than assembled from
parts: `technical-mono`, `soft-clinical`, `bold-commerce`, `archive-serif`,
`playful-rounded`, `dense-console`, `muted-enterprise`, `sunlit-wellness`,
`stark-brutal`.

- [ ] **Step 1: Write the failing property test**

`packages/taste/tests/systems.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { oklch } from 'culori'
import { loadSystems } from '../src/load.js'
import { composeSystem } from '../src/compose.js'
import { contrast } from '../src/color/solve.js'
import { selectSystems } from '../src/select.js'
import { SYSTEMS_DIR } from '@fe-design/packs'

const load = async () => (await loadSystems(SYSTEMS_DIR)).systems

const HUES = [0, 40, 80, 120, 160, 200, 240, 280, 320]
const accentAt = (hue: number) => `oklch(0.5 0.12 ${hue})`

describe('the curated catalogue', () => {
  it('ships twelve systems, all valid', async () => {
    const { systems, degraded } = await loadSystems(SYSTEMS_DIR)
    expect(degraded).toEqual([])
    expect(systems).toHaveLength(12)
  })

  it('gives every system a unique id', async () => {
    const ids = (await load()).map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('does not name an overused default font as a primary family', async () => {
    for (const s of await load()) {
      expect(['Inter', 'Roboto', 'Arial', 'Helvetica'], `${s.id}`)
        .not.toContain(s.type.families.sans)
    }
  })

  it('covers the axis space, so briefs land somewhere distinct', async () => {
    const systems = await load()
    for (const axis of ['formality', 'density', 'energy', 'expressiveness'] as const) {
      const lows = systems.map(s => s.axes[axis][0])
      const highs = systems.map(s => s.axes[axis][1])
      expect(Math.min(...lows), `${axis} low coverage`).toBeLessThanOrEqual(0.2)
      expect(Math.max(...highs), `${axis} high coverage`).toBeGreaterThanOrEqual(0.8)
    }
  })

  it('meets every contrast target for every system at every hue', async () => {
    for (const system of await load()) {
      for (const hue of HUES) {
        const t = composeSystem(system, accentAt(hue))
        for (const r of t.report) {
          expect(r.meets, `${system.id} @ hue ${hue}: ${r.pair} was ${r.ratio.toFixed(2)}`)
            .toBe(true)
        }
      }
    }
  })

  it('keeps ramp lightness monotonic for every system', async () => {
    for (const system of await load()) {
      const t = composeSystem(system, accentAt(120))
      for (const ramp of [t.ramps.accent, t.ramps.neutral]) {
        const ls = Object.values(ramp).map(h => oklch(h)!.l)
        for (let i = 1; i < ls.length; i++) {
          expect(ls[i]!, `${system.id} step ${i}`).toBeLessThan(ls[i - 1]!)
        }
      }
    }
  })

  it('keeps body text at AAA in both schemes for every system', async () => {
    for (const system of await load()) {
      const t = composeSystem(system, accentAt(200))
      expect(contrast(t.light.fg, t.light.bg), `${system.id} light`).toBeGreaterThanOrEqual(7)
      expect(contrast(t.dark.fg, t.dark.bg), `${system.id} dark`).toBeGreaterThanOrEqual(7)
    }
  })

  it('composes deterministically for every system', async () => {
    for (const system of await load()) {
      expect(composeSystem(system, '#1F4B3F')).toEqual(composeSystem(system, '#1F4B3F'))
    }
  })

  it('does not return the same top system for every kind of brief', async () => {
    const systems = await load()
    const briefs = [
      'banking compliance portal for auditors',
      'playful game for kids',
      'portfolio site for a photographer',
      'dense analytics dashboard',
      'meditation and wellness app',
      'developer CLI documentation'
    ]
    const tops = briefs.map(b => selectSystems(b, systems)[0]!.system.id)
    expect(new Set(tops).size, `tops were ${tops.join(', ')}`).toBeGreaterThanOrEqual(4)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/taste/tests/systems.test.ts`
Expected: FAIL — only three systems exist

- [ ] **Step 3: Author the nine systems**

Write one JSON file per system in `packages/packs/systems/`, following the exact
schema validated in Task 1. Each needs: `id`, four `axes` ranges, `fitFor`,
`avoidFor`, `type`, `space`, `shape`, `color`, `motion`, at least three
`signature` lines, and at least one `antiDefaults` entry.

Here is the first one complete. Write the other eight in exactly this shape,
taking their distinguishing values from the table below.

`packages/packs/systems/technical-mono.json`:

```json
{
  "id": "technical-mono",
  "axes": { "formality": [0.6, 0.9], "density": [0.6, 0.9], "energy": [0.0, 0.3], "expressiveness": [0.1, 0.4] },
  "fitFor": ["developer", "devtool", "cli", "api", "infrastructure", "terminal", "engineering"],
  "avoidFor": ["consumer social", "kids", "wellness", "luxury"],
  "type": {
    "families": { "sans": "IBM Plex Sans", "serif": "IBM Plex Serif" },
    "fallbacks": { "sans": ["ui-monospace", "system-ui", "sans-serif"] },
    "ratio": 1.2, "baseSize": 14, "maxWeights": 2
  },
  "space": { "base": 4, "rhythm": "tight", "sectionGap": 64 },
  "shape": { "radius": 2, "depth": "borders" },
  "color": { "strategy": "cool slate neutral with a single signal accent", "neutralHue": 220, "chromaCeiling": 0.03 },
  "motion": { "budget": "minimal", "duration": 100, "easing": "ease-out" },
  "signature": [
    "Monospace for every identifier, path, and value — never for prose.",
    "Status is a colored dot plus a word, never colour alone.",
    "Dense by default; whitespace is earned, not assumed.",
    "Destructive actions are outlined, never filled."
  ],
  "antiDefaults": ["gradient-anything", "rounded-pill-buttons", "illustration-empty-states"]
}
```

Table of distinguishing values for all nine:

| id | axes formality / density / energy / expressiveness | sans / serif | ratio, base | space base, rhythm | radius, depth | neutralHue, chromaCeiling | motion ms |
|---|---|---|---|---|---|---|---|
| `technical-mono` | .6–.9 / .6–.9 / 0–.3 / .1–.4 | `IBM Plex Sans` / `IBM Plex Serif` | 1.2, 14 | 4, tight | 2, borders | 220, 0.03 | 100 |
| `soft-clinical` | .5–.8 / .3–.6 / 0–.3 / .1–.4 | `Figtree` / `Source Serif 4` | 1.25, 16 | 4, normal | 10, borders | 200, 0.04 | 160 |
| `bold-commerce` | .2–.6 / .4–.7 / .6–1.0 / .6–.9 | `Archivo` / `Fraunces` | 1.333, 16 | 4, normal | 6, shadows | 20, 0.14 | 200 |
| `archive-serif` | .6–.9 / .2–.5 / 0–.3 / .5–.8 | `Libre Franklin` / `Libre Baskerville` | 1.333, 18 | 4, generous | 0, borders | 35, 0.03 | 180 |
| `playful-rounded` | 0–.3 / .2–.5 / .7–1.0 / .6–.9 | `Nunito` / `Bitter` | 1.25, 17 | 4, normal | 16, shadows | 320, 0.16 | 260 |
| `dense-console` | .5–.8 / .8–1.0 / 0–.3 / 0–.3 | `Inter Tight` / `Source Serif 4` | 1.15, 13 | 4, tight | 2, borders | 250, 0.05 | 90 |
| `muted-enterprise` | .8–1.0 / .5–.8 / 0–.2 / 0–.3 | `Public Sans` / `Source Serif 4` | 1.2, 15 | 4, normal | 4, borders | 240, 0.04 | 130 |
| `sunlit-wellness` | .2–.5 / .1–.4 / .3–.6 / .5–.8 | `Outfit` / `Fraunces` | 1.333, 17 | 4, generous | 20, shadows | 70, 0.09 | 240 |
| `stark-brutal` | .3–.7 / .3–.6 / .7–1.0 / .8–1.0 | `Space Grotesk` / `Instrument Serif` | 1.5, 16 | 4, normal | 0, borders | 0, 0.02 | 80 |

For `fitFor` and `avoidFor`, use domain words a brief would actually contain —
these feed the domain bonus in Task 3.

Add a default accent for each new id in `DEFAULT_ACCENTS` in
`packages/taste/src/compose.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/taste/tests/systems.test.ts`
Expected: PASS — 9 tests

If "covers the axis space" fails, a range is missing at one end — widen a
system's range rather than loosening the assertion. If "does not return the same
top system" fails, `fitFor` lists are too similar across systems; make them
name distinct domains.

- [ ] **Step 5: Extend the built-binary test**

Add to `packages/server/tests/built-binary.test.ts`, inside the existing
`describe.skipIf(!existsSync(BIN))('built binary', ...)` block:

```ts
  it('proposes design systems through the shipped binary', async () => {
    const out = await rpc([
      INIT, READY,
      JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: {
          name: 'system_bootstrap',
          arguments: { dir: PROJECT, brief: 'invoicing tool for freelancers' }
        }
      })
    ])
    const call = out.trim().split('\n').map(l => JSON.parse(l)).find(m => m.id === 2)
    const payload = JSON.parse(call.result.content[0].text)
    expect(payload.error).toBeUndefined()
    expect(payload.mode).toBe('proposed')
    expect(payload.proposals).toHaveLength(3)
  }, 15000)

  it('lists all four tools once bootstrap is registered', async () => {
    const out = await rpc([
      INIT, READY,
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    ])
    const listed = out.trim().split('\n').map(l => JSON.parse(l)).find(m => m.id === 2)
    expect(listed.result.tools.map((t: { name: string }) => t.name).sort())
      .toEqual(['explain', 'system_bootstrap', 'system_status', 'verify'])
  }, 15000)
```

The existing "lists all three tools" assertion in that file expects exactly
three names and will now fail. Replace it with the four-tool version above.

- [ ] **Step 6: Update the companion skill**

In `skill/SKILL.md`, replace the `hasLock: false` bullet with:

```markdown
- `hasLock: false` — the project has no design system yet. Call
  `system_bootstrap` with a brief describing the product, its audience, and how
  it should feel. It returns three directions and writes nothing; show them to
  the user and let them choose, then call it again with `choice`. Never invent
  colors, fonts, or spacing yourself.
```

- [ ] **Step 7: Run the whole suite, typecheck, and build**

Run: `pnpm test && pnpm typecheck && pnpm --filter @fe-design/server build`
Expected: everything passes, including Phase 1's 103 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/packs/systems packages/taste packages/server skill
git commit -m "feat(packs): complete the twelve-system catalogue with property tests"
```

---

## Definition of done for Phase 2

- [ ] `pnpm test` passes, Phase 1's 103 tests included
- [ ] `pnpm typecheck` is clean under `strict` and `exactOptionalPropertyTypes`
- [ ] Twelve systems load with zero degradation
- [ ] Every contrast target is met for every system at every tested hue, in both light and dark
- [ ] Ramp lightness is monotonic for every system
- [ ] `system_bootstrap` twice with the same input produces byte-identical files
- [ ] `system_bootstrap` refuses an existing lock without `force`
- [ ] A bootstrapped project reads back through `deriveLock` and verifies clean
- [ ] `system_bootstrap` is still the only tool that writes
- [ ] The built binary lists four tools and proposes systems over real stdio

## Deferred to later phases

| Phase | Contents |
|---|---|
| 3 | `surface_brief`, state-completeness rules over `DataSource` and `Branch`, `guide` and its 13 playbooks |
| 4 | Vue / Svelte / HTML extractors, cross-framework equivalence suite, browser `inspect`, `critique` HTML report |

Two Phase 2 simplifications worth naming, so nobody mistakes them for finished
work. `briefToAxes` uses a hand-written lexicon; the spec's §10 harvest plan
replaces it with the 161-row `ui-reasoning.csv` mapping from ui-ux-pro-max, which
is a Phase 3 data task. And `emitTailwindConfig` writes Tailwind v3 config shape
because that is what `deriveLock` reads today; Tailwind v4's CSS-first `@theme`
is a separate change on both sides.

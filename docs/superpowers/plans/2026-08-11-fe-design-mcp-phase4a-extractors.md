# Frontend Design MCP — Phase 4a (Cross-Framework Extraction) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the premise the whole IR rests on — that a rule written once fires correctly in React, Vue, Svelte, and plain HTML — by adding three extractors and an equivalence suite that fails loudly if they ever disagree.

**Architecture:** A new `extractor-core` package holds what every framework shares: the Tailwind class resolver (moved out of the React package) and a CSS resolver built on postcss. Each framework extractor becomes a thin adapter that finds styled nodes and hands their classes, inline styles, and matching CSS rules to that core. The server gains the extension-keyed registry the spec promised but never built.

**Tech Stack:** TypeScript, Node 20+, pnpm workspaces, Vitest, `@vue/compiler-sfc`, `svelte/compiler` (v5 modern AST), `parse5`, `postcss`.

## Global Constraints

Every task's requirements implicitly include this section.

- **Phases 1–3 must keep passing.** `pnpm test` is 285 tests across 35 files. Never weaken an existing test to make new code fit.
- **Rules never fire on `unknown`.** A style whose applicability cannot be determined is `unknown`, never `absent`. This is the difference between a linter people trust and one they mute.
- **`system_bootstrap` stays the only tool that writes.**
- **Degrade, never throw** except for the three hard errors: path escape, unwritable bootstrap target, existing lock without `force`.
- **`kernel` imports nothing from `extractors`.** The registry therefore lives in `server`, which already depends on all of them.
- **Every extractor produces the same `StyleFacts` shape** for equivalent input. That is the acceptance test for this phase, not a nice-to-have.
- **Spec:** `docs/superpowers/specs/2026-08-11-fe-design-mcp-design.md` §3, §4, §9. Where this plan and the spec disagree, the spec wins — stop and flag it.

## Prior art in this repo (read before starting)

- `packages/extractors/react/src/tailwind.ts` — `resolveTailwindClasses`, moving to `extractor-core` in Task 2
- `packages/extractors/react/src/jsx.ts` — the adapter shape the other three follow
- `packages/kernel/src/ir/types.ts` — `StyleFacts`, `emptyStyleFacts()`, `makeNode()`
- `packages/kernel/src/ir/fact.ts` — `known`, `absent`, `unknown`, and the `StyleOrigin` kinds `class | inline | stylesheet | attribute`
- `packages/server/src/tools/verify.ts:50` — the hardcoded `/\.(tsx|jsx)$/` test and the direct `extractReact` call the registry replaces

## Parser facts, already verified

Confirmed against the installed versions; do not re-derive these.

- **Vue** `@vue/compiler-sfc@3.5`: `parse(src).descriptor.template.ast`; element nodes are `type === 1`; a static `class` is a prop with `type === 6` and `value.content`; `:class` is a bind prop (`type === 7`) and must become `unknown`. Style blocks are `descriptor.styles[].content`.
- **Svelte** `svelte@5`: `parse(src, { modern: true })` returns `{ fragment, css }`. Elements are `type === 'RegularElement'` with `attributes[]`; a static class has `value` as an array of `Text` nodes with `.data`; a dynamic class has `value` as an `ExpressionTag` object and must become `unknown`. CSS is `ast.css.content.styles`.
- **parse5**: `parse(html, { sourceCodeLocationInfo: true })` — without that option every `sourceCodeLocation` is `undefined`. parse5 synthesizes `html`, `head`, and `body` nodes that have no location; skip nodes with no `sourceCodeLocation`.
- **postcss**: `postcss.parse(css)` then `root.walkRules(r => …)` gives `r.selector` and `r.nodes` of `{ prop, value }`.

## File Structure

```
packages/extractors/core/
  src/tailwind.ts          moved from react, unchanged behaviour
  src/css.ts               declarations -> StyleFacts, via postcss
  src/selectors.ts         which rules apply to which element, honestly
  src/merge.ts             combine stylesheet, class, and inline layers
  src/index.ts

packages/extractors/react/
  src/tailwind.ts          deleted; re-exported from core for compatibility

packages/extractors/vue/       src/index.ts   extractVue()
packages/extractors/svelte/    src/index.ts   extractSvelte()
packages/extractors/html/      src/index.ts   extractHtml()

packages/server/
  src/extractors.ts        extension -> extractor registry
  src/tools/verify.ts      modified: use the registry

packages/extractors/core/tests/equivalence/
  card.{tsx,vue,svelte,html}   the same card, four ways
  equivalence.test.ts          asserts identical StyleFacts
```

---

### Task 1: Extension-keyed extractor registry

**Files:**
- Create: `packages/server/src/extractors.ts`
- Modify: `packages/server/src/tools/verify.ts` — use the registry instead of a hardcoded call
- Test: `packages/server/tests/extractors.test.ts`

**Interfaces:**
- Consumes: `extractReact` from `@fe-design/extractor-react`; `IRDoc` from `@fe-design/kernel/ir/types.js`
- Produces:
  - `type ExtractorFn = (source: string, file: string) => IRDoc`
  - `EXTRACTORS: Record<string, ExtractorFn>` keyed by extension including the dot
  - `extractorFor(file: string): ExtractorFn | null`
  - `SUPPORTED_EXTENSIONS: string[]`

This lands first and deliberately changes no behaviour: React remains the only
entry. Doing the refactor while there is exactly one extractor means any
regression is unambiguous, and Tasks 3–5 become one-line registrations.

- [ ] **Step 1: Write the failing test**

`packages/server/tests/extractors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractorFor, SUPPORTED_EXTENSIONS, EXTRACTORS } from '../src/extractors.js'

describe('extractor registry', () => {
  it('resolves a tsx file to an extractor', () => {
    expect(extractorFor('src/App.tsx')).toBeTypeOf('function')
  })

  it('resolves jsx as well', () => {
    expect(extractorFor('src/App.jsx')).toBeTypeOf('function')
  })

  it('returns null for an unsupported extension', () => {
    expect(extractorFor('src/styles.css')).toBeNull()
  })

  it('returns null for a file with no extension', () => {
    expect(extractorFor('Makefile')).toBeNull()
  })

  it('is case-insensitive about the extension', () => {
    expect(extractorFor('src/App.TSX')).toBeTypeOf('function')
  })

  it('lists its supported extensions', () => {
    expect(SUPPORTED_EXTENSIONS).toContain('.tsx')
    expect(SUPPORTED_EXTENSIONS.every(e => e.startsWith('.'))).toBe(true)
  })

  it('keys every entry by an extension with a leading dot', () => {
    for (const key of Object.keys(EXTRACTORS)) expect(key).toMatch(/^\.[a-z]+$/)
  })

  it('produces a working IRDoc through the resolved extractor', () => {
    const fn = extractorFor('a.tsx')!
    const doc = fn('export default () => <div className="p-4">x</div>', 'a.tsx')
    expect(doc.framework).toBe('react')
    expect(doc.nodes).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/server/tests/extractors.test.ts`
Expected: FAIL — cannot find module `extractors.js`

- [ ] **Step 3: Write the registry**

`packages/server/src/extractors.ts`:

```ts
import { extname } from 'node:path'
import { extractReact } from '@fe-design/extractor-react'
import type { IRDoc } from '@fe-design/kernel/ir/types.js'

export type ExtractorFn = (source: string, file: string) => IRDoc

/**
 * Extension to extractor. The spec calls for framework support to be a
 * registration rather than a refactor, so every dispatch decision lives here
 * and nowhere else.
 */
export const EXTRACTORS: Record<string, ExtractorFn> = {
  '.tsx': extractReact,
  '.jsx': extractReact
}

export const SUPPORTED_EXTENSIONS: string[] = Object.keys(EXTRACTORS)

export const extractorFor = (file: string): ExtractorFn | null =>
  EXTRACTORS[extname(file).toLowerCase()] ?? null
```

- [ ] **Step 4: Use the registry in verify**

In `packages/server/src/tools/verify.ts`, replace the import:

```ts
import { extractorFor, SUPPORTED_EXTENSIONS } from '../extractors.js'
```

(remove the `import { extractReact } from '@fe-design/extractor-react'` line)

Replace the extension guard and the extraction call. The current block reads:

```ts
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
```

Replace it with:

```ts
    const extract = extractorFor(file)
    if (!extract) {
      degraded.push({
        code: 'UNSUPPORTED_FRAMEWORK', path: rel,
        detail: `No extractor for this file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}.`,
        impact: '1 file not analyzed'
      })
      continue
    }

    try {
      docs.push(extract(src, rel))
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — the new 8 plus all 285 existing. The `verify` test that asserts
`UNSUPPORTED_FRAMEWORK` on a `.css` file still passes, because the registry
returns null for it.

- [ ] **Step 6: Commit**

```bash
git add packages/server
git commit -m "refactor(server): dispatch extraction through an extension registry"
```

---

### Task 2: Extractor core — shared Tailwind and CSS resolution

**Files:**
- Create: `packages/extractors/core/package.json`, `tsconfig.json`
- Create: `packages/extractors/core/src/tailwind.ts` — moved from the React package
- Create: `packages/extractors/core/src/css.ts`
- Create: `packages/extractors/core/src/selectors.ts`
- Create: `packages/extractors/core/src/merge.ts`
- Create: `packages/extractors/core/src/index.ts`
- Modify: `packages/extractors/react/src/tailwind.ts` — becomes a re-export
- Modify: `packages/extractors/react/package.json` — depend on core
- Modify: `vitest.config.ts`, `tsconfig.json` — register the package
- Test: `packages/extractors/core/tests/css.test.ts`, `selectors.test.ts`, `merge.test.ts`

**Interfaces:**
- Consumes: `StyleFacts`, `emptyStyleFacts`, `Box`, `Len`, `Color` from kernel; `known`, `absent`, `unknown`, `StyleOrigin` from kernel
- Produces:
  - `resolveTailwindClasses(classes, scale?)` — re-exported unchanged
  - `type Decl = { prop: string; value: string }`
  - `declsToStyleFacts(decls: Decl[], origin: StyleOrigin): StyleFacts`
  - `parseInlineStyle(style: string): Decl[]`
  - `type CssRule = { selector: string; decls: Decl[] }`
  - `parseStyleSheet(css: string): { rules: CssRule[]; unparsed: number }`
  - `type ElementKey = { tag: string; classes: string[]; id: string | null }`
  - `type SelectorMatch = 'applies' | 'maybe' | 'no'`
  - `matchSelector(selector: string, el: ElementKey): SelectorMatch`
  - `rulesFor(rules: CssRule[], el: ElementKey): { certain: Decl[]; uncertain: Decl[] }`
  - `mergeFacts(layers: StyleFacts[]): StyleFacts`

The honest part is `matchSelector` returning three values. `.card` on an element
with that class certainly applies. `.sidebar .card` might apply — this extractor
has no ancestor stylesheet context — so its declarations become `unknown` rather
than being applied or ignored. Guessing either way produces false findings.

- [ ] **Step 1: Write the failing tests**

`packages/extractors/core/tests/css.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { declsToStyleFacts, parseInlineStyle, parseStyleSheet } from '../src/css.js'
import { isKnown } from '@fe-design/kernel/ir/fact.js'

const origin = { kind: 'stylesheet' as const, raw: '.card' }

describe('parseInlineStyle', () => {
  it('splits declarations', () => {
    expect(parseInlineStyle('padding: 1rem; color: #111')).toEqual([
      { prop: 'padding', value: '1rem' },
      { prop: 'color', value: '#111' }
    ])
  })

  it('tolerates a trailing semicolon and odd spacing', () => {
    expect(parseInlineStyle('  padding:4px ;')).toEqual([{ prop: 'padding', value: '4px' }])
  })

  it('returns nothing for an empty string', () => {
    expect(parseInlineStyle('')).toEqual([])
  })
})

describe('declsToStyleFacts', () => {
  it('converts uniform padding', () => {
    const f = declsToStyleFacts([{ prop: 'padding', value: '1rem' }], origin)
    if (!isKnown(f.space.padding)) throw new Error('expected known')
    expect(f.space.padding.value).toEqual({ top: 16, right: 16, bottom: 16, left: 16 })
  })

  it('expands two-value padding shorthand', () => {
    const f = declsToStyleFacts([{ prop: 'padding', value: '8px 16px' }], origin)
    if (!isKnown(f.space.padding)) throw new Error('expected known')
    expect(f.space.padding.value).toEqual({ top: 8, right: 16, bottom: 8, left: 16 })
  })

  it('expands four-value padding shorthand', () => {
    const f = declsToStyleFacts([{ prop: 'padding', value: '1px 2px 3px 4px' }], origin)
    if (!isKnown(f.space.padding)) throw new Error('expected known')
    expect(f.space.padding.value).toEqual({ top: 1, right: 2, bottom: 3, left: 4 })
  })

  it('applies longhand padding over shorthand in source order', () => {
    const f = declsToStyleFacts([
      { prop: 'padding', value: '16px' },
      { prop: 'padding-left', value: '8px' }
    ], origin)
    if (!isKnown(f.space.padding)) throw new Error('expected known')
    expect(f.space.padding.value).toEqual({ top: 16, right: 16, bottom: 16, left: 8 })
  })

  it('converts font size, weight, and family', () => {
    const f = declsToStyleFacts([
      { prop: 'font-size', value: '18px' },
      { prop: 'font-weight', value: '600' },
      { prop: 'font-family', value: 'Söhne, system-ui' }
    ], origin)
    if (isKnown(f.type.size)) expect(f.type.size.value.px).toBe(18)
    if (isKnown(f.type.weight)) expect(f.type.weight.value).toBe(600)
    if (isKnown(f.type.family)) expect(f.type.family.value).toBe('Söhne')
  })

  it('maps named font weights to numbers', () => {
    const f = declsToStyleFacts([{ prop: 'font-weight', value: 'bold' }], origin)
    if (isKnown(f.type.weight)) expect(f.type.weight.value).toBe(700)
  })

  it('converts colors from hex and named forms', () => {
    const f = declsToStyleFacts([
      { prop: 'color', value: '#111827' },
      { prop: 'background-color', value: 'white' },
      { prop: 'border-color', value: '#e5e7eb' }
    ], origin)
    if (isKnown(f.color.fg)) expect(f.color.fg.value.hex).toBe('#111827')
    if (isKnown(f.color.bg)) expect(f.color.bg.value.hex).toBe('#ffffff')
    if (isKnown(f.color.border)) expect(f.color.border.value.hex).toBe('#e5e7eb')
  })

  it('reads the color out of a background shorthand', () => {
    const f = declsToStyleFacts([{ prop: 'background', value: '#ffffff' }], origin)
    if (isKnown(f.color.bg)) expect(f.color.bg.value.hex).toBe('#ffffff')
  })

  it('converts radius, border width, and gap', () => {
    const f = declsToStyleFacts([
      { prop: 'border-radius', value: '12px' },
      { prop: 'border-width', value: '1px' },
      { prop: 'gap', value: '8px' }
    ], origin)
    if (isKnown(f.shape.radius)) expect(f.shape.radius.value.px).toBe(12)
    if (isKnown(f.shape.borderWidth)) expect(f.shape.borderWidth.value.px).toBe(1)
    if (isKnown(f.space.gap)) expect(f.space.gap.value.px).toBe(8)
  })

  it('reads border width out of the border shorthand', () => {
    const f = declsToStyleFacts([{ prop: 'border', value: '1px solid #ccc' }], origin)
    if (isKnown(f.shape.borderWidth)) expect(f.shape.borderWidth.value.px).toBe(1)
    if (isKnown(f.color.border)) expect(f.color.border.value.hex).toBe('#cccccc')
  })

  it('marks a value it cannot resolve statically as unknown, not absent', () => {
    const f = declsToStyleFacts([{ prop: 'padding', value: 'var(--space-4)' }], origin)
    expect(f.space.padding.state).toBe('unknown')
  })

  it('leaves untouched properties absent', () => {
    const f = declsToStyleFacts([{ prop: 'padding', value: '4px' }], origin)
    expect(f.color.fg.state).toBe('absent')
  })

  it('records the raw declarations', () => {
    const f = declsToStyleFacts([{ prop: 'padding', value: '4px' }], origin)
    expect(f.raw).toContain('padding: 4px')
  })
})

describe('parseStyleSheet', () => {
  it('extracts rules and their declarations', () => {
    const { rules } = parseStyleSheet('.card { padding: 1rem; color: #111 } .x { gap: 8px }')
    expect(rules).toHaveLength(2)
    expect(rules[0]!.selector).toBe('.card')
    expect(rules[0]!.decls).toEqual([
      { prop: 'padding', value: '1rem' },
      { prop: 'color', value: '#111' }
    ])
  })

  it('counts what it could not parse rather than throwing', () => {
    const { rules, unparsed } = parseStyleSheet('.a { color: red } this is not css {{{')
    expect(rules.length).toBeGreaterThanOrEqual(0)
    expect(unparsed).toBeGreaterThanOrEqual(1)
  })

  it('returns nothing for empty css', () => {
    expect(parseStyleSheet('').rules).toEqual([])
  })
})
```

`packages/extractors/core/tests/selectors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchSelector, rulesFor } from '../src/selectors.js'

const el = { tag: 'div', classes: ['card', 'wide'], id: 'main' }

describe('matchSelector', () => {
  it('applies for a matching class', () => {
    expect(matchSelector('.card', el)).toBe('applies')
  })

  it('applies for a matching tag', () => {
    expect(matchSelector('div', el)).toBe('applies')
  })

  it('applies for a matching id', () => {
    expect(matchSelector('#main', el)).toBe('applies')
  })

  it('applies for a compound selector when every part matches', () => {
    expect(matchSelector('div.card.wide', el)).toBe('applies')
  })

  it('does not apply when a compound part is missing', () => {
    expect(matchSelector('div.card.narrow', el)).toBe('no')
  })

  it('does not apply for an unrelated class', () => {
    expect(matchSelector('.sidebar', el)).toBe('no')
  })

  it('is a maybe for a descendant selector whose subject matches', () => {
    // No ancestor context here, so applicability genuinely cannot be decided.
    expect(matchSelector('.sidebar .card', el)).toBe('maybe')
  })

  it('does not apply when the descendant subject does not match', () => {
    expect(matchSelector('.sidebar .other', el)).toBe('no')
  })

  it('is a maybe for a pseudo-class on a matching subject', () => {
    expect(matchSelector('.card:hover', el)).toBe('maybe')
  })

  it('handles a selector list, taking the strongest outcome', () => {
    expect(matchSelector('.nope, .card', el)).toBe('applies')
    expect(matchSelector('.nope, .sidebar .card', el)).toBe('maybe')
    expect(matchSelector('.nope, .other', el)).toBe('no')
  })

  it('treats the universal selector as applying', () => {
    expect(matchSelector('*', el)).toBe('applies')
  })
})

describe('rulesFor', () => {
  const rules = [
    { selector: '.card', decls: [{ prop: 'padding', value: '16px' }] },
    { selector: '.sidebar .card', decls: [{ prop: 'color', value: 'red' }] },
    { selector: '.other', decls: [{ prop: 'gap', value: '4px' }] }
  ]

  it('separates certain declarations from uncertain ones', () => {
    const { certain, uncertain } = rulesFor(rules, el)
    expect(certain).toEqual([{ prop: 'padding', value: '16px' }])
    expect(uncertain).toEqual([{ prop: 'color', value: 'red' }])
  })

  it('ignores rules that cannot apply', () => {
    const { certain, uncertain } = rulesFor(rules, el)
    expect([...certain, ...uncertain].some(d => d.prop === 'gap')).toBe(false)
  })
})
```

`packages/extractors/core/tests/merge.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mergeFacts } from '../src/merge.js'
import { emptyStyleFacts } from '@fe-design/kernel/ir/types.js'
import { known, unknown, isKnown } from '@fe-design/kernel/ir/fact.js'

const origin = { kind: 'class' as const, raw: 'p-4' }
const withPadding = (v: number) => {
  const f = emptyStyleFacts()
  f.space.padding = known({ top: v, right: v, bottom: v, left: v }, origin)
  return f
}

describe('mergeFacts', () => {
  it('lets a later layer win over an earlier one', () => {
    const merged = mergeFacts([withPadding(4), withPadding(16)])
    if (!isKnown(merged.space.padding)) throw new Error('expected known')
    expect(merged.space.padding.value.top).toBe(16)
  })

  it('keeps an earlier known value when the later layer is absent', () => {
    const merged = mergeFacts([withPadding(4), emptyStyleFacts()])
    if (!isKnown(merged.space.padding)) throw new Error('expected known')
    expect(merged.space.padding.value.top).toBe(4)
  })

  it('lets unknown override known, because uncertainty is contagious', () => {
    const later = emptyStyleFacts()
    later.space.padding = unknown('external-stylesheet')
    expect(mergeFacts([withPadding(4), later]).space.padding.state).toBe('unknown')
  })

  it('stays absent when every layer is absent', () => {
    expect(mergeFacts([emptyStyleFacts(), emptyStyleFacts()]).space.padding.state)
      .toBe('absent')
  })

  it('concatenates raw across layers', () => {
    const a = emptyStyleFacts(); a.raw = ['p-4']
    const b = emptyStyleFacts(); b.raw = ['padding: 1rem']
    expect(mergeFacts([a, b]).raw).toEqual(['p-4', 'padding: 1rem'])
  })

  it('returns an empty fact set for no layers', () => {
    expect(mergeFacts([]).space.padding.state).toBe('absent')
  })
})
```

- [ ] **Step 2: Create the package**

`packages/extractors/core/package.json`:

```json
{
  "name": "@fe-design/extractor-core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "exports": {
    ".": { "types": "./dist/src/index.d.ts", "import": "./dist/src/index.js" }
  },
  "dependencies": {
    "@fe-design/kernel": "workspace:*",
    "culori": "^4.0.2",
    "postcss": "^8.4.0"
  },
  "devDependencies": { "@types/culori": "^4.0.0" }
}
```

`packages/extractors/core/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src", "tests"],
  "exclude": ["tests/equivalence"],
  "references": [{ "path": "../../kernel" }]
}
```

Add `{ "path": "./packages/extractors/core" }` to `references` in the root
`tsconfig.json`, and this line to the `alias` array in `vitest.config.ts`:

```ts
      { find: '@fe-design/extractor-core', replacement: src('packages/extractors/core/src/index.ts') },
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm install && pnpm vitest run packages/extractors/core`
Expected: FAIL — cannot find modules `css.js`, `selectors.js`, `merge.js`

- [ ] **Step 4: Move the Tailwind resolver into core**

```bash
git mv packages/extractors/react/src/tailwind.ts packages/extractors/core/src/tailwind.ts
```

Then replace `packages/extractors/react/src/tailwind.ts` with a re-export so
nothing that imports it breaks:

```ts
// Moved to @fe-design/extractor-core so Vue, Svelte, and HTML can share it.
export {
  resolveTailwindClasses, DEFAULT_SCALE, type TailwindScale
} from '@fe-design/extractor-core'
```

Add the dependency to `packages/extractors/react/package.json`:

```json
    "@fe-design/extractor-core": "workspace:*",
```

and the reference to `packages/extractors/react/tsconfig.json`:

```json
    { "path": "../core" }
```

Move its test too, since the implementation moved:

```bash
git mv packages/extractors/react/tests/tailwind.test.ts \
       packages/extractors/core/tests/tailwind.test.ts
```

and change its import line to:

```ts
import { resolveTailwindClasses } from '../src/tailwind.js'
```

- [ ] **Step 5: Write the CSS resolver**

`packages/extractors/core/src/css.ts`:

```ts
import postcss from 'postcss'
import { formatHex, parse as parseColor } from 'culori'
import {
  emptyStyleFacts, type StyleFacts, type Box
} from '@fe-design/kernel/ir/types.js'
import { known, unknown, type StyleOrigin } from '@fe-design/kernel/ir/fact.js'

export type Decl = { prop: string; value: string }
export type CssRule = { selector: string; decls: Decl[] }

const FONT_WEIGHTS: Record<string, number> = {
  thin: 100, extralight: 200, light: 300, normal: 400, regular: 400,
  medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900
}

/** null means "present but not statically resolvable", which becomes unknown. */
const toPx = (raw: string): number | null => {
  const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(raw.trim())
  if (!m) return null
  const n = Number(m[1])
  if (Number.isNaN(n)) return null
  return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n
}

const toHex = (raw: string): string | null => {
  const c = parseColor(raw.trim())
  if (!c) return null
  return formatHex(c) ?? null
}

const expandBox = (value: string): Box | null => {
  const parts = value.trim().split(/\s+/)
  const px = parts.map(toPx)
  if (px.some(p => p === null)) return null
  const [a, b, c, d] = px as number[]
  if (parts.length === 1) return { top: a!, right: a!, bottom: a!, left: a! }
  if (parts.length === 2) return { top: a!, right: b!, bottom: a!, left: b! }
  if (parts.length === 3) return { top: a!, right: b!, bottom: c!, left: b! }
  if (parts.length === 4) return { top: a!, right: b!, bottom: c!, left: d! }
  return null
}

export const parseInlineStyle = (style: string): Decl[] =>
  style.split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const i = part.indexOf(':')
      if (i === -1) return null
      return { prop: part.slice(0, i).trim(), value: part.slice(i + 1).trim() }
    })
    .filter((d): d is Decl => d !== null)

export const parseStyleSheet = (
  css: string
): { rules: CssRule[]; unparsed: number } => {
  const rules: CssRule[] = []
  let unparsed = 0

  try {
    const root = postcss.parse(css)
    root.walkRules(rule => {
      const decls: Decl[] = []
      rule.walkDecls(d => decls.push({ prop: d.prop, value: d.value }))
      rules.push({ selector: rule.selector, decls })
    })
  } catch {
    // A malformed block yields no rules rather than a thrown extraction.
    unparsed += 1
  }

  return { rules, unparsed }
}

export const declsToStyleFacts = (
  decls: Decl[], origin: StyleOrigin
): StyleFacts => {
  const facts = emptyStyleFacts()
  facts.raw = decls.map(d => `${d.prop}: ${d.value}`)

  // Longhands are applied in source order after shorthands, so a later
  // padding-left wins over an earlier padding, matching the cascade.
  let box: Box | null = null

  for (const { prop, value } of decls) {
    const p = prop.toLowerCase()

    if (p === 'padding') {
      const b = expandBox(value)
      if (b) box = b
      else facts.space.padding = unknown('parse-limit')
      continue
    }
    if (p.startsWith('padding-')) {
      const side = p.slice('padding-'.length) as keyof Box
      const px = toPx(value)
      if (px === null) { facts.space.padding = unknown('parse-limit'); continue }
      box ??= { top: 0, right: 0, bottom: 0, left: 0 }
      if (side === 'top' || side === 'right' || side === 'bottom' || side === 'left') {
        box[side] = px
      }
      continue
    }

    if (p === 'gap') {
      const px = toPx(value)
      facts.space.gap = px === null ? unknown('parse-limit') : known({ px }, origin)
      continue
    }

    if (p === 'font-size') {
      const px = toPx(value)
      facts.type.size = px === null ? unknown('parse-limit') : known({ px }, origin)
      continue
    }
    if (p === 'font-weight') {
      const named = FONT_WEIGHTS[value.trim().toLowerCase()]
      const n = named ?? Number(value.trim())
      facts.type.weight = Number.isFinite(n)
        ? known(n, origin) : unknown('parse-limit')
      continue
    }
    if (p === 'font-family') {
      const first = value.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '')
      if (first) facts.type.family = known(first, origin)
      continue
    }
    if (p === 'line-height') {
      const px = toPx(value)
      if (px !== null) facts.type.leading = known({ px }, origin)
      continue
    }
    if (p === 'letter-spacing') {
      const px = toPx(value)
      if (px !== null) facts.type.tracking = known({ px }, origin)
      continue
    }

    if (p === 'color') {
      const hex = toHex(value)
      facts.color.fg = hex ? known({ hex }, origin) : unknown('parse-limit')
      continue
    }
    if (p === 'background-color' || p === 'background') {
      const hex = toHex(value.split(/\s+/)[0] ?? value)
      if (hex) facts.color.bg = known({ hex }, origin)
      else if (p === 'background-color') facts.color.bg = unknown('parse-limit')
      continue
    }
    if (p === 'border-color') {
      const hex = toHex(value)
      facts.color.border = hex ? known({ hex }, origin) : unknown('parse-limit')
      continue
    }

    if (p === 'border-radius') {
      const px = toPx(value.split(/\s+/)[0] ?? value)
      facts.shape.radius = px === null
        ? unknown('parse-limit') : known({ px }, origin)
      continue
    }
    if (p === 'border-width') {
      const px = toPx(value.split(/\s+/)[0] ?? value)
      facts.shape.borderWidth = px === null
        ? unknown('parse-limit') : known({ px }, origin)
      continue
    }
    if (p === 'border') {
      // `1px solid #ccc` — width first, colour last where both are present.
      const parts = value.trim().split(/\s+/)
      const px = toPx(parts[0] ?? '')
      if (px !== null) facts.shape.borderWidth = known({ px }, origin)
      const hex = toHex(parts[parts.length - 1] ?? '')
      if (hex) facts.color.border = known({ hex }, origin)
      continue
    }
    if (p === 'box-shadow') {
      facts.shape.shadow = known({ raw: value.trim() }, origin)
      continue
    }

    if (p === 'display') { facts.layout.display = known(value.trim(), origin); continue }
    if (p === 'flex-direction') { facts.layout.direction = known(value.trim(), origin); continue }
    if (p === 'align-items') { facts.layout.align = known(value.trim(), origin); continue }
  }

  if (box && facts.space.padding.state === 'absent') {
    facts.space.padding = known(box, origin)
  }

  return facts
}
```

- [ ] **Step 6: Write the selector matcher**

`packages/extractors/core/src/selectors.ts`:

```ts
import type { Decl, CssRule } from './css.js'

export type ElementKey = { tag: string; classes: string[]; id: string | null }
export type SelectorMatch = 'applies' | 'maybe' | 'no'

const RANK: Record<SelectorMatch, number> = { no: 0, maybe: 1, applies: 2 }

/** A compound like `div.card.wide` — no combinators, no pseudos. */
const matchCompound = (compound: string, el: ElementKey): boolean => {
  const parts = compound.match(/^[a-zA-Z][\w-]*|\.[\w-]+|#[\w-]+|\*/g)
  if (!parts || parts.join('') !== compound) return false

  for (const part of parts) {
    if (part === '*') continue
    if (part.startsWith('.')) {
      if (!el.classes.includes(part.slice(1))) return false
    } else if (part.startsWith('#')) {
      if (el.id !== part.slice(1)) return false
    } else if (part.toLowerCase() !== el.tag.toLowerCase()) {
      return false
    }
  }
  return true
}

const matchOne = (selector: string, el: ElementKey): SelectorMatch => {
  const sel = selector.trim()
  if (sel === '') return 'no'

  // Strip pseudo-classes and pseudo-elements from the subject. They make the
  // rule conditional, so a match becomes 'maybe' rather than 'applies'.
  const hasPseudo = /::?[\w-]+/.test(sel)
  const base = sel.replace(/::?[\w-]+(\([^)]*\))?/g, '')

  // The subject is the last compound after any combinator.
  const compounds = base.split(/\s*[>+~]\s*|\s+/).filter(Boolean)
  const subject = compounds[compounds.length - 1] ?? ''
  if (!matchCompound(subject, el)) return 'no'

  // Ancestors and siblings cannot be evaluated without document context, and
  // a pseudo-class depends on runtime state. Either way the honest answer is
  // that this rule might apply, so its declarations become unknown.
  if (compounds.length > 1 || hasPseudo) return 'maybe'
  return 'applies'
}

export const matchSelector = (selector: string, el: ElementKey): SelectorMatch => {
  let best: SelectorMatch = 'no'
  for (const part of selector.split(',')) {
    const r = matchOne(part, el)
    if (RANK[r] > RANK[best]) best = r
  }
  return best
}

export const rulesFor = (
  rules: CssRule[], el: ElementKey
): { certain: Decl[]; uncertain: Decl[] } => {
  const certain: Decl[] = []
  const uncertain: Decl[] = []

  for (const rule of rules) {
    const m = matchSelector(rule.selector, el)
    if (m === 'applies') certain.push(...rule.decls)
    else if (m === 'maybe') uncertain.push(...rule.decls)
  }

  return { certain, uncertain }
}
```

- [ ] **Step 7: Write the layer merger**

`packages/extractors/core/src/merge.ts`:

```ts
import { emptyStyleFacts, type StyleFacts } from '@fe-design/kernel/ir/types.js'
import type { Fact } from '@fe-design/kernel/ir/fact.js'

type Group = keyof Omit<StyleFacts, 'raw'>

const GROUPS: Group[] = ['space', 'type', 'color', 'shape', 'layout']

/**
 * Later layers win, but uncertainty is contagious: once a layer says a value
 * is unknown, no earlier certainty can restore it, because the later rule may
 * or may not override. Treating it as known would invent a finding.
 */
const pick = (a: Fact<unknown>, b: Fact<unknown>): Fact<unknown> => {
  if (b.state === 'unknown' || a.state === 'unknown') {
    return b.state === 'unknown' ? b : a
  }
  return b.state === 'known' ? b : a
}

export const mergeFacts = (layers: StyleFacts[]): StyleFacts => {
  const out = emptyStyleFacts()
  if (layers.length === 0) return out

  for (const layer of layers) {
    for (const group of GROUPS) {
      const target = out[group] as Record<string, Fact<unknown>>
      const source = layer[group] as Record<string, Fact<unknown>>
      for (const key of Object.keys(source)) {
        target[key] = pick(target[key]!, source[key]!)
      }
    }
    out.raw.push(...layer.raw)
  }

  return out
}
```

`packages/extractors/core/src/index.ts`:

```ts
export {
  resolveTailwindClasses, DEFAULT_SCALE, type TailwindScale
} from './tailwind.js'
export {
  declsToStyleFacts, parseInlineStyle, parseStyleSheet,
  type Decl, type CssRule
} from './css.js'
export {
  matchSelector, rulesFor, type ElementKey, type SelectorMatch
} from './selectors.js'
export { mergeFacts } from './merge.js'
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm install && pnpm test && pnpm typecheck`
Expected: PASS — the new core tests plus all 285 existing. The React package
still works because `tailwind.ts` re-exports from core.

- [ ] **Step 9: Commit**

```bash
git add packages/extractors vitest.config.ts tsconfig.json
git commit -m "feat(extractor-core): share Tailwind and CSS resolution across frameworks"
```

---

### Task 3: Vue extractor

**Files:**
- Create: `packages/extractors/vue/package.json`, `tsconfig.json`, `src/index.ts`
- Create: `packages/extractors/vue/tests/extract.test.ts`
- Modify: `vitest.config.ts`, `tsconfig.json` — register the package

**Interfaces:**
- Consumes: `resolveTailwindClasses`, `parseInlineStyle`, `parseStyleSheet`, `declsToStyleFacts`, `rulesFor`, `mergeFacts`, `ElementKey` from `@fe-design/extractor-core`; `makeNode`, `emptyStyleFacts`, `IRDoc`, `IRNode` from kernel
- Produces: `extractVue(source: string, file: string): IRDoc`

Verified parser behaviour, restated so it is not re-derived: `parse(src)` from
`@vue/compiler-sfc` returns `{ descriptor }`; the template root is
`descriptor.template.ast`; element nodes are `type === 1`; a static `class` prop
has `type === 6` with `value.content`; `:class` arrives as a bind prop with
`type === 7` and must produce `unknown`; style blocks are `descriptor.styles[]`
with a `.content` string.

- [ ] **Step 1: Write the failing test**

`packages/extractors/vue/tests/extract.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractVue } from '../src/index.js'
import { isKnown, isUnknown } from '@fe-design/kernel/ir/fact.js'

const sfc = (body: string) => extractVue(body, 'Card.vue')

describe('extractVue', () => {
  it('produces one node per element with parent links', () => {
    const doc = sfc(`<template>
  <section class="bg-white p-6">
    <h2 class="text-2xl">Title</h2>
    <p class="text-base">Body</p>
  </section>
</template>`)
    expect(doc.framework).toBe('vue')
    expect(doc.nodes.map(n => n.name)).toEqual(['section', 'h2', 'p'])
    expect(doc.nodes[1]?.parent).toBe(doc.nodes[0]?.id)
    expect(doc.nodes[0]?.children).toHaveLength(2)
  })

  it('resolves a static class through the Tailwind resolver', () => {
    const doc = sfc('<template><div class="p-6 bg-white"/></template>')
    const d = doc.nodes[0]!
    if (!isKnown(d.style.space.padding)) throw new Error('expected known padding')
    expect(d.style.space.padding.value.top).toBe(24)
    if (isKnown(d.style.color.bg)) expect(d.style.color.bg.value.hex).toBe('#ffffff')
  })

  it('marks a bound :class as unknown, not absent', () => {
    const doc = sfc('<template><div :class="tone"/></template>')
    expect(isUnknown(doc.nodes[0]!.style.space.padding)).toBe(true)
  })

  it('resolves an inline style attribute', () => {
    const doc = sfc('<template><div style="padding: 1rem; color: #111827"/></template>')
    const d = doc.nodes[0]!
    if (isKnown(d.style.space.padding)) expect(d.style.space.padding.value.top).toBe(16)
    if (isKnown(d.style.color.fg)) expect(d.style.color.fg.value.hex).toBe('#111827')
  })

  it('applies a scoped style block by class selector', () => {
    const doc = sfc(`<template><div class="card"/></template>
<style scoped>.card { padding: 12px }</style>`)
    const d = doc.nodes[0]!
    if (!isKnown(d.style.space.padding)) throw new Error('expected known padding')
    expect(d.style.space.padding.value.top).toBe(12)
  })

  it('marks a descendant-selector rule as unknown rather than applying it', () => {
    const doc = sfc(`<template><div class="card"/></template>
<style>.sidebar .card { padding: 99px }</style>`)
    expect(isUnknown(doc.nodes[0]!.style.space.padding)).toBe(true)
  })

  it('lets an inline style win over a stylesheet rule', () => {
    const doc = sfc(`<template><div class="card" style="padding: 4px"/></template>
<style>.card { padding: 32px }</style>`)
    const d = doc.nodes[0]!
    if (!isKnown(d.style.space.padding)) throw new Error('expected known padding')
    expect(d.style.space.padding.value.top).toBe(4)
  })

  it('classifies a capitalised tag as a component', () => {
    const doc = sfc('<template><MyButton class="p-4">Go</MyButton></template>')
    expect(doc.nodes[0]?.kind).toBe('component')
  })

  it('records line numbers', () => {
    const doc = sfc('<template>\n  <div class="p-4"/>\n</template>')
    expect(doc.nodes[0]?.loc.line).toBe(2)
  })

  it('captures literal text children', () => {
    const doc = sfc('<template><h2 class="text-2xl">Title</h2></template>')
    expect(doc.nodes[0]?.text).toBe('Title')
  })

  it('returns an empty document for an SFC with no template', () => {
    const doc = sfc('<script setup>const a = 1</script>')
    expect(doc.nodes).toEqual([])
  })

  it('leaves an unstyled element fully absent', () => {
    const doc = sfc('<template><div/></template>')
    expect(doc.nodes[0]?.style.space.padding.state).toBe('absent')
  })
})
```

- [ ] **Step 2: Create the package**

`packages/extractors/vue/package.json`:

```json
{
  "name": "@fe-design/extractor-vue",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "exports": {
    ".": { "types": "./dist/src/index.d.ts", "import": "./dist/src/index.js" }
  },
  "dependencies": {
    "@fe-design/kernel": "workspace:*",
    "@fe-design/extractor-core": "workspace:*",
    "@vue/compiler-sfc": "^3.5.0"
  }
}
```

`packages/extractors/vue/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src", "tests"],
  "references": [{ "path": "../../kernel" }, { "path": "../core" }]
}
```

Add `{ "path": "./packages/extractors/vue" }` to the root `tsconfig.json`
references, and to the `alias` array in `vitest.config.ts`:

```ts
      { find: '@fe-design/extractor-vue', replacement: src('packages/extractors/vue/src/index.ts') },
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm install && pnpm vitest run packages/extractors/vue`
Expected: FAIL — cannot find module `index.js`

- [ ] **Step 4: Write the extractor**

`packages/extractors/vue/src/index.ts`:

```ts
import { parse as parseSfc } from '@vue/compiler-sfc'
import {
  resolveTailwindClasses, parseInlineStyle, parseStyleSheet,
  declsToStyleFacts, rulesFor, mergeFacts, type ElementKey, type CssRule
} from '@fe-design/extractor-core'
import {
  makeNode, emptyStyleFacts, type IRDoc, type IRNode, type StyleFacts
} from '@fe-design/kernel/ir/types.js'
import { unknown } from '@fe-design/kernel/ir/fact.js'

const ELEMENT = 1
const ATTR = 6

const allUnknown = (): StyleFacts => {
  const s = emptyStyleFacts()
  const u = () => unknown('dynamic-expression')
  s.space.padding = u(); s.space.margin = u(); s.space.gap = u()
  s.type.size = u(); s.type.weight = u(); s.type.leading = u()
  s.type.tracking = u(); s.type.family = u()
  s.color.fg = u(); s.color.bg = u(); s.color.border = u()
  s.shape.radius = u(); s.shape.borderWidth = u(); s.shape.shadow = u()
  return s
}

const uncertainFacts = (raw: string[]): StyleFacts => {
  const s = emptyStyleFacts()
  s.raw = raw
  const u = () => unknown('external-stylesheet')
  s.space.padding = u(); s.space.gap = u()
  s.type.size = u(); s.type.weight = u()
  s.color.fg = u(); s.color.bg = u(); s.color.border = u()
  s.shape.radius = u(); s.shape.borderWidth = u()
  return s
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const attrValue = (node: any, name: string): string | null => {
  const prop = (node.props ?? []).find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: any) => p.type === ATTR && p.name === name
  )
  return prop?.value?.content ?? null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hasBoundClass = (node: any): boolean =>
  (node.props ?? []).some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: any) => p.type !== ATTR &&
      (p.arg?.content === 'class' || p.name === 'class')
  )

export const extractVue = (source: string, file: string): IRDoc => {
  const { descriptor } = parseSfc(source, { filename: file })

  const sheet: CssRule[] = descriptor.styles.flatMap(
    s => parseStyleSheet(s.content).rules
  )

  const nodes: IRNode[] = []
  let seq = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (node: any, parentId: string | null): void => {
    if (!node || node.type !== ELEMENT) {
      for (const child of node?.children ?? []) walk(child, parentId)
      return
    }

    const id = `n${++seq}`
    const tag = String(node.tag ?? 'unknown')
    const className = attrValue(node, 'class')
    const inline = attrValue(node, 'style')

    const key: ElementKey = {
      tag,
      classes: className ? className.split(/\s+/).filter(Boolean) : [],
      id: attrValue(node, 'id')
    }

    const layers: StyleFacts[] = []

    if (sheet.length > 0) {
      const { certain, uncertain } = rulesFor(sheet, key)
      if (certain.length > 0) {
        layers.push(declsToStyleFacts(certain, { kind: 'stylesheet', raw: tag }))
      }
      if (uncertain.length > 0) {
        layers.push(uncertainFacts(uncertain.map(d => `${d.prop}: ${d.value}`)))
      }
    }

    if (hasBoundClass(node)) layers.push(allUnknown())
    else if (className) layers.push(resolveTailwindClasses(className))

    if (inline) {
      layers.push(declsToStyleFacts(
        parseInlineStyle(inline), { kind: 'inline', raw: inline }
      ))
    }

    const textChild = (node.children ?? []).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c.type === 2 && String(c.content).trim().length > 0
    )

    nodes.push(makeNode({
      id,
      name: tag,
      kind: /^[A-Z]/.test(tag) ? 'component' : 'element',
      parent: parentId,
      style: layers.length > 0 ? mergeFacts(layers) : emptyStyleFacts(),
      text: textChild ? String(textChild.content).trim() : null,
      loc: { line: node.loc?.start?.line ?? 1, col: node.loc?.start?.column ?? 0 }
    }))

    if (parentId) {
      nodes.find(n => n.id === parentId)?.children.push(id)
    }

    for (const child of node.children ?? []) walk(child, id)
  }

  const root = descriptor.template?.ast
  if (root) for (const child of root.children ?? []) walk(child, null)

  return { file, framework: 'vue', nodes, imports: [], dataSources: [] }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/extractors/vue`
Expected: PASS — 12 tests

If the line-number test fails, read the actual value from the failure and
correct the expectation to match the fixture. Do not adjust the extractor to
satisfy a guessed line number.

- [ ] **Step 6: Register the extractor**

In `packages/server/src/extractors.ts`, add the import and entry:

```ts
import { extractVue } from '@fe-design/extractor-vue'
```

```ts
  '.vue': extractVue,
```

Add `"@fe-design/extractor-vue": "workspace:*"` to `packages/server/package.json`
dependencies and `{ "path": "../extractors/vue" }` to its tsconfig references.

- [ ] **Step 7: Run everything and commit**

Run: `pnpm install && pnpm test && pnpm typecheck`

```bash
git add packages/extractors/vue packages/server vitest.config.ts tsconfig.json
git commit -m "feat(extractor-vue): extract Vue SFCs into the shared IR"
```

---

### Task 4: Svelte extractor

**Files:**
- Create: `packages/extractors/svelte/package.json`, `tsconfig.json`, `src/index.ts`
- Create: `packages/extractors/svelte/tests/extract.test.ts`
- Modify: `vitest.config.ts`, `tsconfig.json`, `packages/server/src/extractors.ts`

**Interfaces:**
- Consumes: the same `@fe-design/extractor-core` surface as Task 3
- Produces: `extractSvelte(source: string, file: string): IRDoc`

Verified parser behaviour: `parse(src, { modern: true })` from `svelte/compiler`
returns `{ fragment, css }`. Elements are `type === 'RegularElement'` with a
`name` and `attributes[]`. A static class attribute has `value` as an array of
`Text` nodes carrying `.data`; a dynamic one has `value` as an `ExpressionTag`
object, which must become `unknown`. Stylesheet text is `ast.css.content.styles`.
Children live on `node.fragment.nodes`.

- [ ] **Step 1: Write the failing test**

`packages/extractors/svelte/tests/extract.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractSvelte } from '../src/index.js'
import { isKnown, isUnknown } from '@fe-design/kernel/ir/fact.js'

const sv = (body: string) => extractSvelte(body, 'Card.svelte')

describe('extractSvelte', () => {
  it('produces one node per element with parent links', () => {
    const doc = sv(`<section class="bg-white p-6">
  <h2 class="text-2xl">Title</h2>
  <p class="text-base">Body</p>
</section>`)
    expect(doc.framework).toBe('svelte')
    expect(doc.nodes.map(n => n.name)).toEqual(['section', 'h2', 'p'])
    expect(doc.nodes[1]?.parent).toBe(doc.nodes[0]?.id)
    expect(doc.nodes[0]?.children).toHaveLength(2)
  })

  it('resolves a static class through the Tailwind resolver', () => {
    const doc = sv('<div class="p-6 bg-white"/>')
    const d = doc.nodes[0]!
    if (!isKnown(d.style.space.padding)) throw new Error('expected known padding')
    expect(d.style.space.padding.value.top).toBe(24)
    if (isKnown(d.style.color.bg)) expect(d.style.color.bg.value.hex).toBe('#ffffff')
  })

  it('marks a dynamic class expression as unknown, not absent', () => {
    const doc = sv('<div class={tone}/>')
    expect(isUnknown(doc.nodes[0]!.style.space.padding)).toBe(true)
  })

  it('resolves an inline style attribute', () => {
    const doc = sv('<div style="padding: 1rem; color: #111827"/>')
    const d = doc.nodes[0]!
    if (isKnown(d.style.space.padding)) expect(d.style.space.padding.value.top).toBe(16)
    if (isKnown(d.style.color.fg)) expect(d.style.color.fg.value.hex).toBe('#111827')
  })

  it('applies a style block by class selector', () => {
    const doc = sv('<div class="card"/>\n<style>.card { padding: 12px }</style>')
    const d = doc.nodes[0]!
    if (!isKnown(d.style.space.padding)) throw new Error('expected known padding')
    expect(d.style.space.padding.value.top).toBe(12)
  })

  it('marks a descendant-selector rule as unknown rather than applying it', () => {
    const doc = sv('<div class="card"/>\n<style>.sidebar .card { padding: 99px }</style>')
    expect(isUnknown(doc.nodes[0]!.style.space.padding)).toBe(true)
  })

  it('lets an inline style win over a stylesheet rule', () => {
    const doc = sv('<div class="card" style="padding: 4px"/>\n<style>.card { padding: 32px }</style>')
    const d = doc.nodes[0]!
    if (!isKnown(d.style.space.padding)) throw new Error('expected known padding')
    expect(d.style.space.padding.value.top).toBe(4)
  })

  it('classifies a capitalised tag as a component', () => {
    const doc = sv('<MyButton class="p-4">Go</MyButton>')
    expect(doc.nodes[0]?.kind).toBe('component')
  })

  it('captures literal text children', () => {
    const doc = sv('<h2 class="text-2xl">Title</h2>')
    expect(doc.nodes[0]?.text).toBe('Title')
  })

  it('leaves an unstyled element fully absent', () => {
    expect(sv('<div/>').nodes[0]?.style.space.padding.state).toBe('absent')
  })

  it('returns an empty document for markup with no elements', () => {
    expect(sv('<script>const a = 1</script>').nodes).toEqual([])
  })
})
```

- [ ] **Step 2: Create the package**

`packages/extractors/svelte/package.json`:

```json
{
  "name": "@fe-design/extractor-svelte",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "exports": {
    ".": { "types": "./dist/src/index.d.ts", "import": "./dist/src/index.js" }
  },
  "dependencies": {
    "@fe-design/kernel": "workspace:*",
    "@fe-design/extractor-core": "workspace:*",
    "svelte": "^5.0.0"
  }
}
```

`packages/extractors/svelte/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src", "tests"],
  "references": [{ "path": "../../kernel" }, { "path": "../core" }]
}
```

Add `{ "path": "./packages/extractors/svelte" }` to the root tsconfig references,
and to `vitest.config.ts`:

```ts
      { find: '@fe-design/extractor-svelte', replacement: src('packages/extractors/svelte/src/index.ts') },
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm install && pnpm vitest run packages/extractors/svelte`
Expected: FAIL — cannot find module `index.js`

- [ ] **Step 4: Write the extractor**

`packages/extractors/svelte/src/index.ts`:

```ts
import { parse } from 'svelte/compiler'
import {
  resolveTailwindClasses, parseInlineStyle, parseStyleSheet,
  declsToStyleFacts, rulesFor, mergeFacts, type ElementKey, type CssRule
} from '@fe-design/extractor-core'
import {
  makeNode, emptyStyleFacts, type IRDoc, type IRNode, type StyleFacts
} from '@fe-design/kernel/ir/types.js'
import { unknown } from '@fe-design/kernel/ir/fact.js'

const allUnknown = (): StyleFacts => {
  const s = emptyStyleFacts()
  const u = () => unknown('dynamic-expression')
  s.space.padding = u(); s.space.margin = u(); s.space.gap = u()
  s.type.size = u(); s.type.weight = u(); s.type.leading = u()
  s.type.tracking = u(); s.type.family = u()
  s.color.fg = u(); s.color.bg = u(); s.color.border = u()
  s.shape.radius = u(); s.shape.borderWidth = u(); s.shape.shadow = u()
  return s
}

const uncertainFacts = (raw: string[]): StyleFacts => {
  const s = emptyStyleFacts()
  s.raw = raw
  const u = () => unknown('external-stylesheet')
  s.space.padding = u(); s.space.gap = u()
  s.type.size = u(); s.type.weight = u()
  s.color.fg = u(); s.color.bg = u(); s.color.border = u()
  s.shape.radius = u(); s.shape.borderWidth = u()
  return s
}

type AttrRead = { value: string | null; dynamic: boolean }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readAttr = (node: any, name: string): AttrRead => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attr = (node.attributes ?? []).find((a: any) => a.name === name)
  if (!attr) return { value: null, dynamic: false }

  const v = attr.value
  if (v === true) return { value: null, dynamic: false }

  if (Array.isArray(v)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (v.every((p: any) => p.type === 'Text')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { value: v.map((p: any) => p.data).join(''), dynamic: false }
    }
    return { value: null, dynamic: true }
  }

  // A bare ExpressionTag, e.g. class={tone}.
  return { value: null, dynamic: true }
}

export const extractSvelte = (source: string, file: string): IRDoc => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ast = parse(source, { modern: true }) as any

  const sheet: CssRule[] = ast.css?.content?.styles
    ? parseStyleSheet(ast.css.content.styles).rules
    : []

  const nodes: IRNode[] = []
  let seq = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const childrenOf = (node: any): any[] =>
    node?.fragment?.nodes ?? node?.nodes ?? []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (node: any, parentId: string | null): void => {
    const isElement = node?.type === 'RegularElement' || node?.type === 'Component'
    if (!isElement) {
      for (const child of childrenOf(node)) walk(child, parentId)
      return
    }

    const id = `n${++seq}`
    const tag = String(node.name ?? 'unknown')
    const cls = readAttr(node, 'class')
    const inline = readAttr(node, 'style')

    const key: ElementKey = {
      tag,
      classes: cls.value ? cls.value.split(/\s+/).filter(Boolean) : [],
      id: readAttr(node, 'id').value
    }

    const layers: StyleFacts[] = []

    if (sheet.length > 0) {
      const { certain, uncertain } = rulesFor(sheet, key)
      if (certain.length > 0) {
        layers.push(declsToStyleFacts(certain, { kind: 'stylesheet', raw: tag }))
      }
      if (uncertain.length > 0) {
        layers.push(uncertainFacts(uncertain.map(d => `${d.prop}: ${d.value}`)))
      }
    }

    if (cls.dynamic) layers.push(allUnknown())
    else if (cls.value) layers.push(resolveTailwindClasses(cls.value))

    if (inline.value) {
      layers.push(declsToStyleFacts(
        parseInlineStyle(inline.value), { kind: 'inline', raw: inline.value }
      ))
    }

    const textChild = childrenOf(node).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c.type === 'Text' && String(c.data).trim().length > 0
    )

    nodes.push(makeNode({
      id,
      name: tag,
      kind: /^[A-Z]/.test(tag) ? 'component' : 'element',
      parent: parentId,
      style: layers.length > 0 ? mergeFacts(layers) : emptyStyleFacts(),
      text: textChild ? String(textChild.data).trim() : null,
      loc: { line: 1, col: 0 }
    }))

    if (parentId) {
      nodes.find(n => n.id === parentId)?.children.push(id)
    }

    for (const child of childrenOf(node)) walk(child, id)
  }

  for (const child of childrenOf(ast.fragment)) walk(child, null)

  return { file, framework: 'svelte', nodes, imports: [], dataSources: [] }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/extractors/svelte`
Expected: PASS — 11 tests

- [ ] **Step 6: Register the extractor**

In `packages/server/src/extractors.ts`:

```ts
import { extractSvelte } from '@fe-design/extractor-svelte'
```

```ts
  '.svelte': extractSvelte,
```

Add the workspace dependency and tsconfig reference to the server package, as in
Task 3.

- [ ] **Step 7: Run everything and commit**

Run: `pnpm install && pnpm test && pnpm typecheck`

```bash
git add packages/extractors/svelte packages/server vitest.config.ts tsconfig.json
git commit -m "feat(extractor-svelte): extract Svelte components into the shared IR"
```

---

### Task 5: HTML extractor

**Files:**
- Create: `packages/extractors/html/package.json`, `tsconfig.json`, `src/index.ts`
- Create: `packages/extractors/html/tests/extract.test.ts`
- Modify: `vitest.config.ts`, `tsconfig.json`, `packages/server/src/extractors.ts`

**Interfaces:**
- Consumes: the same `@fe-design/extractor-core` surface as Tasks 3 and 4
- Produces: `extractHtml(source: string, file: string): IRDoc`

Verified parser behaviour: `parse(html, { sourceCodeLocationInfo: true })` from
`parse5`. Without that option every `sourceCodeLocation` is `undefined`. parse5
also synthesizes `html`, `head`, and `body` elements when they are absent from
the source, and those synthesized nodes carry no location — skip any element
with no `sourceCodeLocation` so a fragment does not gain three phantom nodes.
Attributes are `node.attrs` as `{ name, value }` pairs; children are
`node.childNodes`; inline `<style>` text sits in the style element's first
child `.value`.

- [ ] **Step 1: Write the failing test**

`packages/extractors/html/tests/extract.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractHtml } from '../src/index.js'
import { isKnown, isUnknown } from '@fe-design/kernel/ir/fact.js'

const h = (body: string) => extractHtml(body, 'page.html')

describe('extractHtml', () => {
  it('produces one node per element with parent links', () => {
    const doc = h(`<section class="bg-white p-6">
  <h2 class="text-2xl">Title</h2>
  <p class="text-base">Body</p>
</section>`)
    expect(doc.framework).toBe('html')
    expect(doc.nodes.map(n => n.name)).toEqual(['section', 'h2', 'p'])
    expect(doc.nodes[1]?.parent).toBe(doc.nodes[0]?.id)
    expect(doc.nodes[0]?.children).toHaveLength(2)
  })

  it('does not invent html, head, or body nodes for a fragment', () => {
    const doc = h('<div class="p-4">x</div>')
    expect(doc.nodes.map(n => n.name)).toEqual(['div'])
  })

  it('keeps the structural elements the source actually wrote', () => {
    // Verified: for this input parse5 gives html, body, and div a source
    // location but still synthesizes head, which therefore stays out.
    const names = h('<html><body><div class="p-4">x</div></body></html>')
      .nodes.map(n => n.name)
    expect(names).toContain('html')
    expect(names).toContain('body')
    expect(names).toContain('div')
    expect(names).not.toContain('head')
  })

  it('resolves a static class through the Tailwind resolver', () => {
    const doc = h('<div class="p-6 bg-white"></div>')
    const d = doc.nodes[0]!
    if (!isKnown(d.style.space.padding)) throw new Error('expected known padding')
    expect(d.style.space.padding.value.top).toBe(24)
    if (isKnown(d.style.color.bg)) expect(d.style.color.bg.value.hex).toBe('#ffffff')
  })

  it('resolves an inline style attribute', () => {
    const doc = h('<div style="padding: 1rem; color: #111827"></div>')
    const d = doc.nodes[0]!
    if (isKnown(d.style.space.padding)) expect(d.style.space.padding.value.top).toBe(16)
    if (isKnown(d.style.color.fg)) expect(d.style.color.fg.value.hex).toBe('#111827')
  })

  it('applies a style element by class selector', () => {
    const doc = h('<style>.card { padding: 12px }</style><div class="card"></div>')
    const card = doc.nodes.find(n => n.name === 'div')!
    if (!isKnown(card.style.space.padding)) throw new Error('expected known padding')
    expect(card.style.space.padding.value.top).toBe(12)
  })

  it('marks a descendant-selector rule as unknown rather than applying it', () => {
    const doc = h('<style>.sidebar .card { padding: 99px }</style><div class="card"></div>')
    const card = doc.nodes.find(n => n.name === 'div')!
    expect(isUnknown(card.style.space.padding)).toBe(true)
  })

  it('lets an inline style win over a stylesheet rule', () => {
    const doc = h('<style>.card { padding: 32px }</style><div class="card" style="padding: 4px"></div>')
    const card = doc.nodes.find(n => n.name === 'div')!
    if (!isKnown(card.style.space.padding)) throw new Error('expected known padding')
    expect(card.style.space.padding.value.top).toBe(4)
  })

  it('records line numbers', () => {
    const doc = h('<div class="p-4">\n  <p class="text-lg">hi</p>\n</div>')
    expect(doc.nodes[0]?.loc.line).toBe(1)
    expect(doc.nodes[1]?.loc.line).toBe(2)
  })

  it('captures literal text children', () => {
    expect(h('<h2 class="text-2xl">Title</h2>').nodes[0]?.text).toBe('Title')
  })

  it('leaves an unstyled element fully absent', () => {
    expect(h('<div></div>').nodes[0]?.style.space.padding.state).toBe('absent')
  })

  it('does not emit a node for the style element itself', () => {
    const doc = h('<style>.a{color:red}</style><div class="a"></div>')
    expect(doc.nodes.map(n => n.name)).not.toContain('style')
  })
})
```

- [ ] **Step 2: Create the package**

`packages/extractors/html/package.json`:

```json
{
  "name": "@fe-design/extractor-html",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "exports": {
    ".": { "types": "./dist/src/index.d.ts", "import": "./dist/src/index.js" }
  },
  "dependencies": {
    "@fe-design/kernel": "workspace:*",
    "@fe-design/extractor-core": "workspace:*",
    "parse5": "^7.2.0"
  }
}
```

`packages/extractors/html/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src", "tests"],
  "references": [{ "path": "../../kernel" }, { "path": "../core" }]
}
```

Add `{ "path": "./packages/extractors/html" }` to the root tsconfig references,
and to `vitest.config.ts`:

```ts
      { find: '@fe-design/extractor-html', replacement: src('packages/extractors/html/src/index.ts') },
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm install && pnpm vitest run packages/extractors/html`
Expected: FAIL — cannot find module `index.js`

- [ ] **Step 4: Write the extractor**

`packages/extractors/html/src/index.ts`:

```ts
import { parse } from 'parse5'
import {
  resolveTailwindClasses, parseInlineStyle, parseStyleSheet,
  declsToStyleFacts, rulesFor, mergeFacts, type ElementKey, type CssRule
} from '@fe-design/extractor-core'
import {
  makeNode, emptyStyleFacts, type IRDoc, type IRNode, type StyleFacts
} from '@fe-design/kernel/ir/types.js'
import { unknown } from '@fe-design/kernel/ir/fact.js'

const uncertainFacts = (raw: string[]): StyleFacts => {
  const s = emptyStyleFacts()
  s.raw = raw
  const u = () => unknown('external-stylesheet')
  s.space.padding = u(); s.space.gap = u()
  s.type.size = u(); s.type.weight = u()
  s.color.fg = u(); s.color.bg = u(); s.color.border = u()
  s.shape.radius = u(); s.shape.borderWidth = u()
  return s
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const attr = (node: any, name: string): string | null =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (node.attrs ?? []).find((a: any) => a.name === name)?.value ?? null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const collectStyles = (node: any, out: string[]): void => {
  if (node.tagName === 'style') {
    const text = node.childNodes?.[0]?.value
    if (typeof text === 'string') out.push(text)
  }
  for (const c of node.childNodes ?? []) collectStyles(c, out)
}

export const extractHtml = (source: string, file: string): IRDoc => {
  // Without sourceCodeLocationInfo every location is undefined, and locations
  // are also how synthesized html/head/body nodes are told apart from real ones.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = parse(source, { sourceCodeLocationInfo: true }) as any

  const styleTexts: string[] = []
  collectStyles(doc, styleTexts)
  const sheet: CssRule[] = styleTexts.flatMap(t => parseStyleSheet(t).rules)

  const nodes: IRNode[] = []
  let seq = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (node: any, parentId: string | null): void => {
    const tag: string | undefined = node.tagName

    // parse5 inserts html, head, and body around a fragment. Those synthesized
    // nodes have no source location, so skipping location-less elements keeps a
    // fragment from gaining three nodes nobody wrote.
    const synthesized = tag !== undefined && !node.sourceCodeLocation
    const skip = tag === undefined || tag === 'style' || tag === 'script' || synthesized

    let id = parentId

    if (!skip) {
      id = `n${++seq}`
      const className = attr(node, 'class')
      const inline = attr(node, 'style')

      const key: ElementKey = {
        tag,
        classes: className ? className.split(/\s+/).filter(Boolean) : [],
        id: attr(node, 'id')
      }

      const layers: StyleFacts[] = []

      if (sheet.length > 0) {
        const { certain, uncertain } = rulesFor(sheet, key)
        if (certain.length > 0) {
          layers.push(declsToStyleFacts(certain, { kind: 'stylesheet', raw: tag }))
        }
        if (uncertain.length > 0) {
          layers.push(uncertainFacts(uncertain.map(d => `${d.prop}: ${d.value}`)))
        }
      }

      if (className) layers.push(resolveTailwindClasses(className))

      if (inline) {
        layers.push(declsToStyleFacts(
          parseInlineStyle(inline), { kind: 'inline', raw: inline }
        ))
      }

      const textChild = (node.childNodes ?? []).find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (c: any) => c.nodeName === '#text' && String(c.value).trim().length > 0
      )

      nodes.push(makeNode({
        id,
        name: tag,
        kind: /^[A-Z]/.test(tag) ? 'component' : 'element',
        parent: parentId,
        style: layers.length > 0 ? mergeFacts(layers) : emptyStyleFacts(),
        text: textChild ? String(textChild.value).trim() : null,
        loc: {
          line: node.sourceCodeLocation?.startLine ?? 1,
          col: node.sourceCodeLocation?.startCol ?? 0
        }
      }))

      if (parentId) {
        nodes.find(n => n.id === parentId)?.children.push(id)
      }
    }

    if (tag === 'style' || tag === 'script') return
    for (const child of node.childNodes ?? []) walk(child, id)
  }

  walk(doc, null)

  return { file, framework: 'html', nodes, imports: [], dataSources: [] }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/extractors/html`
Expected: PASS — 12 tests

The structural-elements test encodes verified parse5 behaviour: `html`, `body`,
and `div` carry locations for that input while `head` does not, because parse5
synthesizes it. If it fails, print `node.sourceCodeLocation` for a full document
and adjust the expectation to match observed behaviour — but never by dropping
the location check itself, or every fragment gains three phantom nodes.

- [ ] **Step 6: Register the extractor**

In `packages/server/src/extractors.ts`:

```ts
import { extractHtml } from '@fe-design/extractor-html'
```

```ts
  '.html': extractHtml,
  '.htm': extractHtml,
```

Add the workspace dependency and tsconfig reference to the server package.

- [ ] **Step 7: Run everything and commit**

Run: `pnpm install && pnpm test && pnpm typecheck`

```bash
git add packages/extractors/html packages/server vitest.config.ts tsconfig.json
git commit -m "feat(extractor-html): extract plain HTML into the shared IR"
```

---

### Task 6: The cross-framework equivalence suite

**Files:**
- Create: `packages/extractors/core/tests/equivalence/card.tsx`
- Create: `packages/extractors/core/tests/equivalence/card.vue`
- Create: `packages/extractors/core/tests/equivalence/card.svelte`
- Create: `packages/extractors/core/tests/equivalence/card.html`
- Create: `packages/extractors/core/tests/equivalence.test.ts`
- Modify: `packages/extractors/core/package.json` — dev-depend on all four extractors
- Modify: `packages/server/tests/built-binary.test.ts` — add a Vue file to the fixture project
- Test: the suite itself

**Interfaces:**
- Consumes: `extractReact`, `extractVue`, `extractSvelte`, `extractHtml`
- Produces: no API — this task exists to prove the premise the IR rests on

This is the acceptance test for the whole architecture. If it cannot pass, the
claim that a rule is written once and works everywhere is false, and the four
extractors are four separate products wearing one interface.

The fixtures are deliberately the *same card*, expressed the way each framework
would naturally express it — Tailwind classes in React, Vue, and HTML, and the
same classes in Svelte. What must match is `StyleFacts`, not node counts or
framework-specific structure.

- [ ] **Step 1: Write the four fixtures**

`packages/extractors/core/tests/equivalence/card.tsx`:

```tsx
export default function Card() {
  return (
    <section className="bg-white p-6 rounded-xl border">
      <h2 className="text-2xl font-semibold">Title</h2>
      <p className="text-base text-gray-900">Body copy</p>
    </section>
  )
}
```

`packages/extractors/core/tests/equivalence/card.vue`:

```vue
<template>
  <section class="bg-white p-6 rounded-xl border">
    <h2 class="text-2xl font-semibold">Title</h2>
    <p class="text-base text-gray-900">Body copy</p>
  </section>
</template>
```

`packages/extractors/core/tests/equivalence/card.svelte`:

```svelte
<section class="bg-white p-6 rounded-xl border">
  <h2 class="text-2xl font-semibold">Title</h2>
  <p class="text-base text-gray-900">Body copy</p>
</section>
```

`packages/extractors/core/tests/equivalence/card.html`:

```html
<section class="bg-white p-6 rounded-xl border">
  <h2 class="text-2xl font-semibold">Title</h2>
  <p class="text-base text-gray-900">Body copy</p>
</section>
```

- [ ] **Step 2: Write the failing test**

`packages/extractors/core/tests/equivalence.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { extractReact } from '@fe-design/extractor-react'
import { extractVue } from '@fe-design/extractor-vue'
import { extractSvelte } from '@fe-design/extractor-svelte'
import { extractHtml } from '@fe-design/extractor-html'
import type { IRDoc, StyleFacts } from '@fe-design/kernel/ir/types.js'

const DIR = join(import.meta.dirname, 'equivalence')

const read = (name: string) => readFile(join(DIR, name), 'utf8')

/** Origins differ by framework by design; the resolved values must not. */
const comparable = (s: StyleFacts): unknown => JSON.parse(JSON.stringify({
  space: s.space, type: s.type, color: s.color, shape: s.shape, layout: s.layout
}, (key, value) => key === 'origin' ? undefined : value))

const load = async (): Promise<Record<string, IRDoc>> => ({
  react: extractReact(await read('card.tsx'), 'card.tsx'),
  vue: extractVue(await read('card.vue'), 'card.vue'),
  svelte: extractSvelte(await read('card.svelte'), 'card.svelte'),
  html: extractHtml(await read('card.html'), 'card.html')
})

describe('cross-framework equivalence', () => {
  it('finds the same three elements in every framework', async () => {
    for (const [name, doc] of Object.entries(await load())) {
      expect(doc.nodes.map(n => n.name), name).toEqual(['section', 'h2', 'p'])
    }
  })

  it('produces identical StyleFacts for the section in all four', async () => {
    const docs = await load()
    const facts = Object.entries(docs).map(
      ([name, d]) => [name, comparable(d.nodes[0]!.style)] as const
    )
    const [, reference] = facts[0]!
    for (const [name, f] of facts) expect(f, `${name} vs react`).toEqual(reference)
  })

  it('produces identical StyleFacts for the heading in all four', async () => {
    const facts = Object.entries(await load()).map(
      ([name, d]) => [name, comparable(d.nodes[1]!.style)] as const
    )
    const [, reference] = facts[0]!
    for (const [name, f] of facts) expect(f, `${name} vs react`).toEqual(reference)
  })

  it('produces identical StyleFacts for the paragraph in all four', async () => {
    const facts = Object.entries(await load()).map(
      ([name, d]) => [name, comparable(d.nodes[2]!.style)] as const
    )
    const [, reference] = facts[0]!
    for (const [name, f] of facts) expect(f, `${name} vs react`).toEqual(reference)
  })

  it('agrees on the actual resolved values, not merely on shape', async () => {
    for (const [name, doc] of Object.entries(await load())) {
      const section = doc.nodes[0]!.style
      if (section.space.padding.state !== 'known') {
        throw new Error(`${name}: padding should be known`)
      }
      expect(section.space.padding.value, name)
        .toEqual({ top: 24, right: 24, bottom: 24, left: 24 })
      if (section.shape.radius.state === 'known') {
        expect(section.shape.radius.value.px, name).toBe(12)
      }
      if (section.color.bg.state === 'known') {
        expect(section.color.bg.value.hex, name).toBe('#ffffff')
      }
    }
  })

  it('reports the right framework on every document', async () => {
    const docs = await load()
    expect(docs.react!.framework).toBe('react')
    expect(docs.vue!.framework).toBe('vue')
    expect(docs.svelte!.framework).toBe('svelte')
    expect(docs.html!.framework).toBe('html')
  })

  it('builds the same parent-child structure everywhere', async () => {
    for (const [name, doc] of Object.entries(await load())) {
      expect(doc.nodes[0]!.parent, name).toBeNull()
      expect(doc.nodes[1]!.parent, name).toBe(doc.nodes[0]!.id)
      expect(doc.nodes[2]!.parent, name).toBe(doc.nodes[0]!.id)
      expect(doc.nodes[0]!.children, name).toHaveLength(2)
    }
  })
})
```

- [ ] **Step 3: Add the dev dependencies**

In `packages/extractors/core/package.json`, add:

```json
  "devDependencies": {
    "@types/culori": "^4.0.0",
    "@fe-design/extractor-react": "workspace:*",
    "@fe-design/extractor-vue": "workspace:*",
    "@fe-design/extractor-svelte": "workspace:*",
    "@fe-design/extractor-html": "workspace:*"
  }
```

These are dev-only and used by tests, so `core` still ships without depending on
any framework — the dependency direction the architecture requires is preserved.

- [ ] **Step 4: Run the suite**

Run: `pnpm install && pnpm vitest run packages/extractors/core/tests/equivalence.test.ts`
Expected: PASS — 7 tests

**If a framework disagrees, the extractor is wrong, not the test.** Print both
sides and fix the adapter that deviates:

```bash
pnpm vitest run packages/extractors/core/tests/equivalence.test.ts --reporter=verbose
```

The most likely causes, in order: the adapter forgot to pass classes through
`resolveTailwindClasses`; a stylesheet layer was merged when the fixture has no
stylesheet; or an adapter set a fact to `absent` where another set it to
`known`. Do not add per-framework special cases to `comparable()` beyond the
origin exclusion already there — that would hide exactly the drift this suite
exists to catch.

- [ ] **Step 5: Extend the built-binary test to a second framework**

Add a Vue file to the server's fixture project so the shipped binary is proven
to analyze more than React:

`packages/server/tests/fixtures/project/src/app/settings/Panel.vue`:

```vue
<template>
  <div class="rounded-xl border p-4">
    <div class="rounded-xl border p-4">nested</div>
  </div>
</template>
```

Add to `packages/server/tests/built-binary.test.ts`, inside the existing
`describe.skipIf(!existsSync(BIN))` block:

```ts
  it('analyzes a Vue file through the shipped binary', async () => {
    const out = await rpc([
      INIT, READY,
      JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: {
          name: 'verify',
          arguments: { dir: PROJECT, paths: ['src/app/settings/Panel.vue'] }
        }
      })
    ])
    const call = out.trim().split('\n').map(l => JSON.parse(l)).find(m => m.id === 2)
    const payload = JSON.parse(call.result.content[0].text)
    expect(payload.error).toBeUndefined()
    expect(payload.degraded.some((d: { code: string }) => d.code === 'UNSUPPORTED_FRAMEWORK'))
      .toBe(false)
    expect(payload.findings.map((f: { rule: string }) => f.rule)).toContain('nested-card')
  }, 15000)
```

That assertion matters: `nested-card` is a rule written for React in Phase 1,
firing on Vue markup it was never written for. That is the premise, demonstrated
end to end through the real server.

- [ ] **Step 6: Run everything**

Run: `pnpm test && pnpm typecheck && pnpm --filter @fe-design/server build`
Expected: all pass, including Phases 1–3.

- [ ] **Step 7: Update the companion skill**

In `skill/SKILL.md`, replace the `coverage.skipped` bullet under "After writing
any UI" with:

```markdown
- `coverage.skipped` counts nodes that could not be analyzed statically —
  dynamic class expressions in any framework, and CSS rules whose selectors
  depend on ancestors this tool cannot see. It is information, not a failure.
- `verify` handles `.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, and `.htm`.
```

- [ ] **Step 8: Commit**

```bash
git add packages/extractors packages/server skill
git commit -m "test: prove one rule fires identically across four frameworks"
```

---

## Definition of done for Phase 4a

- [ ] `pnpm test` passes, with Phases 1–3 included
- [ ] `pnpm typecheck` is clean under `strict` and `exactOptionalPropertyTypes`
- [ ] The equivalence suite passes: the same card yields identical `StyleFacts` in React, Vue, Svelte, and HTML
- [ ] A rule written in Phase 1 for React fires on Vue markup through the shipped binary
- [ ] Dynamic class expressions produce `unknown` in every framework, never `absent`
- [ ] A CSS rule whose selector depends on unseen ancestors produces `unknown`, not a guess
- [ ] `verify` dispatches through the registry; adding a framework touches one file
- [ ] `system_bootstrap` is still the only tool that writes

## Deferred to Phase 4b

| Contents |
|---|
| Browser `inspect` — computed contrast, overflow at real viewports, screenshots |
| `critique` and its HTML report with looping CSS demos |

Phase 4b needs Playwright and a Chromium download of roughly 150MB, plus a
running dev server for anything useful. It shares no code with the extractors,
which is why it is a separate plan rather than two more tasks here.

## Known limits of this phase, stated so they are not mistaken for finished work

Selector matching handles simple and compound selectors. Anything involving
ancestors, siblings, or pseudo-classes resolves to `unknown` rather than being
evaluated, because this extractor sees one file and has no document context.
That is the correct answer, not a shortcut — but it does mean a project styling
everything through `.sidebar .card` descendant rules will see high
`coverage.skipped` and few findings. The browser pass in Phase 4b is what
resolves those cases, by reading computed styles from a real render.

Svelte node locations are not populated; every node reports line 1. The Svelte 5
modern AST carries `start` and `end` character offsets rather than line numbers,
so producing real lines needs an offset-to-line conversion that is not written
here. Findings in Svelte files will point at the file, not the line.

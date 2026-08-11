# Frontend Design MCP — Phase 4b (Browser Inspection and Critique) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catch what source analysis structurally cannot — contrast through inherited backgrounds, real overflow at real viewport widths, and touch targets at their rendered size — and turn everything found into a review a person can read.

**Architecture:** A separate `browser` package renders a URL in Chromium, collects a flat list of computed facts in one page evaluation, and runs pure check functions over that data. Because the checks are pure, they are fully unit-tested without a browser; only a thin smoke test needs Chromium. The package degrades to install instructions when Chromium is absent, leaving every other tool unaffected.

**Tech Stack:** TypeScript, Node 20+, pnpm workspaces, Vitest, `playwright` (Chromium only), `culori` for colour maths.

## Global Constraints

Every task's requirements implicitly include this section.

- **Phases 1–4a must keep passing.** `pnpm test` is 374 tests across 43 files. Never weaken an existing test to make new code fit.
- **Nothing writes into the user's project except `system_bootstrap`.** Screenshots and reports go to the OS temp directory and their paths are returned. This preserves the spec's write boundary — the project tree stays untouched.
- **Rules never fire on `unknown`.** In this phase the equivalent is: never report contrast against a background that could not be resolved to an opaque colour. Report it as unresolved instead.
- **Degrade, never throw** except for the three hard errors: path escape, unwritable bootstrap target, existing lock without `force`.
- **The browser is opt-in and lazily loaded.** With Chromium absent, `inspect` returns install instructions and every other tool works normally. Importing the browser package must not fail when Playwright is missing.
- **Contrast target:** WCAG 2.1 AA — 4.5:1 for text, 3.0:1 for non-text.
- **Default test suite needs no browser.** Chromium-dependent tests skip when it is unavailable, exactly as the existing built-binary suite skips when `dist` is unbuilt.
- **Spec:** `docs/superpowers/specs/2026-08-11-fe-design-mcp-design.md` §3, §8, §9. Where this plan and the spec disagree, the spec wins — stop and flag it.

## Prior art in this repo (read before starting)

- `packages/server/tests/built-binary.test.ts` — the `describe.skipIf(...)` pattern for tests with an external prerequisite
- `packages/server/src/tools/verify.ts` — the `degraded[]` shape every tool returns
- `packages/kernel/src/engine/rule-types.ts` — `Finding`, `Degraded`, `Severity`
- `packages/taste/src/color/solve.ts` — `contrast(a, b)` and `TARGETS`, reused here rather than reimplemented
- `packages/server/src/context.ts` — `safeJoin`, the path-escape guard

## Verified browser facts, already measured

Confirmed against Playwright 1.62 with Chromium headless shell; do not re-derive.

- `getComputedStyle(el).backgroundColor` returns `rgba(0, 0, 0, 0)` for an
  element with no background of its own. **Contrast therefore requires walking
  ancestors to the first non-transparent background.** This is the single thing
  static analysis cannot do and the reason this phase exists.
- Computed colours come back as `rgb(...)` / `rgba(...)` strings, which `culori`
  parses directly.
- `document.documentElement.scrollWidth` compared with `window.innerWidth`
  detects horizontal overflow. In the probe: `924` against a `375` viewport.
- `getBoundingClientRect()` gives real rendered sizes, so a 20×20 button is
  measurable as an undersized touch target.
- `page.screenshot({ type: 'png' })` returns a Buffer.

## File Structure

```
packages/browser/
  package.json                 optional playwright dependency
  src/facts.ts                 BrowserNode, PageFacts types
  src/collect.ts               the in-page evaluation script
  src/launch.ts                Chromium resolution + graceful absence
  src/checks/contrast.ts       computed contrast, ancestor-resolved
  src/checks/overflow.ts       horizontal overflow and its culprits
  src/checks/targets.ts        touch target sizing
  src/inspect.ts               orchestration across viewports
  src/index.ts
  tests/**                     pure-function tests, no browser
  tests/smoke.test.ts          the one test that needs Chromium

packages/report/
  src/critique.ts              findings -> a structured review
  src/html.ts                  review -> a self-contained HTML report
  src/index.ts

packages/server/
  src/tools/inspect.ts         the inspect tool
  src/tools/critique.ts        the critique tool
  src/index.ts                 modified: register both
```

---

### Task 1: Browser package with graceful absence

**Files:**
- Create: `packages/browser/package.json`, `tsconfig.json`
- Create: `packages/browser/src/facts.ts`
- Create: `packages/browser/src/launch.ts`
- Create: `packages/browser/src/index.ts`
- Modify: `vitest.config.ts`, `tsconfig.json` — register the package
- Test: `packages/browser/tests/launch.test.ts`

**Interfaces:**
- Consumes: `Degraded` from `@fe-design/kernel/engine/rule-types.js`
- Produces:
  - `type Viewport = { width: number; height: number }`
  - `type BrowserNode = { id: string; tag: string; selector: string; text: string | null; color: string; bg: string; bgResolved: boolean; fontSize: number; fontWeight: number; rect: { x: number; y: number; w: number; h: number }; interactive: boolean }`
  - `type PageFacts = { viewport: Viewport; scrollWidth: number; nodes: BrowserNode[] }`
  - `DEFAULT_VIEWPORTS: Viewport[]`
  - `browserAvailable(): Promise<boolean>`
  - `INSTALL_HINT: string`
  - `launchChromium(): Promise<{ ok: true; browser: BrowserLike } | { ok: false; degraded: Degraded }>`
  - `type BrowserLike = { newPage(o: { viewport: Viewport }): Promise<PageLike>; close(): Promise<void> }`
  - `type PageLike = { goto(url: string, o?: { waitUntil?: 'load' | 'networkidle'; timeout?: number }): Promise<unknown>; setContent(html: string): Promise<void>; evaluate<T>(fn: () => T): Promise<T>; screenshot(o: { type: 'png' }): Promise<Buffer>; close(): Promise<void> }`

The narrow `BrowserLike` and `PageLike` shapes exist so every later task can be
tested against a fake page. Playwright is imported dynamically inside
`launchChromium` and nowhere else, which is what keeps the package importable
when Playwright is not installed.

- [ ] **Step 1: Write the failing test**

`packages/browser/tests/launch.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  browserAvailable, launchChromium, INSTALL_HINT, DEFAULT_VIEWPORTS
} from '../src/launch.js'

describe('browser availability', () => {
  it('answers whether a browser can be launched without throwing', async () => {
    expect(typeof await browserAvailable()).toBe('boolean')
  })

  it('offers an install hint that names the actual command', () => {
    expect(INSTALL_HINT).toContain('playwright install chromium')
  })

  it('ships sensible default viewports covering phone and desktop', () => {
    expect(DEFAULT_VIEWPORTS.length).toBeGreaterThanOrEqual(2)
    expect(DEFAULT_VIEWPORTS.some(v => v.width <= 400)).toBe(true)
    expect(DEFAULT_VIEWPORTS.some(v => v.width >= 1280)).toBe(true)
    for (const v of DEFAULT_VIEWPORTS) {
      expect(v.width).toBeGreaterThan(0)
      expect(v.height).toBeGreaterThan(0)
    }
  })
})

describe('launchChromium', () => {
  it('either launches or degrades, but never throws', async () => {
    const r = await launchChromium()
    if (r.ok) {
      expect(r.browser).toBeTruthy()
      await r.browser.close()
    } else {
      expect(r.degraded.code).toBe('BROWSER_UNAVAILABLE')
      expect(r.degraded.detail).toContain('playwright install chromium')
    }
  }, 30000)
})
```

- [ ] **Step 2: Create the package**

`packages/browser/package.json`:

```json
{
  "name": "@fe-design/browser",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "exports": {
    ".": { "types": "./dist/src/index.d.ts", "import": "./dist/src/index.js" }
  },
  "dependencies": {
    "@fe-design/kernel": "workspace:*",
    "@fe-design/taste": "workspace:*"
  },
  "peerDependencies": { "playwright": ">=1.40.0" },
  "peerDependenciesMeta": { "playwright": { "optional": true } },
  "devDependencies": { "playwright": "^1.62.0" }
}
```

Playwright is an optional peer dependency on purpose: the package installs and
imports without it, and only `launchChromium` needs it at call time.

`packages/browser/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src", "tests"],
  "exclude": ["dist"],
  "references": [{ "path": "../kernel" }, { "path": "../taste" }]
}
```

Add `{ "path": "./packages/browser" }` to the root `tsconfig.json` references,
and this to the `alias` array in `vitest.config.ts`:

```ts
      { find: '@fe-design/browser', replacement: src('packages/browser/src/index.ts') },
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm install && pnpm vitest run packages/browser`
Expected: FAIL — cannot find module `launch.js`

- [ ] **Step 4: Write the fact types**

`packages/browser/src/facts.ts`:

```ts
export type Viewport = { width: number; height: number }

export type BrowserNode = {
  id: string
  tag: string
  /** A short CSS path, for naming the element in a finding. */
  selector: string
  text: string | null
  /** Computed colour, as an rgb()/rgba() string. */
  color: string
  /**
   * The effective background, resolved by walking ancestors until an opaque
   * colour is found. `bgResolved` is false when nothing opaque was reachable —
   * for example an element over an image — and contrast must not be judged.
   */
  bg: string
  bgResolved: boolean
  fontSize: number
  fontWeight: number
  rect: { x: number; y: number; w: number; h: number }
  interactive: boolean
}

export type PageFacts = {
  viewport: Viewport
  scrollWidth: number
  nodes: BrowserNode[]
}

export type BrowserLike = {
  newPage(o: { viewport: Viewport }): Promise<PageLike>
  close(): Promise<void>
}

export type PageLike = {
  goto(
    url: string,
    o?: { waitUntil?: 'load' | 'networkidle'; timeout?: number }
  ): Promise<unknown>
  setContent(html: string): Promise<void>
  evaluate<T>(fn: () => T): Promise<T>
  screenshot(o: { type: 'png' }): Promise<Buffer>
  close(): Promise<void>
}
```

- [ ] **Step 5: Write the launcher**

`packages/browser/src/launch.ts`:

```ts
import type { Degraded } from '@fe-design/kernel/engine/rule-types.js'
import type { BrowserLike, Viewport } from './facts.js'

export const INSTALL_HINT =
  'Install the browser pack with: npx playwright install chromium'

/** Phone, tablet, and desktop. Overflow shows up at the narrow end. */
export const DEFAULT_VIEWPORTS: Viewport[] = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 }
]

/**
 * Playwright is imported here and nowhere else, so importing this package
 * succeeds even when Playwright is absent. The browser pass is opt-in; every
 * other tool must keep working without it.
 */
const loadChromium = async (): Promise<unknown | null> => {
  try {
    const mod = await import('playwright') as { chromium?: unknown }
    return mod.chromium ?? null
  } catch {
    return null
  }
}

export const browserAvailable = async (): Promise<boolean> => {
  const chromium = await loadChromium()
  if (!chromium) return false
  try {
    const b = await (chromium as {
      launch(o: { headless: boolean }): Promise<{ close(): Promise<void> }>
    }).launch({ headless: true })
    await b.close()
    return true
  } catch {
    return false
  }
}

export const launchChromium = async (): Promise<
  { ok: true; browser: BrowserLike } | { ok: false; degraded: Degraded }
> => {
  const chromium = await loadChromium()
  if (!chromium) {
    return {
      ok: false,
      degraded: {
        code: 'BROWSER_UNAVAILABLE',
        detail: `Playwright is not installed. ${INSTALL_HINT}`,
        impact: 'no rendered findings; source analysis is unaffected'
      }
    }
  }

  try {
    const browser = await (chromium as {
      launch(o: { headless: boolean }): Promise<BrowserLike>
    }).launch({ headless: true })
    return { ok: true, browser }
  } catch (err) {
    return {
      ok: false,
      degraded: {
        code: 'BROWSER_UNAVAILABLE',
        detail: `Chromium could not start: ${(err as Error).message}. ${INSTALL_HINT}`,
        impact: 'no rendered findings; source analysis is unaffected'
      }
    }
  }
}
```

`packages/browser/src/index.ts`:

```ts
export {
  browserAvailable, launchChromium, INSTALL_HINT, DEFAULT_VIEWPORTS
} from './launch.js'
export type {
  Viewport, BrowserNode, PageFacts, BrowserLike, PageLike
} from './facts.js'
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run packages/browser && pnpm typecheck`
Expected: PASS — 4 tests. The launch test passes whether or not Chromium is
present, because both outcomes are valid and asserted.

- [ ] **Step 7: Commit**

```bash
git add packages/browser vitest.config.ts tsconfig.json
git commit -m "feat(browser): add an opt-in browser pack that degrades cleanly"
```

---

### Task 2: In-page fact collection

**Files:**
- Create: `packages/browser/src/collect.ts`
- Test: `packages/browser/tests/collect.test.ts`

**Interfaces:**
- Consumes: `PageFacts`, `PageLike`, `Viewport` from Task 1
- Produces: `collectFacts(page: PageLike, viewport: Viewport): Promise<PageFacts>` and `COLLECT_SCRIPT` (the function evaluated in the page)

One evaluation collects everything. Round-tripping per element would be slow and
would let the page change between reads.

- [ ] **Step 1: Write the failing test**

`packages/browser/tests/collect.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { collectFacts } from '../src/collect.js'
import type { PageFacts, PageLike, Viewport } from '../src/facts.js'

/** A fake page: no browser, but the same contract collectFacts consumes. */
const fakePage = (facts: Omit<PageFacts, 'viewport'>): PageLike => ({
  goto: async () => null,
  setContent: async () => undefined,
  evaluate: async <T>() => facts as unknown as T,
  screenshot: async () => Buffer.from(''),
  close: async () => undefined
})

const viewport: Viewport = { width: 375, height: 812 }

describe('collectFacts', () => {
  it('stamps the viewport it was given onto the result', async () => {
    const facts = await collectFacts(fakePage({ scrollWidth: 375, nodes: [] }), viewport)
    expect(facts.viewport).toEqual(viewport)
  })

  it('passes through the collected nodes and scroll width', async () => {
    const node = {
      id: 'b0', tag: 'p', selector: 'p', text: 'hi',
      color: 'rgb(0, 0, 0)', bg: 'rgb(255, 255, 255)', bgResolved: true,
      fontSize: 16, fontWeight: 400,
      rect: { x: 0, y: 0, w: 100, h: 20 }, interactive: false
    }
    const facts = await collectFacts(fakePage({ scrollWidth: 924, nodes: [node] }), viewport)
    expect(facts.scrollWidth).toBe(924)
    expect(facts.nodes).toEqual([node])
  })

  it('returns an empty node list rather than throwing on an empty page', async () => {
    const facts = await collectFacts(fakePage({ scrollWidth: 0, nodes: [] }), viewport)
    expect(facts.nodes).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/browser/tests/collect.test.ts`
Expected: FAIL — cannot find module `collect.js`

- [ ] **Step 3: Write the collector**

`packages/browser/src/collect.ts`:

```ts
import type { PageFacts, PageLike, Viewport } from './facts.js'

/**
 * Runs inside the page. It must be self-contained: no imports, no closure over
 * anything outside itself, because it is serialised across the process
 * boundary.
 *
 * The important part is background resolution. getComputedStyle returns
 * `rgba(0, 0, 0, 0)` for an element with no background of its own, so contrast
 * against it would be meaningless. Walking ancestors to the first opaque colour
 * is what source analysis cannot do, and it is the reason this pass exists.
 */
export const COLLECT_SCRIPT = (): Omit<PageFacts, 'viewport'> => {
  const INTERACTIVE = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary'])

  const isTransparent = (c: string): boolean =>
    c === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c)

  const shortSelector = (el: Element): string => {
    const tag = el.tagName.toLowerCase()
    if (el.id) return `${tag}#${el.id}`
    const cls = (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean)
    return cls.length > 0 ? `${tag}.${cls[0]}` : tag
  }

  const nodes: Omit<PageFacts, 'viewport'>['nodes'] = []
  let i = 0

  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const tag = el.tagName.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'br') continue

    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue

    const rect = el.getBoundingClientRect()

    let bg = cs.backgroundColor
    let bgResolved = !isTransparent(bg)
    if (!bgResolved) {
      let parent: Element | null = el.parentElement
      while (parent) {
        const pbg = getComputedStyle(parent).backgroundColor
        if (!isTransparent(pbg)) { bg = pbg; bgResolved = true; break }
        parent = parent.parentElement
      }
      if (!bgResolved) {
        // Nothing opaque up the tree: the page background is the last resort.
        const bodyBg = getComputedStyle(document.body).backgroundColor
        if (!isTransparent(bodyBg)) { bg = bodyBg; bgResolved = true }
      }
    }

    // Only the element's own text, not its descendants', so a wrapper does not
    // inherit the blame for a child's contrast.
    const ownText = Array.from(el.childNodes)
      .filter(n => n.nodeType === 3)
      .map(n => (n.textContent ?? '').trim())
      .join(' ')
      .trim()

    nodes.push({
      id: `b${i++}`,
      tag,
      selector: shortSelector(el),
      text: ownText.length > 0 ? ownText.slice(0, 80) : null,
      color: cs.color,
      bg,
      bgResolved,
      fontSize: parseFloat(cs.fontSize) || 0,
      fontWeight: parseInt(cs.fontWeight, 10) || 400,
      rect: {
        x: Math.round(rect.x), y: Math.round(rect.y),
        w: Math.round(rect.width), h: Math.round(rect.height)
      },
      interactive: INTERACTIVE.has(tag) || el.hasAttribute('onclick')
        || el.getAttribute('role') === 'button'
    })
  }

  return { scrollWidth: document.documentElement.scrollWidth, nodes }
}

export const collectFacts = async (
  page: PageLike, viewport: Viewport
): Promise<PageFacts> => {
  const collected = await page.evaluate<Omit<PageFacts, 'viewport'>>(COLLECT_SCRIPT)
  return { viewport, scrollWidth: collected.scrollWidth, nodes: collected.nodes }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/browser/tests/collect.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add packages/browser/src/collect.ts packages/browser/tests/collect.test.ts
git commit -m "feat(browser): collect computed page facts in one evaluation"
```

---

### Task 3: Computed contrast — the check source analysis cannot do

**Files:**
- Create: `packages/browser/src/checks/contrast.ts`
- Test: `packages/browser/tests/checks/contrast.test.ts`

**Interfaces:**
- Consumes: `PageFacts`, `BrowserNode` (Task 1); `contrast` and `TARGETS` from `@fe-design/taste`
- Produces:
  - `type BrowserFinding = Omit<Finding, 'id' | 'file' | 'line'> & { selector: string; viewport: string; detail?: string }`
  - `checkContrast(facts: PageFacts): BrowserFinding[]`
  - `LARGE_TEXT_PX: number`, `LARGE_TEXT_BOLD_PX: number`

WCAG relaxes the target to 3.0:1 for large text — 24px, or 18.66px when bold.
Applying 4.5:1 to a 40px heading would produce findings a designer would
correctly ignore, and a checker people ignore is worthless.

Contrast is judged only where `bgResolved` is true. An element over an image or
gradient has no single background colour, and guessing one would manufacture
findings — the same discipline as the `unknown` contract in the source rules.

- [ ] **Step 1: Write the failing test**

`packages/browser/tests/checks/contrast.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { checkContrast, LARGE_TEXT_PX } from '../../src/checks/contrast.js'
import type { BrowserNode, PageFacts } from '../../src/facts.js'

const node = (over: Partial<BrowserNode>): BrowserNode => ({
  id: 'b0', tag: 'p', selector: 'p', text: 'hello',
  color: 'rgb(17, 24, 39)', bg: 'rgb(255, 255, 255)', bgResolved: true,
  fontSize: 16, fontWeight: 400,
  rect: { x: 0, y: 0, w: 200, h: 20 }, interactive: false,
  ...over
})

const facts = (nodes: BrowserNode[]): PageFacts => ({
  viewport: { width: 375, height: 812 }, scrollWidth: 375, nodes
})

describe('checkContrast', () => {
  it('reports nothing for readable body text', () => {
    expect(checkContrast(facts([node({})]))).toEqual([])
  })

  it('reports faint text on white', () => {
    const out = checkContrast(facts([node({ color: 'rgb(156, 163, 175)' })]))
    expect(out).toHaveLength(1)
    expect(out[0]!.rule).toBe('computed-contrast')
    expect(out[0]!.sev).toBe('error')
  })

  it('names the element and the measured ratio', () => {
    const out = checkContrast(facts([
      node({ color: 'rgb(156, 163, 175)', selector: 'p.muted' })
    ]))
    expect(out[0]!.selector).toBe('p.muted')
    expect(out[0]!.msg).toMatch(/\d\.\d+:1/)
  })

  it('applies the relaxed large-text target', () => {
    // 3.1:1 fails at body size but passes as large text.
    const colour = 'rgb(130, 130, 130)'
    expect(checkContrast(facts([node({ color: colour, fontSize: 16 })])))
      .toHaveLength(1)
    expect(checkContrast(facts([node({ color: colour, fontSize: LARGE_TEXT_PX })])))
      .toEqual([])
  })

  it('treats bold 19px as large text', () => {
    const colour = 'rgb(130, 130, 130)'
    expect(checkContrast(facts([node({ color: colour, fontSize: 19, fontWeight: 700 })])))
      .toEqual([])
  })

  it('skips elements with no text', () => {
    expect(checkContrast(facts([node({ text: null, color: 'rgb(200,200,200)' })])))
      .toEqual([])
  })

  it('does not judge contrast when the background could not be resolved', () => {
    const out = checkContrast(facts([
      node({ color: 'rgb(200, 200, 200)', bgResolved: false })
    ]))
    expect(out.filter(f => f.rule === 'computed-contrast')).toEqual([])
  })

  it('reports an unresolved background as information, not as a failure', () => {
    const out = checkContrast(facts([
      node({ color: 'rgb(200, 200, 200)', bgResolved: false })
    ]))
    expect(out).toHaveLength(1)
    expect(out[0]!.rule).toBe('contrast-unresolved')
    expect(out[0]!.sev).toBe('info')
  })

  it('stamps the viewport on every finding', () => {
    const out = checkContrast(facts([node({ color: 'rgb(156, 163, 175)' })]))
    expect(out[0]!.viewport).toBe('375x812')
  })

  it('reports each failing element once', () => {
    const out = checkContrast(facts([
      node({ id: 'b0', color: 'rgb(156, 163, 175)' }),
      node({ id: 'b1', color: 'rgb(156, 163, 175)' })
    ]))
    expect(out).toHaveLength(2)
  })

  it('survives an unparseable colour rather than throwing', () => {
    expect(() => checkContrast(facts([node({ color: 'not-a-colour' })]))).not.toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/browser/tests/checks/contrast.test.ts`
Expected: FAIL — cannot find module `contrast.js`

- [ ] **Step 3: Write the check**

`packages/browser/src/checks/contrast.ts`:

```ts
import { contrast } from '@fe-design/taste'
import type { Severity } from '@fe-design/kernel/engine/rule-types.js'
import type { PageFacts } from '../facts.js'

export type BrowserFinding = {
  rule: string
  sev: Severity
  selector: string
  viewport: string
  msg: string
  fix?: string
}

/** WCAG large text: 24px, or 18.66px when bold. */
export const LARGE_TEXT_PX = 24
export const LARGE_TEXT_BOLD_PX = 18.66

const TARGET_NORMAL = 4.5
const TARGET_LARGE = 3.0

const isLarge = (fontSize: number, fontWeight: number): boolean =>
  fontSize >= LARGE_TEXT_PX ||
  (fontWeight >= 700 && fontSize >= LARGE_TEXT_BOLD_PX)

export const checkContrast = (facts: PageFacts): BrowserFinding[] => {
  const out: BrowserFinding[] = []
  const viewport = `${facts.viewport.width}x${facts.viewport.height}`

  for (const node of facts.nodes) {
    if (!node.text) continue

    if (!node.bgResolved) {
      // No single background colour exists — an image or gradient sits behind.
      // Reporting a ratio here would invent a number, so this is information.
      out.push({
        rule: 'contrast-unresolved',
        sev: 'info',
        selector: node.selector,
        viewport,
        msg: `Could not resolve a background colour behind ${node.selector}; contrast not checked.`,
        fix: 'Check this element by eye, or give it an explicit background.'
      })
      continue
    }

    let ratio: number
    try {
      ratio = contrast(node.color, node.bg)
    } catch {
      continue
    }
    if (!Number.isFinite(ratio)) continue

    const target = isLarge(node.fontSize, node.fontWeight) ? TARGET_LARGE : TARGET_NORMAL
    if (ratio >= target) continue

    out.push({
      rule: 'computed-contrast',
      sev: 'error',
      selector: node.selector,
      viewport,
      msg: `Rendered contrast is ${ratio.toFixed(2)}:1 against ${node.bg}, below the ${target}:1 minimum.`,
      fix: `Darken the text or lighten the background until it reaches ${target}:1.`
    })
  }

  return out
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/browser/tests/checks/contrast.test.ts`
Expected: PASS — 11 tests

If the large-text test fails, print the actual ratio for `rgb(130,130,130)` on
white and pick a grey that genuinely sits between 3.0 and 4.5. Adjust the
fixture colour, never the targets.

- [ ] **Step 5: Commit**

```bash
git add packages/browser/src/checks packages/browser/tests/checks
git commit -m "feat(browser): check contrast against ancestor-resolved backgrounds"
```

---

### Task 4: Overflow and touch target checks

**Files:**
- Create: `packages/browser/src/checks/overflow.ts`
- Create: `packages/browser/src/checks/targets.ts`
- Test: `packages/browser/tests/checks/overflow.test.ts`
- Test: `packages/browser/tests/checks/targets.test.ts`

**Interfaces:**
- Consumes: `PageFacts`, `BrowserFinding` (Tasks 1 and 3)
- Produces:
  - `checkOverflow(facts: PageFacts): BrowserFinding[]`
  - `checkTargets(facts: PageFacts): BrowserFinding[]`
  - `MIN_TARGET_PX: number`

- [ ] **Step 1: Write the failing tests**

`packages/browser/tests/checks/overflow.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { checkOverflow } from '../../src/checks/overflow.js'
import type { BrowserNode, PageFacts } from '../../src/facts.js'

const node = (over: Partial<BrowserNode>): BrowserNode => ({
  id: 'b0', tag: 'div', selector: 'div', text: null,
  color: 'rgb(0,0,0)', bg: 'rgb(255,255,255)', bgResolved: true,
  fontSize: 16, fontWeight: 400,
  rect: { x: 0, y: 0, w: 300, h: 20 }, interactive: false,
  ...over
})

const facts = (scrollWidth: number, nodes: BrowserNode[]): PageFacts => ({
  viewport: { width: 375, height: 812 }, scrollWidth, nodes
})

describe('checkOverflow', () => {
  it('reports nothing when the page fits', () => {
    expect(checkOverflow(facts(375, [node({})]))).toEqual([])
  })

  it('reports horizontal overflow', () => {
    const out = checkOverflow(facts(924, [node({})]))
    expect(out.some(f => f.rule === 'horizontal-overflow')).toBe(true)
  })

  it('names the widest offending element', () => {
    const out = checkOverflow(facts(924, [
      node({ id: 'b0', selector: 'div.narrow', rect: { x: 0, y: 0, w: 300, h: 20 } }),
      node({ id: 'b1', selector: 'nav.wide', rect: { x: 24, y: 0, w: 900, h: 20 } })
    ]))
    expect(out.some(f => f.selector === 'nav.wide')).toBe(true)
  })

  it('tolerates a one pixel rounding difference', () => {
    expect(checkOverflow(facts(376, [node({})]))).toEqual([])
  })

  it('stamps the viewport on the finding', () => {
    expect(checkOverflow(facts(924, [node({})]))[0]!.viewport).toBe('375x812')
  })

  it('reports the page-level overflow once, not per element', () => {
    const out = checkOverflow(facts(924, [
      node({ id: 'b0', rect: { x: 0, y: 0, w: 900, h: 20 } }),
      node({ id: 'b1', rect: { x: 0, y: 0, w: 800, h: 20 } })
    ]))
    expect(out.filter(f => f.rule === 'horizontal-overflow')).toHaveLength(1)
  })
})
```

`packages/browser/tests/checks/targets.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { checkTargets, MIN_TARGET_PX } from '../../src/checks/targets.js'
import type { BrowserNode, PageFacts } from '../../src/facts.js'

const node = (over: Partial<BrowserNode>): BrowserNode => ({
  id: 'b0', tag: 'button', selector: 'button', text: 'x',
  color: 'rgb(0,0,0)', bg: 'rgb(255,255,255)', bgResolved: true,
  fontSize: 16, fontWeight: 400,
  rect: { x: 0, y: 0, w: 48, h: 48 }, interactive: true,
  ...over
})

const facts = (nodes: BrowserNode[], width = 375): PageFacts => ({
  viewport: { width, height: 812 }, scrollWidth: width, nodes
})

describe('checkTargets', () => {
  it('reports nothing for a large enough control', () => {
    expect(checkTargets(facts([node({})]))).toEqual([])
  })

  it('reports an undersized interactive control', () => {
    const out = checkTargets(facts([node({ rect: { x: 0, y: 0, w: 20, h: 20 } })]))
    expect(out).toHaveLength(1)
    expect(out[0]!.rule).toBe('small-touch-target')
  })

  it('states both the measured size and the minimum', () => {
    const out = checkTargets(facts([node({ rect: { x: 0, y: 0, w: 20, h: 20 } })]))
    expect(out[0]!.msg).toContain('20')
    expect(out[0]!.msg).toContain(String(MIN_TARGET_PX))
  })

  it('ignores non-interactive elements', () => {
    expect(checkTargets(facts([
      node({ interactive: false, rect: { x: 0, y: 0, w: 10, h: 10 } })
    ]))).toEqual([])
  })

  it('ignores zero-sized controls, which are hidden rather than small', () => {
    expect(checkTargets(facts([node({ rect: { x: 0, y: 0, w: 0, h: 0 } })]))).toEqual([])
  })

  it('only applies at touch-sized viewports', () => {
    const small = node({ rect: { x: 0, y: 0, w: 20, h: 20 } })
    expect(checkTargets(facts([small], 375))).toHaveLength(1)
    expect(checkTargets(facts([small], 1440))).toEqual([])
  })

  it('fails when either dimension is short', () => {
    expect(checkTargets(facts([node({ rect: { x: 0, y: 0, w: 100, h: 20 } })])))
      .toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/browser/tests/checks`
Expected: FAIL — cannot find modules `overflow.js` and `targets.js`

- [ ] **Step 3: Write the overflow check**

`packages/browser/src/checks/overflow.ts`:

```ts
import type { PageFacts } from '../facts.js'
import type { BrowserFinding } from './contrast.js'

/** Sub-pixel layout rounding routinely puts scrollWidth one over. */
const TOLERANCE_PX = 1

export const checkOverflow = (facts: PageFacts): BrowserFinding[] => {
  const viewport = `${facts.viewport.width}x${facts.viewport.height}`
  const overflow = facts.scrollWidth - facts.viewport.width
  if (overflow <= TOLERANCE_PX) return []

  // The page-level fact is one finding. The widest element that extends past
  // the viewport is named alongside it, because "the page scrolls sideways" is
  // not actionable without a culprit.
  const culprit = facts.nodes
    .filter(n => n.rect.x + n.rect.w > facts.viewport.width + TOLERANCE_PX)
    .sort((a, b) => (b.rect.x + b.rect.w) - (a.rect.x + a.rect.w))[0]

  return [{
    rule: 'horizontal-overflow',
    sev: 'error',
    selector: culprit?.selector ?? 'document',
    viewport,
    msg: culprit
      ? `The page scrolls sideways by ${overflow}px at ${viewport}; ${culprit.selector} extends to ${culprit.rect.x + culprit.rect.w}px.`
      : `The page scrolls sideways by ${overflow}px at ${viewport}.`,
    fix: 'Let the element wrap or shrink instead of holding a fixed width.'
  }]
}
```

- [ ] **Step 4: Write the touch target check**

`packages/browser/src/checks/targets.ts`:

```ts
import type { PageFacts } from '../facts.js'
import type { BrowserFinding } from './contrast.js'

/** WCAG 2.2 target size, and the practical floor for a fingertip. */
export const MIN_TARGET_PX = 44

/** Above this width a pointer is likely, and the target rule does not apply. */
const TOUCH_VIEWPORT_MAX = 1024

export const checkTargets = (facts: PageFacts): BrowserFinding[] => {
  if (facts.viewport.width > TOUCH_VIEWPORT_MAX) return []

  const viewport = `${facts.viewport.width}x${facts.viewport.height}`
  const out: BrowserFinding[] = []

  for (const node of facts.nodes) {
    if (!node.interactive) continue

    const { w, h } = node.rect
    // Zero-sized controls are hidden, not small; reporting them is noise.
    if (w === 0 || h === 0) continue
    if (w >= MIN_TARGET_PX && h >= MIN_TARGET_PX) continue

    out.push({
      rule: 'small-touch-target',
      sev: 'warn',
      selector: node.selector,
      viewport,
      msg: `${node.selector} renders at ${w}x${h}px, below the ${MIN_TARGET_PX}px touch minimum.`,
      fix: `Grow the control, or add padding until both sides reach ${MIN_TARGET_PX}px.`
    })
  }

  return out
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/browser/tests/checks`
Expected: PASS — 13 new tests plus the 11 contrast tests

- [ ] **Step 6: Commit**

```bash
git add packages/browser/src/checks packages/browser/tests/checks
git commit -m "feat(browser): check horizontal overflow and touch target sizing"
```

---

### Task 5: The `inspect` tool

**Files:**
- Create: `packages/browser/src/inspect.ts`
- Create: `packages/server/src/tools/inspect.ts`
- Modify: `packages/browser/src/index.ts`, `packages/server/src/index.ts`
- Modify: `packages/server/package.json`, `tsconfig.json`
- Test: `packages/browser/tests/inspect.test.ts`
- Test: `packages/browser/tests/smoke.test.ts` — the only Chromium-dependent test

**Interfaces:**
- Consumes: everything from Tasks 1–4
- Produces:
  - `type InspectResult = { url: string; viewports: string[]; findings: BrowserFinding[]; screenshots: string[]; degraded: Degraded[] }`
  - `inspectUrl(url: string, viewports?: Viewport[], opts?: { screenshot?: boolean }): Promise<InspectResult>`
  - `runChecks(facts: PageFacts): BrowserFinding[]`
  - server-side `inspect(url: string, viewports?: number[]): Promise<InspectResult>`

Screenshots go to the OS temp directory and their paths are returned.
`system_bootstrap` remains the only tool that writes into the user's project;
this one never touches it.

- [ ] **Step 1: Write the failing tests**

`packages/browser/tests/inspect.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { runChecks } from '../src/inspect.js'
import type { BrowserNode, PageFacts } from '../src/facts.js'

const node = (over: Partial<BrowserNode>): BrowserNode => ({
  id: 'b0', tag: 'p', selector: 'p', text: 'hi',
  color: 'rgb(17,24,39)', bg: 'rgb(255,255,255)', bgResolved: true,
  fontSize: 16, fontWeight: 400,
  rect: { x: 0, y: 0, w: 100, h: 20 }, interactive: false,
  ...over
})

describe('runChecks', () => {
  it('returns nothing for a clean page', () => {
    const facts: PageFacts = {
      viewport: { width: 375, height: 812 }, scrollWidth: 375, nodes: [node({})]
    }
    expect(runChecks(facts)).toEqual([])
  })

  it('combines findings from every check', () => {
    const facts: PageFacts = {
      viewport: { width: 375, height: 812 },
      scrollWidth: 900,
      nodes: [
        node({ id: 'b0', color: 'rgb(156,163,175)' }),
        node({
          id: 'b1', tag: 'button', selector: 'button', interactive: true,
          rect: { x: 0, y: 0, w: 20, h: 20 }
        })
      ]
    }
    const rules = runChecks(facts).map(f => f.rule)
    expect(rules).toContain('computed-contrast')
    expect(rules).toContain('horizontal-overflow')
    expect(rules).toContain('small-touch-target')
  })

  it('orders errors before warnings and warnings before info', () => {
    const facts: PageFacts = {
      viewport: { width: 375, height: 812 },
      scrollWidth: 900,
      nodes: [
        node({ id: 'b0', bgResolved: false }),
        node({
          id: 'b1', tag: 'button', selector: 'button', interactive: true,
          rect: { x: 0, y: 0, w: 20, h: 20 }
        })
      ]
    }
    const sevs = runChecks(facts).map(f => f.sev)
    const rank = { error: 0, warn: 1, info: 2 } as const
    const ranks = sevs.map(s => rank[s])
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })
})
```

`packages/browser/tests/smoke.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { browserAvailable } from '../src/launch.js'
import { inspectUrl } from '../src/inspect.js'

let available = false
beforeAll(async () => { available = await browserAvailable() }, 60000)

const PAGE = `<!doctype html><html><body style="margin:0;background:#fff">
  <section style="padding:24px">
    <p id="faint" style="color:#9ca3af">faint inherited text</p>
    <nav id="wide" style="width:900px">too wide</nav>
    <button id="tiny" style="width:20px;height:20px">x</button>
  </section>
</body></html>`

describe.skipIf(!available)('inspect against a real browser', () => {
  it('finds contrast, overflow, and target problems on a seeded page', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'inspect-'))
    const file = join(dir, 'page.html')
    await writeFile(file, PAGE)

    const r = await inspectUrl(pathToFileURL(file).href, [{ width: 375, height: 812 }])
    const rules = r.findings.map(f => f.rule)

    // The contrast finding is the point: #9ca3af sits on a transparent
    // section over a white body, so only an ancestor walk resolves it.
    expect(rules).toContain('computed-contrast')
    expect(rules).toContain('horizontal-overflow')
    expect(rules).toContain('small-touch-target')
    expect(r.degraded).toEqual([])
  }, 60000)

  it('writes a screenshot outside the project and returns its path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'inspect-'))
    const file = join(dir, 'page.html')
    await writeFile(file, PAGE)

    const r = await inspectUrl(
      pathToFileURL(file).href, [{ width: 375, height: 812 }], { screenshot: true }
    )
    expect(r.screenshots).toHaveLength(1)
    expect(r.screenshots[0]).toContain(tmpdir())
  }, 60000)
})

describe('inspect without a browser', () => {
  it.skipIf(available)('degrades with install instructions', async () => {
    const r = await inspectUrl('https://example.com')
    expect(r.findings).toEqual([])
    expect(r.degraded.some(d => d.code === 'BROWSER_UNAVAILABLE')).toBe(true)
  }, 30000)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/browser/tests/inspect.test.ts`
Expected: FAIL — cannot find module `inspect.js`

- [ ] **Step 3: Write the orchestrator**

`packages/browser/src/inspect.ts`:

```ts
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Degraded } from '@fe-design/kernel/engine/rule-types.js'
import { launchChromium, DEFAULT_VIEWPORTS } from './launch.js'
import { collectFacts } from './collect.js'
import { checkContrast, type BrowserFinding } from './checks/contrast.js'
import { checkOverflow } from './checks/overflow.js'
import { checkTargets } from './checks/targets.js'
import type { PageFacts, Viewport } from './facts.js'

export type InspectResult = {
  url: string
  viewports: string[]
  findings: BrowserFinding[]
  screenshots: string[]
  degraded: Degraded[]
}

const SEVERITY_RANK = { error: 0, warn: 1, info: 2 } as const

export const runChecks = (facts: PageFacts): BrowserFinding[] => {
  const all = [
    ...checkContrast(facts),
    ...checkOverflow(facts),
    ...checkTargets(facts)
  ]
  return all.sort((a, b) => SEVERITY_RANK[a.sev] - SEVERITY_RANK[b.sev])
}

export const inspectUrl = async (
  url: string,
  viewports: Viewport[] = DEFAULT_VIEWPORTS,
  opts: { screenshot?: boolean } = {}
): Promise<InspectResult> => {
  const result: InspectResult = {
    url,
    viewports: viewports.map(v => `${v.width}x${v.height}`),
    findings: [],
    screenshots: [],
    degraded: []
  }

  const launched = await launchChromium()
  if (!launched.ok) {
    result.degraded.push(launched.degraded)
    return result
  }

  const { browser } = launched
  // Screenshots go to the OS temp directory. system_bootstrap stays the only
  // tool that writes into the user's project.
  const shotDir = opts.screenshot
    ? await mkdtemp(join(tmpdir(), 'fe-design-shots-'))
    : null

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport })
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 20000 })
        const facts = await collectFacts(page, viewport)
        result.findings.push(...runChecks(facts))

        if (shotDir) {
          const buf = await page.screenshot({ type: 'png' })
          const path = join(shotDir, `${viewport.width}x${viewport.height}.png`)
          await writeFile(path, buf)
          result.screenshots.push(path)
        }
      } catch (err) {
        result.degraded.push({
          code: 'PAGE_FAILED',
          detail: `${viewport.width}x${viewport.height}: ${(err as Error).message}`,
          impact: '1 viewport not inspected'
        })
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }

  result.findings.sort((a, b) => SEVERITY_RANK[a.sev] - SEVERITY_RANK[b.sev])
  return result
}
```

Extend `packages/browser/src/index.ts`:

```ts
export { inspectUrl, runChecks, type InspectResult } from './inspect.js'
export { checkContrast, type BrowserFinding } from './checks/contrast.js'
export { checkOverflow } from './checks/overflow.js'
export { checkTargets, MIN_TARGET_PX } from './checks/targets.js'
export { collectFacts } from './collect.js'
```

- [ ] **Step 4: Write the server tool**

`packages/server/src/tools/inspect.ts`:

```ts
import { inspectUrl, DEFAULT_VIEWPORTS, type InspectResult } from '@fe-design/browser'

export type { InspectResult }

/**
 * Widths arrive as plain numbers from the tool call; heights are derived so a
 * caller does not have to think about them.
 */
const HEIGHT_FOR = (width: number): number => (width <= 480 ? 812 : width <= 1024 ? 1024 : 900)

export const inspect = async (
  url: string, viewports?: number[], screenshot?: boolean
): Promise<InspectResult> => {
  const vps = viewports && viewports.length > 0
    ? viewports.map(width => ({ width, height: HEIGHT_FOR(width) }))
    : DEFAULT_VIEWPORTS

  return inspectUrl(url, vps, screenshot ? { screenshot: true } : {})
}
```

Register it in `packages/server/src/index.ts`, adding the import:

```ts
import { inspect } from './tools/inspect.js'
```

and the registration before `system_bootstrap`:

```ts
server.tool(
  'inspect',
  'Render a running page in a browser and report what only pixels reveal: contrast against inherited backgrounds, horizontal overflow at real viewport widths, and touch targets at their rendered size. Needs a running dev server and the browser pack. Read-only; screenshots are written outside the project.',
  {
    url: z.string().describe('URL of the running page, e.g. http://localhost:5173/settings'),
    viewports: z.array(z.number().int().positive()).optional()
      .describe('Viewport widths in px. Defaults to 375, 768, and 1440.'),
    screenshot: z.boolean().optional()
      .describe('Also capture a PNG per viewport and return its path.')
  },
  async ({ url, viewports, screenshot }) =>
    asText(await inspect(url, viewports, screenshot))
)
```

Add `"@fe-design/browser": "workspace:*"` to `packages/server/package.json`
dependencies and `{ "path": "../browser" }` to its tsconfig references.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm install && pnpm vitest run packages/browser`
Expected: PASS. The smoke tests run when Chromium is present and skip otherwise;
the no-browser test does the reverse. Exactly one of the two paths executes.

- [ ] **Step 6: Run everything and commit**

Run: `pnpm test && pnpm typecheck`

```bash
git add packages/browser packages/server vitest.config.ts tsconfig.json
git commit -m "feat(server): add the inspect tool for rendered findings"
```

---

### Task 6: `critique` — one review from source and pixels

**Files:**
- Create: `packages/report/package.json`, `tsconfig.json`
- Create: `packages/report/src/critique.ts`
- Create: `packages/report/src/index.ts`
- Create: `packages/server/src/tools/critique.ts`
- Modify: `packages/server/src/index.ts`, `package.json`, `tsconfig.json`
- Modify: `vitest.config.ts`, root `tsconfig.json`
- Test: `packages/report/tests/critique.test.ts`

**Interfaces:**
- Consumes: `Finding`, `Severity` from kernel; `BrowserFinding` from `@fe-design/browser`
- Produces:
  - `type ReviewItem = { rule: string; sev: Severity; where: string; msg: string; fix?: string; source: 'static' | 'rendered' }`
  - `type ReviewSection = { title: string; items: ReviewItem[] }`
  - `type Review = { surface: string; system: string | null; counts: { error: number; warn: number; info: number }; sections: ReviewSection[]; coverage: { analyzed: number; skipped: number }; degraded: Degraded[] }`
  - `buildReview(input: { surface: string; system: string | null; findings: Finding[]; rendered: BrowserFinding[]; coverage: { analyzed: number; skipped: number }; degraded: Degraded[] }): Review`
  - `SECTION_FOR: Record<string, string>`

Grouping matters more than it looks. A flat list of twenty findings reads as
noise; the same twenty grouped into "Accessibility", "Consistency", "Craft", and
"Real-world states" reads as a review, and the group names tell a reader which
kind of problem they are looking at.

- [ ] **Step 1: Write the failing test**

`packages/report/tests/critique.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildReview } from '../src/critique.js'
import type { Finding } from '@fe-design/kernel/engine/rule-types.js'

const f = (over: Partial<Finding>): Finding => ({
  id: 'f1', rule: 'space-off-scale', sev: 'error',
  file: 'src/app/settings/page.tsx', line: 12,
  msg: 'Padding 13px is not on the spacing scale.',
  ...over
})

const base = {
  surface: 'settings',
  system: 'quiet-precision',
  findings: [] as Finding[],
  rendered: [],
  coverage: { analyzed: 40, skipped: 0 },
  degraded: []
}

describe('buildReview', () => {
  it('counts findings by severity', () => {
    const r = buildReview({
      ...base,
      findings: [
        f({ id: 'f1', sev: 'error' }),
        f({ id: 'f2', sev: 'warn', rule: 'tiny-text' }),
        f({ id: 'f3', sev: 'warn', rule: 'radius-off-scale' })
      ]
    })
    expect(r.counts).toEqual({ error: 1, warn: 2, info: 0 })
  })

  it('groups findings into named sections', () => {
    const r = buildReview({
      ...base,
      findings: [
        f({ id: 'f1', rule: 'text-contrast' }),
        f({ id: 'f2', rule: 'space-off-scale' })
      ]
    })
    expect(r.sections.map(s => s.title)).toContain('Accessibility')
    expect(r.sections.map(s => s.title)).toContain('Consistency')
  })

  it('omits sections that have no findings', () => {
    const r = buildReview({ ...base, findings: [f({ rule: 'text-contrast' })] })
    expect(r.sections.every(s => s.items.length > 0)).toBe(true)
  })

  it('orders sections by their worst severity', () => {
    const r = buildReview({
      ...base,
      findings: [
        f({ id: 'f1', rule: 'monotonous-spacing', sev: 'info' }),
        f({ id: 'f2', rule: 'text-contrast', sev: 'error' })
      ]
    })
    expect(r.sections[0]!.title).toBe('Accessibility')
  })

  it('labels where each static finding came from', () => {
    const r = buildReview({ ...base, findings: [f({})] })
    const item = r.sections.flatMap(s => s.items)[0]!
    expect(item.source).toBe('static')
    expect(item.where).toBe('src/app/settings/page.tsx:12')
  })

  it('merges rendered findings and labels them by viewport', () => {
    const r = buildReview({
      ...base,
      rendered: [{
        rule: 'computed-contrast', sev: 'error', selector: 'p.muted',
        viewport: '375x812', msg: 'Rendered contrast is 2.85:1.'
      }]
    })
    const item = r.sections.flatMap(s => s.items).find(i => i.source === 'rendered')!
    expect(item.where).toBe('p.muted @ 375x812')
  })

  it('puts an unrecognised rule in a catch-all section rather than dropping it', () => {
    const r = buildReview({ ...base, findings: [f({ rule: 'brand-new-rule' })] })
    expect(r.sections.flatMap(s => s.items).map(i => i.rule)).toContain('brand-new-rule')
  })

  it('carries coverage and degradation through untouched', () => {
    const r = buildReview({
      ...base,
      coverage: { analyzed: 61, skipped: 9 },
      degraded: [{ code: 'PARSE_FAILED', detail: 'x', impact: '1 file' }]
    })
    expect(r.coverage).toEqual({ analyzed: 61, skipped: 9 })
    expect(r.degraded).toHaveLength(1)
  })

  it('produces an empty review with no sections for a clean surface', () => {
    const r = buildReview(base)
    expect(r.sections).toEqual([])
    expect(r.counts).toEqual({ error: 0, warn: 0, info: 0 })
  })
})
```

- [ ] **Step 2: Create the package**

`packages/report/package.json`:

```json
{
  "name": "@fe-design/report",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "exports": {
    ".": { "types": "./dist/src/index.d.ts", "import": "./dist/src/index.js" }
  },
  "dependencies": {
    "@fe-design/kernel": "workspace:*",
    "@fe-design/browser": "workspace:*"
  }
}
```

`packages/report/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src", "tests"],
  "exclude": ["dist"],
  "references": [{ "path": "../kernel" }, { "path": "../browser" }]
}
```

Add `{ "path": "./packages/report" }` to the root tsconfig references, and to
`vitest.config.ts`:

```ts
      { find: '@fe-design/report', replacement: src('packages/report/src/index.ts') },
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm install && pnpm vitest run packages/report`
Expected: FAIL — cannot find module `critique.js`

- [ ] **Step 4: Write the review builder**

`packages/report/src/critique.ts`:

```ts
import type { Finding, Severity, Degraded } from '@fe-design/kernel/engine/rule-types.js'
import type { BrowserFinding } from '@fe-design/browser'

export type ReviewItem = {
  rule: string
  sev: Severity
  where: string
  msg: string
  fix?: string
  source: 'static' | 'rendered'
}

export type ReviewSection = { title: string; items: ReviewItem[] }

export type Review = {
  surface: string
  system: string | null
  counts: { error: number; warn: number; info: number }
  sections: ReviewSection[]
  coverage: { analyzed: number; skipped: number }
  degraded: Degraded[]
}

/**
 * Rule to section. A flat list of twenty findings reads as noise; the same
 * twenty grouped tell a reader what kind of problem each one is.
 */
export const SECTION_FOR: Record<string, string> = {
  'text-contrast': 'Accessibility',
  'computed-contrast': 'Accessibility',
  'contrast-unresolved': 'Accessibility',
  'tiny-text': 'Accessibility',
  'small-touch-target': 'Accessibility',
  'space-off-scale': 'Consistency',
  'type-off-scale': 'Consistency',
  'radius-off-scale': 'Consistency',
  'color-off-palette': 'Consistency',
  'flat-type-hierarchy': 'Craft',
  'monotonous-spacing': 'Craft',
  'nested-card': 'Craft',
  'horizontal-overflow': 'Craft',
  'missing-error-state': 'Real-world states',
  'missing-loading-state': 'Real-world states',
  'missing-empty-state': 'Real-world states',
  'list-without-empty': 'Real-world states'
}

const OTHER = 'Other'
const SEVERITY_RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 }

export const buildReview = (input: {
  surface: string
  system: string | null
  findings: Finding[]
  rendered: BrowserFinding[]
  coverage: { analyzed: number; skipped: number }
  degraded: Degraded[]
}): Review => {
  const items: ReviewItem[] = [
    ...input.findings.map((f): ReviewItem => ({
      rule: f.rule,
      sev: f.sev,
      where: `${f.file}:${f.line}`,
      msg: f.msg,
      ...(f.fix ? { fix: f.fix } : {}),
      source: 'static' as const
    })),
    ...input.rendered.map((f): ReviewItem => ({
      rule: f.rule,
      sev: f.sev,
      where: `${f.selector} @ ${f.viewport}`,
      msg: f.msg,
      ...(f.fix ? { fix: f.fix } : {}),
      source: 'rendered' as const
    }))
  ]

  const counts = { error: 0, warn: 0, info: 0 }
  for (const item of items) counts[item.sev] += 1

  const grouped = new Map<string, ReviewItem[]>()
  for (const item of items) {
    // An unrecognised rule lands in Other rather than vanishing: a new rule
    // must never be silently dropped from a review.
    const title = SECTION_FOR[item.rule] ?? OTHER
    const list = grouped.get(title) ?? []
    list.push(item)
    grouped.set(title, list)
  }

  const sections: ReviewSection[] = [...grouped.entries()]
    .map(([title, list]) => ({
      title,
      items: [...list].sort((a, b) => SEVERITY_RANK[a.sev] - SEVERITY_RANK[b.sev])
    }))
    .sort((a, b) => {
      const worst = (s: ReviewSection): number =>
        Math.min(...s.items.map(i => SEVERITY_RANK[i.sev]))
      return worst(a) - worst(b) || a.title.localeCompare(b.title)
    })

  return {
    surface: input.surface,
    system: input.system,
    counts,
    sections,
    coverage: input.coverage,
    degraded: input.degraded
  }
}
```

`packages/report/src/index.ts`:

```ts
export {
  buildReview, SECTION_FOR,
  type Review, type ReviewSection, type ReviewItem
} from './critique.js'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/report`
Expected: PASS — 9 tests

- [ ] **Step 6: Commit**

```bash
git add packages/report vitest.config.ts tsconfig.json
git commit -m "feat(report): build a grouped review from static and rendered findings"
```

---

### Task 7: The HTML report and the `critique` tool

**Files:**
- Create: `packages/report/src/html.ts`
- Modify: `packages/report/src/index.ts`
- Create: `packages/server/src/tools/critique.ts`
- Modify: `packages/server/src/index.ts`, `package.json`, `tsconfig.json`
- Modify: `packages/server/tests/built-binary.test.ts` — eight tools
- Modify: `skill/SKILL.md`
- Test: `packages/report/tests/html.test.ts`
- Test: `packages/server/tests/critique.test.ts`

**Interfaces:**
- Consumes: `Review` (Task 6); `verify` and `surfaceBrief` from the server; `inspectUrl` from the browser package
- Produces:
  - `renderReport(review: Review): string`
  - `writeReport(review: Review): Promise<string>` — returns the temp path
  - server-side `critique(dir: string, paths: string[], opts?: { url?: string; html?: boolean }): Promise<{ review: Review; reportPath: string | null }>`

The report is a single self-contained HTML file with no external requests, so it
opens from a temp path with no server. It is written to the OS temp directory,
never into the project.

- [ ] **Step 1: Write the failing tests**

`packages/report/tests/html.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { renderReport, writeReport } from '../src/html.js'
import type { Review } from '../src/critique.js'
import { tmpdir } from 'node:os'
import { readFile } from 'node:fs/promises'

const review: Review = {
  surface: 'settings',
  system: 'quiet-precision',
  counts: { error: 1, warn: 1, info: 0 },
  sections: [
    {
      title: 'Accessibility',
      items: [{
        rule: 'computed-contrast', sev: 'error',
        where: 'p.muted @ 375x812',
        msg: 'Rendered contrast is 2.85:1.',
        fix: 'Darken the text.', source: 'rendered'
      }]
    },
    {
      title: 'Consistency',
      items: [{
        rule: 'space-off-scale', sev: 'warn',
        where: 'src/app/settings/page.tsx:12',
        msg: 'Padding 13px is not on the spacing scale.', source: 'static'
      }]
    }
  ],
  coverage: { analyzed: 61, skipped: 9 },
  degraded: []
}

describe('renderReport', () => {
  it('produces a complete standalone document', () => {
    const html = renderReport(review)
    expect(html).toMatch(/^<!doctype html>/i)
    expect(html).toContain('</html>')
  })

  it('makes no external requests', () => {
    const html = renderReport(review)
    expect(html).not.toMatch(/<script\s+src=/i)
    expect(html).not.toMatch(/<link[^>]+href="https?:/i)
    expect(html).not.toMatch(/@import\s+url\(/i)
  })

  it('names the surface and the design system', () => {
    const html = renderReport(review)
    expect(html).toContain('settings')
    expect(html).toContain('quiet-precision')
  })

  it('shows every section and every finding', () => {
    const html = renderReport(review)
    expect(html).toContain('Accessibility')
    expect(html).toContain('Consistency')
    expect(html).toContain('Rendered contrast is 2.85:1.')
    expect(html).toContain('Padding 13px is not on the spacing scale.')
  })

  it('shows the fix where one exists', () => {
    expect(renderReport(review)).toContain('Darken the text.')
  })

  it('reports coverage honestly, including what was skipped', () => {
    const html = renderReport(review)
    expect(html).toContain('61')
    expect(html).toContain('9')
  })

  it('escapes markup in finding text rather than injecting it', () => {
    const nasty: Review = {
      ...review,
      sections: [{
        title: 'Craft',
        items: [{
          rule: 'x', sev: 'warn', where: 'a.tsx:1',
          msg: '<script>alert(1)</script>', source: 'static'
        }]
      }]
    }
    const html = renderReport(nasty)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders a clean review as a pass rather than an empty page', () => {
    const clean: Review = {
      ...review, counts: { error: 0, warn: 0, info: 0 }, sections: []
    }
    expect(renderReport(clean).toLowerCase()).toContain('no findings')
  })

  it('works in both colour schemes', () => {
    expect(renderReport(review)).toContain('prefers-color-scheme: dark')
  })
})

describe('writeReport', () => {
  it('writes outside the project and returns the path', async () => {
    const path = await writeReport(review)
    expect(path).toContain(tmpdir())
    expect(path).toMatch(/\.html$/)
    expect(await readFile(path, 'utf8')).toContain('Accessibility')
  })
})
```

`packages/server/tests/critique.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { critique } from '../src/tools/critique.js'
import { systemBootstrap } from '../src/tools/system-bootstrap.js'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'crit-'))
  await systemBootstrap(dir, 'settings for a banking portal', { choice: 1 })
})

describe('critique', () => {
  it('reviews a file and groups what it finds', async () => {
    await writeFile(join(dir, 'Bad.tsx'),
      'export default () => <div className="p-[13px]">x</div>')
    const { review } = await critique(dir, ['Bad.tsx'])
    expect(review.counts.error + review.counts.warn).toBeGreaterThan(0)
    expect(review.sections.length).toBeGreaterThan(0)
  })

  it('names the project design system in the review', async () => {
    await writeFile(join(dir, 'Ok.tsx'), 'export default () => <div>x</div>')
    const { review } = await critique(dir, ['Ok.tsx'])
    expect(review.system).toBe('warm-utility')
  })

  it('returns a clean review for compliant code', async () => {
    await writeFile(join(dir, 'Ok.tsx'), 'export default () => <div>x</div>')
    const { review } = await critique(dir, ['Ok.tsx'])
    expect(review.counts.error).toBe(0)
  })

  it('writes no report unless asked', async () => {
    await writeFile(join(dir, 'Ok.tsx'), 'export default () => <div>x</div>')
    expect((await critique(dir, ['Ok.tsx'])).reportPath).toBeNull()
  })

  it('writes an HTML report outside the project when asked', async () => {
    await writeFile(join(dir, 'Bad.tsx'),
      'export default () => <div className="p-[13px]">x</div>')
    const { reportPath } = await critique(dir, ['Bad.tsx'], { html: true })
    expect(reportPath).toContain(tmpdir())
    expect(reportPath).not.toContain(dir)
  })

  it('refuses a path outside the project root', async () => {
    await expect(critique(dir, ['../../etc/passwd'])).rejects.toThrow(/outside/i)
  })

  it('carries source coverage into the review', async () => {
    await writeFile(join(dir, 'Dyn.tsx'),
      'export default ({t}: {t: string}) => <div className={`p-4 ${t}`}>x</div>')
    const { review } = await critique(dir, ['Dyn.tsx'])
    expect(review.coverage.skipped).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/report/tests/html.test.ts`
Expected: FAIL — cannot find module `html.js`

- [ ] **Step 3: Write the report renderer**

`packages/report/src/html.ts`:

```ts
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Review, ReviewItem, ReviewSection } from './critique.js'

/** Findings carry source text, so everything interpolated is escaped. */
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const SEV_LABEL = { error: 'Error', warn: 'Warning', info: 'Note' } as const

const item = (i: ReviewItem): string => `
      <li class="item ${i.sev}">
        <div class="head">
          <span class="sev">${SEV_LABEL[i.sev]}</span>
          <code class="where">${esc(i.where)}</code>
          <span class="src">${i.source}</span>
        </div>
        <p class="msg">${esc(i.msg)}</p>
        ${i.fix ? `<p class="fix">${esc(i.fix)}</p>` : ''}
        <p class="rule"><code>${esc(i.rule)}</code></p>
      </li>`

const section = (s: ReviewSection): string => `
    <section>
      <h2>${esc(s.title)} <span class="count">${s.items.length}</span></h2>
      <ul>${s.items.map(item).join('')}</ul>
    </section>`

export const renderReport = (review: Review): string => {
  const total = review.counts.error + review.counts.warn + review.counts.info

  const body = total === 0
    ? `<section class="clean"><h2>No findings</h2>
         <p>Nothing to fix on this surface.</p></section>`
    : review.sections.map(section).join('')

  // Colours are defined on bare :root and only overridden inside the dark
  // media query, so the report is legible in either scheme.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design review — ${esc(review.surface)}</title>
<style>
  :root {
    --bg: #fbfaf9; --surface: #ffffff; --fg: #1c1917; --muted: #57534e;
    --border: #e7e5e4; --error: #b91c1c; --warn: #b45309; --info: #0369a1;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1c1917; --surface: #292524; --fg: #f5f5f4; --muted: #a8a29e;
      --border: #44403c; --error: #f87171; --warn: #fbbf24; --info: #7dd3fc;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 48px 24px; background: var(--bg); color: var(--fg);
    font: 16px/1.6 ui-sans-serif, system-ui, sans-serif;
  }
  main { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  .meta { color: var(--muted); margin: 0 0 32px; }
  .totals { display: flex; gap: 16px; margin: 0 0 40px; padding: 0; list-style: none; }
  .totals li { padding: 8px 14px; border: 1px solid var(--border); border-radius: 2px;
               background: var(--surface); }
  .totals .n { font-weight: 600; }
  h2 { font-size: 18px; margin: 40px 0 12px; display: flex; gap: 10px; align-items: baseline; }
  .count { color: var(--muted); font-weight: 400; font-size: 14px; }
  ul { list-style: none; margin: 0; padding: 0; }
  .item { background: var(--surface); border: 1px solid var(--border);
          border-left-width: 3px; border-radius: 2px; padding: 14px 16px; margin: 0 0 10px; }
  .item.error { border-left-color: var(--error); }
  .item.warn  { border-left-color: var(--warn); }
  .item.info  { border-left-color: var(--info); }
  .head { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap;
          font-size: 13px; color: var(--muted); }
  .item.error .sev { color: var(--error); }
  .item.warn .sev  { color: var(--warn); }
  .item.info .sev  { color: var(--info); }
  .sev { font-weight: 600; }
  .where { font-family: ui-monospace, monospace; }
  .src { margin-left: auto; }
  .msg { margin: 8px 0 0; }
  .fix { margin: 6px 0 0; color: var(--muted); }
  .rule { margin: 8px 0 0; font-size: 12px; color: var(--muted); }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border);
           color: var(--muted); font-size: 14px; }
</style>
</head>
<body>
<main>
  <h1>Design review</h1>
  <p class="meta">${esc(review.surface)}${
    review.system ? ` &middot; ${esc(review.system)}` : ''
  }</p>

  <ul class="totals">
    <li><span class="n">${review.counts.error}</span> errors</li>
    <li><span class="n">${review.counts.warn}</span> warnings</li>
    <li><span class="n">${review.counts.info}</span> notes</li>
  </ul>

  ${body}

  <footer>
    <p>${review.coverage.analyzed} nodes analyzed, ${review.coverage.skipped} skipped.
       Skipped nodes could not be resolved statically and were not judged.</p>
    ${review.degraded.length > 0
      ? `<p>${review.degraded.length} item(s) degraded: ${
          esc(review.degraded.map(d => d.code).join(', '))}</p>`
      : ''}
  </footer>
</main>
</body>
</html>`
}

export const writeReport = async (review: Review): Promise<string> => {
  // The OS temp directory, never the project: system_bootstrap stays the only
  // tool that writes where the user works.
  const dir = await mkdtemp(join(tmpdir(), 'fe-design-review-'))
  const path = join(dir, `${review.surface.replace(/[^\w-]/g, '-')}.html`)
  await writeFile(path, renderReport(review), 'utf8')
  return path
}
```

Extend `packages/report/src/index.ts`:

```ts
export { renderReport, writeReport } from './html.js'
```

- [ ] **Step 4: Write the critique tool**

`packages/server/src/tools/critique.ts`:

```ts
import { resolve } from 'node:path'
import { buildReview, writeReport, type Review } from '@fe-design/report'
import { inspectUrl, type BrowserFinding } from '@fe-design/browser'
import { deriveLock } from '@fe-design/kernel/lock/derive.js'
import { resolveSurface } from '@fe-design/kernel/surface/resolve.js'
import type { Degraded } from '@fe-design/kernel/engine/rule-types.js'
import { verify } from './verify.js'

export type CritiqueResult = { review: Review; reportPath: string | null }

export const critique = async (
  dir: string,
  paths: string[],
  opts: { url?: string; html?: boolean } = {}
): Promise<CritiqueResult> => {
  const root = resolve(dir)

  // verify throws only on path escape, which must stay a hard error here too.
  const result = await verify(root, paths)

  const degraded: Degraded[] = [...result.degraded]
  let rendered: BrowserFinding[] = []

  if (opts.url) {
    const inspected = await inspectUrl(opts.url)
    rendered = inspected.findings
    degraded.push(...inspected.degraded)
  }

  const { lock } = await deriveLock(root)

  const review = buildReview({
    surface: paths[0] ? resolveSurface(paths[0]) : 'project',
    system: lock?.intent.system ?? null,
    findings: result.findings,
    rendered,
    coverage: { analyzed: result.coverage.analyzed, skipped: result.coverage.skipped },
    degraded
  })

  return {
    review,
    reportPath: opts.html ? await writeReport(review) : null
  }
}
```

Register it in `packages/server/src/index.ts`:

```ts
import { critique } from './tools/critique.js'
```

```ts
server.tool(
  'critique',
  'Review a surface and return a grouped design review rather than a flat finding list. Combines source analysis with rendered findings when a URL is given, and can write a self-contained HTML report outside the project. Read-only.',
  {
    dir: z.string().describe('Absolute path to the project root'),
    paths: z.array(z.string()).describe('Project-relative files to review'),
    url: z.string().optional()
      .describe('Optional running URL, to add rendered findings'),
    html: z.boolean().optional()
      .describe('Write a self-contained HTML report and return its path')
  },
  async ({ dir, paths, url, html }) => {
    try {
      const opts: { url?: string; html?: boolean } = {}
      if (url !== undefined) opts.url = url
      if (html !== undefined) opts.html = html
      return asText(await critique(dir, paths, opts))
    } catch (err) {
      return asText({ error: (err as Error).message })
    }
  }
)
```

Add `"@fe-design/report": "workspace:*"` to `packages/server/package.json`
dependencies and `{ "path": "../report" }` to its tsconfig references.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm install && pnpm vitest run packages/report packages/server/tests/critique.test.ts`
Expected: PASS — 10 report tests and 7 critique tests

- [ ] **Step 6: Update the built-binary test to eight tools**

In `packages/server/tests/built-binary.test.ts`, replace the tool-list
assertion, which currently expects six names:

```ts
  it('completes an MCP handshake and lists all eight tools', async () => {
    const out = await rpc([
      INIT, READY,
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    ])
    const listed = out.trim().split('\n').map(l => JSON.parse(l))
      .find(m => m.id === 2)
    expect(listed.result.tools.map((t: { name: string }) => t.name).sort())
      .toEqual([
        'critique', 'explain', 'guide', 'inspect',
        'surface_brief', 'system_bootstrap', 'system_status', 'verify'
      ])
  }, 15000)
```

and add, inside the same `describe.skipIf(!existsSync(BIN))` block:

```ts
  it('returns a grouped critique through the shipped binary', async () => {
    const out = await rpc([
      INIT, READY,
      JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: {
          name: 'critique',
          arguments: { dir: PROJECT, paths: ['src/app/settings/page.tsx'] }
        }
      })
    ])
    const call = out.trim().split('\n').map(l => JSON.parse(l)).find(m => m.id === 2)
    const payload = JSON.parse(call.result.content[0].text)
    expect(payload.error).toBeUndefined()
    expect(payload.review.sections.length).toBeGreaterThan(0)
    expect(payload.review.counts.error).toBeGreaterThan(0)
  }, 15000)
```

- [ ] **Step 7: Update the companion skill**

In `skill/SKILL.md`, add this section immediately before the final `## Rules`
heading:

```markdown
## When a page is running

Call `inspect` with the URL to catch what source analysis cannot: contrast
against inherited backgrounds, horizontal overflow at real widths, and touch
targets at their rendered size. It needs the browser pack; without it the tool
returns install instructions and everything else still works.

Call `critique` for a grouped review instead of a flat finding list. Pass `url`
to fold in rendered findings, and `html: true` to get a self-contained report
you can open. Both tools are read-only, and any file they produce is written
outside the project.
```

- [ ] **Step 8: Run everything and commit**

Run: `pnpm test && pnpm typecheck && pnpm --filter @fe-design/server build`
Expected: all pass, including Phases 1–4a.

```bash
git add packages/report packages/server skill
git commit -m "feat(server): add critique and its self-contained HTML report"
```

---

## Definition of done for Phase 4b

- [ ] `pnpm test` passes, with Phases 1–4a included
- [ ] `pnpm typecheck` is clean under `strict` and `exactOptionalPropertyTypes`
- [ ] The default suite passes with no browser installed
- [ ] With Chromium present, the smoke test finds contrast, overflow, and touch target problems on a seeded page
- [ ] Contrast is judged only where a background resolved to an opaque colour; otherwise it is reported as unresolved
- [ ] `inspect` degrades to install instructions when the browser pack is absent, and no other tool is affected
- [ ] `critique` groups findings into named sections and never drops an unrecognised rule
- [ ] The HTML report is self-contained, escapes finding text, and reads in both colour schemes
- [ ] `system_bootstrap` is still the only tool that writes into the user's project
- [ ] The built binary lists eight tools

## Known limits, stated so they are not mistaken for finished work

`inspect` needs a running page. It cannot analyse a component in isolation, so
it complements `verify` rather than replacing it — which is why `critique`
combines both rather than preferring one.

The report has no looping CSS demos beside each finding, which the spec's §10
harvest notes as the best idea in design-motion-principles. Getting a demo right
means generating a correct example of the fix for each rule, which is a rule
pack authoring task rather than a report task. The report structure has room for
it: each item already carries its rule id, so a demo can be attached per rule
later without changing the review shape.

Contrast is checked against WCAG 2.1 ratios. APCA, which models thin light text
on dark backgrounds better, remains deferred as it was in Phase 2.

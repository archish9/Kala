# Testing

How to run the tests, how they are organised, and what each suite actually proves.

- [Running tests](#running-tests)
- [Test layout](#test-layout)
- [The suites that matter](#the-suites-that-matter)
- [Test design principles](#test-design-principles)
- [Typechecking](#typechecking)
- [Manual verification](#manual-verification)

---

## Running tests

```bash
pnpm test                                  # everything — 476 tests
pnpm test:watch                            # watch mode
pnpm typecheck                             # tsc -b across all packages

pnpm vitest run packages/kernel            # one package
pnpm vitest run packages/packs/tests/rules.test.ts   # one file
pnpm vitest run -t "unknown"               # tests matching a name
```

Run from the **repository root**. Vitest resolves paths and workspace aliases from there;
running inside a package directory reports "No test files found".

The suite needs **no build and no browser**. Workspace packages alias to source during
tests, so a fresh clone can run `pnpm test` immediately after `pnpm install`. The one
browser-dependent test skips when Chromium is absent.

---

## Test layout

| Location | Files | Covers |
|---|---|---|
| `packages/kernel/tests` | 9 | Facts, IR queries, evaluator, pack loader, rule runner, lock, surfaces |
| `packages/taste/tests` | 17 | Systems, axes, selection, catalog fallback (selection, composition, color mode), ramps, contrast, dark mode, scales, emission, surfaces, guides |
| `packages/taste/scripts` | 1 | Catalog CSV-to-JSON conversion helpers (`.test.mjs`, not `.test.ts` — see [Extending § Refresh the catalog data](03-extending.md#refresh-the-catalog-data)) |
| `packages/server/tests` | 8 | Each tool, plus the built-binary suite |
| `packages/packs/tests` | 5 | Rule pack gate, rules dir, provenance, generated-docs sync, documentation links |
| `packages/extractors/core/tests` | 4 | Tailwind, CSS, selectors, merge |
| `packages/extractors/{react,vue,svelte,html}/tests` | 6 | One extractor each |
| `packages/extractors/equivalence/tests` | 1 | **All four agree** |
| `packages/browser/tests` | 7 | Launch, collection, three checks, and one real-browser smoke test |
| `packages/report/tests` | 2 | Review grouping and HTML rendering |

---

## The suites that matter

Most tests are ordinary unit tests. These four carry the architecture.

### The equivalence suite

`packages/extractors/equivalence/tests/equivalence.test.ts`

The same card, written four ways, must produce **identical `StyleFacts`**:

```
tests/fixtures/card.tsx      React
tests/fixtures/card.vue      Vue
tests/fixtures/card.svelte   Svelte
tests/fixtures/card.html     plain HTML
```

Origins are excluded from the comparison — they differ by framework by design — but every
resolved value must match exactly.

**If this fails, "write a rule once, works everywhere" is false** and the four extractors
are four separate products wearing one interface. When it fails, fix the extractor that
deviates. Never add per-framework special cases to the comparison; that hides exactly the
drift the suite exists to catch.

### The rule pack gate

`packages/packs/tests/rules.test.ts`

Four assertions over every rule in the pack:

1. Every rule loads with **zero** degradation
2. Every rule **fires** on its own fail fixture
3. **No** rule fires on its own pass fixture
4. **No** rule fires on `all-unknown.tsx`

That fourth one is the false-positive firewall. `all-unknown.tsx` is a component where
every style comes from a dynamic expression:

```tsx
export default function X({ tone }: { tone: string }) {
  return (
    <div className={`p-4 ${tone}`}>
      <p className={cn('text-sm text-gray-400', tone)}>hi</p>
    </div>
  )
}
```

Every rule runs against it, and **none may produce a finding**. A rule that fires here is
guessing.

### The built-binary suite

`packages/server/tests/built-binary.test.ts`

Spawns the **shipped artifact** and drives it over real stdio. It skips when `dist/` is
unbuilt.

This exists because source-level tests alias workspace packages back to `src`, so they
structurally cannot catch a broken `bin` entry or a path that only resolves from `dist/`.
Both of those shipped and were invisible until this suite existed.

Its most important assertion:

```ts
expect(payload.findings.map(f => f.rule)).toContain('nested-card')
```

`nested-card` was written for React. That assertion runs it against **Vue** markup through
the real server.

### The browser smoke test

`packages/browser/tests/smoke.test.ts`

Drives real Chromium against a seeded page and asserts all three rendered checks fire. It
matters because the contrast case cannot be faked: `#9ca3af` sits on a transparent
`<section>` over a white `<body>`, so only an ancestor walk resolves it.

Availability is resolved at **module scope**, not in `beforeAll`. `describe.skipIf` is
evaluated during collection, which happens before any hook runs — deciding in a hook leaves
the flag false and silently skips every browser test while appearing to pass.

### Taste property tests

`packages/taste/tests/systems.test.ts`

Properties rather than snapshots, across all 12 systems × 9 hues:

- Every contrast pair meets its target, in **both** light and dark
- Ramp lightness is strictly monotonic
- Body text clears AAA in both schemes
- Composition is deterministic
- Six different briefs do not all select the same system

When one of these fails, the fix is the generator, never the target. Lowering a contrast
target to make a test pass defeats the entire point of solving contrast structurally.

### Catalog fallback tests

`packages/taste/tests/catalog-data.test.ts` and `packages/taste/tests/propose.test.ts`

`catalog-data.test.ts` asserts the ported data itself: exact counts (84/192/74), every
entry has a valid axis range, ids are unique. `propose.test.ts` asserts the *behaviour* —
including one test that runs a catalog-sourced synthetic system through `composeSystem`
and checks `report` is non-empty and every pair meets its target. That single assertion is
the guard against the fallback tier silently regressing into shipping literal hex and
skipping the contrast solver — see
[Design systems § the catalog fallback tier](../users/06-design-systems.md#the-catalog-fallback-tier).

---

## Test design principles

**Checks are pure functions.** Rules run against hand-built IR objects, with no parser and
no server involved. That keeps rule tests fast and precise.

**Every rule ships two fixtures.** A rule missing either does not load — enforced at
pack-load time, not in CI, so an untested rule cannot ship.

**Failure messages name the subject.** Loops over many cases pass a label:

```ts
expect(r.meets, `${system.id} @ hue ${hue}: ${r.pair} was ${r.ratio.toFixed(2)}`).toBe(true)
```

A property test over 108 combinations is useless if a failure does not say which one.

**Assertions encode intent, not observed output.** When a test disagreed with a correct
implementation, the assertion was wrong. One example: an early test demanded dark-mode
foreground lightness above 0.85, but the solver deliberately picks the *dimmest* step that
still clears 7:1, because pinning all text to white flattens hierarchy. The test was
corrected to assert light/dark separation instead.

---

## Typechecking

```bash
pnpm typecheck
```

Runs `tsc -b` across the project graph under `strict` **and**
`exactOptionalPropertyTypes`. That second flag distinguishes an absent property from one
explicitly set to `undefined`, and it has caught real bugs — passing
`{ choice: undefined }` is not the same as omitting `choice`.

Typecheck also **builds**, so it doubles as the build step for the server.

---

## Manual verification

Sometimes you want to see behaviour rather than assertions.

### Drive the server over stdio

```bash
cd /path/to/DesignMCP
pnpm --filter @kala/server build

{
  printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"p","version":"1"}}}'
  printf '%s\n' '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  printf '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"verify","arguments":{"dir":"/tmp/demo","paths":["src/Settings.tsx"]}}}\n'
  sleep 3
} | node packages/server/dist/src/index.js 2>/dev/null | tail -1 |
python3 -c "import json,sys; print(json.load(sys.stdin)['result']['content'][0]['text'])"
```

### Inspect what an extractor produces

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

### Check which system a brief selects

```bash
node --input-type=module -e "
const { loadSystems, selectSystems } = await import('./packages/taste/dist/src/index.js')
const { SYSTEMS_DIR } = await import('./packages/packs/dist/src/index.js')
const { systems } = await loadSystems(SYSTEMS_DIR)
for (const p of selectSystems('your brief here', systems)) {
  console.log(p.system.id, p.fit, '—', p.rationale)
}
"
```

This only ever shows the 12 curated systems' fit scores. To see the **full picture**
including whether a brief falls through to the catalog tier, use `proposeSystem` instead —
it is the same function `system_bootstrap` actually calls:

```bash
node --input-type=module -e "
const { loadSystems, loadCatalog, proposeSystem } = await import('./packages/taste/dist/src/index.js')
const { SYSTEMS_DIR, CATALOG_DIR } = await import('./packages/packs/dist/src/index.js')
const { systems } = await loadSystems(SYSTEMS_DIR)
const { catalog } = await loadCatalog(CATALOG_DIR)
for (const p of proposeSystem('your brief here', systems, catalog)) {
  console.log(p.system.id, p.fit, '—', p.rationale, '— signature:', p.system.signature.length)
}
"
```

A catalog-sourced result prints `signature: 0`; a curated one always prints 3 or more.

Both snippets need `pnpm typecheck` to have run at least once, since they import from
`dist/`.

### Call any tool as a plain function

Every tool is an ordinary async function taking `dir` first, so no MCP client is needed to
drive one — useful for scripting and for debugging what an agent sent:

```bash
cd /path/to/Kala
pnpm --filter @kala/server build

node --input-type=module -e "
import { systemStatus } from './packages/server/dist/src/tools/system-status.js'
import { verify } from './packages/server/dist/src/tools/verify.js'
console.log(await systemStatus('/tmp/demo'))
console.log(await verify('/tmp/demo', ['src/Settings.tsx']))
"
```

### Check the generated documentation

Four user documents contain tables generated from the pack data
([Extending § Regenerate the documentation](03-extending.md#regenerate-the-documentation)):

```bash
node scripts/build-docs.mjs                                   # rewrite the tables
pnpm vitest run packages/packs/tests/docs-sync.test.ts        # counts match the JSON
pnpm vitest run packages/packs/tests/docs-links.test.ts       # no broken links or anchors
```

`docs-sync` is what stops pack data and documentation drifting apart, since the generator is
deliberately not part of `pnpm test` or CI.

---

**Next:** [Design rationale](05-design-rationale.md).

# 7. Testing

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
pnpm test                                  # everything — 374 tests
pnpm test:watch                            # watch mode
pnpm typecheck                             # tsc -b across all packages

pnpm vitest run packages/kernel            # one package
pnpm vitest run packages/packs/tests/rules.test.ts   # one file
pnpm vitest run -t "unknown"               # tests matching a name
```

Run from the **repository root**. Vitest resolves paths and workspace aliases from there;
running inside a package directory reports "No test files found".

The suite needs **no build and no browser**. Workspace packages alias to source during
tests, so a fresh clone can run `pnpm test` immediately after `pnpm install`.

---

## Test layout

| Location | Files | Covers |
|---|---|---|
| `packages/kernel/tests` | 9 | Facts, IR queries, evaluator, pack loader, rule runner, lock, surfaces |
| `packages/taste/tests` | 13 | Systems, axes, selection, ramps, contrast, dark mode, scales, emission, surfaces, guides |
| `packages/server/tests` | 7 | Each tool, plus the built-binary suite |
| `packages/packs/tests` | 3 | Rule pack gate, rules dir, provenance |
| `packages/extractors/core/tests` | 4 | Tailwind, CSS, selectors, merge |
| `packages/extractors/{react,vue,svelte,html}/tests` | 6 | One extractor each |
| `packages/extractors/equivalence/tests` | 1 | **All four agree** |

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
pnpm --filter @fe-design/server build

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

Both snippets need `pnpm typecheck` to have run at least once, since they import from
`dist/`.

---

**Next:** [Extending](08-extending.md).

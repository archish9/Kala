# 9. Troubleshooting

Failures you are likely to hit, what they mean, and how to fix them.

- [Install and build](#install-and-build)
- [Running the server](#running-the-server)
- [Tool responses](#tool-responses)
- [Tests](#tests)
- [git and the repository](#git-and-the-repository)

---

## Install and build

### `ERR_PNPM_IGNORED_BUILDS: Ignored build scripts: esbuild`

pnpm 10+ blocks package build scripts by default. Vitest needs esbuild's, which links its
platform binary.

The approval already lives in `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  esbuild: true
```

If it still appears, remove `node_modules` and reinstall:

```bash
rm -rf node_modules && pnpm install
```

Note this setting lives in `pnpm-workspace.yaml`, not `package.json` — pnpm 11 ignores a
`pnpm` field in `package.json` and will say so.

### `Cannot find module '@fe-design/…'`

A workspace package is not linked. Run `pnpm install` from the repository root.

If it persists for a package you just created, check three places:

1. `packages/*/package.json` — the dependency is declared
2. `vitest.config.ts` — an alias entry exists
3. root `tsconfig.json` — a project reference exists

### `error TS5055: Cannot write file … because it would overwrite input file`

A tsconfig sets `exclude` but does not exclude `dist`. Specifying `exclude` **overrides
TypeScript's automatic `outDir` exclusion**, so the build starts treating its own output as
input.

Every tsconfig that sets `exclude` must include `"dist"`:

```json
{ "exclude": ["dist", "tests/fixtures"] }
```

Then clear stale output:

```bash
rm -rf packages/*/dist packages/extractors/*/dist && pnpm typecheck
```

### Tests pass but the code is clearly wrong

Almost always stale build output being imported instead of source. Historically this
happened when `tsc` emitted `.js` beside every `.ts`, and vitest resolved `../foo.js` to
the stale artifact.

Check for emitted files outside `dist/`:

```bash
find packages -name '*.js' -not -path '*/node_modules/*' -not -path '*/dist/*' \
  -not -path '*/rules/predicates/*'
```

That should print nothing. If it prints anything, delete those files and confirm `outDir`
is set per package.

---

## Running the server

### `Cannot find module '…/dist/src/index.js'`

The server is not built:

```bash
pnpm --filter @fe-design/server build
```

`dist/` is gitignored, so this is required after every fresh clone.

### `ERR_MODULE_NOT_FOUND` pointing at a `.ts` file

Something is trying to run TypeScript directly. Node's type stripping does not rewrite
`.js` import specifiers to `.ts`, so the entry point must be the built JavaScript. Use the
`dist` path, not `src`.

### The client connects but lists no tools

Check the server starts standalone:

```bash
node packages/server/dist/src/index.js
```

It should wait silently for stdin. If it exits with an error, that error is the problem.
Full handshake probe in
[Getting Started](01-getting-started.md#verify-the-connection).

### The agent has the tools but never calls them

Tool descriptions activate weakly on their own. Install the companion skill — see
[Getting Started](01-getting-started.md#the-companion-skill-optional-but-recommended).

---

## Tool responses

### `NO_DESIGN_SOURCE` — "No tailwind config and no CSS custom properties found"

Expected on a project with no design system. `verify` still runs system-independent rules;
scale and palette rules cannot run because there is no scale or palette to check against.

Fix: call `system_bootstrap`, or add a `tailwind.config.*` or CSS custom properties by
hand.

### `UNSUPPORTED_FRAMEWORK`

No extractor for that extension. Supported: `.tsx` `.jsx` `.vue` `.svelte` `.html` `.htm`.

Adding one: [Extending](08-extending.md#add-a-framework).

### `verify` reports nothing on obviously broken code

Check `coverage.skipped` first.

```json
"coverage": { "analyzed": 4, "skipped": 22 }
```

A high skip count means styles could not be resolved statically — usually dynamic class
expressions, or CSS reached through selectors that depend on ancestors. Those nodes were
**skipped rather than guessed**, which is deliberate.

```tsx
<div className={cn('p-[13px]', tone)}>   // unknown → no finding, by design
<div className="p-[13px]">               // known   → finding
```

### High `skipped` on a CSS-heavy project

A project styling everything through descendant selectors like `.sidebar .card` will see
high skips. A single-file extractor has no ancestor context, so it cannot tell whether such
a rule applies. This is the correct answer, not a bug — resolving it needs a real render,
which is Phase 4b.

### `system_bootstrap` refuses to run

```
This project already has a design system (design.lock.json). Pass force to replace it.
```

Working as intended. Replacing rewrites the palette, type, and scales, so it needs an
explicit `force: true`.

### `guide` or `surface_brief` returns `system: null`

The project has no design system, or its lock has no `intent.system`. Run
`system_bootstrap`. The playbook still returns, but without project grounding.

### A finding I disagree with

Three honest options:

1. **Fix the code** — usually correct
2. **Change the system** — if 13px really belongs, add it to the scale deliberately
3. **Report it** — if the rule is wrong, it should be fixed or removed

Do not add a value to the config purely to silence a finding without saying so.

---

## The browser pass

### `BROWSER_UNAVAILABLE`

Chromium is not installed:

```bash
npx playwright install chromium
```

This is a ~115MB download. Everything except `inspect` works without it, and `critique`
still returns a full review from source findings alone.

### `PAGE_FAILED`

The page did not load at that viewport. The detail carries the underlying error. Usual
causes: the dev server is not running, the URL is wrong, or the page took longer than the
20 second timeout.

Other viewports are still inspected — one failure does not abort the run.

### `inspect` finds nothing on a page that looks wrong

Check `degraded[]` first; if the page failed to load there will be nothing to report.

Also note the two deliberate exemptions:

- Large text (24px, or 18.66px bold) uses the relaxed 3.0:1 target, so a soft-grey heading
  may legitimately pass
- Touch targets are only checked at viewports of 1024px or less

### `contrast-unresolved` instead of a ratio

No opaque background was reachable — typically an element over an image or gradient.
Reporting a number there would invent one. Check it by eye, or give the element an explicit
background.

---

## Tests

### "No test files found, exiting with code 1"

You are inside a package directory. Run from the repository root:

```bash
cd /path/to/DesignMCP && pnpm vitest run packages/kernel
```

### The equivalence suite fails

One extractor deviates from the other three. Get the detail:

```bash
pnpm vitest run packages/extractors/equivalence --reporter=verbose
```

Likely causes, in order: the adapter did not pass classes through
`resolveTailwindClasses`; a stylesheet layer was merged when the fixture has no stylesheet;
or one adapter set a fact `absent` where another set it `known`.

**Fix the extractor, never the comparison.** Adding per-framework special cases hides
exactly the drift the suite exists to catch.

### The rule pack gate fails

| Failure | Meaning |
|---|---|
| Rule does not fire on its fail fixture | The rule or the fixture is wrong |
| Rule fires on its pass fixture | Too broad |
| Rule fires on `all-unknown.tsx` | **It is guessing** — the serious one |
| Rule does not load | Missing a fixture, or a fixture path is wrong |

### A contrast property test fails

Do not lower the target. The generator is wrong — widen the ramp search or fix the
lightness targets. Lowering a target defeats the point of solving contrast structurally.

### Built-binary tests skip

Expected when `dist/` is unbuilt. Run `pnpm --filter @fe-design/server build`.

### The browser smoke test skips

Expected when Chromium is absent. Run `npx playwright install chromium`. If it skips even
with Chromium present, availability is being resolved too late — it must be at module
scope, since `describe.skipIf` is evaluated before hooks run.

---

## git and the repository

### `git status` says "not a git repository"

You are above the repository root. The repository is the `DesignMCP` directory itself.

### `git status` lists nothing

That is a clean tree — everything is committed. It is not a sign that nothing was
committed. Confirm with:

```bash
git log --oneline | wc -l     # commit count
git ls-files | wc -l          # tracked files
```

### "Your branch is ahead of 'origin/master' by N commits"

Local commits not yet pushed. `git push origin master`.

### The reference projects do not appear in git

Deliberate. `impeccable-main/`, `ui-ux-pro-max-skill-main/`, and
`design-motion-principles-main/` are gitignored — they are upstream copies to harvest from,
not project source. See [Roadmap and Limits](10-roadmap.md#provenance).

---

**Next:** [Roadmap and Limits](10-roadmap.md).

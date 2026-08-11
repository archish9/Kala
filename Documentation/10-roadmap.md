# 10. Roadmap and Limits

What is built, what is deliberately not, and what is honestly weak.

- [Build status](#build-status)
- [What is not built yet](#what-is-not-built-yet)
- [Known limits](#known-limits)
- [Design decisions and their costs](#design-decisions-and-their-costs)
- [Provenance](#provenance)

---

## Build status

The work was specced once and built in four phases. Each phase ships working software on
its own.

| Phase | Contents | Status |
|---|---|---|
| 1 | Kernel: IR, three-state facts, evaluator, rule engine, lock, React extractor, 9 rules, MCP server | **Done** |
| 2 | Taste: 12 curated systems, OKLCH ramps, solved contrast, derived dark mode, `system_bootstrap` | **Done** |
| 3 | Surfaces: branch and data-source extraction, document rules, 4 state rules, `surface_brief`, `guide` | **Done** |
| 4a | Extraction: Vue, Svelte, and HTML extractors, shared CSS resolution, the equivalence suite | **Done** |
| 4b | Browser: `inspect` and `critique` with an HTML report | **Planned, not built** |

Current totals: **374 tests**, 6 tools, 13 rules, 12 systems, 6 surfaces, 13 playbooks,
4 frameworks.

Every phase has a written spec and plan under `docs/superpowers/`.

---

## What is not built yet

### Phase 4b — browser inspection and critique

Fully planned in
`docs/superpowers/plans/2026-08-11-fe-design-mcp-phase4b-browser.md`. Seven tasks.

Two tools:

**`inspect`** renders a running page in Chromium and reports what only pixels reveal:

- **Contrast against inherited backgrounds.** `getComputedStyle` returns
  `rgba(0, 0, 0, 0)` for an element with no background of its own, so judging contrast
  requires walking ancestors to the first opaque colour. This is the thing static analysis
  structurally cannot do, and the main reason the phase exists.
- **Horizontal overflow at real viewport widths**, with the offending element named.
- **Touch targets at their rendered size**, which markup alone cannot give you.

**`critique`** turns findings — source, and rendered when a URL is supplied — into a
grouped review across Accessibility, Consistency, Craft, and Real-world states, optionally
written as a self-contained HTML report.

It was split from 4a because it needs Playwright and a ~115MB Chromium download, and shares
no code with the extractors. Both were verified to install and work here before the plan
was written.

### The looping CSS demo report

The spec's harvest notes identify the HTML report with auto-looping CSS demos beside each
finding as the best single idea in `design-motion-principles`. The 4b plan produces the
report but **not** the demos: getting one right means generating a correct example of the
fix per rule, which is rule-pack authoring rather than report work. The report structure
leaves room — every item already carries its rule id.

### Data harvest not yet done

Section 10 of the spec plans to convert roughly 800 curated rows from
`ui-ux-pro-max-skill` into typed JSON. Some landed as inspiration for the surfaces and
guides; the bulk has not been converted. Most relevant: the 161-row `ui-reasoning.csv`
would replace the hand-written keyword lexicon in `briefToAxes` with real per-industry
mappings.

---

## Known limits

Stated plainly so they are not mistaken for finished work.

### Svelte findings have no line numbers

Every Svelte node reports line 1. The Svelte 5 modern AST carries character offsets rather
than line numbers, and the offset-to-line conversion is not written. Findings point at the
file, not the line.

### Descendant CSS selectors resolve to `unknown`

A single-file extractor has no ancestor context, so a rule like `.sidebar .card` cannot be
evaluated. Its declarations become `unknown` rather than being applied or ignored — the
correct answer, but it means a project styling everything through descendant rules sees
high `coverage.skipped` and few findings. The browser pass in 4b resolves those from a real
render.

### Branch-to-source linking is file-scoped

Every branch in a file counts as downstream of every data source in it. Narrower analysis
needs cross-statement dataflow tracking the IR deliberately excludes. This can **miss** a
finding in a file with several independent queries; it cannot **invent** one.

### The axis lexicon is hand-written

`briefToAxes` uses a keyword lexicon. A brief using vocabulary outside it lands neutral and
selection falls back to axis geometry alone.

### Twelve systems is a real catalogue but a small one

Quality is capped by how good they are. No maths layer rescues a mediocre catalogue, and
authoring more is design work rather than a coding task.

### Tailwind v3 config shape

Emission targets Tailwind v3 because that is what `deriveLock` reads. Tailwind v4's
CSS-first `@theme` is a change on both sides.

### WCAG 2.1, not APCA

Contrast uses WCAG 2.1 ratios. APCA models thin light text on dark backgrounds better and
remains deferred.

### `resolveSurface` overrides are unwired

The function accepts an `overrides` map so a project can name its own surfaces. Nothing
populates it yet.

---

## Design decisions and their costs

Every decision here bought something and cost something. The costs are real.

### Never guessing

**Buys:** trust. A finding is a fact, so the tool does not get muted.
**Costs:** under-reporting. Dynamic class expressions and descendant CSS produce nothing
at all. On a heavily dynamic codebase, coverage can be low.

This trade is deliberate and would be made the same way again. Over-reporting destroys
trust permanently; under-reporting is recoverable.

### Curated systems rather than generated ones

**Buys:** coherence. Twelve systems authored as wholes, not assembled from independent
lookups.
**Costs:** a ceiling. The catalogue is the product, and expanding it is design work.

### Three proposals, never one

**Buys:** two similar briefs can diverge, because a human decides.
**Costs:** an extra round trip, and an agent that ignores the pause gets less value.

### Data packs rather than code

**Buys:** a rule is a JSON file; a system is a JSON file. Both scale cheaply.
**Costs:** the declarative language has a ceiling. Roughly 15% of rules need the code
escape hatch, and beyond that the language would need rethinking rather than bypassing.

### One writing tool

**Buys:** `verify`, `guide`, `surface_brief`, and `explain` are safe to call freely.
**Costs:** anything that would naturally write — caching derived data, persisting reports
into the project — has to be designed around it. Phase 4b writes screenshots and reports
to the OS temp directory for exactly this reason.

---

## Provenance

A greenfield product that harvests proven material from three prior projects rather than
re-deriving it.

| Project | License | What was taken |
|---|---|---|
| [impeccable](https://github.com/pbakaus/impeccable) | Apache-2.0 | Detector heuristics and thresholds for 5 rules; the inline-waiver design |
| [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | MIT | Surface and guidance material; the persisted-design-system pattern |
| [design-motion-principles](https://github.com/kylezantos/design-motion-principles) | MIT | The frequency gate, and the motion guidance in the `animate` playbook |

Rules carrying a `source` also carry `modified: true`, and a test enforces that pairing.
Detection logic was re-expressed as declarative assertions over the IR, replacing the
original regular expressions.

Apache-2.0 §6 grants no trademark rights. This project is not affiliated with, endorsed by,
or branded as any of the above. Full detail in [NOTICE](../NOTICE) and
[ATTRIBUTION.md](../ATTRIBUTION.md).

**Deliberately not carried over:** the three designer names from
`design-motion-principles`. That project states its subjects neither authored nor endorsed
it; carrying the names into a different product would imply an endorsement that does not
exist. The principles are retained through the `motion` field of design systems.

---

**Back to:** [README](../README.md)

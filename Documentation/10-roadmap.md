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
| 4b | Browser: `inspect` and `critique` with a self-contained HTML report | **Done** |

Current totals: **437 tests**, 8 tools, 13 source rules, 3 rendered checks, 12 systems,
6 surfaces, 13 playbooks, 4 frameworks.

The whole spec is now built.

Every phase has a written spec and plan under `docs/superpowers/`.

---

## What is not built yet

### Nothing from the original spec

Every phase is built. What follows is work the spec anticipated but deliberately deferred.

### The looping CSS demo report

The spec's harvest notes identify the HTML report with auto-looping CSS demos beside each
finding as the best single idea in `design-motion-principles`. The report ships **without**
the demos: getting one right means generating a correct example of the fix per rule, which
is rule-pack authoring rather than report work. The report structure leaves room — every
item already carries its rule id.

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

### Descendant CSS selectors resolve to `unknown` in source analysis

A single-file extractor has no ancestor context, so a rule like `.sidebar .card` cannot be
evaluated. Its declarations become `unknown` rather than being applied or ignored — the
correct answer, but it means a project styling everything through descendant rules sees
high `coverage.skipped` from `verify`. **`inspect` resolves those cases** by reading
computed styles from a real render, which is why `critique` combines both.

### `inspect` needs a running page

It cannot analyse a component in isolation, so it complements `verify` rather than
replacing it.

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

### The licensing files, and why there are four

| File | Required by | Purpose |
|---|---|---|
| `LICENSE` | — | **This project's own licence**: Apache-2.0, copyright 2026 archish9 |
| `LICENSES/Apache-2.0.txt` | Apache-2.0 §4(a) | Verbatim copy of impeccable's incoming licence |
| `LICENSES/MIT.txt` | MIT terms | Copyright and permission notice for the two MIT sources |
| `NOTICE` | Apache-2.0 §4(b), §4(d) | States that files were modified, and carries attribution forward |
| `ATTRIBUTION.md` | nothing | Ours: a human-readable table of what came from where |

Incoming licences cannot be merged or summarised — each must be reproduced unchanged — so
there is one file per licence.

Apache-2.0 was chosen for the project itself because it is the most restrictive licence
already binding it. MIT material can be redistributed under Apache-2.0; the reverse is not
true.

Apache-2.0 §6 grants no trademark rights. This project is not affiliated with, endorsed by,
or branded as any of the above. Full detail in [NOTICE](../NOTICE) and
[ATTRIBUTION.md](../ATTRIBUTION.md).

**Deliberately not carried over:** the three designer names from
`design-motion-principles`. That project states its subjects neither authored nor endorsed
it; carrying the names into a different product would imply an endorsement that does not
exist. The principles are retained through the `motion` field of design systems.

---

**Back to:** [README](../README.md)

# Roadmap and limits

What is built, what is deliberately not, and what is honestly weak.

- [Build status](#build-status)
- [What's being built now](#whats-being-built-now)
- [What is not built yet](#what-is-not-built-yet)
- [Known limits](#known-limits)

Why each decision was made, and what it cost: [Design rationale](05-design-rationale.md).

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

Current totals: **476 tests**, 8 tools, 13 source rules, 3 rendered checks, 12 curated
systems + a catalog fallback tier (84 styles / 192 palettes / 74 typography), 6 surfaces,
13 playbooks, 4 frameworks.

The whole original spec is now built. Work since then continues under a new post-spec
roadmap — see [What's being built now](#whats-being-built-now) below.

Every phase has a written spec and plan under `docs/superpowers/`.

---

## What's being built now

The original four-phase spec is complete. Kala is now growing along a **second,
independently-approved roadmap** toward a fuller FE production suite, still bound by the
same constraints as everything above: no network calls, no API keys, deterministic.
True AI image generation (novel banner art, AI-drawn logos, rendered brand mockups) is
explicitly **out of scope for the whole roadmap** — it cannot be done without an external
image-generation API, which contradicts the no-network-dependency constraint. See
`docs/superpowers/specs/2026-08-14-catalog-search-infra-design.md` for the sub-project 1
design doc and the full ordering rationale.

| # | Sub-project | Status |
|---|---|---|
| 1 | Catalog search infra — the 84/192/74 catalog fallback tier documented in [Design systems § the catalog fallback tier](../users/06-design-systems.md#the-catalog-fallback-tier) | **Done** |
| 2 | Advisor breadth — chart-type advisor, icon lookup, mobile/RN guidelines, React/Next perf rules, UX-guideline expansion | Not started |
| 3 | Design dials — variance/motion/density 1–10 knobs on `system_bootstrap` | Not started |
| 4 | GSAP snippet bank — extends the `animate` guide with code snippets by intensity tier | Not started |
| 5 | Banner/slide/component generation — new write-capable tool(s); breaks the "one writing tool" invariant below, needs its own design | Not started |
| 6 | Brand/CIP without images — brand guideline docs, not mockup renders | Not started |
| 7 | Stack coverage expansion — extractors beyond React/Vue/Svelte/HTML, one stack at a time | Not started |
| — | **`npx kala install`** — a one-line installer that detects the harness, writes the MCP config block, and copies `skills/kala/SKILL.md` and the `/kala` command into place. Today install means clone → `pnpm install` → build → hand-edit JSON, which rules kala out for anyone who does not already work that way. Both upstream projects ship one; kala does not. | Candidate, not approved |

(Numbered here by approved build order, which front-loads the sub-project everything else
leans on; this does not match the order the sub-projects were originally proposed in.)

---

## What is not built yet

### Nothing from the original spec

Every phase is built. What follows is work the spec anticipated but deliberately deferred.
The post-spec roadmap above is separate work, tracked in the table just above instead.

### The looping CSS demo report

The spec's harvest notes identify the HTML report with auto-looping CSS demos beside each
finding as the best single idea in `design-motion-principles`. The report ships **without**
the demos: getting one right means generating a correct example of the fix per rule, which
is rule-pack authoring rather than report work. The report structure leaves room — every
item already carries its rule id.

### Data harvest: partially done

Section 10 of the original spec plans to convert roughly 800 curated rows from
`ui-ux-pro-max-skill` into typed JSON. Some landed early as inspiration for the surfaces
and guides; **350 rows — `styles.csv`, `colors.csv`, `typography.csv` — are now converted**
as the catalog fallback tier (see
[Design systems § the catalog fallback tier](../users/06-design-systems.md#the-catalog-fallback-tier)).
The remaining ~450 rows (`charts.csv`, `icons.csv`, `ux-guidelines.csv`,
`react-performance.csv`, `app-interface.csv`, the 22 `data/stacks/*.csv` files, and the
161-row `ui-reasoning.csv`) are **not converted** — they map to sub-project 2, "advisor
breadth", in the [post-spec roadmap](#whats-being-built-now) above, not yet started.
`ui-reasoning.csv` in particular would replace the hand-written keyword lexicon in
`briefToAxes` with real per-industry mappings; the lexicon remains hand-written until then.

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

### Twelve curated systems is a real catalogue but a small one

Quality is capped by how good they are. No maths layer rescues a mediocre catalogue, and
authoring more is design work rather than a coding task. The catalog fallback tier
(84 styles / 192 palettes / 74 typography — see
[Design systems § the catalog fallback tier](../users/06-design-systems.md#the-catalog-fallback-tier))
widens reach for briefs the twelve do not fit, but it is not a substitute for more curated
systems: it carries no hand-authored `signature`/`antiDefaults`, so it trades opinion for
coverage rather than adding more of the twelve's kind of quality.

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

---

**Next:** [Provenance](07-provenance.md).

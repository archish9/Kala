# Design rationale

Why kala is shaped the way it is, and what each decision cost. None of this is needed to
*use* kala — see [the user guides](../users/01-install.md) for that. It is here so that
anyone changing kala knows which constraints are load-bearing.

- [Never guessing](#never-guessing)
- [The problem curated systems solve](#the-problem-curated-systems-solve)
- [The colour maths](#the-colour-maths)
- [Design decisions and their costs](#design-decisions-and-their-costs)

---

## Never guessing

Every style fact kala extracts is in one of three states: `known`, `absent`, or `unknown`.
Rules never fire on `unknown`.

This is the single most important decision in the project. A checker that reports a finding
it is not sure about gets muted within a week, and a muted checker is worth nothing. So when
kala cannot resolve a value — a dynamic class expression, a CSS rule that depends on
ancestors it cannot see — it reports that it could not judge, rather than guessing.

The mechanics, and what an author must do to honour it, are in
[Writing rules § the unknown contract](02-writing-rules.md#the-unknown-contract).

---

## The problem curated systems solve

Prior tools store styles, palettes, and font pairings in **separate** tables and staple the
winners together. That produces two failures.

**Incoherence.** Nothing guarantees the winning style, palette, and fonts belong together.
A designer picks a serif *because* the palette is warm and the spacing is generous — the
choices are consequences of each other.

**Sameness.** Search ranking is deterministic, so every brief containing "SaaS dashboard"
hits the same row. A tool with 84 styles returns maybe six in practice.

This server takes a different approach: **curated whole systems, adapted by maths**.
Curation supplies coherence that maths cannot produce. Maths supplies completeness that
curation cannot enumerate — full colour ramps, solved contrast, dark mode.


That is why kala ships whole systems rather than three independent tables. Curation supplies
coherence that maths cannot produce; maths supplies completeness that curation cannot
enumerate — full colour ramps, solved contrast, dark mode.

The catalog fallback tier is the deliberate exception, and it is a real trade: it reaches
briefs the twelve do not, by giving up exactly the coherence described above. See
[Design systems § the catalog fallback tier](../users/06-design-systems.md#the-catalog-fallback-tier).

---

## The colour maths

### OKLCH, not HSL

HSL lightness is not perceptual, so its ramps go muddy through the middle — which is why
generated palettes so often look cheap. OKLCH holds perceived lightness fixed per step, so
a ramp is even by construction.

Lightness targets are **fixed per step** rather than derived from the seed, so two
different accents produce ramps that are equally light at 500. That is what lets the
contrast solver reason about steps at all.

```
50: 0.97   100: 0.94   200: 0.89   300: 0.82   400: 0.72   500: 0.62
600: 0.55  700: 0.47   800: 0.39   900: 0.32   950: 0.24
```

Chroma follows a curve peaking mid-ramp — near-white and near-black tints hold very little
colour before they look dirty — capped by the system's `chromaCeiling`.

Neutrals carry roughly half the accent ceiling: enough to read as warm or cool rather than
as `#808080`, not enough to look like a colour.

### Contrast is solved, not checked

Each semantic role is filled by **walking the ramp for a step that meets its target**:

| Pair | Target |
|---|---|
| `fg` on `bg` | 7.0 (AAA — free on a near-white ground, so taken) |
| `muted` on `bg` | 4.5 |
| `onPrimary` on `primary` | 4.5 |
| `border` on `bg` | 3.0 (non-text) |

Accessibility becomes a property of construction rather than something to remember.
Property tests assert every pair for every system at every hue, in both schemes.

### The primary colour keeps its identity

A subtle failure worth knowing about, because the first implementation had it. Walking the
ramp from either end trivially satisfies contrast — near-black passes at 15:1 — so **every
project got a near-black primary button** regardless of which system was chosen. Contrast
tests all passed. The curation was being erased by the maths.

Primary now walks outward from the **middle** of the ramp, which is the brand-recognisable
range, and tests assert the primary keeps chroma and tracks the seed hue.

```
before:  --color-primary: #2b1b14    near-black; passed contrast at 15:1
after:   --color-primary: #8f6755    warm terracotta; still passes
```

### Dark mode is derived, not inverted

Inversion is the tell. It keeps the same chroma, and saturated colour glares on a dark
ground; it also flattens elevation, because shadows stop reading.

- Lightness targets remap against a dark surface ladder
- Chroma drops ~15%
- **Surfaces rise by lightness, not by shadow**
- Text is the *dimmest* step that still clears 7:1 — pinning everything to white flattens
  hierarchy

---


---

## Design decisions and their costs

Every decision here bought something and cost something. The costs are real.

### Never guessing

**Buys:** trust. A finding is a fact, so the tool does not get muted.
**Costs:** under-reporting. Dynamic class expressions and descendant CSS produce nothing at
all. On a heavily dynamic codebase, coverage can be low.

This trade is deliberate and would be made the same way again. Over-reporting destroys trust
permanently; under-reporting is recoverable.

### Curated systems rather than generated ones

**Buys:** coherence. Twelve systems authored as wholes, not assembled from independent
lookups.
**Costs:** a ceiling. The catalogue is the product, and expanding it is design work. The
catalog fallback tier softens this cost for *reach* — a brief now always has somewhere
reasonable to land — but not for *quality*: the fallback tier's picks are assembled from
independent lookups, exactly the failure mode curation exists to avoid, deliberately traded
off only as a last resort below the curated fit threshold.

### Three proposals, never one

**Buys:** two similar briefs can diverge, because a human decides.
**Costs:** an extra round trip, and an agent that ignores the pause gets less value.

### Data packs rather than code

**Buys:** a rule is a JSON file; a system is a JSON file. Both scale cheaply.
**Costs:** the declarative language has a ceiling. Roughly 15% of rules need the code escape
hatch, and beyond that the language would need rethinking rather than bypassing.

### One writing tool

**Buys:** `verify`, `guide`, `surface_brief`, and `explain` are safe to call freely.
**Costs:** anything that would naturally write — caching derived data, persisting reports
into the project — has to be designed around it. `inspect` and `critique` write screenshots
and reports to the OS temp directory for exactly this reason.

---

**Next:** [Roadmap and limits](06-roadmap.md).

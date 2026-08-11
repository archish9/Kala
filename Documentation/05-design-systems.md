# 5. Design Systems

How the server arrives at a design direction, and what it writes.

- [The problem this solves](#the-problem-this-solves)
- [The twelve systems](#the-twelve-systems)
- [Anatomy of a system](#anatomy-of-a-system)
- [How a brief becomes a shortlist](#how-a-brief-becomes-a-shortlist)
- [The colour maths](#the-colour-maths)
- [Scales](#scales)
- [What gets written](#what-gets-written)

---

## The problem this solves

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

---

## The twelve systems

| System | Sans / Serif | Built for |
|---|---|---|
| `quiet-precision` | Söhne / Tiempos Text | financial, developer tools, admin, dashboards |
| `warm-utility` | Public Sans / Source Serif 4 | small business, invoicing, booking, solo tools |
| `editorial-clean` | Inter Tight / Newsreader | publishing, documentation, blogs, portfolios |
| `technical-mono` | IBM Plex Sans / IBM Plex Serif | developer tools, CLIs, APIs, infrastructure |
| `soft-clinical` | Figtree / Source Serif 4 | health, medical, clinics, insurance |
| `bold-commerce` | Archivo / Fraunces | ecommerce, retail, checkout, conversion |
| `archive-serif` | Libre Franklin / Libre Baskerville | archives, libraries, museums, research |
| `playful-rounded` | Nunito / Bitter | kids, education, games, family |
| `dense-console` | Inter Tight | monitoring, observability, logs, trading |
| `muted-enterprise` | Public Sans | enterprise, procurement, government, HR |
| `sunlit-wellness` | Outfit / Fraunces | wellness, meditation, sleep, habits |
| `stark-brutal` | Space Grotesk / Instrument Serif | studios, experimental, music, fashion |

Twelve well-authored systems beat eighty-four thin ones. **Quality is capped by how good
these are** — no maths layer rescues a mediocre catalogue.

A property test asserts the catalogue covers the axis space at both ends, so briefs land
somewhere distinct rather than clustering.

---

## Anatomy of a system

```jsonc
{
  "id": "quiet-precision",
  "axes": { "formality": [0.7, 1.0], "density": [0.4, 0.7],
            "energy": [0.0, 0.3], "expressiveness": [0.1, 0.4] },
  "fitFor":   ["financial", "developer tools", "admin", "dashboard"],
  "avoidFor": ["consumer social", "kids", "entertainment"],

  "type":   { "families": { "sans": "Söhne", "serif": "Tiempos Text" },
              "ratio": 1.2, "baseSize": 15, "maxWeights": 2 },
  "space":  { "base": 4, "rhythm": "generous", "sectionGap": 96 },
  "shape":  { "radius": 2, "depth": "borders" },
  "color":  { "neutralHue": 40, "chromaCeiling": 0.04 },
  "motion": { "budget": "minimal", "duration": 120, "easing": "ease-out" },

  "signature": [
    "Borders carry structure. Shadows are for overlays only.",
    "Numbers are tabular-lined and right-aligned.",
    "One accent, used only for the single primary action per surface."
  ],
  "antiDefaults": ["card-in-card", "gradient-anything", "shadow-on-rest-state"]
}
```

**`signature` is what stops output reading generic.** Those lines are injected into every
surface brief and every guide response, and become constraints the agent works under. A
system without opinions is a template. The loader rejects any system with fewer than three
signature lines.

**`antiDefaults`** become `intent.banned.patterns` in the lock, so they survive into every
later session.

---

## How a brief becomes a shortlist

### Step 1 — brief to axis vector

A keyword lexicon nudges four axes from a neutral 0.5:

```
"banking compliance portal for auditors"
  → formality 0.86  density 0.50  energy 0.32  expressiveness 0.32

"playful game for kids"
  → formality 0.22  density 0.50  energy 0.82  expressiveness 0.70
```

Nudges are small on purpose: several weak signals agreeing should outweigh one strong word,
because briefs are prose and not a form.

### Step 2 — distance, then domain evidence

Distance is zero when an axis falls **inside** a system's range and grows with the gap
otherwise. Then `fitFor` matches add, and `avoidFor` matches subtract more.

### Step 3 — return three, never one

```
brief: "invoicing tool for freelancers, trustworthy not corporate"

  1. warm-utility     fit 1.00   warm sand neutral; built for invoicing
  2. editorial-clean  fit 0.88   paper neutral with a single ink accent
  3. archive-serif    fit 0.85   aged paper neutral with an ink-blue accent
```

**The shortlist is the product.** A silent single answer is the sameness failure this
replaces. A human picks, and that pause is what lets two similar briefs diverge.

The engine discriminates rather than defaulting — eight different briefs select eight
different systems:

```
banking compliance portal    → muted-enterprise
playful game for kids        → playful-rounded
portfolio for a photographer → editorial-clean
meditation and wellness app  → sunlit-wellness
developer CLI documentation  → technical-mono
online shop checkout         → bold-commerce
museum research archive      → archive-serif
dense analytics dashboard    → quiet-precision
```

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

## Scales

**Type:** `baseSize × ratio^n`, snapped to whole pixels, clamped to 6–7 steps. More steps
and hierarchy stops meaning anything. Never below 12px.

**Space:** `base × [0,1,2,3,4,6,8,12,16]`, stretched by the system's `rhythm`
(`tight`, `normal`, `generous`).

**Radius:** always includes 0. Some elements should not be rounded even in a rounded
system, and the alternative is an arbitrary value in the markup.

---

## What gets written

`system_bootstrap` writes exactly three files, all idempotent and marker-delimited:

### `tailwind.config.mjs`

```js
// fe-design:tailwind:start — generated; edits inside are overwritten
export default {
  theme: { extend: {
    spacing:      { "0": '0px', "1": '4px', … },
    fontSize:     { "s12": '12px', "s16": '16px', … },
    borderRadius: { "0": '0px', "8": '8px', … },
    fontFamily:   { sans: ["Public Sans", "system-ui", …] },
    colors: { accent: { "50": '#…', … }, neutral: { … }, bg: '#…', fg: '#…' }
  } }
}
// fe-design:tailwind:end
```

The key names matter: `deriveLock` reads `theme.extend.spacing`, `.fontSize`, `.colors`,
and `.borderRadius`. Changing them silently breaks derivation.

### `src/styles/globals.css`

```css
/* fe-design:tokens:start — generated; edits inside are overwritten */
:root {
  --color-bg: #f7f4f3;
  --color-fg: #4c433d;
  --color-primary: #8f6755;
  --space-0: 0px; --space-1: 4px; …
  --text-12: 12px; --text-16: 16px; …
  --radius: 8px;
  --motion-duration: 180ms;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { … }
}
:root[data-theme="dark"] { … }

@media (prefers-reduced-motion: reduce) { :root { --motion-duration: 0ms; } }
/* fe-design:tokens:end */
```

### `design.lock.json`

The `derived` zone comes from **reading back the two files just written**, so it is a true
function of project config rather than a second, divergent source. The `intent` zone
carries the system id, hierarchy rules, motion budget, banned fonts and patterns, and the
rationale.

### Idempotence and hand edits

Running bootstrap twice with the same input produces **byte-identical** files. Content
outside the markers is preserved, so your own additions survive regeneration. Everything
inside them is regenerated.

After bootstrap the arrow points one way: **project config is upstream, the lock is
downstream.** Bootstrap is the single moment it points outward.

---

**Next:** [Surfaces and Guides](06-surfaces-and-guides.md).

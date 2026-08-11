# 4. Rule Reference

All 13 rules, the four rule kinds, and how findings are suppressed.

- [The four rule kinds](#the-four-rule-kinds)
- [Scale rules](#scale-rules)
- [Consistency rules](#consistency-rules)
- [Accessibility rules](#accessibility-rules)
- [Craft rules](#craft-rules)
- [Real-world state rules](#real-world-state-rules)
- [The unknown contract](#the-unknown-contract)
- [Rule anatomy](#rule-anatomy)
- [Provenance](#provenance)

---

## The complete list

| Rule | Kind | Severity | Catches |
|---|---|---|---|
| `space-off-scale` | node | error | Padding not on the project spacing scale |
| `type-off-scale` | node | error | Text size not on the project type scale |
| `radius-off-scale` | node | warn | Border radius not on the project radius scale |
| `color-off-palette` | node | error | A colour not in the project palette |
| `text-contrast` | relation | error | Text below 4.5:1 against its nearest known background |
| `tiny-text` | node | warn | Text below the 12px legibility floor |
| `flat-type-hierarchy` | aggregate | warn | Fewer than 3 distinct text sizes on a surface |
| `monotonous-spacing` | aggregate | info | Every element using the same padding |
| `nested-card` | node | warn | A bordered, rounded container directly inside another |
| `missing-error-state` | document | error | A data source with no error branch |
| `missing-loading-state` | document | warn | A data source with no loading branch |
| `missing-empty-state` | document | error | A fetched list rendered with no empty state |
| `list-without-empty` | document | warn | Any rendered list with no empty case |

---

## The four rule kinds

Each kind exists because it asks a question the others cannot.

### `node` — assert about one element

```jsonc
{
  "kind": "node",
  "select": { "hasFact": "style.space.padding" },
  "assert": { "allIn": ["self.style.space.padding", "$lock.derived.space"] }
}
```

### `relation` — assert about an element and an ancestor

```jsonc
{
  "kind": "relation",
  "select":  { "hasFact": "style.color.fg" },
  "against": { "nearestAncestor": { "hasFact": "style.color.bg" } },
  "assert":  { "gte": ["contrast(self.style.color.fg, other.style.color.bg)", 4.5] }
}
```

`nearestAncestor` resolves through nesting. If no ancestor has a known background, the
fact is `unknown` and the rule **does not fire**.

### `aggregate` — assert about a whole file or surface

Catches what is invisible per-node and obvious in aggregate:

```jsonc
{
  "kind": "aggregate",
  "scope": "surface",
  "collect": "style.type.size",
  "assert": { "gte": ["distinct(collected)", 3] },
  "minSample": 8
}
```

`minSample` stops it firing on a three-element stub.

### `document` — assert about a whole file

State completeness needs the data-source list and the branch list **together**. Every other
kind selects nodes first, so none of them can ask "does this query have an error path?"

```jsonc
{ "kind": "document", "predicate": "missing-error-state" }
```

Document rules return an array, because one file can have three queries each missing a
different state.

---

## Scale rules

### `space-off-scale` — error

Padding that is not on the project's spacing scale.

```tsx
<div className="p-4">        ✓  16px is on the scale
<div className="p-[13px]">   ✗  13px is not
```

**Fix:** use the nearest value from `derived.space`. If 13px is genuinely needed, add it to
the scale deliberately — and say so.

### `type-off-scale` — error

Text size not on the project's type scale. Same shape: `text-base` passes, `text-[13px]`
fails unless 13 is on the scale.

### `radius-off-scale` — warn

Border radius not on the project's radius scale. A warning rather than an error because a
one-off radius is occasionally justified.

---

## Consistency rules

### `color-off-palette` — error

A colour that is not in the project palette.

```tsx
<p className="text-gray-900">     ✓  in the palette
<p className="text-[#22543D]">    ✗  invented on the spot
```

This is the rule that stops page five from looking like a different product than page one.

---

## Accessibility rules

### `text-contrast` — error

Text below 4.5:1 against its nearest **known** background.

```tsx
<section className="bg-white">
  <p className="text-gray-400">too faint</p>   ✗  2.85:1
</section>
```

The relation walks up to the nearest ancestor with a known background. If none has one, the
rule skips rather than guessing — resolving inherited backgrounds properly requires a real
render, which is Phase 4b.

### `tiny-text` — warn

Text below 12px. Below that, text stops being readable for a meaningful share of users
regardless of the design intent.

---

## Craft rules

These catch the things that make output look amateur without any single line being wrong.

### `flat-type-hierarchy` — warn

Fewer than three distinct text sizes across a surface, with at least eight sized elements.
Everything the same size means nothing is emphasised.

### `monotonous-spacing` — info

Every element using the same padding. Spacing carries grouping information; uniform spacing
throws that information away.

### `nested-card` — warn

A bordered, rounded container directly inside another one.

```tsx
<div className="rounded-xl border p-4">
  <div className="rounded-xl border p-4">nested</div>   ✗
</div>
```

The predicate requires **both** a known radius and a known border width on both elements,
so a rounded button inside a card does not trip it.

---

## Real-world state rules

These use the `Branch` and `DataSource` information the extractor infers. They are the
answer to "only the happy path exists".

### How branch meaning is inferred

```tsx
if (isLoading) return <Spinner/>       → loading
if (error) return <Err/>               → error
{items.length === 0 && <Empty/>}       → empty
{!data?.length && <Empty/>}            → empty
if (!canEdit) return <ReadOnly/>       → permission
{ok ? <A/> : <B/>}                     → null (unclassifiable)
```

Inference is deliberately narrow. A pattern like `/\bcan\w*\b/` would classify `cancel` as
a permission branch — a false positive in nearly every form — so the real pattern requires
`can[A-Z]`.

### `missing-error-state` — error

A data source (`fetch`, `useQuery`, `useSWR`, `useMutation`, `load`) with no error branch
anywhere in the file. **Real data fails.**

### `missing-loading-state` — warn

Same, for loading. The happy path is never instant.

### `missing-empty-state` — error

A file that both fetches and renders a list, with no empty branch. Zero items is a normal
outcome, not an error. Fires once per file, since the empty state belongs to the list.

### `list-without-empty` — warn

Any rendered list with no empty case, even one fed by props rather than a fetch.

**Known limit:** branch-to-source linking is file-scoped — every branch counts as
downstream of every source in the file. Narrower analysis would need cross-statement
tracking the IR deliberately excludes. This can miss a finding in a file with several
independent queries; it cannot invent one.

---

## The unknown contract

**No rule fires on a fact it could not resolve.** Enforced in the evaluator, so a rule
author cannot opt out.

```tsx
<div className={cn('p-4', tone)}>   →  padding unknown  →  no finding, coverage.skipped++
```

Cases that produce `unknown`:

| Situation | Why |
|---|---|
| `className={expr}` / `:class` / `class={expr}` | Runtime value |
| `cn()` / `clsx()` calls | Not statically resolvable |
| CSS via `.sidebar .card` | No ancestor context in a single file |
| CSS gated on `:hover` | Depends on runtime state |
| `padding: var(--x)` | Not statically resolvable |

Every response reports this honestly:

```json
"coverage": { "analyzed": 61, "skipped": 9, "reason": "facts that could not be resolved statically" }
```

A high `skipped` count is not a failure. It means the tool declined to guess.

---

## Rule anatomy

A rule is a JSON file in `packages/packs/rules/<category>/`:

```jsonc
{
  "id": "space-off-scale",
  "kind": "node",
  "severity": "error",
  "select": { "hasFact": "style.space.padding" },
  "assert": { "allIn": ["self.style.space.padding", "$lock.derived.space"] },
  "message": "Padding {value} is not on the project spacing scale.",
  "fix": "Use the nearest value from derived.space in design.lock.json.",
  "fixtures": {
    "pass": "../fixtures/space-pass.tsx",
    "fail": "../fixtures/space-fail.tsx"
  },
  "source": "impeccable@0.x/cramped-padding",
  "modified": true
}
```

**A rule without both fixtures does not load.** The gate is at pack-load time, not in CI,
so an untested rule cannot ship. The pack test then enforces that every rule fires on its
fail fixture, stays silent on its pass fixture, and produces nothing on the all-unknown
fixture.

### The expression language

Deliberately small — no user functions, no loops, no recursion:

```
builtins:  contrast()  distinct()  count()  nearest()  ratio()
           median()  stddev()  has()  matches()
refs:      self.*   other.*   collected   $lock.*   $surface.*
operators: eq  gte  lte  in  allIn  anyIn  not  and  or
```

`and` and `or` evaluate every branch rather than short-circuiting, because short-circuiting
past an `unknown` would hide it.

Adding a rule: [Extending](08-extending.md#add-a-rule).

---

## Provenance

Five rules adapt heuristics and thresholds from
[impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0). The detection logic was
re-expressed as declarative assertions over the IR, replacing the original regular
expressions.

| Ours | Upstream |
|---|---|
| `space-off-scale` | `cramped-padding` |
| `tiny-text` | `tiny-text` |
| `nested-card` | `nested-cards` |
| `monotonous-spacing` | `monotonous-spacing` |
| `flat-type-hierarchy` | `flat-type-hierarchy` |

Every rule carrying a `source` also carries `modified: true`, and a test enforces that
pairing. See [NOTICE](../NOTICE) and [ATTRIBUTION.md](../ATTRIBUTION.md).

---

**Next:** [Design Systems](05-design-systems.md) covers what the rules check against.

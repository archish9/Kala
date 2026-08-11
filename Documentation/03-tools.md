# 3. Tool Reference

All six MCP tools: parameters, responses, worked examples, and failure behaviour.

| Tool | Purpose | Writes? |
|---|---|---|
| [`system_status`](#system_status) | What design system does this project have? | no |
| [`system_bootstrap`](#system_bootstrap) | Create one for a project that has none | **yes** |
| [`surface_brief`](#surface_brief) | Requirements before building a screen | no |
| [`guide`](#guide) | A playbook for a design action, grounded in the project | no |
| [`verify`](#verify) | Check code against the project's design system | no |
| [`explain`](#explain) | Expand one finding | no |

**`system_bootstrap` is the only tool that writes.** Everything else is safe to call
freely and repeatedly.

---

## Two rules that apply to every tool

**Degrade, never throw.** Failures come back as a valid response with a `degraded[]` array
explaining what was not done. There are exactly three hard errors:

1. A path outside the project root
2. An unwritable bootstrap target
3. An existing `design.lock.json` without `force`

**`dir` is always an absolute path** to the project root.

---

## `system_status`

Ask what design system a project has. Call this before building any UI.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `dir` | string | yes | Absolute path to the project root |

**Response**

```json
{
  "hasLock": true,
  "stale": false,
  "changed": [],
  "space": [0, 4, 8, 12, 16, 24, 32, 48, 64],
  "typeSteps": [12, 13, 16, 20, 25, 31, 39],
  "palette": ["accent-50", "accent-500", "neutral-900", "bg", "fg", "primary"],
  "components": ["Button"],
  "degraded": []
}
```

**How to read it**

| Field | Meaning |
|---|---|
| `hasLock: false` | No design system. Do not invent one — call `system_bootstrap`. |
| `stale: true` | Config changed since the lock was derived. The returned values are **already refreshed**; just use them. |
| `space`, `typeSteps`, `palette` | Hard constraints. Never introduce a value outside these. |
| `components` | Components that already exist. Use them instead of writing new ones. |

`stale` is computed by rehashing the source files listed in the lock, so it is a fact
rather than a guess.

---

## `system_bootstrap`

Create a design system for a project that has none. **This is a two-step tool.**

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `dir` | string | yes | Absolute path to the project root |
| `brief` | string | yes | What the product is, who it is for, how it should feel |
| `choice` | integer 1–3 | no | Which proposal to apply. **Omit to see proposals first.** |
| `accent` | string | no | Accent colour as hex, e.g. `#1F4B3F` |
| `force` | boolean | no | Replace an existing system. Rewrites palette, type, and scales. |

### Step one — propose

Call **without** `choice`. Writes nothing.

```json
{ "dir": "/path/to/project", "brief": "calm invoicing tool for freelancers" }
```

```json
{
  "mode": "proposed",
  "proposals": [
    {
      "id": "warm-utility",
      "fit": 1,
      "rationale": "warm sand neutral with a friendly saturated accent; built for invoicing",
      "signature": [
        "Rounded corners and warm neutrals; nothing clinical.",
        "Empty states speak in plain sentences, never in icons alone."
      ],
      "palettePreview": ["#b0704a", "#f7f4f3", "#4c433d"]
    }
  ]
}
```

Three options, always. **Show them to the user and let them choose.** A silent single
answer is exactly what makes lookup-table tools return the same design for every brief.

### Step two — apply

Same call plus `choice`.

```json
{
  "mode": "applied",
  "system": "warm-utility",
  "files": ["…/tailwind.config.mjs", "…/src/styles/globals.css", "…/design.lock.json"],
  "contrastReport": [
    { "pair": "fg on bg", "ratio": 8.81, "target": 7, "meets": true },
    { "pair": "muted on bg", "ratio": 6.23, "target": 4.5, "meets": true },
    { "pair": "dark onPrimary on primary", "ratio": 15.07, "target": 4.5, "meets": true }
  ]
}
```

**Properties worth knowing**

- **Idempotent.** Running twice with the same input produces byte-identical files.
- **Marker-delimited.** Generated blocks are fenced by `fe-design:*:start` / `:end`
  comments, so hand edits outside them survive regeneration.
- **Refuses to overwrite.** An existing `design.lock.json` without `force` is a hard error.
- **Contrast is solved, not hoped for.** Every pair meets its target by construction.

Details of what gets written: [Design Systems](05-design-systems.md#what-gets-written).

---

## `surface_brief`

Get the requirements for a screen **before** building it.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `dir` | string | yes | Absolute path to the project root |
| `surface` | string | yes | Name, alias, or route path |

`surface` accepts any of: `"settings"`, `"sign-in"` (alias), or
`"src/app/settings/page.tsx"` (route path).

**Response**

```json
{
  "surface": "settings",
  "purpose": "A user changes something about their account and trusts that it saved.",
  "requiredStates": ["loading", "error", "success", "permission"],
  "requirements": [
    "Saving shows a pending state and then a confirmed state; silence is not confirmation.",
    "Destructive actions are separated from ordinary ones and require confirmation."
  ],
  "antiPatterns": ["A single Save button at the bottom of forty fields."],
  "primaryAction": "Save, made available only when something actually changed",
  "system": {
    "id": "warm-utility",
    "signature": ["Rounded corners and warm neutrals; nothing clinical."],
    "banned": ["pure-gray-neutrals", "all-caps-labels", "Inter", "Roboto"]
  },
  "tokens": {
    "space": [0, 4, 8, 12, 16, 24, 32, 48, 64],
    "typeSteps": [12, 13, 16, 20, 25, 31, 39],
    "components": ["Button"]
  },
  "degraded": []
}
```

`requiredStates` is the machine-checkable half — the same vocabulary the state rules use,
so what the brief asks for is what `verify` later checks. `requirements` and `antiPatterns`
are judgement no rule can verify.

An unknown surface degrades with `SURFACE_UNKNOWN` and lists the known ones.

The six surfaces and their aliases: [Surfaces and Guides](06-surfaces-and-guides.md).

---

## `guide`

A playbook for a design action, grounded in this project.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `dir` | string | yes | Absolute path to the project root |
| `action` | enum | yes | One of the 13 actions below |
| `target` | string | no | File or surface the action applies to |

**Actions:** `bolder`, `quieter`, `distill`, `harden`, `animate`, `typeset`, `layout`,
`colorize`, `delight`, `clarify`, `adapt`, `optimize`, `onboard`

**Response**

```json
{
  "action": "bolder",
  "intent": "Amplify a design that reads as safe or timid, without abandoning the system.",
  "moves": [
    "Raise the primary heading two steps on the type scale, not one — one step reads as a mistake.",
    "Commit the accent colour to one element instead of spreading it across several."
  ],
  "avoid": ["Adding gradients, glows, or shadows to manufacture emphasis."],
  "system": "warm-utility",
  "signature": ["Rounded corners and warm neutrals; nothing clinical."],
  "banned": ["pure-gray-neutrals", "all-caps-labels", "Inter"],
  "available": { "type": [12, 13, 16, 20, 25, 31, 39], "color": { … }, "space": [0, 4, 8, …] }
}
```

**`available` is the point.** Each playbook declares which token groups it works in, and
the tool returns this project's real values for exactly those groups — `animate` returns
only `motion`, `layout` returns only `space`. Two different projects asking for `bolder`
get different answers. Prior tools returned identical prose to everyone; this one cannot,
because it reads the lock.

---

## `verify`

Check frontend source against the project's design system.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `dir` | string | yes | Absolute path to the project root |
| `paths` | string[] | yes | Project-relative file paths |

**Supported extensions:** `.tsx` `.jsx` `.vue` `.svelte` `.html` `.htm`

**Response**

```json
{
  "findings": [
    {
      "id": "f1",
      "rule": "space-off-scale",
      "sev": "error",
      "file": "src/Settings.tsx",
      "line": 4,
      "msg": "Padding {\"top\":13,…} is not on the project spacing scale.",
      "fix": "Use the nearest value from derived.space in design.lock.json."
    }
  ],
  "coverage": { "analyzed": 61, "skipped": 9, "reason": "facts that could not be resolved statically" },
  "degraded": []
}
```

**How to read it**

- Fix every `error`. Fix `warn` unless it conflicts with an explicit instruction.
- `coverage.skipped` is **information, not failure**. It counts nodes whose styles could
  not be resolved statically — dynamic class expressions, or CSS reached through selectors
  that depend on ancestors. Those were skipped rather than guessed.
- `degraded[]` lists files that could not be analysed and why.

`verify` is read-only and fast. Call it after every UI change.

**Common degraded codes**

| Code | Meaning |
|---|---|
| `UNSUPPORTED_FRAMEWORK` | No extractor for that extension |
| `PARSE_FAILED` | The file did not parse; the rest were still analysed |
| `FILE_TOO_LARGE` | Over 2MB; treated as a bundle, not source |
| `NO_DESIGN_SOURCE` | No lock; only system-independent rules ran |

---

## `explain`

Expand one finding or rule from the most recent `verify` run.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | A finding id such as `"f7"`, or a rule id |

**Response**

```json
{
  "found": true,
  "rule": "space-off-scale",
  "severity": "error",
  "detail": "Padding {value} is not on the project spacing scale.\nKind: node\nAdapted from: impeccable@0.x/cramped-padding",
  "fix": "Use the nearest value from derived.space in design.lock.json.",
  "source": "impeccable@0.x/cramped-padding"
}
```

`explain` exists so `verify` can stay lean. `verify` runs many times per session, so it
returns compact findings; depth is fetched only when needed.

An unknown id returns `{ "found": false, … }` rather than throwing.

---

## The intended sequence

```
system_status ──▶ hasLock false? ──▶ system_bootstrap (propose ▸ choose ▸ apply)
      │
      ▼
surface_brief ──▶ …agent writes code… ──▶ verify ──▶ explain (as needed)
      │                                      │
      └────────── guide, when changing character of the design
```

---

**Next:** [Rule Reference](04-rules.md) documents what `verify` actually checks.

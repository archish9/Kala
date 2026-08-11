# 6. Surfaces and Guides

Two data packs that carry design judgement no rule can verify.

- [Surfaces](#surfaces)
- [The six surfaces](#the-six-surfaces)
- [Guides](#guides)
- [The thirteen playbooks](#the-thirteen-playbooks)
- [Why grounding matters](#why-grounding-matters)

---

## Surfaces

A **surface** is one screen a user lands on — a route, a page, a top-level view. Not a
component, not a file.

A surface brief is delivered **before** the agent writes anything. It splits into two
halves that behave differently:

| Half | Contents | Checkable? |
|---|---|---|
| `requiredStates` | The states this kind of screen must handle | **Yes** — same vocabulary the state rules use |
| `requirements`, `antiPatterns` | What it must do and avoid | No — judgement the agent satisfies |

That first half is the mechanism that turns "handle real-world states" from advice into
something `verify` can later check. The brief says a settings screen needs `error`; the
`missing-error-state` rule checks it exists.

### How a surface is matched

`surface_brief` accepts three forms:

```
"settings"                      exact id
"sign-in"                       alias → auth
"src/app/settings/page.tsx"     route path → settings
```

Route paths are reduced to their most meaningful segment, so `.../settings/page.tsx`
matches `settings` rather than `page`.

---

## The six surfaces

### `landing`

*Aliases:* marketing, home, index, hero
*Required states:* none — it should render without waiting on data

A visitor decides whether this product is for them, and acts.

Requirements include: say what the product does in the first viewport in the user's words;
one primary call to action; every claim that implies proof carries the proof next to it.

Anti-patterns: a carousel hero (visitors see slide one and nothing else); competing primary
buttons; fake urgency.

### `dashboard`

*Aliases:* analytics, overview, home-app, metrics
*Required states:* `loading`, `error`, `empty`

A returning user checks state and finds what needs attention.

Requirements include: the most decision-relevant number is the largest thing on screen;
every metric states its period and unit; errors scope to their own panel, not the page;
nothing animates on data refresh, because movement should mean something changed.

Anti-patterns: a wall of equally weighted cards; sparklines with no scale; colour as the
only carrier of status.

### `settings`

*Aliases:* preferences, account, profile, config
*Required states:* `loading`, `error`, `success`, `permission`

A user changes something and trusts that it saved.

Requirements include: saving shows pending then confirmed — **silence is not
confirmation**; destructive actions separated and confirmed; unsaved changes warn before
navigation; fields a user cannot edit explain why rather than being silently disabled.

Anti-patterns: one Save button at the bottom of forty fields; placeholder text used as the
label; Delete next to Save in the same button group.

### `form`

*Aliases:* create, edit, new, checkout, submit
*Required states:* `loading`, `error`, `disabled`, `success`

A user supplies information and completes a task.

Requirements include: validate on blur and submit, never on every keystroke; errors name
the field and the fix; submit shows pending and cannot be double-fired; field order matches
how the user thinks, not the database schema.

Anti-patterns: clearing entered data when validation fails; a generic "Something went
wrong" with no recovery path.

### `list`

*Aliases:* table, index-page, results, search, inbox, feed
*Required states:* `loading`, `error`, `empty`

A user finds one item among many, or confirms none exists.

Requirements include: the empty state distinguishes *nothing yet* from *nothing matched
your filter*; loading shows the shape of the result, not a spinner over blank space; row
actions reachable by keyboard, not hover alone.

Anti-patterns: hover-only row actions, which do not exist on touch; an empty state that is
a shrug and nothing actionable.

### `auth`

*Aliases:* login, sign-in, signin, signup, sign-up, register
*Required states:* `loading`, `error`, `disabled`

A user proves who they are and gets in, or recovers when they cannot.

Requirements include: errors never reveal whether the account exists; recovery visible on
the same screen as the password field; correct autocomplete attributes so password managers
work; after success the user lands where they were going.

Anti-patterns: rejecting a pasted password; composition rules hidden until after a failed
submit.

---

## Guides

A **guide** is a playbook for changing the character of a design. Thirteen actions, each
declaring which token groups it works in — which is what makes grounding mechanical.

```jsonc
{
  "id": "bolder",
  "intent": "Amplify a design that reads as safe or timid, without abandoning the system.",
  "moves": [
    "Raise the primary heading two steps on the type scale, not one — one step reads as a mistake.",
    "Commit the accent colour to one element instead of spreading it across several."
  ],
  "avoid": ["Adding gradients, glows, or shadows to manufacture emphasis."],
  "usesTokens": ["type", "color", "space"]
}
```

Because `bolder` declares `type`, `color`, and `space`, the tool returns this project's
real type scale, palette, and spacing scale — and nothing else. `animate` returns only the
motion budget.

---

## The thirteen playbooks

| Action | Intent | Token groups |
|---|---|---|
| `bolder` | Amplify a design that reads as safe or timid | type, color, space |
| `quieter` | Calm a surface that overstimulates, by removing emphasis rather than shrinking it | type, color, motion |
| `distill` | Remove everything not carrying weight, until what remains is obvious | space, type |
| `harden` | Make a surface survive real data, real networks, and real people | space, type, color |
| `animate` | Add motion that carries meaning, and only where it earns its cost | motion |
| `typeset` | Fix hierarchy, measure, and rhythm in the text itself | type, space |
| `layout` | Give the surface a spatial structure a reader can predict | space |
| `colorize` | Introduce colour with intent into a flat or monochrome surface | color |
| `delight` | Add one memorable moment where it costs the user nothing | motion, color |
| `clarify` | Rewrite interface copy so it says what happens, in the user's words | type |
| `adapt` | Make the surface work at the sizes it will actually be used at | space, type |
| `optimize` | Reduce what the browser does before the surface is usable | motion |
| `onboard` | Design the first run, when there is no data and no habit yet | space, type, color |

Every playbook carries at least three concrete moves and at least one thing to avoid. The
loader enforces those minimums, though it cannot judge whether a move is specific — which
is why the moves are written as *"raise the heading two steps, not one"* rather than
*"improve hierarchy"*.

### A few worth reading in full

**`animate`** starts with the frequency gate: *ask how often the user triggers this.
High-frequency interactions get faster motion or none.* It ends with: *honour
prefers-reduced-motion by removing motion, not by shortening it.*

**`harden`** is the checklist version of the state rules: render every reachable state;
test each text container with a value three times longer than the design assumes; give
every control a disabled and a pending appearance.

**`clarify`** is about copy: *make button labels name the outcome — Save changes, not
Submit; Delete project, not OK.*

---

## Why grounding matters

The playbook text is generic. The **response is not**.

```
guide("bolder") on a dense analytics dashboard
  → system: quiet-precision
  → type steps to work within: [12, 14, 16, 20, 24, 30]
  → banned here: card-in-card, gradient-anything, shadow-on-rest-state

guide("bolder") on a kids education app
  → system: playful-rounded
  → type steps to work within: [12, 14, 17, 21, 27, 33]
  → banned here: dense-data-grid, all-caps-labels, tiny-tap-targets
```

Same action, different answers, because the tool reads the project's lock. Prior tools
returned identical prose to every project; this one cannot.

---

**Next:** [Testing](07-testing.md).

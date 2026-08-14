# Your first project

A complete walkthrough: empty folder to a checked settings screen. Everything below is what
you *type* and what actually comes back — the outputs on this page are real runs, not
illustrations.

Before you start, finish [Install](01-install.md).

---

## Set the scene

```bash
mkdir -p /tmp/demo/src && cd /tmp/demo
```

Open your agent in that folder.

---

## 1. Ask what is already there

> **You:** What design system does this project have?

The agent calls `system_status` and gets back:

```json
{ "hasLock": false,
  "degraded": [{ "code": "NO_DESIGN_SOURCE",
                 "detail": "No tailwind config and no CSS custom properties found." }] }
```

Nothing. **This is the moment that matters.** Without kala, an agent fills that vacuum with
whatever it has seen most: Inter for everything, a purple-to-blue gradient, cards nested
inside cards. With kala it has somewhere to ask instead.

---

## 2. Ask for a design direction

> **You:** Set up a design system. It is a calm invoicing tool for freelancers —
> trustworthy, not corporate.

kala reads that brief, scores all 12 systems, and returns **three** — never one:

```
1. warm-utility    fit 1.00   warm sand neutral with a friendly saturated accent;
                              built for invoicing, freelance
                              • Rounded corners and warm neutrals; nothing clinical.
                              • Empty states speak in plain sentences, never in icons alone.
                              • Primary action is a filled button; everything else is text
                                or outline.
                              • Errors are amber before they are red.
                              swatches: #a57b68  #f7f4f3  #4c433d

2. soft-clinical   fit 0.95   cool calm neutral with a reassuring blue-green accent
3. archive-serif   fit 0.93   aged paper neutral with an ink-blue accent
```

**Nothing has been written yet.** The pause is deliberate: a tool that silently picks one
gives every project the same design. Two similar briefs diverge here, because a human
decides.

> **You:** Use the first one.

Now it writes three files:

```
tailwind.config.mjs      scales, palette, font families
src/styles/globals.css   CSS custom properties, dark scheme, motion tokens
design.lock.json         the derived values plus the design intent
```

and reports every colour pair with its measured contrast — all passing, in both light and
dark, because the palette was *solved* rather than picked and hoped over.

Want your own brand colour? Say so up front: *"…and use #1F4B3F as the accent."* Everything
else is generated around it, still contrast-checked.

---

## 3. Ask what the screen needs *before* building it

> **You:** I want to build a settings page. What does it need?

```
settings — "A user changes something about their account and trusts that it saved."

Required states:  loading · error · success · permission

Must:   Saving shows a pending state and then a confirmed state; silence is not
        confirmation.
Never:  A single Save button at the bottom of forty fields.

Primary action:  Save, made available only when something actually changed

Work within:  space  0 4 8 12 16 24 32 48 64
              type   12 13 16 20 25 31 39
```

Four states — not just the happy path — and the exact scales to build them from. The state
list is machine-checkable, so what the brief asks for is what gets checked in step 5.

---

## 4. Build it badly on purpose

To see what the checks catch, write something that ignores the brief:

```bash
cat > src/Settings.tsx <<'TSX'
export default function Settings() {
  const { data } = useQuery(['settings'], load)
  return (
    <div className="p-[13px]">
      <h1 className="text-[31px]">Settings</h1>
      <ul>{data.map((s: any) => <li key={s.id}>{s.name}</li>)}</ul>
    </div>
  )
}
TSX
```

---

## 5. Check it

> **You:** Check src/Settings.tsx against our design system.

```
error  space-off-scale        Padding {"top":13,"right":13,"bottom":13,"left":13} is not
                              on the project spacing scale.
error  missing-empty-state    This surface fetches a list and renders it, but has no
                              empty state.
error  missing-error-state    query has no error branch: useQuery(['settings'], load)
warn   missing-loading-state  query has no loading branch: useQuery(['settings'], load)
warn   list-without-empty     A list is rendered from data with no empty case.

coverage: 5 nodes analysed, 0 skipped
```

One spacing violation and four of the states the brief asked for. `13px` is not on the
scale — `12px` and `16px` are.

Note what did **not** fire: `text-[31px]` is fine, because 31 is on this system's type
scale. kala is checking against *your* project, not against a fixed opinion.

**About `skipped`:** it counts nodes whose styles could not be resolved without running the
code — dynamic class expressions like `cn('p-4', tone)`, or CSS reached through selectors
that depend on ancestors. Those are skipped rather than guessed. It is zero here because
this file is entirely static. A high number is information, not failure.

> **You:** Why was space-off-scale flagged?

kala expands the finding: the full rule detail, the fix, and where the rule came from.

---

## 6. Ask for a design action

> **You:** Make it bolder.

The playbook that comes back is not generic advice — it carries *this* project's type scale
to work within and *this* system's bans:

```
bolder — Amplify a design that reads as safe or timid, without abandoning the system.

Do:     Raise the primary heading two steps on the type scale, not one — one step reads
        as a mistake.
        Increase the contrast between the largest and smallest text, rather than
        enlarging everything.
        Commit the accent colour to one element instead of spreading it across several.

Avoid:  Adding gradients, glows, or shadows to manufacture emphasis.
        Introducing a second accent colour.

Your type scale:  12 13 16 20 25 31 39
warm-utility will not use:  pure-gray-neutrals · all-caps-labels · dense-data-grid
```

Ask a different project for `bolder` and you get different numbers, because it reads that
project's lock. All 13 actions:
[Surfaces and actions](07-surfaces-and-actions.md#actions-13).

---

## 7. Read it as a review

> **You:** Give me a full review of src/Settings.tsx as an HTML report.

Instead of a flat list you get findings grouped into **Accessibility**, **Consistency**,
**Craft**, and **Real-world states**, plus a path to a self-contained HTML file you can open
directly — no server, no external requests.

Twenty findings in a flat list read as noise. The same twenty across four named groups read
as a review.

If your dev server is running, add the URL and the rendered checks fold into the same
review:

> **You:** Same again, but also check localhost:5173/settings.

That catches what source analysis structurally cannot: contrast against whatever background
actually renders behind the text, sideways scroll at real viewport widths, and touch targets
too small to hit. Needs Chromium once — `npx playwright install chromium`.

---

## What you learned

| You said | kala did |
|---|---|
| "What design system does this project have?" | `system_status` |
| "Set up a design system for…" | `system_bootstrap` — proposed 3, then wrote 3 files |
| "What does the settings page need?" | `surface_brief` |
| "Check this file" | `verify` |
| "Why was that flagged?" | `explain` |
| "Make it bolder" | `guide` |
| "Give me a review" | `critique`, plus `inspect` when given a URL |

You never typed a tool name. More phrasings for each: [What to say](03-prompts.md).

---

## Adopting kala in a project you already have

The walkthrough above starts empty, but most projects are not. kala derives your design
system from what is already there — a `tailwind.config.*` or CSS custom properties — so
there is usually nothing to set up:

> **You:** What design system does this project have?

If that comes back with your real spacing and type scales, you are done. Skip straight to
checking code. Only bootstrap if it reports `hasLock: false`, and only pass `force` if you
genuinely want your existing palette and scales rewritten.

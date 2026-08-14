# What to say

kala has no commands to memorise. You talk to your agent normally; it decides which kala
tool answers. This page is the phrasebook — what to say for each thing you might want.

If the agent answers from its own memory instead of asking kala, say the name: *"Use kala
to…"*. See
[the agent ignores kala](09-troubleshooting.md#the-agent-ignores-kala-and-designs-from-memory).

---

## The five things people actually want

| You want to… | Say |
|---|---|
| Start a project with a real design system | *"Set up a design system for a calm invoicing tool for freelancers."* |
| Know what a screen needs before building it | *"What states does the settings page need?"* |
| Check code you just wrote | *"Check src/Settings.tsx against our design system."* |
| Change the character of a design | *"Make the pricing page bolder."* |
| Get a full review | *"Review src/ and give me an HTML report."* |

---

## Starting a project

Describe the **product, the audience, and the feeling** — kala matches on all three. The
more specific the brief, the more the three proposals differ from each other.

> *"Set up a design system. It is a patient portal for a dental clinic — reassuring, and it
> has to feel safe to older users."*

> *"Set up a design system for a developer CLI's documentation site. Dense, technical, no
> marketing gloss."*

> *"Set up a design system for a kids' maths game. Playful, loud, ages 6 to 10."*

You get three options and pick one. To skip the pause when you already know:

> *"Set up a design system for an online shop, and use the second proposal."*

To pin your brand colour:

> *"…and use #1F4B3F as the accent."*

**Already have a project?** kala derives what you have rather than replacing it. Just ask
*"What design system does this project have?"* — if it finds a Tailwind config or CSS custom
properties, that becomes the system it checks against, and no setup is needed.

To replace an existing system deliberately:

> *"Replace our design system — force it — with a bolder direction for ecommerce."*

That rewrites the palette, type, and scales, so kala refuses unless you are explicit.

---

## Before building a screen

> *"What does a checkout form need to handle?"*
>
> *"I'm about to build the login page — what am I missing?"*
>
> *"What states does src/app/settings/page.tsx need?"*

kala knows six kinds of screen and their aliases, so *"sign-in"*, *"login"*, *"signup"*, and
a route path all reach the same brief. Full list:
[Surfaces](07-surfaces-and-actions.md#surfaces-6).

The states it names are the ones it will later check for, so this is worth asking *before*
you build rather than after.

---

## Checking code

> *"Check src/Settings.tsx against our design system."*
>
> *"Verify everything I just changed."*
>
> *"Did that break anything in the design system?"*

Works on `.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, and `.htm` — one rule, written once,
fires identically in all of them.

When a finding is unclear:

> *"Why was that flagged?"*
>
> *"Explain space-off-scale."*

Full rule list: [What kala checks](08-what-kala-checks.md).

---

## Changing the character of a design

Thirteen actions. Say the word in a normal sentence:

> *"Make the hero bolder."*
>
> *"This page is too loud — quieten it."*
>
> *"Distill the dashboard; there is too much on it."*
>
> *"Harden the checkout form for real data."*
>
> *"Add some motion to the sidebar."*

| Action | Say it when |
|---|---|
| `bolder` | it reads as safe or timid |
| `quieter` | it overstimulates |
| `distill` | there is too much on the page |
| `harden` | it will meet real data, slow networks, and long strings |
| `animate` | it needs motion that means something |
| `typeset` | the text hierarchy is muddy |
| `layout` | the spatial structure is unpredictable |
| `colorize` | it is flat or monochrome |
| `delight` | it is correct but joyless |
| `clarify` | the copy does not say what happens |
| `adapt` | it breaks at real screen sizes |
| `optimize` | it is slow to become usable |
| `onboard` | the first run has no data and no habit yet |

Each one's exact intent and which of your tokens it draws on:
[Actions](07-surfaces-and-actions.md#actions-13).

---

## Reviewing

> *"Review src/Settings.tsx and give me an HTML report."*
>
> *"Review the whole checkout flow."*

With a dev server running, add the URL and kala also renders the page — catching contrast
against inherited backgrounds, sideways scroll at real widths, and touch targets too small
to hit:

> *"Review src/Settings.tsx and localhost:5173/settings together."*

Rendered checks need Chromium once: `npx playwright install chromium`. Without it everything
else still works.

---

## Phrasings that do not work

| Do not say | Why | Say instead |
|---|---|---|
| *"Make it look better."* | No action matches, so you get generic advice instead of your project's values. | *"Make it bolder"* / *"distill it"* |
| *"Add a purple gradient."* | kala checks against your system, and four of the twelve ban `gradient-anything` outright. | *"Colorize the hero"* and let it use your palette |
| *"Design a logo."* | kala does no image or asset generation, by design. | — |
| *"Check this Flutter file."* | Extractors cover React, Vue, Svelte, and HTML only. | — |
| *"Just pick a design for me."* | It will still return three. The choice is the point — it is what stops two similar projects looking identical. | Read the three and pick, or name one up front |

---

## Pinning kala as the only design authority

If another design tool is installed and competes for the same request, use the `/kala`
command. It dispatches to a subagent whose tools are restricted to kala's, so nothing else
is consulted:

```
/kala Build the settings page and verify it
```

Setup: [Install](01-install.md#the-kala-command).

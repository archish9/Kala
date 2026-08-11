# fe-design MCP

An MCP server that helps coding agents build **production-grade frontend** — work that
reads as though an experienced designer made it, rather than a template filled in.

It does four things a coding agent cannot do reliably on its own:

| Problem | What the server does |
|---|---|
| Every page looks slightly different | Holds the project's design system as data and checks code against it |
| Generic, template-ish output | Bootstraps a coherent, opinionated design direction with solved colour maths |
| Only the happy path exists | Names the states a screen must handle, then checks they exist |
| Advice that ignores the project | Grounds every playbook in this project's real scales and bans |

It works across **React, Vue, Svelte, and plain HTML** — one rule, written once, fires
identically in all four — and can render a running page to catch what source analysis
structurally cannot.

---

## Quick start

```bash
git clone git@github.com:archish9/DesignMCP.git
cd DesignMCP
corepack enable pnpm      # Node 20+ required
pnpm install
pnpm test                 # 437 tests
pnpm --filter @fe-design/server build
```

Then point your MCP client at the built server:

```json
{
  "mcpServers": {
    "fe-design": {
      "command": "node",
      "args": ["/absolute/path/to/DesignMCP/packages/server/dist/src/index.js"]
    }
  }
}
```

Full walkthrough: **[Getting Started](Documentation/01-getting-started.md)**.

---

## The loop

```
system_status    →  does this project have a design system?
system_bootstrap →  if not, propose three directions and apply one
surface_brief    →  before building: which states must this screen handle?
        …agent writes code…
verify           →  check it against the project's own system
inspect          →  render it, and catch what only pixels reveal
critique         →  read everything found as a grouped review
```

A worked example of the whole loop is in
[Getting Started](Documentation/01-getting-started.md#your-first-loop).

---

## What ships today

- **8 MCP tools** — `system_status`, `system_bootstrap`, `surface_brief`, `guide`,
  `verify`, `inspect`, `critique`, `explain`
- **13 source rules** across scale, consistency, accessibility, craft, and real-world states
- **3 rendered checks** — computed contrast, horizontal overflow, touch target size
- **12 curated design systems** with generated OKLCH palettes and solved contrast
- **6 surface briefs** and **13 action playbooks**
- **4 framework extractors** proven equivalent by a dedicated test suite
- **437 tests**, typechecked under `strict` and `exactOptionalPropertyTypes`
- **No browser required** — the browser pass is opt-in and degrades cleanly

---

## Documentation

Start here and read in order, or jump to what you need.

| Guide | What it covers |
|---|---|
| [1. Getting Started](Documentation/01-getting-started.md) | Install, build, connect a client, run the first loop |
| [2. Architecture](Documentation/02-architecture.md) | Packages, the IR, the three-state fact model, dependency rules |
| [3. Tool Reference](Documentation/03-tools.md) | Every tool: parameters, responses, worked examples |
| [4. Rule Reference](Documentation/04-rules.md) | All 13 rules, the four rule kinds, waivers, provenance |
| [5. Design Systems](Documentation/05-design-systems.md) | The 12 systems, selection, colour maths, emitted files |
| [6. Surfaces and Guides](Documentation/06-surfaces-and-guides.md) | The 6 surface briefs and 13 playbooks |
| [7. Testing](Documentation/07-testing.md) | Running tests, the test layout, what each suite proves |
| [8. Extending](Documentation/08-extending.md) | Add a rule, a design system, a surface, a framework |
| [9. Troubleshooting](Documentation/09-troubleshooting.md) | Common failures and what they mean |
| [10. Roadmap and Limits](Documentation/10-roadmap.md) | What is deliberately not built yet, and why |

---

## Design principles

Three decisions shape everything else. They are explained in
[Architecture](Documentation/02-architecture.md), but in short:

**Never guess.** Every style fact is `known`, `absent`, or `unknown`. Rules never fire on
`unknown`. A linter that cries wolf gets muted within a week, and then it is worthless.

**Commit, then enforce.** A project picks one coherent direction; the server holds it as
typed data and checks every later change against it. Prose drifts — data does not.

**Ground everything.** `guide("bolder")` returns this project's actual type scale and this
system's actual bans. Returning the same advice to every project is the failure this
replaces.

---

## Provenance

This is a greenfield product that harvests proven material from three prior projects, with
attribution. See [NOTICE](NOTICE) and [ATTRIBUTION.md](ATTRIBUTION.md).

- [impeccable](https://github.com/pbakaus/impeccable) — Apache-2.0 — detector heuristics and thresholds
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) — MIT
- [design-motion-principles](https://github.com/kylezantos/design-motion-principles) — MIT

## License

Apache-2.0. Copyright 2026 archish9. See [LICENSE](LICENSE).

Apache-2.0 was chosen because it is the most restrictive licence this project is already
bound by — MIT-licensed material can be redistributed under Apache-2.0, but not the
reverse.

Incoming licences are reproduced verbatim in [LICENSES/](LICENSES/): each must be shipped
unchanged, so there is one file per licence rather than a merged summary. Apache-2.0 §6
grants no trademark rights; this project is not affiliated with or endorsed by any of the
projects above.

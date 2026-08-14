# kala

An MCP server that helps coding agents build **production-grade frontend** — work that reads
as though an experienced designer made it, rather than a template filled in.

It does four things a coding agent cannot do reliably on its own:

| Problem | What kala does |
|---|---|
| Every page looks slightly different | Holds the project's design system as data and checks code against it |
| Generic, template-ish output | Bootstraps a coherent, opinionated design direction with solved colour maths |
| Only the happy path exists | Names the states a screen must handle, then checks they exist |
| Advice that ignores the project | Grounds every playbook in this project's real scales and bans |

It works across **React, Vue, Svelte, and plain HTML** — one rule, written once, fires
identically in all four — and can render a running page to catch what source analysis
structurally cannot.

---

## Install

```bash
git clone git@github.com:archish9/Kala.git
cd Kala
corepack enable pnpm            # Node 20+ required
pnpm install
pnpm test                       # 477 tests
pnpm --filter @kala/server build
```

Then point your agent at the built server, using an **absolute** path:

```json
{
  "mcpServers": {
    "kala": {
      "command": "node",
      "args": ["/absolute/path/to/Kala/packages/server/dist/src/index.js"]
    }
  }
}
```

Open your agent in a project and say:

> *"What design system does this project have?"*

Full setup, per-client config, and the optional `/kala` command:
**[Install](Documentation/users/01-install.md)**.
Complete walkthrough: **[Your first project](Documentation/users/02-first-project.md)**.

---

## What you can ask for

There are no commands to memorise — you talk to your agent normally.

| You want to… | Say |
|---|---|
| Start a project with a real design system | *"Set up a design system for a calm invoicing tool for freelancers."* |
| Know what a screen needs before building it | *"What states does the settings page need?"* |
| Check code you just wrote | *"Check src/Settings.tsx against our design system."* |
| Change the character of a design | *"Make the pricing page bolder."* |
| Get a full review | *"Review src/ and give me an HTML report."* |

Thirteen design actions are available by name: `bolder`, `quieter`, `distill`, `harden`,
`animate`, `typeset`, `layout`, `colorize`, `delight`, `clarify`, `adapt`, `optimize`,
`onboard`.

More phrasings for every task: **[What to say](Documentation/users/03-prompts.md)**.

---

## What ships today

- **[8 MCP tools](Documentation/users/04-tools.md)** — `system_status`, `system_bootstrap`,
  `surface_brief`, `guide`, `verify`, `inspect`, `critique`, `explain`
- **[13 source rules](Documentation/users/08-what-kala-checks.md)** across scale,
  consistency, accessibility, craft, and real-world states
- **[3 rendered checks](Documentation/users/08-what-kala-checks.md#rendered-checks-3)** —
  computed contrast, horizontal overflow, touch target size
- **[12 curated design systems](Documentation/users/06-design-systems.md)** with generated
  OKLCH palettes and solved contrast, backed by a
  **[catalog of 84 styles, 192 palettes, and 74 typography pairings](Documentation/users/05-catalog.md)**
  for briefs none of the 12 fit well
- **[6 surface briefs and 13 action playbooks](Documentation/users/07-surfaces-and-actions.md)**
- **4 framework extractors** proven equivalent by a dedicated test suite
- **477 tests**, typechecked under `strict` and `exactOptionalPropertyTypes`
- **No browser required** — the rendered pass is opt-in and degrades cleanly
- **No network calls, no API keys** — static data plus deterministic code; nothing kala does
  depends on an external service

---

## Documentation

### Using kala

| Guide | What it covers |
|---|---|
| [Install](Documentation/users/01-install.md) | Requirements, MCP client setup, verifying it works |
| [Your first project](Documentation/users/02-first-project.md) | A full walkthrough, start to finish |
| [What to say](Documentation/users/03-prompts.md) | The phrasebook — what to type for each task |
| [Tool reference](Documentation/users/04-tools.md) | Parameters and payloads, for scripting kala directly |
| [Catalog](Documentation/users/05-catalog.md) | All 84 styles, 192 palettes, 74 font pairings |
| [Design systems](Documentation/users/06-design-systems.md) | All 12 systems and what each refuses to do |
| [Surfaces and actions](Documentation/users/07-surfaces-and-actions.md) | 6 screen types, 13 design actions |
| [What kala checks](Documentation/users/08-what-kala-checks.md) | Every rule, check, and banned pattern |
| [Troubleshooting](Documentation/users/09-troubleshooting.md) | When it does not work |

### Contributing

| Guide | What it covers |
|---|---|
| [Architecture](Documentation/contributors/01-architecture.md) | Packages, the IR, the fact model |
| [Writing rules](Documentation/contributors/02-writing-rules.md) | Rule kinds, the expression language, fixtures |
| [Extending](Documentation/contributors/03-extending.md) | Add a system, surface, action, framework, or tool |
| [Testing](Documentation/contributors/04-testing.md) | The suites and what each proves |
| [Design rationale](Documentation/contributors/05-design-rationale.md) | Why kala is shaped this way, and what it cost |
| [Roadmap and limits](Documentation/contributors/06-roadmap.md) | What is not built, and what is honestly weak |
| [Provenance](Documentation/contributors/07-provenance.md) | Upstream projects, licences, attribution |

---

## Licence

Apache-2.0 — see [LICENSE](LICENSE). kala builds on three prior projects under Apache-2.0
and MIT; full attribution and the reasoning behind the licence choice are in
[Provenance](Documentation/contributors/07-provenance.md) and
[ATTRIBUTION.md](ATTRIBUTION.md).

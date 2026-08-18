# kala MCP — scope for this repo

kala is an MCP server that helps coding agents build production-grade frontend: it holds
a project's design system as data, checks code against it, bootstraps a coherent design
direction when none exists, and names the states a screen must handle before it's built.
Not a linter, not a component library — a design-system authority a coding agent can
query and be checked against. Works across React, Vue, Svelte, and plain HTML.

Full pitch: `README.md`. Docs are split by audience: `Documentation/users/` (install, first
project, prompts, tool reference, and the generated catalog/system/surface/action/rule
inventories) and `Documentation/contributors/` (architecture, writing rules, extending,
testing, design rationale, roadmap, provenance).

Four user docs contain marker-delimited generated regions. After changing any pack data, run
`node scripts/build-docs.mjs` — `packages/packs/tests/docs-sync.test.ts` fails if they drift,
and `docs-links.test.ts` fails on a broken internal link or anchor.

## Repo shape

pnpm monorepo, packages depend downward:

- `packages/kernel` — the IR, the lock (derived design-system state), the rule engine.
- `packages/extractors/{core,react,vue,svelte,html,equivalence}` — parse source into IR.
- `packages/packs` — the actual data: `rules/`, `guides/` (13 playbooks incl. `animate`),
  `systems/` (12 curated design systems, each a `motion`/`type`/`space`/`color`/`shape`
  token set), `surfaces/`, `catalog/` (84 styles / 192 palettes / 74 typography pairings —
  the fallback tier `system_bootstrap` falls through to below a 0.55 curated fit; see
  `Documentation/05-design-systems.md`'s "catalog fallback tier" section).
- `packages/taste` — loads/validates/composes packs; token derivation and CSS/lock emit.
- `packages/browser` — Playwright-backed `inspect` (pixel-level checks; opt-in Chromium).
- `packages/report` — HTML report generation for `critique`.
- `packages/server` — the MCP server itself (`packages/server/src/index.ts`), 8 tools:
  `system_status`, `system_bootstrap`, `surface_brief`, `guide`, `verify`, `explain`,
  `inspect`, `critique`. Only `system_bootstrap` writes files — everything else is
  read-only by design (see "One writing tool" in `10-roadmap.md`).

`dist/` is gitignored everywhere; the server runs from compiled JS, so
`pnpm --filter @kala/server build` is required after every fresh clone before the MCP
server can start (tests run fine against source, no build needed for `pnpm test`).

## Commands

```bash
pnpm install
pnpm test                          # vitest, whole workspace
pnpm typecheck                     # tsc -b, no output = success
pnpm --filter @kala/server build   # required before running the server
```

Refreshing the catalog data (rare — only if upstream ui-ux-pro-max data changes) is a
separate, non-CI maintenance step: `Documentation/08-extending.md`'s "Refresh the catalog
data" section.

## Provenance (why some code looks familiar)

Three prior projects were harvested from, vendored locally for reference under
`/impeccable-main`, `/ui-ux-pro-max-skill-main`, `/design-motion-principles-main` (all
gitignored, upstream copies only — not our source):

| Project | License | What was taken |
|---|---|---|
| impeccable | Apache-2.0 | Detector heuristics/thresholds for 5 rules; inline-waiver design |
| ui-ux-pro-max-skill | MIT | Surface/guidance material; the persisted-design-system pattern; 350 rows (`styles.csv`/`colors.csv`/`typography.csv`) reshaped into `packages/packs/catalog/` — see `docs/superpowers/specs/2026-08-14-catalog-search-infra-design.md` |
| design-motion-principles | MIT | The frequency gate + the motion guidance in the `animate` guide |

Rules carrying a `source` field also carry `modified: true` — a test enforces that
pairing. Detection logic was re-expressed as declarative assertions over the IR, not
copied as regex. The three designer names from design-motion-principles were
deliberately dropped (see `ATTRIBUTION.md`) — that project states its subjects neither
authored nor endorsed it, so carrying the names here would imply an endorsement that
doesn't exist. The principles themselves live on in the `motion` token field.

## Distribution artifacts (these ship to end users, not just contributors)

- `skills/kala/SKILL.md` — companion skill; tool descriptions alone activate weakly, this
  tells an agent when to call what. Users copy it to `.claude/skills/kala/SKILL.md` in
  their own project (or globally).
- `.claude/agents/kala.md` + `.claude/commands/kala.md` — a `/kala` command that
  hard-restricts the subagent's tools to kala + core file/bash tools, so it works even
  when another FE-design MCP is also installed and would otherwise compete for the same
  request. Users copy both into their own project's `.claude/agents` and
  `.claude/commands`. Same pattern is portable to LangChain `deepagents` via its
  `SubAgent(tools=[...])` — see the "LangChain deepagents" section in
  `Documentation/01-getting-started.md`.
- kala itself is a plain stdio MCP server (`@modelcontextprotocol/sdk`) — works
  unmodified with any MCP client (Claude Code, deepagents/`dcode`, others). No
  kala-side changes needed for cross-agent compatibility; the one known gap is the
  hosted managed-deep-agents cloud service, which requires HTTP/SSE transport instead
  of stdio (not yet built).

## Git remote

`git@github.com:archish9/Kala.git` (project renamed from `DesignMCP`/`fe-design`).

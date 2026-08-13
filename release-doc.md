# Release Doc — publishing kala

Self-contained checklist for when kala is ready to leave development/testing mode. Covers
three things: publishing the MCP server to npm so `npx` works everywhere (the fix for the
gitignored-`dist` problem), wiring up LangChain `deepagents`, and publishing the Claude
Code plugin to a marketplace. kala is used throughout as the worked example — swap the
names for your own project if you're reading this as a general guide.

**Status as of writing:** none of this is done yet. kala is still in development/testing.
`packages/server/dist/` is gitignored; the MCP server currently only runs from a local
build (`pnpm --filter @kala/server build`) pointed at by an absolute path. Nothing here
should be started until the project is actually ready to ship.

---

## Part 1 — Publish the MCP server to npm (Option 1)

### Why

Today `.claude-plugin/plugin.json`'s `mcpServers.kala.args` points at
`${CLAUDE_PLUGIN_ROOT}/packages/server/dist/src/index.js`. That file only exists if
someone clones the repo and runs the build — `dist/` is gitignored, so a marketplace
install (which copies the plugin from published source, not your local disk) won't have
it. Publishing a built artifact to npm and invoking it via `npx` removes the build step
for every consumer — Claude Code plugin install, plain `claude mcp add`, and deepagents
all just spawn `npx` and it works.

### 1.1 Bundle instead of publishing 8 packages

`packages/server/dist/src/index.js` currently imports real workspace packages —
`@kala/kernel`, `@kala/packs`, `@kala/taste`, `@kala/extractor-react`, etc. — resolved via
pnpm's local symlinks. Publishing this to npm as-is would require separately publishing
all 8 `@kala/*` packages, each versioned and released in lockstep. Don't do that.

Instead, bundle everything workspace-internal into one flat file with esbuild:

```bash
pnpm --filter @kala/server add -D esbuild
```

Add a build script, e.g. `packages/server/scripts/bundle.mjs`:

```js
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/bundle.js',
  // Keep npm deps external — installed normally as real dependencies.
  // Bundle only the @kala/* workspace packages.
  external: ['zod', '@modelcontextprotocol/sdk', 'playwright'],
  banner: { js: '#!/usr/bin/env node' },
})
```

Add to `packages/server/package.json`:

```json
{
  "scripts": {
    "build": "tsc -b",
    "build:bundle": "node scripts/bundle.mjs"
  }
}
```

Run `tsc -b` first (type-checks and is still useful for development), then
`build:bundle` to produce the single-file artifact actually published.

### 1.2 package.json changes for the published artifact

```json
{
  "name": "kala-mcp",
  "version": "0.1.0",
  "type": "module",
  "bin": { "kala-mcp": "./dist/bundle.js" },
  "files": ["dist/bundle.js", "LICENSE", "NOTICE", "LICENSES/"],
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  },
  "license": "Apache-2.0"
}
```

Decisions to make here, not defaults to copy blindly:

- **Name**: `@kala/server` (scoped) or unscoped `kala-mcp` to match the existing `bin`
  entry. Scoped packages publish free with `--access public` — no paid npm org required.
  Unscoped gives a cleaner `npx kala-mcp`. Pick one; this doc uses `kala-mcp`.
- **`playwright`** (used by `packages/browser` for the `inspect` tool): decide whether to
  bundle it in or leave it as a real dependency users `npm install` separately. It's a
  heavy dependency (~115MB Chromium download) that's already documented as opt-in in
  `Documentation/01-getting-started.md` — leaving it external and letting `inspect`
  degrade gracefully (as it already does today when Chromium isn't installed) is
  consistent with that design.
- **`files`**: keep this narrow. Don't publish `src/`, tests, or the monorepo's other
  packages — just the bundle and the license material.

### 1.3 Licensing travels with the published artifact

`NOTICE`, `LICENSE`, and `LICENSES/Apache-2.0.txt` + `LICENSES/MIT.txt` currently live at
the repo root, satisfying Apache-2.0 §4 and the MIT attribution requirement for the
harvested material (impeccable, ui-ux-pro-max-skill, design-motion-principles — see
`ATTRIBUTION.md` and `CLAUDE.md`). Once the code ships as a standalone npm artifact
separate from the repo, those obligations travel with *that* artifact — the `files` field
above already includes them. Don't drop this when narrowing `files`.

### 1.4 Publish

```bash
cd packages/server
pnpm build              # tsc -b — typecheck
pnpm build:bundle       # esbuild — produces dist/bundle.js
npm login               # first time only
npm publish --access public
```

Versioning: follow semver (`npm version patch|minor|major`) and tag releases. Keep this
version and the plugin's `.claude-plugin/plugin.json` `version` field moving together —
they don't have to match exactly, but drift between "what npm has" and "what the plugin
manifest claims" is confusing to debug later.

### 1.5 What changes for each consumer once published

**Claude Code plugin** — `.claude-plugin/plugin.json`:

```diff
  "mcpServers": {
    "kala": {
-     "command": "node",
-     "args": ["${CLAUDE_PLUGIN_ROOT}/packages/server/dist/src/index.js"]
+     "command": "npx",
+     "args": ["-y", "kala-mcp"]
    }
  }
```

No more `${CLAUDE_PLUGIN_ROOT}` path, no build step for the installer. `npx` fetches from
the registry on first run and caches it.

**Plain MCP install, no plugin** — replaces the local dev command:

```bash
claude mcp add kala --scope user -- npx -y kala-mcp
```

**Any other MCP client** — same shape, their config format:

```json
{ "mcpServers": { "kala": { "command": "npx", "args": ["-y", "kala-mcp"] } } }
```

---

## Part 2 — LangChain deepagents

Already documented in `Documentation/01-getting-started.md` under "LangChain
deepagents" — reproduced here so this doc is self-contained.

### 2.1 What deepagents needs

deepagents is a LangGraph-based agent harness (`create_deep_agent()`). It consumes MCP
servers directly — no kala-side code changes needed, stdio is the default and fully
supported transport in the open-source package:

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    tools=[],
    mcp_servers={
        "kala": {
            "command": "npx",
            "args": ["-y", "kala-mcp"],
        }
    },
)
```

Before npm publish, point `command`/`args` at the local build instead (same shape as the
Claude Code dev config): `{"command": "node", "args": ["/absolute/path/to/Kala/packages/server/dist/src/index.js"]}`.

### 2.2 Hard tool restriction (the `/kala`-command equivalent)

deepagents' `SubAgent` spec takes an explicit `tools` list. Omit it and the subagent
inherits everything (soft, description-based selection — same as no restriction at all).
Pass an explicit list and LangChain binds *only* those tools — no merge with the parent's
toolset. Same guarantee shape as this repo's own `.claude/agents/kala.md` restriction.
Relevant if a deepagents app also has another FE-design MCP wired in and a given subagent
should only consult kala:

```python
SubAgent(
    name="kala-only",
    tools=["mcp__kala__system_status", "mcp__kala__verify", "mcp__kala__guide", ...],
)
```

This is something the deepagents *application developer* configures in their own code —
not something kala ships. deepagents has no plugin/skill/command bundling concept the way
Claude Code does (see Part 3).

### 2.3 Known gap

The separate **hosted managed-deep-agents cloud service** (not the open-source package)
only accepts remote HTTP/SSE MCP servers — it can't spawn local processes in its sandbox,
so stdio (what kala ships today) doesn't work there. Not a blocker for self-hosted
`deepagents`/`dcode` agents. If the managed service matters later, kala would need an
HTTP/SSE transport variant in addition to stdio — not built, not currently planned.

---

## Part 3 — Publishing the Claude Code plugin

This section is written as a general guide — the steps anyone publishing a Claude Code
plugin would follow — with kala as the running example, so following it later means
copy-pasting real values instead of re-deriving the process.

### 3.1 What's already scaffolded (done, in this repo)

```
.claude-plugin/plugin.json   ← plugin manifest (name, mcpServers, etc.)
agents/kala.md                 → symlink to .claude/agents/kala.md
commands/kala.md               → symlink to .claude/commands/kala.md
skills/kala/SKILL.md           → symlink to skill/SKILL.md
```

`claude plugin validate .` passes clean (one expected warning: `CLAUDE.md` at plugin root
isn't loaded as plugin context — correct, it's a contributor doc, not shipped context).

**Note on the current `mcpServers` block**: it's inline in `plugin.json`, pointing at the
local `dist/` build (see Part 1 for why that's a placeholder, not the final state).

### 3.2 Two ways to distribute a plugin

A plugin (the `.claude-plugin/plugin.json` + `agents/`/`commands/`/`skills/` bundle) is
not itself installable — it needs a **marketplace** entry pointing at it. There is no
Anthropic review/submission queue documented for getting listed in a curated official
marketplace; the standard, fully self-service path is **hosting your own marketplace**,
which can live in the same repo as the plugin.

#### Self-referencing marketplace (recommended for a single-plugin repo like kala)

Add `.claude-plugin/marketplace.json` alongside `plugin.json` — same directory:

```json
{
  "name": "kala-marketplace",
  "owner": { "name": "archish9", "url": "https://github.com/archish9" },
  "plugins": [
    {
      "name": "kala",
      "source": "./",
      "description": "Design-system verification and critique for frontend agents."
    }
  ]
}
```

`source: "./"` means "the plugin is the marketplace root itself" — no separate plugin
repo needed. Paths in `source` resolve relative to the marketplace root (the directory
containing `.claude-plugin/`), not the `.claude-plugin/` directory itself.

Marketplace name can't collide with Anthropic's reserved list (`claude-code-marketplace`,
`claude-code-plugins`, `claude-plugins-official`, `anthropic-*`, and a few others) —
`kala-marketplace` is clear of that.

#### Separate marketplace repo (if you'll host multiple plugins later)

Same `marketplace.json` shape, but plugin entries point elsewhere instead of `"./"`:

```json
{
  "name": "code-formatter",
  "source": { "source": "github", "repo": "archish9/kala" }
}
```

Not needed for a single-plugin launch — mentioned for completeness since kala's org may
ship more plugins later.

### 3.3 What a user actually runs

Once `.claude-plugin/marketplace.json` is pushed to GitHub:

```
/plugin marketplace add archish9/Kala
/plugin install kala@kala-marketplace
```

(`kala@kala-marketplace` = `plugin-name@marketplace-name`, per the marketplace's own
`name` field above.) If the install summary says `Run /reload-plugins to activate.`, that
command finishes it. From then on: `/kala <task>`, the restricted subagent, and the
`skill/SKILL.md` companion skill are all active — no separate `claude mcp add` step, no
manual copying of `.claude/agents`/`.claude/commands` into the user's own project (that
manual-copy path documented in `CLAUDE.md` today is the pre-plugin workaround; the plugin
install supersedes it).

### 3.4 Versioning

Claude Code resolves a plugin's version from, in order: `plugin.json`'s `version` field →
the marketplace entry's `version` field → git commit SHA → `unknown`. For kala:

- Keep `"version"` set explicitly in `.claude-plugin/plugin.json` and bump it every
  release — `/plugin update` compares this string, not commit history, to decide if an
  update exists. Pushing commits without bumping it is invisible to installed users.
- Follow semver. Document changes in a `CHANGELOG.md` (impeccable's vendored copy under
  `/impeccable-main/CHANGELOG.md` is a reasonable format reference, not something to
  copy).

### 3.5 Pre-publish checklist

- [ ] `claude plugin validate . --strict` passes (catches misspelled/leftover fields,
      not just the loose default check already run).
- [ ] `mcpServers.kala` in `plugin.json` points at the published `npx kala-mcp` command
      (Part 1), not a local `dist/` path — the single most likely thing to be stale.
- [ ] `.claude-plugin/marketplace.json` added, `source: "./"`.
- [ ] Version bumped in `plugin.json` (and npm, if publishing both together).
- [ ] `LICENSE`, `NOTICE`, `LICENSES/` still accurate — check `ATTRIBUTION.md` and
      `CLAUDE.md`'s provenance table hasn't drifted from what `packages/packs/rules/*`
      actually declares in their `source` fields.
- [ ] Push to `git@github.com:archish9/Kala.git`, tag the release
      (`claude plugin tag . --push` handles this if versioning off git tags; not
      required if using explicit `plugin.json` versions).
- [ ] Test the actual install flow in a clean environment: `/plugin marketplace add
      archish9/Kala` → `/plugin install kala@kala-marketplace` → `/kala` works, kala's
      MCP tools appear, skill activates on a real UI task.

---

## Open questions to resolve before publishing, not before

- Final npm package name (`kala-mcp` vs `@kala/server`) — affects `bin`, `npx` command,
  and the `plugin.json` `mcpServers.kala.command` args together; change all three at once.
- Whether `playwright` (the `inspect` tool's dependency) ships bundled or external.
- Whether an HTTP/SSE transport is ever worth adding for the managed-deep-agents cloud
  gap (Part 2.3) — no evidence yet this is worth the effort pre-launch.
- Whether an Anthropic-curated official-marketplace listing (distinct from a self-hosted
  marketplace) is worth pursuing — not documented as a self-service process anywhere
  found during research for this doc; would need direct outreach/research at the time.

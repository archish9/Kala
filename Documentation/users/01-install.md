# Install

> **Who this is for.** kala is an MCP server for an AI coding agent. If you use Claude Code,
> installing the plugin is two commands and nothing else. Every other client needs one block
> of JSON pointing at `npx kala-mcp`.

- [Requirements](#requirements)
- [Claude Code: install the plugin](#claude-code-install-the-plugin)
- [Any MCP client: the server alone](#any-mcp-client-the-server-alone)
- [From source](#from-source)
- [The companion skill](#the-companion-skill)
- [The kala command](#the-kala-command)
- [LangChain deepagents](#langchain-deepagents)
- [Did it work](#did-it-work)

---

## Requirements

| Requirement | Version | Why |
|---|---|---|
| Node.js | 20 or later | ESM, `node:` built-ins, and the framework parsers |

That is the whole list for the plugin and `npx` paths — `npx` fetches the published package
and caches it, so there is no clone, no build, and no pnpm. [Building from
source](#from-source) additionally needs git and pnpm 9+.

The [rendered checks](08-what-kala-checks.md#rendered-checks-3) additionally need Chromium,
which is **opt-in** and can wait until you want it:

```bash
npx playwright install chromium     # ~115MB, only needed for reviewing a running page
```

Without it every other part of kala works unchanged, and `inspect` says so rather than
failing.

---

## Claude Code: install the plugin

The plugin carries everything in one install: the MCP server, the [companion
skill](#the-companion-skill), the [`/kala` command](#the-kala-command), and the restricted
subagent it dispatches to.

```
/plugin marketplace add archish9/Kala
/plugin install kala@kala-marketplace
```

`kala@kala-marketplace` reads as `plugin-name@marketplace-name`. If the install summary ends
with `Run /reload-plugins to activate.`, run that and the components load without a restart.

That is the entire install. There is no `claude mcp add` step and nothing to copy by hand —
the plugin declares the MCP server itself, as `npx -y kala-mcp`, so the first call fetches
the published package and caches it.

To confirm it worked, open a project and say:

> *"What design system does this project have?"*

To update later, `/plugin update kala`. Updates are keyed to the `version` field in the
plugin manifest, not to new commits.

---

## Any MCP client: the server alone

kala speaks MCP over stdio and takes no arguments, no environment variables, and no working
directory — the project directory is a parameter on every tool call. Any client that can
spawn a stdio MCP server can run it.

**Claude Code**, without the plugin:

```bash
claude mcp add kala --scope user -- npx -y kala-mcp
```

**Cursor**, in `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global) — and the same
shape for any other client:

```json
{
  "mcpServers": {
    "kala": {
      "command": "npx",
      "args": ["-y", "kala-mcp"]
    }
  }
}
```

Installed this way you get the eight tools but none of the surrounding material. Add the
[companion skill](#the-companion-skill) — without it an agent mid-task will not reliably
remember to ask kala anything.

---

## From source

For working on kala itself, or running a change that is not published yet.

```bash
git clone git@github.com:archish9/Kala.git
cd Kala
corepack enable pnpm          # Node ships a manager for it
pnpm install
pnpm test                     # 485 passing
pnpm typecheck                # no output means success
pnpm --filter @kala/server build
```

`pnpm install` approves one build script, `esbuild`, which vitest needs to link its platform
binary. That approval lives in `pnpm-workspace.yaml` and is deliberately scoped to that one
package rather than allowing builds generally.

The build produces `packages/server/dist/src/index.js`. `dist/` is gitignored, so the build
is required after every fresh clone.

> **Why a build step?** Node's TypeScript stripping does not rewrite `.js` import specifiers
> to `.ts`, so a server entry pointing at TypeScript cannot start. Package exports resolve to
> built JavaScript for runtime while tests alias back to source — which is why `pnpm test`
> needs no build but the server does.

Point your client at the built entry with an **absolute** path:

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

To load the whole plugin from a working copy instead — server, skill, command, and agent,
without installing it:

```bash
claude --plugin-dir /absolute/path/to/Kala
```

To build the npm artifact the published package is made from, see
[Testing](../contributors/04-testing.md).

---

## The companion skill

**Included in the plugin. Recommended for every other install.** Tool descriptions alone
activate weakly: an agent mid-task will not reliably remember to ask kala what the design
system is before writing a component.

`skills/kala/SKILL.md` is a short file that tells the agent when to call what. Copy it
wherever your harness looks for skills:

```bash
# Claude Code, for this project
mkdir -p .claude/skills/kala
cp /path/to/Kala/skills/kala/SKILL.md .claude/skills/kala/SKILL.md

# Or globally, for every project
mkdir -p ~/.claude/skills/kala
cp /path/to/Kala/skills/kala/SKILL.md ~/.claude/skills/kala/SKILL.md
```

If you installed the plugin, this is already active as `kala:kala` — nothing to copy.

---

## The kala command

**Included in the plugin.** If you have another frontend-design tool installed, it will
compete with kala for the same requests. `/kala` dispatches to a subagent whose tools are
restricted to kala's plus core file editing, so nothing else is consulted:

```
/kala Build the settings page and verify it
```

The plugin registers it under both `/kala` and the namespaced `/kala:kala`; use the
namespaced form if another installed plugin also defines `/kala`.

If the subagent reports back that it only had `Read`/`Edit`/`Write`/`Bash` and no kala
tool, its allowlist did not match the names the server is actually registered under. A
plugin-installed server exposes `mcp__plugin_kala_kala__<tool>`; a server from a
hand-written `.mcp.json` exposes `mcp__kala__<tool>`. The shipped agent lists both, so
whichever applies resolves and the other is dropped — if you wrote your own agent file,
list both there too. Names that match nothing are silently discarded rather than erroring.

Without the plugin, copy the two files into your own project:

```bash
mkdir -p .claude/agents .claude/commands
cp /path/to/Kala/.claude/agents/kala.md   .claude/agents/kala.md
cp /path/to/Kala/.claude/commands/kala.md .claude/commands/kala.md
```

---

## LangChain deepagents

kala is a standard stdio MCP server, which `deepagents` (and the underlying
`langchain-mcp-adapters`) consumes directly — no changes needed on kala's side:

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

A deepagents `SubAgent` scoped to an explicit `tools=[...]` list gets the same hard
tool-restriction guarantee as the [`/kala` command](#the-kala-command) above.

One caveat: the hosted **managed-deep-agents** cloud offering only accepts remote HTTP/SSE
MCP servers, not stdio — it cannot spawn local processes in its sandbox. kala currently
ships stdio only, so it works with self-hosted `deepagents`/`dcode` agents but not that
specific managed service.

---

## Did it work

You do not need a client to check the server runs. This drives it over raw stdio:

```bash
{
  printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}'
  printf '%s\n' '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  sleep 2
} | npx -y kala-mcp
```

You should see an `initialize` result followed by a `tools/list` result naming eight tools:
`system_status`, `verify`, `explain`, `surface_brief`, `guide`, `inspect`, `critique`, and
`system_bootstrap`. Running [from source](#from-source), substitute
`node packages/server/dist/src/index.js` for the last line.

If that works, the server is fine and any remaining problem is client configuration — see
[Troubleshooting](09-troubleshooting.md#running-the-server).

**Now open your agent in a project and say:**

> *"What design system does this project have?"*

Then follow [Your first project](02-first-project.md).

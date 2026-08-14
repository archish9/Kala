# Install

> **Who this is for.** kala installs as an MCP server for an AI coding agent. Setting it up
> means cloning a repo, running two commands, and adding a few lines to your agent's config
> file. If you have done any of those before, this takes about five minutes. There is no
> one-line installer yet — that is
> [a tracked gap](../contributors/06-roadmap.md#whats-being-built-now).

- [Requirements](#requirements)
- [Install](#install)
- [Build](#build)
- [Connect your agent](#connect-your-agent)
- [The companion skill](#the-companion-skill)
- [The kala command](#the-kala-command)
- [Did it work](#did-it-work)

---

## Requirements

| Requirement | Version | Why |
|---|---|---|
| Node.js | 20 or later | ESM, `node:` built-ins, and the framework parsers |
| pnpm | 9 or later | Workspace protocol (`workspace:*`) |
| git | any | Cloning |

Check what you have:

```bash
node --version     # must print v20.x or higher
pnpm --version
```

If pnpm is missing, Node ships a manager for it:

```bash
corepack enable pnpm
```

Nothing else is required. The [rendered checks](08-what-kala-checks.md#rendered-checks-3)
additionally need Chromium, which is **opt-in** and can wait until you want it:

```bash
npx playwright install chromium     # ~115MB, only needed for reviewing a running page
```

Without it every other part of kala works unchanged.

---

## Install

```bash
git clone git@github.com:archish9/Kala.git
cd Kala
pnpm install
```

`pnpm install` approves one build script, `esbuild`, which vitest needs to link its platform
binary. That approval lives in `pnpm-workspace.yaml` and is deliberately scoped to that one
package rather than allowing builds generally.

Confirm the install is healthy:

```bash
pnpm test        # 477 passing
pnpm typecheck   # no output means success
```

If either fails, see [Troubleshooting](09-troubleshooting.md#install-and-build).

---

## Build

The server runs from compiled JavaScript, so build before connecting your agent:

```bash
pnpm --filter @kala/server build
```

This produces `packages/server/dist/src/index.js`. `dist/` is gitignored, so this step is
required after every fresh clone.

> **Why a build step?** Node's TypeScript stripping does not rewrite `.js` import specifiers
> to `.ts`, so a server entry pointing at TypeScript cannot start. Package exports resolve to
> built JavaScript for runtime while tests alias back to source — which is why `pnpm test`
> needs no build but the server does.

---

## Connect your agent

kala speaks MCP over stdio. Every client wants the same two things: the command `node`, and
the absolute path to the built entry point.

> **The path must be absolute.** kala takes the project directory as a parameter on every
> call, so the server itself has no working directory to resolve a relative path against.

Get the absolute path:

```bash
echo "$(pwd)/packages/server/dist/src/index.js"
```

### Claude Code

Add to your MCP settings:

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

### Cursor

Same shape, in `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

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

### Any other MCP client

Same shape again. kala takes no arguments, reads no environment variables, and needs no
working directory, so any client that can spawn a stdio MCP server can run it.

### LangChain deepagents

kala is a standard stdio MCP server, which `deepagents` (and the underlying
`langchain-mcp-adapters`) consumes directly — no changes needed on kala's side:

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    tools=[],
    mcp_servers={
        "kala": {
            "command": "node",
            "args": ["/absolute/path/to/Kala/packages/server/dist/src/index.js"],
        }
    },
)
```

A deepagents `SubAgent` scoped to an explicit `tools=[...]` list gets the same hard
tool-restriction guarantee as the [`/kala` command](#the-kala-command) below.

One caveat: the hosted **managed-deep-agents** cloud offering only accepts remote HTTP/SSE
MCP servers, not stdio — it cannot spawn local processes in its sandbox. kala currently
ships stdio only, so it works with self-hosted `deepagents`/`dcode` agents but not that
specific managed service.

---

## The companion skill

**Recommended.** Tool descriptions alone activate weakly: an agent mid-task will not
reliably remember to ask kala what the design system is before writing a component.

`skill/SKILL.md` is a short file that tells the agent when to call what. Copy it wherever
your harness looks for skills:

```bash
# Claude Code, for this project
mkdir -p .claude/skills/kala
cp /path/to/Kala/skill/SKILL.md .claude/skills/kala/SKILL.md

# Or globally, for every project
mkdir -p ~/.claude/skills/kala
cp /path/to/Kala/skill/SKILL.md ~/.claude/skills/kala/SKILL.md
```

---

## The kala command

**Optional.** If you have another frontend-design tool installed, it will compete with kala
for the same requests. The `/kala` command dispatches to a subagent whose tools are
restricted to kala's plus core file editing, so nothing else is consulted:

```bash
mkdir -p .claude/agents .claude/commands
cp /path/to/Kala/.claude/agents/kala.md   .claude/agents/kala.md
cp /path/to/Kala/.claude/commands/kala.md .claude/commands/kala.md
```

Then:

```
/kala Build the settings page and verify it
```

---

## Did it work

You do not need a client to check the server runs. This drives it over raw stdio:

```bash
cd /path/to/Kala
{
  printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}'
  printf '%s\n' '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  sleep 2
} | node packages/server/dist/src/index.js
```

You should see an `initialize` result followed by a `tools/list` result naming eight tools:
`system_status`, `verify`, `explain`, `surface_brief`, `guide`, `inspect`, `critique`, and
`system_bootstrap`.

If that works, the server is fine and any remaining problem is client configuration — see
[Troubleshooting](09-troubleshooting.md#running-the-server).

**Now open your agent in a project and say:**

> *"What design system does this project have?"*

Then follow [Your first project](02-first-project.md).

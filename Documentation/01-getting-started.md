# 1. Getting Started

Everything needed to install, build, connect, and run the server for the first time.

- [Requirements](#requirements)
- [Install](#install)
- [Build](#build)
- [Connect an MCP client](#connect-an-mcp-client)
- [Verify the connection](#verify-the-connection)
- [Your first loop](#your-first-loop)
- [Using it without an MCP client](#using-it-without-an-mcp-client)

---

## Requirements

| Requirement | Version | Why |
|---|---|---|
| Node.js | 20 or later | ESM, `node:` built-ins, and the parsers |
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

Nothing else is required to install, test, and run. The `inspect` tool additionally needs
Chromium, which is **opt-in**:

```bash
npx playwright install chromium     # ~115MB, only needed for `inspect`
```

Without it, `inspect` returns install instructions and every other tool is unaffected.

---

## Install

```bash
git clone git@github.com:archish9/Kala.git
cd Kala
pnpm install
```

`pnpm install` will approve one build script, `esbuild`, which vitest needs to link its
platform binary. That approval lives in `pnpm-workspace.yaml` and is deliberately scoped
to that one package rather than allowing builds generally.

Confirm the install is healthy:

```bash
pnpm test        # 437 passing
pnpm typecheck   # no output means success
```

If either fails, see [Troubleshooting](09-troubleshooting.md).

---

## Build

The server runs from compiled JavaScript, so build before connecting a client:

```bash
pnpm --filter @kala/server build
```

This produces `packages/server/dist/src/index.js`. `dist/` is gitignored, so this step is
required after every fresh clone.

> **Why a build step?** Node's TypeScript stripping does not rewrite `.js` import
> specifiers to `.ts`, so a server entry pointing at TypeScript cannot start. Package
> exports resolve to built JavaScript for runtime while tests alias back to source, which
> is why `pnpm test` needs no build but the server does.

---

## Connect an MCP client

The server speaks MCP over stdio. Use an **absolute path** to the built entry point.

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

### Any other MCP client

Same shape. The server takes no arguments, reads no environment variables, and needs no
working directory — every tool takes an absolute `dir` parameter instead.

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

A deepagents `SubAgent` scoped to `tools=[...]` an explicit list gets the same hard
tool-restriction guarantee as this project's own `/kala` command (see
`.claude/agents/kala.md`) — useful if another FE-design MCP is also wired into the same
agent and you want kala to be the only one consulted for a given subagent.

One caveat: the hosted **managed-deep-agents** cloud offering only accepts remote
HTTP/SSE MCP servers, not stdio — it can't spawn local processes in its sandbox. kala
currently ships stdio only, so it works with self-hosted `deepagents`/`dcode` agents but
not that specific managed service, until an HTTP/SSE transport is added.

### The companion skill (optional but recommended)

Tool descriptions alone activate weakly: an agent mid-task will not reliably remember to
call `surface_brief` before writing a component. `skill/SKILL.md` is a short file that
tells the agent when to call what. Copy it wherever your harness looks for skills — for
Claude Code that is `.claude/skills/kala/SKILL.md` in your project, or
`~/.claude/skills/kala/SKILL.md` globally.

---

## Verify the connection

You do not need a client to check the server works. This drives it over raw stdio:

```bash
cd /path/to/DesignMCP
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

If that works, the server is fine and any remaining problem is client configuration.

---

## Your first loop

This walks the full cycle on a throwaway directory. Every command is real and runnable.

### Step 1 — Make an empty project

```bash
mkdir -p /tmp/demo/src && cd /tmp/demo
```

### Step 2 — Ask what design system it has

Call `system_status` with `dir: "/tmp/demo"`. It returns:

```json
{
  "hasLock": false,
  "degraded": [{ "code": "NO_DESIGN_SOURCE", "detail": "No tailwind config and no CSS custom properties found." }]
}
```

No design system. The agent must not invent one — it should bootstrap.

### Step 3 — Propose design directions

Call `system_bootstrap` with a brief and **no** `choice`:

```json
{ "dir": "/tmp/demo", "brief": "calm invoicing tool for freelancers, trustworthy not corporate" }
```

It writes nothing and returns three candidate directions with fit scores, rationale, each
system's signature moves, and a palette preview. This pause is deliberate: a silent
single-answer pick is what makes lookup-table tools return the same design every time.

### Step 4 — Apply one

Same call plus `"choice": 1`. Now it writes three files:

```
/tmp/demo/tailwind.config.mjs      scales, palette, font families
/tmp/demo/src/styles/globals.css   CSS custom properties, dark scheme, motion tokens
/tmp/demo/design.lock.json         derived values + design intent
```

The response includes a contrast report where every semantic pair meets its WCAG target,
in both light and dark.

### Step 5 — Get the brief before building

Call `surface_brief` with `surface: "settings"`:

```json
{
  "surface": "settings",
  "requiredStates": ["loading", "error", "success", "permission"],
  "requirements": ["Saving shows a pending state and then a confirmed state; silence is not confirmation.", "..."],
  "antiPatterns": ["A single Save button at the bottom of forty fields.", "..."],
  "tokens": { "space": [0, 4, 8, 12, 16, 24, 32, 48, 64], "typeSteps": [12, 13, 16, 20, 25, 31, 39] }
}
```

Four states to handle, and the real scales to build them from.

### Step 6 — Write something that ignores all that

```bash
cat > /tmp/demo/src/Settings.tsx <<'TSX'
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

### Step 7 — Verify

Call `verify` with `paths: ["src/Settings.tsx"]`:

```
error  space-off-scale        Padding 13px is not on the project spacing scale.
error  missing-error-state    query has no error branch: useQuery(['settings'], load)
error  missing-empty-state    This surface fetches a list and renders it, but has no empty state.
warn   missing-loading-state  query has no loading branch
warn   list-without-empty     A list is rendered with no empty case.
```

Five findings: one scale violation, and four real-world states the brief asked for and the
code skipped. `coverage` reports how many nodes were analysed and how many could not be
resolved statically.

### Step 8 — Ask for grounded guidance

Call `guide` with `action: "bolder"`. The response is not generic advice — it carries this
project's type scale to work within, and this system's own bans.

### Step 9 — read it as a review

Call `critique` with the same paths and `html: true`. Instead of a flat list you get the
findings grouped into Accessibility, Consistency, Craft, and Real-world states, plus a
path to a self-contained HTML report you can open directly.

If the page is running, pass `url` as well and rendered findings are folded into the same
review.

---

## Using it without an MCP client

Every tool is a plain function. This is useful for scripting and for debugging:

```bash
cd /path/to/DesignMCP
pnpm --filter @kala/server build

node --input-type=module -e "
import { systemStatus } from './packages/server/dist/src/tools/system-status.js'
import { verify } from './packages/server/dist/src/tools/verify.js'
console.log(await systemStatus('/tmp/demo'))
console.log(await verify('/tmp/demo', ['src/Settings.tsx']))
"
```

---

**Next:** [Architecture](02-architecture.md) explains why the system is shaped this way.

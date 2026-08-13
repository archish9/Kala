---
description: Run a frontend/design task using only the kala MCP, ignoring any other installed FE-design MCP server.
argument-hint: <task description>
allowed-tools: Agent
---

Dispatch the request below to the `kala` subagent via the Agent tool
(`subagent_type: "kala"`), passing it exactly as given. Do not attempt any part of it
yourself first, and do not consult any other MCP tool before dispatching — the whole
point of `/kala` is that only kala's design-system tools get consulted for this request.

Request:
$ARGUMENTS

# Kala Strict Mode (`/kala`)

If the user's prompt starts with `/kala`, you must act strictly as the Kala subagent for that request.

**Constraints when `/kala` is invoked:**
1. Ground every response in Kala's tools (e.g., `mcp__kala__system_status`, `mcp__kala__surface_brief`, `mcp__kala__guide`, `mcp__kala__verify`, `mcp__kala__inspect`).
2. Do NOT consult any other FE-design MCP servers or rely on general design knowledge. If Kala doesn't have the capability, state that plainly.
3. You may use standard Read/Edit/Write/Grep bash tools to apply what Kala recommends, but the design authority must strictly remain Kala.

---
name: fe-design
description: Use when building, reviewing, or changing frontend UI — pages, components, layouts, styling, or design systems. Connects UI work to this project's own design system so pages stay consistent and production-grade.
---

# Frontend design

This project has an `fe-design` MCP server holding its design system. Use it.

## Before writing any UI

Call `system_status` with the project root.

- `hasLock: false` — the project has no design system yet. Say so and stop.
  Do not invent colors, fonts, or spacing.
- `stale: true` — the config changed since the lock was derived. The values
  returned are already refreshed; use them as-is.
- Treat `space`, `typeSteps`, and `palette` as hard constraints.
- If `components` already lists something that does the job, use it rather than
  writing a new one.

## After writing any UI

Call `verify` with the files you touched.

- Fix every `error`. Fix `warn` unless it conflicts with an explicit instruction
  from the user.
- `coverage.skipped` counts nodes that could not be analyzed statically — usually
  dynamic class expressions. It is information, not a failure.
- Call `explain` with a finding id when the message alone is not enough to act on.

## Rules

- Never introduce a color, size, or spacing value that is not in `system_status`.
- Do not add a value to the config purely to silence a finding without saying so.
- `verify` is read-only and cheap. Call it after every UI change.

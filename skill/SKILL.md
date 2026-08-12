---
name: kala
description: Use when building, reviewing, or changing frontend UI — pages, components, layouts, styling, or design systems. Connects UI work to this project's own design system so pages stay consistent and production-grade.
---

# Frontend design

This project has an `kala` MCP server holding its design system. Use it.

## Before writing any UI

Call `system_status` with the project root.

- `hasLock: false` — the project has no design system yet. Call
  `system_bootstrap` with a brief describing the product, its audience, and how
  it should feel. It returns three directions and writes nothing; show them to
  the user and let them choose, then call it again with `choice`. Never invent
  colors, fonts, or spacing yourself.
- `stale: true` — the config changed since the lock was derived. The values
  returned are already refreshed; use them as-is.
- Treat `space`, `typeSteps`, and `palette` as hard constraints.
- If `components` already lists something that does the job, use it rather than
  writing a new one.

## Before building a new screen

Call `surface_brief` with the screen name or its route path.

- `requiredStates` lists the states this kind of screen must handle. Build all
  of them, not just the happy path.
- `requirements` and `antiPatterns` are the brief. Satisfy the first, avoid the
  second.
- `system.signature` describes how this project does things. Follow it.

## When changing the character of a design

Call `guide` with one of: bolder, quieter, distill, harden, animate, typeset,
layout, colorize, delight, clarify, adapt, optimize, onboard.

The response is grounded in this project: `available` holds the real scales to
work within, and `banned` lists what this system does not do.

## After writing any UI

Call `verify` with the files you touched.

- Fix every `error`. Fix `warn` unless it conflicts with an explicit instruction
  from the user.
- `coverage.skipped` counts nodes that could not be analyzed statically —
  dynamic class expressions in any framework, and CSS rules whose selectors
  depend on ancestors this tool cannot see. It is information, not a failure.
- `verify` handles `.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, and `.htm`.
- Call `explain` with a finding id when the message alone is not enough to act on.

## When a page is running

Call `inspect` with the URL to catch what source analysis cannot: contrast
against inherited backgrounds, horizontal overflow at real widths, and touch
targets at their rendered size. It needs the browser pack; without it the tool
returns install instructions and everything else still works.

Call `critique` for a grouped review instead of a flat finding list. Pass `url`
to fold in rendered findings, and `html: true` to get a self-contained report
you can open. Both tools are read-only, and any file they produce is written
outside the project.

## Rules

- Never introduce a color, size, or spacing value that is not in `system_status`.
- Do not add a value to the config purely to silence a finding without saying so.
- `verify` is read-only and cheap. Call it after every UI change.

#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { systemStatus } from './tools/system-status.js'
import { verify } from './tools/verify.js'
import { explain } from './tools/explain.js'
import { systemBootstrap } from './tools/system-bootstrap.js'
import { surfaceBrief } from './tools/surface-brief.js'
import { guide } from './tools/guide.js'
import type { VerifyResult } from '@fe-design/kernel/engine/rule-types.js'

let lastRun: VerifyResult | null = null

const server = new McpServer({ name: 'fe-design', version: '0.1.0' })

const asText = (v: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }]
})

server.tool(
  'system_status',
  'Report this project design system: spacing scale, type scale, palette, component registry, and whether it is stale. Call before building or changing UI.',
  { dir: z.string().describe('Absolute path to the project root') },
  async ({ dir }) => asText(await systemStatus(dir))
)

server.tool(
  'verify',
  'Check frontend source files against the project design system. Returns findings with file and line, plus coverage showing what could not be analyzed statically. Read-only.',
  {
    dir: z.string().describe('Absolute path to the project root'),
    paths: z.array(z.string()).describe('Project-relative file paths to check')
  },
  async ({ dir, paths }) => {
    try {
      lastRun = await verify(dir, paths)
      return asText(lastRun)
    } catch (err) {
      // Only path escape reaches here; everything else degrades.
      return asText({ error: (err as Error).message })
    }
  }
)

server.tool(
  'explain',
  'Expand one finding id or rule id from the most recent verify run into its full rationale, fix guidance, and provenance.',
  { id: z.string().describe('A finding id such as "f7", or a rule id') },
  async ({ id }) => asText(await explain(id, lastRun))
)

server.tool(
  'surface_brief',
  'Get the requirements for a screen before building it: which real-world states it must handle, what it must do, what to avoid, and the project design constraints it must work within. Call this before writing a new surface. Read-only.',
  {
    dir: z.string().describe('Absolute path to the project root'),
    surface: z.string()
      .describe('Surface name, alias, or route path — e.g. "settings", "sign-in", "src/app/settings/page.tsx"')
  },
  async ({ dir, surface }) => asText(await surfaceBrief(dir, surface))
)

server.tool(
  'guide',
  'Get a playbook for a design action — bolder, quieter, distill, harden, animate, typeset, layout, colorize, delight, clarify, adapt, optimize, or onboard — grounded in this project design system rather than generic advice. Read-only.',
  {
    dir: z.string().describe('Absolute path to the project root'),
    action: z.enum([
      'bolder', 'quieter', 'distill', 'harden', 'animate', 'typeset', 'layout',
      'colorize', 'delight', 'clarify', 'adapt', 'optimize', 'onboard'
    ]).describe('Which design action to get a playbook for'),
    target: z.string().optional().describe('Optional file or surface the action applies to')
  },
  async ({ dir, action, target }) => asText(await guide(dir, action, target))
)

server.tool(
  'system_bootstrap',
  'Create a design system for a project that has none. Called with a brief alone it returns three candidate directions and writes nothing; call it again with choice to apply one. This is the only tool that writes files.',
  {
    dir: z.string().describe('Absolute path to the project root'),
    brief: z.string().describe('What the product is, who it is for, how it should feel'),
    choice: z.number().int().min(1).max(3).optional()
      .describe('Which proposal to apply, 1-3. Omit to see proposals first.'),
    accent: z.string().optional().describe('Accent color as hex, e.g. #1F4B3F'),
    force: z.boolean().optional()
      .describe('Replace an existing design system. Rewrites palette, type, and scales.')
  },
  async ({ dir, brief, choice, accent, force }) => {
    try {
      // Built conditionally: under exactOptionalPropertyTypes an explicit
      // undefined is not the same as an omitted key.
      const opts: { choice?: number; accent?: string; force?: boolean } = {}
      if (choice !== undefined) opts.choice = choice
      if (accent !== undefined) opts.accent = accent
      if (force !== undefined) opts.force = force
      return asText(await systemBootstrap(dir, brief, opts))
    } catch (err) {
      return asText({ error: (err as Error).message })
    }
  }
)

await server.connect(new StdioServerTransport())

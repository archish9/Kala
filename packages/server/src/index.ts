#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { systemStatus } from './tools/system-status.js'
import { verify } from './tools/verify.js'
import { explain } from './tools/explain.js'
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

await server.connect(new StdioServerTransport())

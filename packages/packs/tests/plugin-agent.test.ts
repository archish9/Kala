import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..', '..')

const registeredTools = async (): Promise<string[]> => {
  const src = await readFile(join(ROOT, 'packages/server/src/index.ts'), 'utf8')
  return [...src.matchAll(/^server\.tool\(\n\s*'([a-z_]+)'/gm)].map((m) => m[1]!)
}

const agentAllowlist = async (): Promise<string[]> => {
  const text = await readFile(join(ROOT, '.claude/agents/kala.md'), 'utf8')
  const line = text.split('\n').find((l) => l.startsWith('tools:'))
  if (!line) throw new Error('the kala agent has no tools: frontmatter')
  return line.slice('tools:'.length).split(',').map((t) => t.trim())
}

describe('the /kala subagent allowlist', () => {
  // A plugin-installed server is exposed as mcp__plugin_<plugin>_<server>__<tool>; the
  // same server from a hand-written .mcp.json is mcp__<server>__<tool>. Only one set
  // resolves per session and unmatched names are dropped silently, so both must be
  // listed or the subagent runs with no kala tools at all and never says so.
  it('lists every registered tool under both the plugin and plain naming schemes', async () => {
    const tools = await registeredTools()
    const allowed = new Set(await agentAllowlist())
    expect(tools.length).toBe(8)
    for (const tool of tools) {
      expect(allowed).toContain(`mcp__plugin_kala_kala__${tool}`)
      expect(allowed).toContain(`mcp__kala__${tool}`)
    }
  })

  it('excludes every other MCP server', async () => {
    const foreign = (await agentAllowlist()).filter(
      (t) => t.startsWith('mcp__') && !/^mcp__(plugin_kala_kala|kala)__/.test(t)
    )
    expect(foreign).toEqual([])
  })

  it('keeps the plugin manifest server name the allowlist is derived from', async () => {
    const manifest = JSON.parse(
      await readFile(join(ROOT, '.claude-plugin/plugin.json'), 'utf8')
    )
    expect(manifest.name).toBe('kala')
    expect(Object.keys(manifest.mcpServers)).toEqual(['kala'])
  })

  // Playwright is an optional peer, so npm never installs it beside the bundle on its
  // own, and the bundle resolves a bare import from the npx cache rather than from the
  // user's project. Without the second -p, inspect and critique report
  // BROWSER_UNAVAILABLE however many times Chromium is downloaded.
  it('declares the server so Playwright lands in the same npx cache as the bundle', async () => {
    const manifest = JSON.parse(
      await readFile(join(ROOT, '.claude-plugin/plugin.json'), 'utf8')
    )
    const { command, args } = manifest.mcpServers.kala
    expect(command).toBe('npx')
    expect(args).toEqual(['-y', '-p', 'kala-mcp', '-p', 'playwright', 'kala-mcp'])
  })
})

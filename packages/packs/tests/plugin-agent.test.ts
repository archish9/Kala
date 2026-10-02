import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..', '..')

const registeredTools = async (): Promise<string[]> => {
  const src = await readFile(join(ROOT, 'packages/server/src/index.ts'), 'utf8')
  return [...src.matchAll(/^server\.tool\(\n\s*'([a-z_]+)'/gm)].map((m) => m[1]!)
}

// The agent ships as two files. The plugin loads PLUGIN_AGENT; MANUAL_AGENT is the one a
// non-plugin user copies into their own project, and the one this repo itself runs.
const PLUGIN_AGENT = 'agents/kala.md'
const MANUAL_AGENT = '.claude/agents/kala.md'

const agentAllowlist = async (path: string): Promise<string[]> => {
  const text = await readFile(join(ROOT, path), 'utf8')
  const line = text.split('\n').find((l) => l.startsWith('tools:'))
  if (!line) throw new Error(`${path} has no tools: frontmatter`)
  return line.slice('tools:'.length).split(',').map((t) => t.trim())
}

const withoutAllowlist = async (path: string): Promise<string> => {
  const text = await readFile(join(ROOT, path), 'utf8')
  return text.split('\n').filter((l) => !l.startsWith('tools:')).join('\n')
}

describe('the /kala subagent allowlist', () => {
  // A plugin-installed server is exposed as mcp__plugin_<plugin>_<server>__<tool>; the
  // same server from a hand-written .mcp.json is mcp__<server>__<tool>. Only one set
  // resolves per session and unmatched names are dropped silently, so the hand-copied
  // agent lists both or it runs with no kala tools at all and never says so.
  it('lists every registered tool under both naming schemes in the hand-copied agent', async () => {
    const tools = await registeredTools()
    const allowed = new Set(await agentAllowlist(MANUAL_AGENT))
    expect(tools.length).toBe(8)
    for (const tool of tools) {
      expect(allowed).toContain(`mcp__plugin_kala_kala__${tool}`)
      expect(allowed).toContain(`mcp__kala__${tool}`)
    }
  })

  // The Claude plugin directory's validator rejects an MCP tool name in a plugin's agent
  // that lacks the plugin scope, and inside a plugin the plain names never resolve anyway.
  it('lists every registered tool under the plugin scheme only in the plugin agent', async () => {
    const tools = await registeredTools()
    const allowed = await agentAllowlist(PLUGIN_AGENT)
    const mcp = allowed.filter((t) => t.startsWith('mcp__'))
    expect(mcp.sort()).toEqual(tools.map((t) => `mcp__plugin_kala_kala__${t}`).sort())
  })

  it('keeps the two agent files identical apart from the allowlist', async () => {
    expect(await withoutAllowlist(PLUGIN_AGENT)).toBe(await withoutAllowlist(MANUAL_AGENT))
    const core = (list: string[]) => list.filter((t) => !t.startsWith('mcp__'))
    expect(core(await agentAllowlist(PLUGIN_AGENT))).toEqual(
      core(await agentAllowlist(MANUAL_AGENT))
    )
  })

  it('excludes every other MCP server', async () => {
    for (const path of [PLUGIN_AGENT, MANUAL_AGENT]) {
      const foreign = (await agentAllowlist(path)).filter(
        (t) => t.startsWith('mcp__') && !/^mcp__(plugin_kala_kala|kala)__/.test(t)
      )
      expect(foreign).toEqual([])
    }
  })

  it('keeps the plugin manifest server name the allowlist is derived from', async () => {
    const manifest = JSON.parse(
      await readFile(join(ROOT, '.claude-plugin/plugin.json'), 'utf8')
    )
    expect(manifest.name).toBe('kala')
    expect(Object.keys(manifest.mcpServers)).toEqual(['kala'])
    expect(manifest.agents).toEqual([`./${PLUGIN_AGENT}`])
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
    expect(args).toEqual([
      '-y',
      '-p',
      expect.stringMatching(/^kala-mcp@/),
      '-p',
      expect.stringMatching(/^playwright@/),
      'kala-mcp'
    ])
  })

  // The Claude plugin directory blocks a launcher that fetches a floating version, so
  // every -p package carries an exact one. The kala-mcp pin has to move with each release:
  // left behind, an updated plugin keeps launching the previous server.
  it('pins every fetched package exactly, and kala-mcp to the released version', async () => {
    const manifest = JSON.parse(
      await readFile(join(ROOT, '.claude-plugin/plugin.json'), 'utf8')
    )
    const server = JSON.parse(
      await readFile(join(ROOT, 'packages/server/package.json'), 'utf8')
    )
    const args: string[] = manifest.mcpServers.kala.args
    const fetched = args.filter((_, i) => args[i - 1] === '-p')
    for (const spec of fetched) expect(spec).toMatch(/^[a-z-]+@\d+\.\d+\.\d+$/)
    expect(manifest.version).toBe(server.version)
    expect(fetched[0]).toBe(`kala-mcp@${server.version}`)
  })
})

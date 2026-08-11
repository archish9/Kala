import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const BIN = resolve(import.meta.dirname, '..', 'dist', 'src', 'index.js')
const PROJECT = join(import.meta.dirname, 'fixtures', 'project')

/**
 * Exercises the shipped artifact, not the sources. Two real bugs — a bin
 * pointing at TypeScript node cannot load, and a pack path computed relative to
 * the consumer — were invisible to every source-level test because vitest
 * aliases packages back to src.
 */
const rpc = (lines: string[]): Promise<string> => new Promise((res, rej) => {
  const p = spawn('node', [BIN], { stdio: ['pipe', 'pipe', 'pipe'] })
  let out = '', err = ''
  p.stdout.on('data', d => { out += d })
  p.stderr.on('data', d => { err += d })
  p.on('error', rej)
  p.on('close', code => code === 0 || out ? res(out) : rej(new Error(err)))
  for (const l of lines) p.stdin.write(l + '\n')
  setTimeout(() => p.kill(), 4000)
})

const INIT = JSON.stringify({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: {
    protocolVersion: '2024-11-05', capabilities: {},
    clientInfo: { name: 'test', version: '1' }
  }
})
const READY = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })

describe.skipIf(!existsSync(BIN))('built binary', () => {
  it('completes an MCP handshake and lists all four tools', async () => {
    const out = await rpc([
      INIT, READY,
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    ])
    const listed = out.trim().split('\n').map(l => JSON.parse(l))
      .find(m => m.id === 2)
    expect(listed.result.tools.map((t: { name: string }) => t.name).sort())
      .toEqual(['explain', 'system_bootstrap', 'system_status', 'verify'])
  }, 15000)

  it('proposes design systems through the shipped binary', async () => {
    const out = await rpc([
      INIT, READY,
      JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: {
          name: 'system_bootstrap',
          arguments: { dir: PROJECT, brief: 'invoicing tool for freelancers' }
        }
      })
    ])
    const call = out.trim().split('\n').map(l => JSON.parse(l)).find(m => m.id === 2)
    const payload = JSON.parse(call.result.content[0].text)
    expect(payload.error).toBeUndefined()
    expect(payload.mode).toBe('proposed')
    expect(payload.proposals).toHaveLength(3)
  }, 15000)

  it('runs verify against a real project and finds the seeded violations', async () => {
    const out = await rpc([
      INIT, READY,
      JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: {
          name: 'verify',
          arguments: { dir: PROJECT, paths: ['src/app/settings/page.tsx'] }
        }
      })
    ])
    const call = out.trim().split('\n').map(l => JSON.parse(l)).find(m => m.id === 2)
    const payload = JSON.parse(call.result.content[0].text)
    expect(payload.error).toBeUndefined()
    expect(payload.findings.map((f: { rule: string }) => f.rule))
      .toContain('text-contrast')
  }, 15000)
})

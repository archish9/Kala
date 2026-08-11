import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { guide } from '../src/tools/guide.js'
import { systemBootstrap } from '../src/tools/system-bootstrap.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'guide-')) })

describe('guide', () => {
  it('returns the playbook for a known action', async () => {
    const r = await guide(dir, 'bolder')
    expect(r.action).toBe('bolder')
    expect(r.moves.length).toBeGreaterThanOrEqual(3)
    expect(r.avoid.length).toBeGreaterThanOrEqual(1)
  })

  it('degrades rather than throwing on an unknown action', async () => {
    const r = await guide(dir, 'sparkle')
    expect(r.degraded.some(d => d.code === 'GUIDE_UNKNOWN')).toBe(true)
    expect(r.moves).toEqual([])
  })

  it('lists the known actions when it cannot match one', async () => {
    const r = await guide(dir, 'sparkle')
    expect(r.degraded.find(d => d.code === 'GUIDE_UNKNOWN')!.detail).toContain('bolder')
  })

  it('reports no system on a project without one', async () => {
    const r = await guide(dir, 'bolder')
    expect(r.system).toBeNull()
    expect(r.available).toEqual({})
  })

  it('quotes the project type scale back for a type-using action', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1 })
    const r = await guide(dir, 'bolder')
    expect(r.system).not.toBeNull()
    expect(Array.isArray(r.available.type)).toBe(true)
    expect((r.available.type as number[]).length).toBeGreaterThan(4)
  })

  it('only returns the token groups the playbook declares', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1 })
    const animate = await guide(dir, 'animate')
    expect(Object.keys(animate.available)).toEqual(['motion'])
    const layout = await guide(dir, 'layout')
    expect(Object.keys(layout.available)).toEqual(['space'])
  })

  it('carries the system signature and bans so guidance stays in-system', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1 })
    const r = await guide(dir, 'bolder')
    expect(r.signature.length).toBeGreaterThanOrEqual(3)
    expect(r.banned.length).toBeGreaterThanOrEqual(1)
  })

  it('returns different grounding for two different projects', async () => {
    const a = await mkdtemp(join(tmpdir(), 'ga-'))
    const b = await mkdtemp(join(tmpdir(), 'gb-'))
    await systemBootstrap(a, 'dense analytics dashboard', { choice: 1 })
    await systemBootstrap(b, 'playful game for kids', { choice: 1 })
    const ra = await guide(a, 'bolder')
    const rb = await guide(b, 'bolder')
    expect(ra.system).not.toBe(rb.system)
    expect(ra.signature).not.toEqual(rb.signature)
  })

  it('accepts an optional target without changing the contract', async () => {
    const r = await guide(dir, 'bolder', 'src/pages/Pricing.tsx')
    expect(r.action).toBe('bolder')
  })

  it('is read-only', async () => {
    await guide(dir, 'bolder')
    expect(await readdir(dir)).toEqual([])
  })
})

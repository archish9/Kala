import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { surfaceBrief } from '../src/tools/surface-brief.js'
import { systemBootstrap } from '../src/tools/system-bootstrap.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'brief-')) })

describe('surface_brief', () => {
  it('returns the requirements for a known surface', async () => {
    const r = await surfaceBrief(dir, 'settings')
    expect(r.surface).toBe('settings')
    expect(r.requiredStates).toContain('error')
    expect(r.requirements.length).toBeGreaterThanOrEqual(3)
    expect(r.antiPatterns.length).toBeGreaterThanOrEqual(1)
  })

  it('resolves an alias to its surface', async () => {
    expect((await surfaceBrief(dir, 'sign-in')).surface).toBe('auth')
  })

  it('resolves a route path to its surface', async () => {
    expect((await surfaceBrief(dir, 'src/app/settings/page.tsx')).surface).toBe('settings')
  })

  it('degrades rather than throwing on an unknown surface', async () => {
    const r = await surfaceBrief(dir, 'wormhole')
    expect(r.surface).toBeNull()
    expect(r.degraded.some(d => d.code === 'SURFACE_UNKNOWN')).toBe(true)
    expect(r.requirements).toEqual([])
  })

  it('lists the known surfaces when it cannot match one', async () => {
    const r = await surfaceBrief(dir, 'wormhole')
    const detail = r.degraded.find(d => d.code === 'SURFACE_UNKNOWN')!.detail
    expect(detail).toContain('settings')
  })

  it('reports no system on a project with no design system', async () => {
    const r = await surfaceBrief(dir, 'settings')
    expect(r.system).toBeNull()
    expect(r.tokens).toBeNull()
    expect(r.degraded.some(d => d.code === 'NO_DESIGN_SOURCE')).toBe(true)
  })

  it('grounds the brief in the project system once bootstrapped', async () => {
    await systemBootstrap(dir, 'settings for a banking portal', { choice: 1 })
    const r = await surfaceBrief(dir, 'settings')
    expect(r.system).not.toBeNull()
    expect(r.system!.signature.length).toBeGreaterThanOrEqual(3)
    expect(r.system!.banned.length).toBeGreaterThanOrEqual(1)
    expect(r.tokens!.space.length).toBeGreaterThan(4)
    expect(r.tokens!.typeSteps.length).toBeGreaterThan(4)
  })

  it('is read-only', async () => {
    await surfaceBrief(dir, 'settings')
    expect(await readdir(dir)).toEqual([])
  })
})

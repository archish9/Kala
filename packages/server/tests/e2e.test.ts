import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { systemStatus } from '../src/tools/system-status.js'
import { verify } from '../src/tools/verify.js'

const PROJECT = join(import.meta.dirname, 'fixtures', 'project')

describe('end to end', () => {
  it('derives the system from the fixture project', async () => {
    const s = await systemStatus(PROJECT)
    expect(s.hasLock).toBe(true)
    expect(s.space).toEqual([4, 8, 12, 16, 24, 32])
    expect(s.typeSteps).toEqual([14, 16, 20, 30])
    expect(s.components).toContain('Button')
  })

  it('finds the seeded violations on the settings page', async () => {
    const r = await verify(PROJECT, ['src/app/settings/page.tsx'])
    const ids = r.findings.map(f => f.rule)
    expect(ids).toContain('type-off-scale')  // text-[31px]
    expect(ids).toContain('text-contrast')   // gray-400 on white is 2.8:1
    expect(ids).toContain('nested-card')     // card inside card
  })

  it('attaches the surface id to aggregate findings', async () => {
    const r = await verify(PROJECT, ['src/app/settings/page.tsx'])
    const agg = r.findings.find(f => f.surface !== undefined)
    if (agg) expect(agg.surface).toBe('settings')
  })

  it('reports no degradation on a clean file', async () => {
    const r = await verify(PROJECT, ['src/ui/Button.tsx'])
    expect(r.degraded).toEqual([])
  })
})

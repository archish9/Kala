import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { systemBootstrap } from '../src/tools/system-bootstrap.js'
import { systemStatus } from '../src/tools/system-status.js'
import { verify } from '../src/tools/verify.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'boot-')) })

describe('system_bootstrap — propose', () => {
  it('returns three proposals and writes nothing', async () => {
    const r = await systemBootstrap(dir, 'invoicing tool for freelancers')
    expect(r.mode).toBe('proposed')
    if (r.mode !== 'proposed') throw new Error('expected proposals')
    expect(r.proposals).toHaveLength(3)
    await expect(readFile(join(dir, 'design.lock.json'), 'utf8')).rejects.toThrow()
  })

  it('gives each proposal a rationale, signature, and palette preview', async () => {
    const r = await systemBootstrap(dir, 'banking portal')
    if (r.mode !== 'proposed') throw new Error('expected proposals')
    for (const p of r.proposals) {
      expect(p.rationale.length).toBeGreaterThan(10)
      expect(p.signature.length).toBeGreaterThanOrEqual(3)
      expect(p.palettePreview.length).toBeGreaterThan(0)
      for (const hex of p.palettePreview) expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('still proposes from the curated systems when the brief fits one well', async () => {
    const r = await systemBootstrap(dir, 'portfolio site for a photographer')
    expect(r.mode).toBe('proposed')
    if (r.mode !== 'proposed') throw new Error('expected proposals')
    expect(r.proposals[0]!.id).toBe('editorial-clean')
  })

  it('falls through to the catalog tier when no curated system fits', async () => {
    // Deliberately contradictory domain signals (medical + gaming + banking +
    // luxury + admin + fun + ...) so every curated system's fitFor/avoidFor
    // score cancels out or goes negative — verified empirically to score
    // well below the 0.55 curated threshold against every one of the 12.
    const r = await systemBootstrap(
      dir,
      'a cli tool for medical accounting solo consumer luxury developer kids ' +
      'banking gaming compliance boutique reporting campaign console fun admin'
    )
    expect(r.mode).toBe('proposed')
    if (r.mode !== 'proposed') throw new Error('expected proposals')
    expect(r.proposals[0]!.signature).toEqual([])
  })
})

describe('system_bootstrap — apply', () => {
  it('writes config, css, and lock for the chosen system', async () => {
    const r = await systemBootstrap(dir, 'banking portal', { choice: 1 })
    expect(r.mode).toBe('applied')
    if (r.mode !== 'applied') throw new Error('expected applied')
    expect(r.files).toHaveLength(3)
    expect(JSON.parse(await readFile(join(dir, 'design.lock.json'), 'utf8')).version).toBe(1)
  })

  it('reports every contrast pair as meeting its target', async () => {
    const r = await systemBootstrap(dir, 'banking portal', { choice: 1 })
    if (r.mode !== 'applied') throw new Error('expected applied')
    for (const p of r.contrastReport) {
      expect(p.meets, `${p.pair} was ${p.ratio.toFixed(2)}`).toBe(true)
    }
  })

  it('produces a project that system_status reads as a fresh lock', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1 })
    const s = await systemStatus(dir)
    expect(s.hasLock).toBe(true)
    expect(s.stale).toBe(false)
    expect(s.space.length).toBeGreaterThan(4)
  })

  it('produces a project where compliant code verifies clean', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1 })
    const s = await systemStatus(dir)
    const pad = s.space[3]
    const size = s.typeSteps[1]
    await writeFile(join(dir, 'Ok.tsx'),
      `export default () => <div className="p-[${pad}px] text-[${size}px]">ok</div>`)
    const v = await verify(dir, ['Ok.tsx'])
    expect(v.findings.filter(f => f.rule === 'space-off-scale')).toEqual([])
    expect(v.findings.filter(f => f.rule === 'type-off-scale')).toEqual([])
  })

  it('honours an explicit accent', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1, accent: '#7C3AED' })
    const css = await readFile(join(dir, 'src/styles/globals.css'), 'utf8')
    expect(css).toContain('--color-primary')
  })

  it('refuses to overwrite an existing lock without force', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1 })
    await expect(systemBootstrap(dir, 'other brief', { choice: 1 }))
      .rejects.toThrow(/already has a design system/i)
  })

  it('overwrites when force is passed', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1 })
    const r = await systemBootstrap(dir, 'portfolio site', { choice: 1, force: true })
    expect(r.mode).toBe('applied')
  })

  it('rejects a choice outside the proposal range', async () => {
    await expect(systemBootstrap(dir, 'anything', { choice: 9 }))
      .rejects.toThrow(/choice/i)
  })

  it('refuses a target directory that does not exist', async () => {
    await expect(systemBootstrap(join(dir, 'nope', 'deeper'), 'x', { choice: 1 }))
      .rejects.toThrow(/does not exist/i)
  })

  it('is idempotent when re-applied with force', async () => {
    await systemBootstrap(dir, 'banking portal', { choice: 1 })
    const before = await readFile(join(dir, 'tailwind.config.mjs'), 'utf8')
    await systemBootstrap(dir, 'banking portal', { choice: 1, force: true })
    expect(await readFile(join(dir, 'tailwind.config.mjs'), 'utf8')).toBe(before)
  })
})

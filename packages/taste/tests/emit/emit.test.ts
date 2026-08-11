import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emitAll } from '../../src/emit/lock.js'
import { composeSystem } from '../../src/compose.js'
import { loadSystems } from '../../src/load.js'
import { deriveLock } from '@fe-design/kernel/lock/derive.js'
import { SYSTEMS_DIR } from '@fe-design/packs'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'emit-proj-')) })

const compose = async (id = 'quiet-precision') => {
  const { systems } = await loadSystems(SYSTEMS_DIR)
  return composeSystem(systems.find(s => s.id === id)!, '#1F4B3F')
}

describe('emitAll', () => {
  it('writes all three artifacts', async () => {
    const { files } = await emitAll(dir, await compose())
    expect(files.some(f => f.endsWith('tailwind.config.mjs'))).toBe(true)
    expect(files.some(f => f.endsWith('globals.css'))).toBe(true)
    expect(files.some(f => f.endsWith('design.lock.json'))).toBe(true)
  })

  it('produces a config that Phase 1 deriveLock can read back', async () => {
    const t = await compose()
    await emitAll(dir, t)
    const { lock } = await deriveLock(dir)
    expect(lock).not.toBeNull()
    expect(lock!.derived.space).toEqual(t.space)
    expect(lock!.derived.type.steps).toEqual(t.type.steps)
  })

  it('round-trips the accent ramp into the derived palette', async () => {
    const t = await compose()
    await emitAll(dir, t)
    const { lock } = await deriveLock(dir)
    expect(Object.values(lock!.derived.color)).toContain(t.ramps.accent[500])
  })

  it('writes the intent zone with the system id and its bans', async () => {
    const t = await compose()
    await emitAll(dir, t)
    const parsed = JSON.parse(await readFile(join(dir, 'design.lock.json'), 'utf8'))
    expect(parsed.intent.system).toBe('quiet-precision')
    expect(parsed.intent.banned.patterns).toEqual(
      expect.arrayContaining(t.system.antiDefaults)
    )
    expect(parsed.intent.rationale.length).toBeGreaterThan(0)
  })

  it('bans overused fonts the system does not itself use', async () => {
    await emitAll(dir, await compose())
    const parsed = JSON.parse(await readFile(join(dir, 'design.lock.json'), 'utf8'))
    expect(parsed.intent.banned.fonts).toContain('Inter')
  })

  it('emits a dark block in css', async () => {
    await emitAll(dir, await compose())
    const css = await readFile(join(dir, 'src/styles/globals.css'), 'utf8')
    expect(css).toContain('prefers-color-scheme: dark')
    expect(css).toContain('--color-bg')
  })

  it('is idempotent: running twice leaves files byte-identical', async () => {
    const t = await compose()
    const paths = [
      join(dir, 'tailwind.config.mjs'),
      join(dir, 'src/styles/globals.css'),
      join(dir, 'design.lock.json')
    ]
    await emitAll(dir, t)
    const before = await Promise.all(paths.map(p => readFile(p, 'utf8')))
    await emitAll(dir, t)
    const after = await Promise.all(paths.map(p => readFile(p, 'utf8')))
    expect(after).toEqual(before)
  })
})

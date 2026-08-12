import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSurfaces, matchSurface } from '../src/surfaces.js'
import { SURFACES_DIR } from '@kala/packs'

const load = async () => (await loadSurfaces(SURFACES_DIR)).surfaces

describe('loadSurfaces', () => {
  it('loads all six shipped surfaces without degradation', async () => {
    const { surfaces, degraded } = await loadSurfaces(SURFACES_DIR)
    expect(degraded).toEqual([])
    expect(surfaces).toHaveLength(6)
  })

  it('gives every surface a purpose and at least three requirements', async () => {
    for (const s of await load()) {
      expect(s.purpose.length, `${s.id} purpose`).toBeGreaterThan(10)
      expect(s.requirements.length, `${s.id} requirements`).toBeGreaterThanOrEqual(3)
    }
  })

  it('gives every surface at least one anti-pattern', async () => {
    for (const s of await load()) {
      expect(s.antiPatterns.length, `${s.id}`).toBeGreaterThanOrEqual(1)
    }
  })

  it('only uses state names the extractor can infer', async () => {
    const known = ['loading', 'error', 'empty', 'success', 'disabled', 'permission']
    for (const s of await load()) {
      for (const st of s.requiredStates) {
        expect(known, `${s.id} requires unknown state ${st}`).toContain(st)
      }
    }
  })

  it('rejects a surface missing required fields, keeping the rest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'surf-'))
    await writeFile(join(dir, 'bad.json'), JSON.stringify({ id: 'bad' }))
    await writeFile(join(dir, 'ok.json'), JSON.stringify({
      id: 'ok', aliases: [], purpose: 'a purpose long enough',
      requiredStates: ['error'], requirements: ['a', 'b', 'c'],
      antiPatterns: ['x'], primaryAction: null
    }))
    const { surfaces, degraded } = await loadSurfaces(dir)
    expect(surfaces.map(s => s.id)).toEqual(['ok'])
    expect(degraded.some(d => d.code === 'SURFACE_INVALID')).toBe(true)
  })

  it('survives a malformed surface file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'surf-'))
    await writeFile(join(dir, 'broken.json'), '{ not json')
    const { surfaces, degraded } = await loadSurfaces(dir)
    expect(surfaces).toEqual([])
    expect(degraded.some(d => d.code === 'SURFACE_PARSE_FAILED')).toBe(true)
  })
})

describe('matchSurface', () => {
  it('matches on the exact id', async () => {
    expect(matchSurface('settings', await load())?.id).toBe('settings')
  })

  it('matches case-insensitively', async () => {
    expect(matchSurface('Settings', await load())?.id).toBe('settings')
  })

  it('matches on an alias', async () => {
    expect(matchSurface('sign-in', await load())?.id).toBe('auth')
  })

  it('matches a route-like path by its last segment', async () => {
    expect(matchSurface('src/app/settings/page.tsx', await load())?.id).toBe('settings')
  })

  it('returns null for something it does not know', async () => {
    expect(matchSurface('wormhole', await load())).toBeNull()
  })
})

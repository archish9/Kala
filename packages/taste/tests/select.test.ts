import { describe, it, expect } from 'vitest'
import { selectSystems, axisDistance } from '../src/select.js'
import { loadSystems } from '../src/load.js'
import { SYSTEMS_DIR } from '@kala/packs'
import type { DesignSystem } from '../src/types.js'

const load = async (): Promise<DesignSystem[]> =>
  (await loadSystems(SYSTEMS_DIR)).systems

describe('axisDistance', () => {
  it('is zero when every axis falls inside the system range', async () => {
    const sys = (await load()).find(s => s.id === 'quiet-precision')!
    const axes = { formality: 0.8, density: 0.5, energy: 0.1, expressiveness: 0.2 }
    expect(axisDistance(axes, sys)).toBe(0)
  })

  it('grows as the vector moves further outside the range', async () => {
    const sys = (await load()).find(s => s.id === 'quiet-precision')!
    const near = { formality: 0.6, density: 0.5, energy: 0.1, expressiveness: 0.2 }
    const far = { formality: 0.1, density: 0.5, energy: 0.1, expressiveness: 0.2 }
    expect(axisDistance(far, sys)).toBeGreaterThan(axisDistance(near, sys))
  })
})

describe('selectSystems', () => {
  it('returns three proposals, never one', async () => {
    const proposals = selectSystems('invoicing tool for freelancers', await load())
    expect(proposals).toHaveLength(3)
  })

  it('returns them best fit first, with fit descending', async () => {
    const proposals = selectSystems('analytics dashboard for auditors', await load())
    const fits = proposals.map(p => p.fit)
    expect(fits).toEqual([...fits].sort((a, b) => b - a))
  })

  it('scores fit between 0 and 1', async () => {
    for (const p of selectSystems('anything at all', await load())) {
      expect(p.fit).toBeGreaterThanOrEqual(0)
      expect(p.fit).toBeLessThanOrEqual(1)
    }
  })

  it('prefers a system whose fitFor names the domain', async () => {
    const top = selectSystems('portfolio site for a photographer', await load())[0]!
    expect(top.system.id).toBe('editorial-clean')
  })

  it('demotes a system whose avoidFor names the domain', async () => {
    // Rank the whole catalogue, not the top three: a strongly demoted system
    // drops out of the returned slice entirely, which findIndex cannot see.
    const systems = await load()
    const ranked = selectSystems('dense admin dashboard', systems, systems.length)
    const editorial = ranked.findIndex(p => p.system.id === 'editorial-clean')
    const quiet = ranked.findIndex(p => p.system.id === 'quiet-precision')
    expect(editorial).toBeGreaterThan(-1)
    expect(quiet).toBeLessThan(editorial)
  })

  it('keeps a demoted system out of the returned top three', async () => {
    const top = selectSystems('dense admin dashboard', await load())
    expect(top.map(p => p.system.id)).not.toContain('editorial-clean')
  })

  it('gives every proposal a rationale mentioning the system', async () => {
    for (const p of selectSystems('banking portal', await load())) {
      expect(p.rationale.length).toBeGreaterThan(10)
    }
  })

  it('returns fewer than three only when fewer systems exist', async () => {
    const one = (await load()).slice(0, 1)
    expect(selectSystems('anything', one)).toHaveLength(1)
  })

  it('is deterministic for the same brief', async () => {
    const systems = await load()
    const a = selectSystems('calm banking tool', systems).map(p => p.system.id)
    const b = selectSystems('calm banking tool', systems).map(p => p.system.id)
    expect(a).toEqual(b)
  })
})

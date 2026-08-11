import { describe, it, expect } from 'vitest'
import { briefToAxes } from '../src/axes.js'

describe('briefToAxes', () => {
  it('returns a neutral vector for an empty brief', () => {
    const { axes } = briefToAxes('')
    expect(axes).toEqual({ formality: 0.5, density: 0.5, energy: 0.5, expressiveness: 0.5 })
  })

  it('raises formality for regulated, serious domains', () => {
    const { axes } = briefToAxes('banking compliance portal for auditors')
    expect(axes.formality).toBeGreaterThan(0.7)
  })

  it('lowers formality and raises energy for playful products', () => {
    const { axes } = briefToAxes('playful game for kids with fun rewards')
    expect(axes.formality).toBeLessThan(0.4)
    expect(axes.energy).toBeGreaterThan(0.7)
  })

  it('raises density for data-heavy products', () => {
    const { axes } = briefToAxes('analytics dashboard with dense data tables')
    expect(axes.density).toBeGreaterThan(0.7)
  })

  it('raises expressiveness for portfolio and editorial work', () => {
    const { axes } = briefToAxes('portfolio site for a photographer')
    expect(axes.expressiveness).toBeGreaterThan(0.65)
  })

  it('keeps every axis within 0..1 no matter how many keywords hit', () => {
    const { axes } = briefToAxes(
      'bank compliance audit enterprise regulated legal formal institutional serious'
    )
    for (const v of Object.values(axes)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('reports which keywords it matched', () => {
    const { matched } = briefToAxes('invoicing tool for freelancers, trustworthy not corporate')
    expect(matched).toContain('invoicing')
    expect(matched.length).toBeGreaterThan(0)
  })

  it('matches whole words only, so "gaming" does not fire on "imagining"', () => {
    expect(briefToAxes('imagining a calm tool').matched).not.toContain('gaming')
  })
})

import { describe, it, expect } from 'vitest'
import { runChecks } from '../src/inspect.js'
import type { BrowserNode, PageFacts } from '../src/facts.js'

const node = (over: Partial<BrowserNode>): BrowserNode => ({
  id: 'b0', tag: 'p', selector: 'p', text: 'hi',
  color: 'rgb(17,24,39)', bg: 'rgb(255,255,255)', bgResolved: true,
  fontSize: 16, fontWeight: 400,
  rect: { x: 0, y: 0, w: 100, h: 20 }, interactive: false,
  ...over
})

describe('runChecks', () => {
  it('returns nothing for a clean page', () => {
    const facts: PageFacts = {
      viewport: { width: 375, height: 812 }, scrollWidth: 375, nodes: [node({})]
    }
    expect(runChecks(facts)).toEqual([])
  })

  it('combines findings from every check', () => {
    const facts: PageFacts = {
      viewport: { width: 375, height: 812 },
      scrollWidth: 900,
      nodes: [
        node({ id: 'b0', color: 'rgb(156,163,175)' }),
        node({
          id: 'b1', tag: 'button', selector: 'button', interactive: true,
          rect: { x: 0, y: 0, w: 20, h: 20 }
        })
      ]
    }
    const rules = runChecks(facts).map(f => f.rule)
    expect(rules).toContain('computed-contrast')
    expect(rules).toContain('horizontal-overflow')
    expect(rules).toContain('small-touch-target')
  })

  it('orders errors before warnings and warnings before info', () => {
    const facts: PageFacts = {
      viewport: { width: 375, height: 812 },
      scrollWidth: 900,
      nodes: [
        node({ id: 'b0', bgResolved: false }),
        node({
          id: 'b1', tag: 'button', selector: 'button', interactive: true,
          rect: { x: 0, y: 0, w: 20, h: 20 }
        })
      ]
    }
    const sevs = runChecks(facts).map(f => f.sev)
    const rank = { error: 0, warn: 1, info: 2 } as const
    const ranks = sevs.map(s => rank[s])
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })
})

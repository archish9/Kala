import { describe, it, expect } from 'vitest'
import { collectFacts } from '../src/collect.js'
import type { PageFacts, PageLike, Viewport } from '../src/facts.js'

/** A fake page: no browser, but the same contract collectFacts consumes. */
const fakePage = (facts: Omit<PageFacts, 'viewport'>): PageLike => ({
  goto: async () => null,
  setContent: async () => undefined,
  evaluate: async <T>() => facts as unknown as T,
  screenshot: async () => Buffer.from(''),
  close: async () => undefined
})

const viewport: Viewport = { width: 375, height: 812 }

describe('collectFacts', () => {
  it('stamps the viewport it was given onto the result', async () => {
    const facts = await collectFacts(fakePage({ scrollWidth: 375, nodes: [] }), viewport)
    expect(facts.viewport).toEqual(viewport)
  })

  it('passes through the collected nodes and scroll width', async () => {
    const node = {
      id: 'b0', tag: 'p', selector: 'p', text: 'hi',
      color: 'rgb(0, 0, 0)', bg: 'rgb(255, 255, 255)', bgResolved: true,
      fontSize: 16, fontWeight: 400,
      rect: { x: 0, y: 0, w: 100, h: 20 }, interactive: false
    }
    const facts = await collectFacts(fakePage({ scrollWidth: 924, nodes: [node] }), viewport)
    expect(facts.scrollWidth).toBe(924)
    expect(facts.nodes).toEqual([node])
  })

  it('returns an empty node list rather than throwing on an empty page', async () => {
    const facts = await collectFacts(fakePage({ scrollWidth: 0, nodes: [] }), viewport)
    expect(facts.nodes).toEqual([])
  })
})

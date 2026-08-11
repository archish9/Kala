import { describe, it, expect } from 'vitest'
import { checkOverflow } from '../../src/checks/overflow.js'
import type { BrowserNode, PageFacts } from '../../src/facts.js'

const node = (over: Partial<BrowserNode>): BrowserNode => ({
  id: 'b0', tag: 'div', selector: 'div', text: null,
  color: 'rgb(0,0,0)', bg: 'rgb(255,255,255)', bgResolved: true,
  fontSize: 16, fontWeight: 400,
  rect: { x: 0, y: 0, w: 300, h: 20 }, interactive: false,
  ...over
})

const facts = (scrollWidth: number, nodes: BrowserNode[]): PageFacts => ({
  viewport: { width: 375, height: 812 }, scrollWidth, nodes
})

describe('checkOverflow', () => {
  it('reports nothing when the page fits', () => {
    expect(checkOverflow(facts(375, [node({})]))).toEqual([])
  })

  it('reports horizontal overflow', () => {
    const out = checkOverflow(facts(924, [node({})]))
    expect(out.some(f => f.rule === 'horizontal-overflow')).toBe(true)
  })

  it('names the widest offending element', () => {
    const out = checkOverflow(facts(924, [
      node({ id: 'b0', selector: 'div.narrow', rect: { x: 0, y: 0, w: 300, h: 20 } }),
      node({ id: 'b1', selector: 'nav.wide', rect: { x: 24, y: 0, w: 900, h: 20 } })
    ]))
    expect(out.some(f => f.selector === 'nav.wide')).toBe(true)
  })

  it('tolerates a one pixel rounding difference', () => {
    expect(checkOverflow(facts(376, [node({})]))).toEqual([])
  })

  it('stamps the viewport on the finding', () => {
    expect(checkOverflow(facts(924, [node({})]))[0]!.viewport).toBe('375x812')
  })

  it('reports the page-level overflow once, not per element', () => {
    const out = checkOverflow(facts(924, [
      node({ id: 'b0', rect: { x: 0, y: 0, w: 900, h: 20 } }),
      node({ id: 'b1', rect: { x: 0, y: 0, w: 800, h: 20 } })
    ]))
    expect(out.filter(f => f.rule === 'horizontal-overflow')).toHaveLength(1)
  })
})

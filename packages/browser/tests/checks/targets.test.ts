import { describe, it, expect } from 'vitest'
import { checkTargets, MIN_TARGET_PX } from '../../src/checks/targets.js'
import type { BrowserNode, PageFacts } from '../../src/facts.js'

const node = (over: Partial<BrowserNode>): BrowserNode => ({
  id: 'b0', tag: 'button', selector: 'button', text: 'x',
  color: 'rgb(0,0,0)', bg: 'rgb(255,255,255)', bgResolved: true,
  fontSize: 16, fontWeight: 400,
  rect: { x: 0, y: 0, w: 48, h: 48 }, interactive: true,
  ...over
})

const facts = (nodes: BrowserNode[], width = 375): PageFacts => ({
  viewport: { width, height: 812 }, scrollWidth: width, nodes
})

describe('checkTargets', () => {
  it('reports nothing for a large enough control', () => {
    expect(checkTargets(facts([node({})]))).toEqual([])
  })

  it('reports an undersized interactive control', () => {
    const out = checkTargets(facts([node({ rect: { x: 0, y: 0, w: 20, h: 20 } })]))
    expect(out).toHaveLength(1)
    expect(out[0]!.rule).toBe('small-touch-target')
  })

  it('states both the measured size and the minimum', () => {
    const out = checkTargets(facts([node({ rect: { x: 0, y: 0, w: 20, h: 20 } })]))
    expect(out[0]!.msg).toContain('20')
    expect(out[0]!.msg).toContain(String(MIN_TARGET_PX))
  })

  it('ignores non-interactive elements', () => {
    expect(checkTargets(facts([
      node({ interactive: false, rect: { x: 0, y: 0, w: 10, h: 10 } })
    ]))).toEqual([])
  })

  it('ignores zero-sized controls, which are hidden rather than small', () => {
    expect(checkTargets(facts([node({ rect: { x: 0, y: 0, w: 0, h: 0 } })]))).toEqual([])
  })

  it('only applies at touch-sized viewports', () => {
    const small = node({ rect: { x: 0, y: 0, w: 20, h: 20 } })
    expect(checkTargets(facts([small], 375))).toHaveLength(1)
    expect(checkTargets(facts([small], 1440))).toEqual([])
  })

  it('fails when either dimension is short', () => {
    expect(checkTargets(facts([node({ rect: { x: 0, y: 0, w: 100, h: 20 } })])))
      .toHaveLength(1)
  })
})

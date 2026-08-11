import { describe, it, expect } from 'vitest'
import { checkContrast, LARGE_TEXT_PX } from '../../src/checks/contrast.js'
import type { BrowserNode, PageFacts } from '../../src/facts.js'

const node = (over: Partial<BrowserNode>): BrowserNode => ({
  id: 'b0', tag: 'p', selector: 'p', text: 'hello',
  color: 'rgb(17, 24, 39)', bg: 'rgb(255, 255, 255)', bgResolved: true,
  fontSize: 16, fontWeight: 400,
  rect: { x: 0, y: 0, w: 200, h: 20 }, interactive: false,
  ...over
})

const facts = (nodes: BrowserNode[]): PageFacts => ({
  viewport: { width: 375, height: 812 }, scrollWidth: 375, nodes
})

describe('checkContrast', () => {
  it('reports nothing for readable body text', () => {
    expect(checkContrast(facts([node({})]))).toEqual([])
  })

  it('reports faint text on white', () => {
    const out = checkContrast(facts([node({ color: 'rgb(156, 163, 175)' })]))
    expect(out).toHaveLength(1)
    expect(out[0]!.rule).toBe('computed-contrast')
    expect(out[0]!.sev).toBe('error')
  })

  it('names the element and the measured ratio', () => {
    const out = checkContrast(facts([
      node({ color: 'rgb(156, 163, 175)', selector: 'p.muted' })
    ]))
    expect(out[0]!.selector).toBe('p.muted')
    expect(out[0]!.msg).toMatch(/\d\.\d+:1/)
  })

  it('applies the relaxed large-text target', () => {
    // Verified 3.84:1 on white: fails at body size, passes as large text.
    const colour = 'rgb(130, 130, 130)'
    expect(checkContrast(facts([node({ color: colour, fontSize: 16 })])))
      .toHaveLength(1)
    expect(checkContrast(facts([node({ color: colour, fontSize: LARGE_TEXT_PX })])))
      .toEqual([])
  })

  it('treats bold 19px as large text', () => {
    const colour = 'rgb(130, 130, 130)'
    expect(checkContrast(facts([node({ color: colour, fontSize: 19, fontWeight: 700 })])))
      .toEqual([])
  })

  it('skips elements with no text', () => {
    expect(checkContrast(facts([node({ text: null, color: 'rgb(200,200,200)' })])))
      .toEqual([])
  })

  it('does not judge contrast when the background could not be resolved', () => {
    const out = checkContrast(facts([
      node({ color: 'rgb(200, 200, 200)', bgResolved: false })
    ]))
    expect(out.filter(f => f.rule === 'computed-contrast')).toEqual([])
  })

  it('reports an unresolved background as information, not as a failure', () => {
    const out = checkContrast(facts([
      node({ color: 'rgb(200, 200, 200)', bgResolved: false })
    ]))
    expect(out).toHaveLength(1)
    expect(out[0]!.rule).toBe('contrast-unresolved')
    expect(out[0]!.sev).toBe('info')
  })

  it('stamps the viewport on every finding', () => {
    const out = checkContrast(facts([node({ color: 'rgb(156, 163, 175)' })]))
    expect(out[0]!.viewport).toBe('375x812')
  })

  it('reports each failing element once', () => {
    const out = checkContrast(facts([
      node({ id: 'b0', color: 'rgb(156, 163, 175)' }),
      node({ id: 'b1', color: 'rgb(156, 163, 175)' })
    ]))
    expect(out).toHaveLength(2)
  })

  it('survives an unparseable colour rather than throwing', () => {
    expect(() => checkContrast(facts([node({ color: 'not-a-colour' })]))).not.toThrow()
  })
})

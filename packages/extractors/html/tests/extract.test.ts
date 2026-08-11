import { describe, it, expect } from 'vitest'
import { extractHtml } from '../src/index.js'
import { isKnown, isUnknown } from '@fe-design/kernel/ir/fact.js'

const h = (body: string) => extractHtml(body, 'page.html')

describe('extractHtml', () => {
  it('produces one node per element with parent links', () => {
    const doc = h(`<section class="bg-white p-6">
  <h2 class="text-2xl">Title</h2>
  <p class="text-base">Body</p>
</section>`)
    expect(doc.framework).toBe('html')
    expect(doc.nodes.map(n => n.name)).toEqual(['section', 'h2', 'p'])
    expect(doc.nodes[1]?.parent).toBe(doc.nodes[0]?.id)
    expect(doc.nodes[0]?.children).toHaveLength(2)
  })

  it('does not invent html, head, or body nodes for a fragment', () => {
    const doc = h('<div class="p-4">x</div>')
    expect(doc.nodes.map(n => n.name)).toEqual(['div'])
  })

  it('keeps the structural elements the source actually wrote', () => {
    const names = h('<html><body><div class="p-4">x</div></body></html>')
      .nodes.map(n => n.name)
    expect(names).toContain('html')
    expect(names).toContain('body')
    expect(names).toContain('div')
    expect(names).not.toContain('head')
  })

  it('resolves a static class through the Tailwind resolver', () => {
    const doc = h('<div class="p-6 bg-white"></div>')
    const d = doc.nodes[0]!
    if (!isKnown(d.style.space.padding)) throw new Error('expected known padding')
    expect(d.style.space.padding.value.top).toBe(24)
    if (isKnown(d.style.color.bg)) expect(d.style.color.bg.value.hex).toBe('#ffffff')
  })

  it('resolves an inline style attribute', () => {
    const doc = h('<div style="padding: 1rem; color: #111827"></div>')
    const d = doc.nodes[0]!
    if (isKnown(d.style.space.padding)) expect(d.style.space.padding.value.top).toBe(16)
    if (isKnown(d.style.color.fg)) expect(d.style.color.fg.value.hex).toBe('#111827')
  })

  it('applies a style element by class selector', () => {
    const doc = h('<style>.card { padding: 12px }</style><div class="card"></div>')
    const card = doc.nodes.find(n => n.name === 'div')!
    if (!isKnown(card.style.space.padding)) throw new Error('expected known padding')
    expect(card.style.space.padding.value.top).toBe(12)
  })

  it('marks a descendant-selector rule as unknown rather than applying it', () => {
    const doc = h('<style>.sidebar .card { padding: 99px }</style><div class="card"></div>')
    const card = doc.nodes.find(n => n.name === 'div')!
    expect(isUnknown(card.style.space.padding)).toBe(true)
  })

  it('lets an inline style win over a stylesheet rule', () => {
    const doc = h('<style>.card { padding: 32px }</style><div class="card" style="padding: 4px"></div>')
    const card = doc.nodes.find(n => n.name === 'div')!
    if (!isKnown(card.style.space.padding)) throw new Error('expected known padding')
    expect(card.style.space.padding.value.top).toBe(4)
  })

  it('records line numbers', () => {
    const doc = h('<div class="p-4">\n  <p class="text-lg">hi</p>\n</div>')
    expect(doc.nodes[0]?.loc.line).toBe(1)
    expect(doc.nodes[1]?.loc.line).toBe(2)
  })

  it('captures literal text children', () => {
    expect(h('<h2 class="text-2xl">Title</h2>').nodes[0]?.text).toBe('Title')
  })

  it('leaves an unstyled element fully absent', () => {
    expect(h('<div></div>').nodes[0]?.style.space.padding.state).toBe('absent')
  })

  it('does not emit a node for the style element itself', () => {
    const doc = h('<style>.a{color:red}</style><div class="a"></div>')
    expect(doc.nodes.map(n => n.name)).not.toContain('style')
  })
})

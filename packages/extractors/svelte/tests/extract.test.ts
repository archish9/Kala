import { describe, it, expect } from 'vitest'
import { extractSvelte } from '../src/index.js'
import { isKnown, isUnknown } from '@fe-design/kernel/ir/fact.js'

const sv = (body: string) => extractSvelte(body, 'Card.svelte')

describe('extractSvelte', () => {
  it('produces one node per element with parent links', () => {
    const doc = sv(`<section class="bg-white p-6">
  <h2 class="text-2xl">Title</h2>
  <p class="text-base">Body</p>
</section>`)
    expect(doc.framework).toBe('svelte')
    expect(doc.nodes.map(n => n.name)).toEqual(['section', 'h2', 'p'])
    expect(doc.nodes[1]?.parent).toBe(doc.nodes[0]?.id)
    expect(doc.nodes[0]?.children).toHaveLength(2)
  })

  it('resolves a static class through the Tailwind resolver', () => {
    const doc = sv('<div class="p-6 bg-white"/>')
    const d = doc.nodes[0]!
    if (!isKnown(d.style.space.padding)) throw new Error('expected known padding')
    expect(d.style.space.padding.value.top).toBe(24)
    if (isKnown(d.style.color.bg)) expect(d.style.color.bg.value.hex).toBe('#ffffff')
  })

  it('marks a dynamic class expression as unknown, not absent', () => {
    const doc = sv('<div class={tone}/>')
    expect(isUnknown(doc.nodes[0]!.style.space.padding)).toBe(true)
  })

  it('resolves an inline style attribute', () => {
    const doc = sv('<div style="padding: 1rem; color: #111827"/>')
    const d = doc.nodes[0]!
    if (isKnown(d.style.space.padding)) expect(d.style.space.padding.value.top).toBe(16)
    if (isKnown(d.style.color.fg)) expect(d.style.color.fg.value.hex).toBe('#111827')
  })

  it('applies a style block by class selector', () => {
    const doc = sv('<div class="card"/>\n<style>.card { padding: 12px }</style>')
    const d = doc.nodes[0]!
    if (!isKnown(d.style.space.padding)) throw new Error('expected known padding')
    expect(d.style.space.padding.value.top).toBe(12)
  })

  it('marks a descendant-selector rule as unknown rather than applying it', () => {
    const doc = sv('<div class="card"/>\n<style>.sidebar .card { padding: 99px }</style>')
    expect(isUnknown(doc.nodes[0]!.style.space.padding)).toBe(true)
  })

  it('lets an inline style win over a stylesheet rule', () => {
    const doc = sv('<div class="card" style="padding: 4px"/>\n<style>.card { padding: 32px }</style>')
    const d = doc.nodes[0]!
    if (!isKnown(d.style.space.padding)) throw new Error('expected known padding')
    expect(d.style.space.padding.value.top).toBe(4)
  })

  it('classifies a capitalised tag as a component', () => {
    const doc = sv('<MyButton class="p-4">Go</MyButton>')
    expect(doc.nodes[0]?.kind).toBe('component')
  })

  it('captures literal text children', () => {
    const doc = sv('<h2 class="text-2xl">Title</h2>')
    expect(doc.nodes[0]?.text).toBe('Title')
  })

  it('leaves an unstyled element fully absent', () => {
    expect(sv('<div/>').nodes[0]?.style.space.padding.state).toBe('absent')
  })

  it('returns an empty document for markup with no elements', () => {
    expect(sv('<script>const a = 1</script>').nodes).toEqual([])
  })
})

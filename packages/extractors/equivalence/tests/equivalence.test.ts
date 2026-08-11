import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { extractReact } from '@fe-design/extractor-react'
import { extractVue } from '@fe-design/extractor-vue'
import { extractSvelte } from '@fe-design/extractor-svelte'
import { extractHtml } from '@fe-design/extractor-html'
import type { IRDoc, StyleFacts } from '@fe-design/kernel/ir/types.js'

const DIR = join(import.meta.dirname, 'fixtures')
const read = (name: string) => readFile(join(DIR, name), 'utf8')

/** Origins differ by framework by design; the resolved values must not. */
const comparable = (s: StyleFacts): unknown => JSON.parse(JSON.stringify({
  space: s.space, type: s.type, color: s.color, shape: s.shape, layout: s.layout
}, (key, value) => key === 'origin' ? undefined : value))

const load = async (): Promise<Record<string, IRDoc>> => ({
  react: extractReact(await read('card.tsx'), 'card.tsx'),
  vue: extractVue(await read('card.vue'), 'card.vue'),
  svelte: extractSvelte(await read('card.svelte'), 'card.svelte'),
  html: extractHtml(await read('card.html'), 'card.html')
})

describe('cross-framework equivalence', () => {
  it('finds the same three elements in every framework', async () => {
    for (const [name, doc] of Object.entries(await load())) {
      expect(doc.nodes.map(n => n.name), name).toEqual(['section', 'h2', 'p'])
    }
  })

  it('produces identical StyleFacts for the section in all four', async () => {
    const facts = Object.entries(await load()).map(
      ([name, d]) => [name, comparable(d.nodes[0]!.style)] as const
    )
    const [, reference] = facts[0]!
    for (const [name, f] of facts) expect(f, `${name} vs react`).toEqual(reference)
  })

  it('produces identical StyleFacts for the heading in all four', async () => {
    const facts = Object.entries(await load()).map(
      ([name, d]) => [name, comparable(d.nodes[1]!.style)] as const
    )
    const [, reference] = facts[0]!
    for (const [name, f] of facts) expect(f, `${name} vs react`).toEqual(reference)
  })

  it('produces identical StyleFacts for the paragraph in all four', async () => {
    const facts = Object.entries(await load()).map(
      ([name, d]) => [name, comparable(d.nodes[2]!.style)] as const
    )
    const [, reference] = facts[0]!
    for (const [name, f] of facts) expect(f, `${name} vs react`).toEqual(reference)
  })

  it('agrees on the actual resolved values, not merely on shape', async () => {
    for (const [name, doc] of Object.entries(await load())) {
      const section = doc.nodes[0]!.style
      if (section.space.padding.state !== 'known') {
        throw new Error(`${name}: padding should be known`)
      }
      expect(section.space.padding.value, name)
        .toEqual({ top: 24, right: 24, bottom: 24, left: 24 })
      if (section.shape.radius.state === 'known') {
        expect(section.shape.radius.value.px, name).toBe(12)
      }
      if (section.color.bg.state === 'known') {
        expect(section.color.bg.value.hex, name).toBe('#ffffff')
      }
    }
  })

  it('reports the right framework on every document', async () => {
    const docs = await load()
    expect(docs.react!.framework).toBe('react')
    expect(docs.vue!.framework).toBe('vue')
    expect(docs.svelte!.framework).toBe('svelte')
    expect(docs.html!.framework).toBe('html')
  })

  it('builds the same parent-child structure everywhere', async () => {
    for (const [name, doc] of Object.entries(await load())) {
      expect(doc.nodes[0]!.parent, name).toBeNull()
      expect(doc.nodes[1]!.parent, name).toBe(doc.nodes[0]!.id)
      expect(doc.nodes[2]!.parent, name).toBe(doc.nodes[0]!.id)
      expect(doc.nodes[0]!.children, name).toHaveLength(2)
    }
  })
})

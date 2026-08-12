import { describe, it, expect } from 'vitest'
import { extractVue } from '../src/index.js'
import { isKnown, isUnknown } from '@kala/kernel/ir/fact.js'

const sfc = (body: string) => extractVue(body, 'Card.vue')

describe('extractVue', () => {
  it('produces one node per element with parent links', () => {
    const doc = sfc(`<template>
  <section class="bg-white p-6">
    <h2 class="text-2xl">Title</h2>
    <p class="text-base">Body</p>
  </section>
</template>`)
    expect(doc.framework).toBe('vue')
    expect(doc.nodes.map(n => n.name)).toEqual(['section', 'h2', 'p'])
    expect(doc.nodes[1]?.parent).toBe(doc.nodes[0]?.id)
    expect(doc.nodes[0]?.children).toHaveLength(2)
  })

  it('resolves a static class through the Tailwind resolver', () => {
    const doc = sfc('<template><div class="p-6 bg-white"/></template>')
    const d = doc.nodes[0]!
    if (!isKnown(d.style.space.padding)) throw new Error('expected known padding')
    expect(d.style.space.padding.value.top).toBe(24)
    if (isKnown(d.style.color.bg)) expect(d.style.color.bg.value.hex).toBe('#ffffff')
  })

  it('marks a bound :class as unknown, not absent', () => {
    const doc = sfc('<template><div :class="tone"/></template>')
    expect(isUnknown(doc.nodes[0]!.style.space.padding)).toBe(true)
  })

  it('resolves an inline style attribute', () => {
    const doc = sfc('<template><div style="padding: 1rem; color: #111827"/></template>')
    const d = doc.nodes[0]!
    if (isKnown(d.style.space.padding)) expect(d.style.space.padding.value.top).toBe(16)
    if (isKnown(d.style.color.fg)) expect(d.style.color.fg.value.hex).toBe('#111827')
  })

  it('applies a scoped style block by class selector', () => {
    const doc = sfc(`<template><div class="card"/></template>
<style scoped>.card { padding: 12px }</style>`)
    const d = doc.nodes[0]!
    if (!isKnown(d.style.space.padding)) throw new Error('expected known padding')
    expect(d.style.space.padding.value.top).toBe(12)
  })

  it('marks a descendant-selector rule as unknown rather than applying it', () => {
    const doc = sfc(`<template><div class="card"/></template>
<style>.sidebar .card { padding: 99px }</style>`)
    expect(isUnknown(doc.nodes[0]!.style.space.padding)).toBe(true)
  })

  it('lets an inline style win over a stylesheet rule', () => {
    const doc = sfc(`<template><div class="card" style="padding: 4px"/></template>
<style>.card { padding: 32px }</style>`)
    const d = doc.nodes[0]!
    if (!isKnown(d.style.space.padding)) throw new Error('expected known padding')
    expect(d.style.space.padding.value.top).toBe(4)
  })

  it('classifies a capitalised tag as a component', () => {
    const doc = sfc('<template><MyButton class="p-4">Go</MyButton></template>')
    expect(doc.nodes[0]?.kind).toBe('component')
  })

  it('records line numbers', () => {
    const doc = sfc('<template>\n  <div class="p-4"/>\n</template>')
    expect(doc.nodes[0]?.loc.line).toBe(2)
  })

  it('captures literal text children', () => {
    const doc = sfc('<template><h2 class="text-2xl">Title</h2></template>')
    expect(doc.nodes[0]?.text).toBe('Title')
  })

  it('returns an empty document for an SFC with no template', () => {
    const doc = sfc('<script setup>const a = 1</script>')
    expect(doc.nodes).toEqual([])
  })

  it('leaves an unstyled element fully absent', () => {
    const doc = sfc('<template><div/></template>')
    expect(doc.nodes[0]?.style.space.padding.state).toBe('absent')
  })
})

import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { extractReact } from '../src/index.js'
import { isKnown, isUnknown } from '@kala/kernel/ir/fact.js'

const fixture = (n: string) =>
  readFile(join(import.meta.dirname, 'fixtures', n), 'utf8')

describe('extractReact', () => {
  it('produces one node per JSX element with parent links', async () => {
    const doc = extractReact(await fixture('simple.tsx'), 'simple.tsx')
    expect(doc.nodes.map(n => n.name)).toEqual(['section', 'h2', 'p'])
    expect(doc.nodes[1]?.parent).toBe(doc.nodes[0]?.id)
    expect(doc.nodes[0]?.children).toHaveLength(2)
  })

  it('resolves a static className into StyleFacts', async () => {
    const doc = extractReact(await fixture('simple.tsx'), 'simple.tsx')
    const section = doc.nodes[0]!
    if (isKnown(section.style.space.padding)) {
      expect(section.style.space.padding.value.top).toBe(24)
    } else {
      throw new Error('padding should be known')
    }
    if (isKnown(section.style.color.bg)) {
      expect(section.style.color.bg.value.hex).toBe('#ffffff')
    }
  })

  it('records line numbers', async () => {
    const doc = extractReact(await fixture('simple.tsx'), 'simple.tsx')
    expect(doc.nodes[0]?.loc.line).toBe(3)
  })

  it('marks a template-literal className as unknown, not absent', async () => {
    const doc = extractReact(await fixture('dynamic.tsx'), 'dynamic.tsx')
    const div = doc.nodes.find(n => n.name === 'div')!
    expect(isUnknown(div.style.space.padding)).toBe(true)
  })

  it('marks a cn()/clsx() className as unknown', async () => {
    const doc = extractReact(await fixture('dynamic.tsx'), 'dynamic.tsx')
    const span = doc.nodes.find(n => n.name === 'span')!
    expect(isUnknown(span.style.type.size)).toBe(true)
  })

  it('classifies capitalised tags as components', () => {
    const doc = extractReact(
      'export default () => <Button className="p-4">Go</Button>', 'x.tsx'
    )
    expect(doc.nodes[0]?.kind).toBe('component')
  })

  it('captures literal text children', async () => {
    const doc = extractReact(await fixture('simple.tsx'), 'simple.tsx')
    expect(doc.nodes.find(n => n.name === 'h2')?.text).toBe('Title')
  })

  it('leaves an element with no className fully absent', () => {
    const doc = extractReact('export default () => <div>x</div>', 'x.tsx')
    expect(doc.nodes[0]?.style.space.padding.state).toBe('absent')
  })
})

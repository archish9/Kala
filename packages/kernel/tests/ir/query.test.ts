import { describe, it, expect } from 'vitest'
import { emptyStyleFacts, makeNode } from '../../src/ir/types.js'
import { ancestors, nodeById } from '../../src/ir/query.js'
import type { IRDoc } from '../../src/ir/types.js'

const doc: IRDoc = {
  file: 'a.tsx',
  framework: 'react',
  imports: [],
  dataSources: [],
  nodes: [
    makeNode({ id: 'n1', name: 'section', children: ['n2'] }),
    makeNode({ id: 'n2', name: 'div', parent: 'n1', children: ['n3'] }),
    makeNode({ id: 'n3', name: 'p', parent: 'n2' })
  ]
}

describe('ir/query', () => {
  it('emptyStyleFacts marks every slot absent, never missing', () => {
    const s = emptyStyleFacts()
    expect(s.space.padding.state).toBe('absent')
    expect(s.color.bg.state).toBe('absent')
    expect(s.type.size.state).toBe('absent')
  })

  it('ancestors returns nearest first', () => {
    expect(ancestors(doc, 'n3').map(n => n.id)).toEqual(['n2', 'n1'])
  })

  it('ancestors of a root node is empty', () => {
    expect(ancestors(doc, 'n1')).toEqual([])
  })

  it('nodeById finds a node', () => {
    expect(nodeById(doc, 'n2')?.name).toBe('div')
  })
})

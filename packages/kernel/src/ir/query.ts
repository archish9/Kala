import type { IRDoc, IRNode } from './types.js'

export const nodeById = (doc: IRDoc, id: string): IRNode | undefined =>
  doc.nodes.find(n => n.id === id)

export const ancestors = (doc: IRDoc, nodeId: string): IRNode[] => {
  const out: IRNode[] = []
  let cur = nodeById(doc, nodeId)
  while (cur?.parent) {
    const parent = nodeById(doc, cur.parent)
    if (!parent) break
    out.push(parent)
    cur = parent
  }
  return out
}

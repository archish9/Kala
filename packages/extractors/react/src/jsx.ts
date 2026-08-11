import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import {
  makeNode, emptyStyleFacts, type IRDoc, type IRNode, type StyleFacts
} from '@fe-design/kernel/ir/types.js'
import { unknown, type UnknownReason } from '@fe-design/kernel/ir/fact.js'
import { resolveTailwindClasses } from './tailwind.js'

// @babel/traverse ships CJS. Under ESM the callable sits on `.default`, but the
// types resolve the default import to the module namespace, so the callable type
// is pinned explicitly rather than derived from the import binding.
type TraverseFn = typeof import('@babel/traverse').default
const traverse = ((_traverse as unknown as { default?: TraverseFn }).default
  ?? _traverse) as unknown as TraverseFn

const allUnknown = (reason: UnknownReason): StyleFacts => {
  const s = emptyStyleFacts()
  const u = () => unknown(reason)
  s.space.padding = u(); s.space.margin = u(); s.space.gap = u()
  s.type.size = u(); s.type.weight = u(); s.type.leading = u()
  s.type.tracking = u(); s.type.family = u()
  s.color.fg = u(); s.color.bg = u(); s.color.border = u()
  s.shape.radius = u(); s.shape.borderWidth = u(); s.shape.shadow = u()
  return s
}

export const extractReact = (source: string, file: string): IRDoc => {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript']
  })

  const nodes: IRNode[] = []
  const idOf = new Map<object, string>()
  let seq = 0

  traverse(ast, {
    JSXElement(path: NodePath<any>) {
      const opening = path.node.openingElement
      const nameNode = opening.name
      const name = nameNode.type === 'JSXIdentifier'
        ? nameNode.name
        : nameNode.type === 'JSXMemberExpression'
          ? `${nameNode.object.name}.${nameNode.property.name}`
          : 'unknown'

      const id = `n${++seq}`
      idOf.set(path.node, id)

      let style = emptyStyleFacts()
      const attr = opening.attributes.find(
        (a: any) => a.type === 'JSXAttribute' && a.name.name === 'className'
      )
      if (attr) {
        const v = attr.value
        if (v?.type === 'StringLiteral') {
          style = resolveTailwindClasses(v.value)
        } else if (v?.type === 'JSXExpressionContainer') {
          const e = v.expression
          if (e.type === 'StringLiteral') style = resolveTailwindClasses(e.value)
          else if (e.type === 'CallExpression') style = allUnknown('unresolved-call')
          else style = allUnknown('dynamic-expression')
        }
      }

      const textChild = path.node.children.find(
        (c: any) => c.type === 'JSXText' && c.value.trim().length > 0
      )

      const parentEl = path.findParent((p: NodePath<any>) => p.isJSXElement())
      const parentId = parentEl ? idOf.get(parentEl.node) ?? null : null

      nodes.push(makeNode({
        id,
        name,
        kind: /^[A-Z]/.test(name) ? 'component' : 'element',
        parent: parentId,
        style,
        text: textChild ? textChild.value.trim() : null,
        loc: {
          line: path.node.loc?.start.line ?? 1,
          col: path.node.loc?.start.column ?? 0
        }
      }))

      if (parentId) {
        const parent = nodes.find(n => n.id === parentId)
        if (parent) parent.children.push(id)
      }
    }
  })

  return { file, framework: 'react', nodes, imports: [], dataSources: [] }
}

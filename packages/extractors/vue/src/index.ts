import { parse as parseSfc } from '@vue/compiler-sfc'
import {
  resolveTailwindClasses, parseInlineStyle, parseStyleSheet,
  declsToStyleFacts, rulesFor, mergeFacts, type ElementKey, type CssRule
} from '@kala/extractor-core'
import {
  makeNode, emptyStyleFacts, type IRDoc, type IRNode, type StyleFacts
} from '@kala/kernel/ir/types.js'
import { unknown } from '@kala/kernel/ir/fact.js'

const ELEMENT = 1
const ATTR = 6

const allUnknown = (): StyleFacts => {
  const s = emptyStyleFacts()
  const u = () => unknown('dynamic-expression')
  s.space.padding = u(); s.space.margin = u(); s.space.gap = u()
  s.type.size = u(); s.type.weight = u(); s.type.leading = u()
  s.type.tracking = u(); s.type.family = u()
  s.color.fg = u(); s.color.bg = u(); s.color.border = u()
  s.shape.radius = u(); s.shape.borderWidth = u(); s.shape.shadow = u()
  return s
}

const uncertainFacts = (raw: string[]): StyleFacts => {
  const s = emptyStyleFacts()
  s.raw = raw
  const u = () => unknown('external-stylesheet')
  s.space.padding = u(); s.space.gap = u()
  s.type.size = u(); s.type.weight = u()
  s.color.fg = u(); s.color.bg = u(); s.color.border = u()
  s.shape.radius = u(); s.shape.borderWidth = u()
  return s
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const attrValue = (node: any, name: string): string | null => {
  const prop = (node.props ?? []).find(
    (p: any) => p.type === ATTR && p.name === name
  )
  return prop?.value?.content ?? null
}

const hasBoundClass = (node: any): boolean =>
  (node.props ?? []).some(
    (p: any) => p.type !== ATTR &&
      (p.arg?.content === 'class' || p.name === 'class')
  )

export const extractVue = (source: string, file: string): IRDoc => {
  const { descriptor } = parseSfc(source, { filename: file })

  const sheet: CssRule[] = descriptor.styles.flatMap(
    s => parseStyleSheet(s.content).rules
  )

  const nodes: IRNode[] = []
  let seq = 0

  const walk = (node: any, parentId: string | null): void => {
    if (!node || node.type !== ELEMENT) {
      for (const child of node?.children ?? []) walk(child, parentId)
      return
    }

    const id = `n${++seq}`
    const tag = String(node.tag ?? 'unknown')
    const className = attrValue(node, 'class')
    const inline = attrValue(node, 'style')

    const key: ElementKey = {
      tag,
      classes: className ? className.split(/\s+/).filter(Boolean) : [],
      id: attrValue(node, 'id')
    }

    const layers: StyleFacts[] = []

    if (sheet.length > 0) {
      const { certain, uncertain } = rulesFor(sheet, key)
      if (certain.length > 0) {
        layers.push(declsToStyleFacts(certain, { kind: 'stylesheet', raw: tag }))
      }
      if (uncertain.length > 0) {
        layers.push(uncertainFacts(uncertain.map(d => `${d.prop}: ${d.value}`)))
      }
    }

    if (hasBoundClass(node)) layers.push(allUnknown())
    else if (className) layers.push(resolveTailwindClasses(className))

    if (inline) {
      layers.push(declsToStyleFacts(
        parseInlineStyle(inline), { kind: 'inline', raw: inline }
      ))
    }

    const textChild = (node.children ?? []).find(
      (c: any) => c.type === 2 && String(c.content).trim().length > 0
    )

    nodes.push(makeNode({
      id,
      name: tag,
      kind: /^[A-Z]/.test(tag) ? 'component' : 'element',
      parent: parentId,
      style: layers.length > 0 ? mergeFacts(layers) : emptyStyleFacts(),
      text: textChild ? String(textChild.content).trim() : null,
      loc: { line: node.loc?.start?.line ?? 1, col: node.loc?.start?.column ?? 0 }
    }))

    if (parentId) {
      nodes.find(n => n.id === parentId)?.children.push(id)
    }

    for (const child of node.children ?? []) walk(child, id)
  }

  const root = descriptor.template?.ast
  if (root) for (const child of root.children ?? []) walk(child, null)

  return { file, framework: 'vue', nodes, imports: [], dataSources: [] }
}

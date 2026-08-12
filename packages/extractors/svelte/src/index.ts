import { parse } from 'svelte/compiler'
import {
  resolveTailwindClasses, parseInlineStyle, parseStyleSheet,
  declsToStyleFacts, rulesFor, mergeFacts, type ElementKey, type CssRule
} from '@kala/extractor-core'
import {
  makeNode, emptyStyleFacts, type IRDoc, type IRNode, type StyleFacts
} from '@kala/kernel/ir/types.js'
import { unknown } from '@kala/kernel/ir/fact.js'

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

type AttrRead = { value: string | null; dynamic: boolean }

/* eslint-disable @typescript-eslint/no-explicit-any */
const readAttr = (node: any, name: string): AttrRead => {
  const attr = (node.attributes ?? []).find((a: any) => a.name === name)
  if (!attr) return { value: null, dynamic: false }

  const v = attr.value
  if (v === true) return { value: null, dynamic: false }

  if (Array.isArray(v)) {
    if (v.every((p: any) => p.type === 'Text')) {
      return { value: v.map((p: any) => p.data).join(''), dynamic: false }
    }
    return { value: null, dynamic: true }
  }

  // A bare ExpressionTag, e.g. class={tone}.
  return { value: null, dynamic: true }
}

export const extractSvelte = (source: string, file: string): IRDoc => {
  const ast = parse(source, { modern: true }) as any

  const sheet: CssRule[] = ast.css?.content?.styles
    ? parseStyleSheet(ast.css.content.styles).rules
    : []

  const nodes: IRNode[] = []
  let seq = 0

  const childrenOf = (node: any): any[] =>
    node?.fragment?.nodes ?? node?.nodes ?? []

  const walk = (node: any, parentId: string | null): void => {
    const isElement = node?.type === 'RegularElement' || node?.type === 'Component'
    if (!isElement) {
      for (const child of childrenOf(node)) walk(child, parentId)
      return
    }

    const id = `n${++seq}`
    const tag = String(node.name ?? 'unknown')
    const cls = readAttr(node, 'class')
    const inline = readAttr(node, 'style')

    const key: ElementKey = {
      tag,
      classes: cls.value ? cls.value.split(/\s+/).filter(Boolean) : [],
      id: readAttr(node, 'id').value
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

    if (cls.dynamic) layers.push(allUnknown())
    else if (cls.value) layers.push(resolveTailwindClasses(cls.value))

    if (inline.value) {
      layers.push(declsToStyleFacts(
        parseInlineStyle(inline.value), { kind: 'inline', raw: inline.value }
      ))
    }

    const textChild = childrenOf(node).find(
      (c: any) => c.type === 'Text' && String(c.data).trim().length > 0
    )

    nodes.push(makeNode({
      id,
      name: tag,
      kind: /^[A-Z]/.test(tag) ? 'component' : 'element',
      parent: parentId,
      style: layers.length > 0 ? mergeFacts(layers) : emptyStyleFacts(),
      text: textChild ? String(textChild.data).trim() : null,
      loc: { line: 1, col: 0 }
    }))

    if (parentId) {
      nodes.find(n => n.id === parentId)?.children.push(id)
    }

    for (const child of childrenOf(node)) walk(child, id)
  }

  for (const child of childrenOf(ast.fragment)) walk(child, null)

  return { file, framework: 'svelte', nodes, imports: [], dataSources: [] }
}

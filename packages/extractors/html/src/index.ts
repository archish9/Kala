import { parse } from 'parse5'
import {
  resolveTailwindClasses, parseInlineStyle, parseStyleSheet,
  declsToStyleFacts, rulesFor, mergeFacts, type ElementKey, type CssRule
} from '@fe-design/extractor-core'
import {
  makeNode, emptyStyleFacts, type IRDoc, type IRNode, type StyleFacts
} from '@fe-design/kernel/ir/types.js'
import { unknown } from '@fe-design/kernel/ir/fact.js'

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
const attr = (node: any, name: string): string | null =>
  (node.attrs ?? []).find((a: any) => a.name === name)?.value ?? null

const collectStyles = (node: any, out: string[]): void => {
  if (node.tagName === 'style') {
    const text = node.childNodes?.[0]?.value
    if (typeof text === 'string') out.push(text)
  }
  for (const c of node.childNodes ?? []) collectStyles(c, out)
}

export const extractHtml = (source: string, file: string): IRDoc => {
  // Without sourceCodeLocationInfo every location is undefined, and locations
  // are also how synthesized html/head/body nodes are told apart from real ones.
  const doc = parse(source, { sourceCodeLocationInfo: true }) as any

  const styleTexts: string[] = []
  collectStyles(doc, styleTexts)
  const sheet: CssRule[] = styleTexts.flatMap(t => parseStyleSheet(t).rules)

  const nodes: IRNode[] = []
  let seq = 0

  const walk = (node: any, parentId: string | null): void => {
    const tag: string | undefined = node.tagName

    // parse5 inserts html, head, and body around a fragment. Those synthesized
    // nodes have no source location, so skipping location-less elements keeps a
    // fragment from gaining nodes nobody wrote.
    const synthesized = tag !== undefined && !node.sourceCodeLocation
    const skip = tag === undefined || tag === 'style' || tag === 'script' || synthesized

    let id = parentId

    if (!skip) {
      id = `n${++seq}`
      const className = attr(node, 'class')
      const inline = attr(node, 'style')

      const key: ElementKey = {
        tag,
        classes: className ? className.split(/\s+/).filter(Boolean) : [],
        id: attr(node, 'id')
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

      if (className) layers.push(resolveTailwindClasses(className))

      if (inline) {
        layers.push(declsToStyleFacts(
          parseInlineStyle(inline), { kind: 'inline', raw: inline }
        ))
      }

      const textChild = (node.childNodes ?? []).find(
        (c: any) => c.nodeName === '#text' && String(c.value).trim().length > 0
      )

      nodes.push(makeNode({
        id,
        name: tag,
        kind: /^[A-Z]/.test(tag) ? 'component' : 'element',
        parent: parentId,
        style: layers.length > 0 ? mergeFacts(layers) : emptyStyleFacts(),
        text: textChild ? String(textChild.value).trim() : null,
        loc: {
          line: node.sourceCodeLocation?.startLine ?? 1,
          col: node.sourceCodeLocation?.startCol ?? 0
        }
      }))

      if (parentId) {
        nodes.find(n => n.id === parentId)?.children.push(id)
      }
    }

    if (tag === 'style' || tag === 'script') return
    for (const child of node.childNodes ?? []) walk(child, id)
  }

  walk(doc, null)

  return { file, framework: 'html', nodes, imports: [], dataSources: [] }
}

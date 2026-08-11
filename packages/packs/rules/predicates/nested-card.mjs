/**
 * A card inside a card. Both the node and its parent must have a known radius
 * AND a known border width, so a rounded button inside a card does not trip it.
 */
export default function nestedCard(node, ctx) {
  const parent = ctx.doc.nodes.find(n => n.id === node.parent)
  if (!parent) return null

  const isCard = n =>
    n.style.shape.radius.state === 'known' &&
    n.style.shape.borderWidth.state === 'known'

  if (!isCard(node) || !isCard(parent)) return null

  return {
    rule: 'nested-card',
    sev: 'warn',
    file: ctx.doc.file,
    line: node.loc.line,
    msg: 'A bordered, rounded container sits directly inside another one.',
    fix: 'Remove the inner border, or flatten one level of nesting.'
  }
}

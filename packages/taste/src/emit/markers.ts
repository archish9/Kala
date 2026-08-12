import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

type CommentStyle = 'js' | 'css'

const wrap = (style: CommentStyle, text: string): string =>
  style === 'css' ? `/* ${text} */` : `// ${text}`

export const START = (tag: string): string => `kala:${tag}:start`
export const END = (tag: string): string => `kala:${tag}:end`

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const spliceBlock = (
  existing: string | null, tag: string, body: string, comment: CommentStyle
): string => {
  const open = wrap(comment, `${START(tag)} — generated; edits inside are overwritten`)
  const close = wrap(comment, END(tag))
  const block = `${open}\n${body}\n${close}`

  if (!existing || existing.trim() === '') return block + '\n'

  // Match from this tag's own start marker through its own end marker, so two
  // different tags in one file stay independent.
  const blockRe = new RegExp(
    `${comment === 'css' ? '/\\* ' : '// '}${escape(START(tag))}[\\s\\S]*?${escape(close)}`
  )

  if (blockRe.test(existing)) return existing.replace(blockRe, block)

  const sep = existing.endsWith('\n') ? '' : '\n'
  return `${existing}${sep}${block}\n`
}

export const writeBlock = async (
  path: string, tag: string, body: string, comment: CommentStyle
): Promise<'created' | 'updated' | 'unchanged'> => {
  let existing: string | null = null
  try { existing = await readFile(path, 'utf8') } catch { existing = null }

  const next = spliceBlock(existing, tag, body, comment)
  if (existing === next) return 'unchanged'

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, next, 'utf8')
  return existing === null ? 'created' : 'updated'
}

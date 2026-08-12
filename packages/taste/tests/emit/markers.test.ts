import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spliceBlock, writeBlock } from '../../src/emit/markers.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'emit-')) })

describe('spliceBlock', () => {
  it('creates a tagged block in an empty file', () => {
    const out = spliceBlock(null, 'tokens', 'const a = 1', 'js')
    expect(out).toContain('kala:tokens:start')
    expect(out).toContain('const a = 1')
    expect(out).toContain('kala:tokens:end')
  })

  it('replaces only the block, preserving text around it', () => {
    const first = spliceBlock('// mine above\n', 'tokens', 'v1', 'js')
    const second = spliceBlock(first + '// mine below\n', 'tokens', 'v2', 'js')
    expect(second).toContain('// mine above')
    expect(second).toContain('// mine below')
    expect(second).toContain('v2')
    expect(second).not.toContain('v1')
  })

  it('is idempotent for identical input', () => {
    const once = spliceBlock(null, 'tokens', 'same', 'js')
    expect(spliceBlock(once, 'tokens', 'same', 'js')).toBe(once)
  })

  it('keeps two different tags independent', () => {
    const a = spliceBlock(null, 'one', 'A', 'js')
    const both = spliceBlock(a, 'two', 'B', 'js')
    expect(both).toContain('A')
    expect(both).toContain('B')
    const updated = spliceBlock(both, 'one', 'A2', 'js')
    expect(updated).toContain('A2')
    expect(updated).toContain('B')
  })

  it('uses css comment syntax when asked', () => {
    expect(spliceBlock(null, 'vars', ':root{}', 'css')).toContain('/* kala:vars:start')
  })
})

describe('writeBlock', () => {
  it('reports created, then unchanged, then updated', async () => {
    const p = join(dir, 'out.js')
    expect(await writeBlock(p, 'tokens', 'v1', 'js')).toBe('created')
    expect(await writeBlock(p, 'tokens', 'v1', 'js')).toBe('unchanged')
    expect(await writeBlock(p, 'tokens', 'v2', 'js')).toBe('updated')
  })

  it('leaves the file byte-identical when nothing changed', async () => {
    const p = join(dir, 'out.js')
    await writeBlock(p, 'tokens', 'v1', 'js')
    const before = await readFile(p, 'utf8')
    await writeBlock(p, 'tokens', 'v1', 'js')
    expect(await readFile(p, 'utf8')).toBe(before)
  })

  it('preserves hand-written content outside the block', async () => {
    const p = join(dir, 'out.js')
    await writeBlock(p, 'tokens', 'v1', 'js')
    await writeFile(p, (await readFile(p, 'utf8')) + '\nexport const mine = 1\n')
    await writeBlock(p, 'tokens', 'v2', 'js')
    const after = await readFile(p, 'utf8')
    expect(after).toContain('export const mine = 1')
    expect(after).toContain('v2')
  })
})

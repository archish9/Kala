import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deriveLock } from '../../src/lock/derive.js'
import { checkStale } from '../../src/lock/staleness.js'
import { scanComponents } from '../../src/lock/registry.js'

let dir: string

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'lock-')) })

const writeTailwind = (d: string, body: string) =>
  writeFile(join(d, 'tailwind.config.mjs'), body)

describe('deriveLock', () => {
  it('derives the spacing scale from tailwind config', async () => {
    await writeTailwind(dir, `export default {
      theme: { extend: { spacing: { xs: '4px', sm: '8px', md: '16px' } } }
    }`)
    const { lock } = await deriveLock(dir)
    expect(lock?.derived.space).toEqual([4, 8, 16])
  })

  it('derives the type scale from tailwind fontSize', async () => {
    await writeTailwind(dir, `export default {
      theme: { extend: { fontSize: { sm: '14px', base: '16px', xl: '24px' } } }
    }`)
    const { lock } = await deriveLock(dir)
    expect(lock?.derived.type.steps).toEqual([14, 16, 24])
  })

  it('flattens nested colors into dashed keys', async () => {
    await writeTailwind(dir, `export default {
      theme: { extend: { colors: { primary: { 500: '#1F4B3F' }, white: '#ffffff' } } }
    }`)
    const { lock } = await deriveLock(dir)
    expect(lock?.derived.color['primary-500']).toBe('#1F4B3F')
    expect(lock?.derived.color['white']).toBe('#ffffff')
  })

  it('falls back to CSS custom properties when no tailwind config exists', async () => {
    await mkdir(join(dir, 'src'), { recursive: true })
    await writeFile(join(dir, 'src/globals.css'),
      ':root { --space-1: 4px; --space-2: 8px; --color-primary: #1F4B3F; }')
    const { lock } = await deriveLock(dir)
    expect(lock?.derived.space).toEqual([4, 8])
    expect(lock?.derived.color['primary']).toBe('#1F4B3F')
  })

  it('returns null when there is nothing to derive from', async () => {
    const { lock, degraded } = await deriveLock(dir)
    expect(lock).toBeNull()
    expect(degraded.some(d => d.code === 'NO_DESIGN_SOURCE')).toBe(true)
  })

  it('re-reads the config after it changes rather than serving a cached module', async () => {
    await writeTailwind(dir, `export default { theme: { extend: { spacing: { a: '4px' } } } }`)
    expect((await deriveLock(dir)).lock?.derived.space).toEqual([4])
    await writeTailwind(dir, `export default { theme: { extend: { spacing: { a: '9px' } } } }`)
    expect((await deriveLock(dir)).lock?.derived.space).toEqual([9])
  })

  it('preserves the intent zone it is given', async () => {
    await writeTailwind(dir, `export default { theme: { extend: { spacing: { a: '4px' } } } }`)
    const { lock } = await deriveLock(dir, { system: 'quiet-precision' })
    expect(lock?.intent.system).toBe('quiet-precision')
  })
})

describe('checkStale', () => {
  it('reports stale after a source file changes', async () => {
    await writeTailwind(dir, `export default { theme: { extend: { spacing: { a: '4px' } } } }`)
    const { lock } = await deriveLock(dir)
    expect((await checkStale(lock!, dir)).stale).toBe(false)

    await writeTailwind(dir, `export default { theme: { extend: { spacing: { a: '8px' } } } }`)
    const after = await checkStale(lock!, dir)
    expect(after.stale).toBe(true)
    expect(after.changed).toContain('tailwind.config.mjs')
  })
})

describe('scanComponents', () => {
  it('registers components and their variant names', async () => {
    await mkdir(join(dir, 'src/ui'), { recursive: true })
    await writeFile(join(dir, 'src/ui/Button.tsx'),
      `const variants = { primary: '', ghost: '' }
       export const Button = () => null`)
    const reg = await scanComponents(dir)
    expect(reg['Button']?.file).toContain('Button.tsx')
    expect(reg['Button']?.variants).toEqual(['primary', 'ghost'])
  })

  it('returns an empty registry when no ui directory exists', async () => {
    expect(await scanComponents(dir)).toEqual({})
  })
})

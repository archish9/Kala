import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { systemStatus } from '../src/tools/system-status.js'
import { verify } from '../src/tools/verify.js'
import { explain } from '../src/tools/explain.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'proj-'))
  await writeFile(join(dir, 'tailwind.config.mjs'), `export default {
    theme: { extend: {
      spacing: { 1: '4px', 2: '8px', 4: '16px', 6: '24px' },
      fontSize: { sm: '14px', base: '16px', xl: '24px' },
      colors: { gray: { 400: '#9ca3af', 900: '#111827' }, white: '#ffffff' }
    } }
  }`)
  await mkdir(join(dir, 'src'), { recursive: true })
})

describe('system_status', () => {
  it('reports a derived lock as fresh', async () => {
    const s = await systemStatus(dir)
    expect(s.hasLock).toBe(true)
    expect(s.stale).toBe(false)
    expect(s.space).toEqual([4, 8, 16, 24])
  })

  it('reports no lock on an empty project', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'empty-'))
    const s = await systemStatus(empty)
    expect(s.hasLock).toBe(false)
    expect(s.degraded.some(d => d.code === 'NO_DESIGN_SOURCE')).toBe(true)
  })

  it('picks up new values after the config changes', async () => {
    await systemStatus(dir)
    await writeFile(join(dir, 'tailwind.config.mjs'),
      `export default { theme: { extend: { spacing: { 1: '5px' } } } }`)
    const s = await systemStatus(dir)
    expect(s.space).toEqual([5])
  })
})

describe('verify', () => {
  it('finds an off-scale padding violation', async () => {
    await writeFile(join(dir, 'src/Bad.tsx'),
      'export default () => <div className="p-[13px]">x</div>')
    const r = await verify(dir, ['src/Bad.tsx'])
    expect(r.findings.map(f => f.rule)).toContain('space-off-scale')
  })

  it('finds nothing in compliant code', async () => {
    await writeFile(join(dir, 'src/Good.tsx'),
      'export default () => <div className="p-4">x</div>')
    expect((await verify(dir, ['src/Good.tsx'])).findings).toEqual([])
  })

  it('reports a parse failure as degraded and keeps going', async () => {
    await writeFile(join(dir, 'src/Broken.tsx'), 'export default () => <div')
    await writeFile(join(dir, 'src/Good.tsx'),
      'export default () => <div className="p-4">x</div>')
    const r = await verify(dir, ['src/Broken.tsx', 'src/Good.tsx'])
    expect(r.degraded.some(d => d.code === 'PARSE_FAILED')).toBe(true)
    expect(r.findings).toEqual([])
  })

  it('refuses a path outside the project root', async () => {
    await expect(verify(dir, ['../../etc/passwd'])).rejects.toThrow(/outside/i)
  })

  it('reports coverage including skipped nodes', async () => {
    await writeFile(join(dir, 'src/Dyn.tsx'),
      'export default ({t}: {t: string}) => <div className={`p-4 ${t}`}>x</div>')
    expect((await verify(dir, ['src/Dyn.tsx'])).coverage.skipped).toBeGreaterThan(0)
  })

  it('skips a non-React file with a clear degraded entry', async () => {
    await writeFile(join(dir, 'src/style.css'), '.a { padding: 13px }')
    const r = await verify(dir, ['src/style.css'])
    expect(r.degraded.some(d => d.code === 'UNSUPPORTED_FRAMEWORK')).toBe(true)
  })
})

describe('explain', () => {
  it('expands a finding from the last run', async () => {
    await writeFile(join(dir, 'src/Bad.tsx'),
      'export default () => <div className="p-[13px]">x</div>')
    const run = await verify(dir, ['src/Bad.tsx'])
    const e = await explain(run.findings[0]!.id, run)
    expect(e.found).toBe(true)
    expect(e.rule).toBe('space-off-scale')
    expect(e.severity).toBe('error')
  })

  it('returns a not-found result for an unknown id rather than throwing', async () => {
    expect((await explain('f999', null)).found).toBe(false)
  })
})

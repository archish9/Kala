import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { critique } from '../src/tools/critique.js'
import { systemBootstrap } from '../src/tools/system-bootstrap.js'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'crit-'))
  await systemBootstrap(dir, 'settings for a banking portal', { choice: 1 })
})

describe('critique', () => {
  it('reviews a file and groups what it finds', async () => {
    await writeFile(join(dir, 'Bad.tsx'),
      'export default () => <div className="p-[13px]">x</div>')
    const { review } = await critique(dir, ['Bad.tsx'])
    expect(review.counts.error + review.counts.warn).toBeGreaterThan(0)
    expect(review.sections.length).toBeGreaterThan(0)
  })

  it('names the project design system in the review', async () => {
    await writeFile(join(dir, 'Ok.tsx'), 'export default () => <div>x</div>')
    const { review } = await critique(dir, ['Ok.tsx'])
    expect(typeof review.system).toBe('string')
  })

  it('returns a clean review for compliant code', async () => {
    await writeFile(join(dir, 'Ok.tsx'), 'export default () => <div>x</div>')
    const { review } = await critique(dir, ['Ok.tsx'])
    expect(review.counts.error).toBe(0)
  })

  it('writes no report unless asked', async () => {
    await writeFile(join(dir, 'Ok.tsx'), 'export default () => <div>x</div>')
    expect((await critique(dir, ['Ok.tsx'])).reportPath).toBeNull()
  })

  it('writes an HTML report outside the project when asked', async () => {
    await writeFile(join(dir, 'Bad.tsx'),
      'export default () => <div className="p-[13px]">x</div>')
    const { reportPath } = await critique(dir, ['Bad.tsx'], { html: true })
    expect(reportPath).toContain(tmpdir())
    expect(reportPath).not.toContain(dir)
  })

  it('refuses a path outside the project root', async () => {
    await expect(critique(dir, ['../../etc/passwd'])).rejects.toThrow(/outside/i)
  })

  it('carries source coverage into the review', async () => {
    await writeFile(join(dir, 'Dyn.tsx'),
      'export default ({t}: {t: string}) => <div className={`p-4 ${t}`}>x</div>')
    const { review } = await critique(dir, ['Dyn.tsx'])
    expect(review.coverage.skipped).toBeGreaterThan(0)
  })
})

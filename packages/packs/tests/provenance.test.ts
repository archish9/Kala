import { describe, it, expect } from 'vitest'
import { readFile, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..', '..')

describe('attribution', () => {
  it('ships both license texts', async () => {
    await expect(access(join(ROOT, 'LICENSES/Apache-2.0.txt'))).resolves.toBeUndefined()
    await expect(access(join(ROOT, 'LICENSES/MIT.txt'))).resolves.toBeUndefined()
  })

  it('NOTICE names impeccable and states modification', async () => {
    const n = await readFile(join(ROOT, 'NOTICE'), 'utf8')
    expect(n).toMatch(/impeccable/i)
    expect(n).toMatch(/modif/i)
  })

  it('NOTICE disclaims trademark use', async () => {
    const n = await readFile(join(ROOT, 'NOTICE'), 'utf8')
    expect(n).toMatch(/trademark/i)
  })

  it('the companion skill tells the agent to call system_status and verify', async () => {
    const s = await readFile(join(ROOT, 'skill/SKILL.md'), 'utf8')
    expect(s).toContain('system_status')
    expect(s).toContain('verify')
  })
})

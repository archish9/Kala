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
    const s = await readFile(join(ROOT, 'skills/kala/SKILL.md'), 'utf8')
    expect(s).toContain('system_status')
    expect(s).toContain('verify')
  })

  it('keeps the licensing material in the contributor provenance doc', async () => {
    const text = await readFile(
      join(ROOT, 'Documentation', 'contributors', '07-provenance.md'), 'utf8'
    )
    expect(text).toMatch(/impeccable/i)
    expect(text).toMatch(/ui-ux-pro-max/i)
    expect(text).toMatch(/design-motion-principles/i)
    expect(text).toMatch(/Apache-2\.0/)
    expect(text).toMatch(/MIT/)
    expect(text).toMatch(/trademark/i)
  })

  it('documents the catalog data port in ATTRIBUTION.md', async () => {
    const text = await readFile(join(ROOT, 'ATTRIBUTION.md'), 'utf8')
    expect(text).toContain('packs/catalog/styles.json')
    expect(text).toContain('packs/catalog/palettes.json')
    expect(text).toContain('packs/catalog/typography.json')
    expect(text).toMatch(/ui-ux-pro-max.*styles\.csv/)
    expect(text).toMatch(/MIT/)
  })
})

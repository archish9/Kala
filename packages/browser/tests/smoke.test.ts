import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { browserAvailable } from '../src/launch.js'
import { inspectUrl } from '../src/inspect.js'

// Resolved at module scope, not in beforeAll: describe.skipIf is evaluated
// during collection, which happens before any hook runs. Deciding in a hook
// would leave `available` false and silently skip every browser test.
const available = await browserAvailable()

const PAGE = `<!doctype html><html><body style="margin:0;background:#fff">
  <section style="padding:24px">
    <p id="faint" style="color:#9ca3af">faint inherited text</p>
    <nav id="wide" style="width:900px">too wide</nav>
    <button id="tiny" style="width:20px;height:20px">x</button>
  </section>
</body></html>`

const seededPage = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'inspect-'))
  const file = join(dir, 'page.html')
  await writeFile(file, PAGE)
  return pathToFileURL(file).href
}

describe.skipIf(!available)('inspect against a real browser', () => {
  it('finds contrast, overflow, and target problems on a seeded page', async () => {
    const r = await inspectUrl(await seededPage(), [{ width: 375, height: 812 }])
    const rules = r.findings.map(f => f.rule)

    // The contrast finding is the point: #9ca3af sits on a transparent
    // section over a white body, so only an ancestor walk resolves it.
    expect(rules).toContain('computed-contrast')
    expect(rules).toContain('horizontal-overflow')
    expect(rules).toContain('small-touch-target')
    expect(r.degraded).toEqual([])
  }, 60000)

  it('writes a screenshot outside the project and returns its path', async () => {
    const r = await inspectUrl(
      await seededPage(), [{ width: 375, height: 812 }], { screenshot: true }
    )
    expect(r.screenshots).toHaveLength(1)
    expect(r.screenshots[0]).toContain(tmpdir())
  }, 60000)
})

describe('inspect without a browser', () => {
  it.skipIf(available)('degrades with install instructions', async () => {
    const r = await inspectUrl('https://example.com')
    expect(r.findings).toEqual([])
    expect(r.degraded.some(d => d.code === 'BROWSER_UNAVAILABLE')).toBe(true)
  }, 30000)
})

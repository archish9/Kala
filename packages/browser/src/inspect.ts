import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Degraded } from '@kala/kernel/engine/rule-types.js'
import { launchChromium, DEFAULT_VIEWPORTS } from './launch.js'
import { collectFacts } from './collect.js'
import { checkContrast, type BrowserFinding } from './checks/contrast.js'
import { checkOverflow } from './checks/overflow.js'
import { checkTargets } from './checks/targets.js'
import type { PageFacts, Viewport } from './facts.js'

export type InspectResult = {
  url: string
  viewports: string[]
  findings: BrowserFinding[]
  screenshots: string[]
  degraded: Degraded[]
}

const SEVERITY_RANK = { error: 0, warn: 1, info: 2 } as const

export const runChecks = (facts: PageFacts): BrowserFinding[] => {
  const all = [
    ...checkContrast(facts),
    ...checkOverflow(facts),
    ...checkTargets(facts)
  ]
  return all.sort((a, b) => SEVERITY_RANK[a.sev] - SEVERITY_RANK[b.sev])
}

export const inspectUrl = async (
  url: string,
  viewports: Viewport[] = DEFAULT_VIEWPORTS,
  opts: { screenshot?: boolean } = {}
): Promise<InspectResult> => {
  const result: InspectResult = {
    url,
    viewports: viewports.map(v => `${v.width}x${v.height}`),
    findings: [],
    screenshots: [],
    degraded: []
  }

  const launched = await launchChromium()
  if (!launched.ok) {
    result.degraded.push(launched.degraded)
    return result
  }

  const { browser } = launched
  // Screenshots go to the OS temp directory. system_bootstrap stays the only
  // tool that writes into the user's project.
  const shotDir = opts.screenshot
    ? await mkdtemp(join(tmpdir(), 'kala-shots-'))
    : null

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport })
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 20000 })
        const facts = await collectFacts(page, viewport)
        result.findings.push(...runChecks(facts))

        if (shotDir) {
          const buf = await page.screenshot({ type: 'png' })
          const path = join(shotDir, `${viewport.width}x${viewport.height}.png`)
          await writeFile(path, buf)
          result.screenshots.push(path)
        }
      } catch (err) {
        result.degraded.push({
          code: 'PAGE_FAILED',
          detail: `${viewport.width}x${viewport.height}: ${(err as Error).message}`,
          impact: '1 viewport not inspected'
        })
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }

  result.findings.sort((a, b) => SEVERITY_RANK[a.sev] - SEVERITY_RANK[b.sev])
  return result
}

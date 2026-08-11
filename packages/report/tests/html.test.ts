import { describe, it, expect } from 'vitest'
import { renderReport, writeReport } from '../src/html.js'
import type { Review } from '../src/critique.js'
import { tmpdir } from 'node:os'
import { readFile } from 'node:fs/promises'

const review: Review = {
  surface: 'settings',
  system: 'quiet-precision',
  counts: { error: 1, warn: 1, info: 0 },
  sections: [
    {
      title: 'Accessibility',
      items: [{
        rule: 'computed-contrast', sev: 'error',
        where: 'p.muted @ 375x812',
        msg: 'Rendered contrast is 2.85:1.',
        fix: 'Darken the text.', source: 'rendered'
      }]
    },
    {
      title: 'Consistency',
      items: [{
        rule: 'space-off-scale', sev: 'warn',
        where: 'src/app/settings/page.tsx:12',
        msg: 'Padding 13px is not on the spacing scale.', source: 'static'
      }]
    }
  ],
  coverage: { analyzed: 61, skipped: 9 },
  degraded: []
}

describe('renderReport', () => {
  it('produces a complete standalone document', () => {
    const html = renderReport(review)
    expect(html).toMatch(/^<!doctype html>/i)
    expect(html).toContain('</html>')
  })

  it('makes no external requests', () => {
    const html = renderReport(review)
    expect(html).not.toMatch(/<script\s+src=/i)
    expect(html).not.toMatch(/<link[^>]+href="https?:/i)
    expect(html).not.toMatch(/@import\s+url\(/i)
  })

  it('names the surface and the design system', () => {
    const html = renderReport(review)
    expect(html).toContain('settings')
    expect(html).toContain('quiet-precision')
  })

  it('shows every section and every finding', () => {
    const html = renderReport(review)
    expect(html).toContain('Accessibility')
    expect(html).toContain('Consistency')
    expect(html).toContain('Rendered contrast is 2.85:1.')
    expect(html).toContain('Padding 13px is not on the spacing scale.')
  })

  it('shows the fix where one exists', () => {
    expect(renderReport(review)).toContain('Darken the text.')
  })

  it('reports coverage honestly, including what was skipped', () => {
    const html = renderReport(review)
    expect(html).toContain('61')
    expect(html).toContain('9')
  })

  it('escapes markup in finding text rather than injecting it', () => {
    const nasty: Review = {
      ...review,
      sections: [{
        title: 'Craft',
        items: [{
          rule: 'x', sev: 'warn', where: 'a.tsx:1',
          msg: '<script>alert(1)</script>', source: 'static'
        }]
      }]
    }
    const html = renderReport(nasty)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders a clean review as a pass rather than an empty page', () => {
    const clean: Review = {
      ...review, counts: { error: 0, warn: 0, info: 0 }, sections: []
    }
    expect(renderReport(clean).toLowerCase()).toContain('no findings')
  })

  it('works in both colour schemes', () => {
    expect(renderReport(review)).toContain('prefers-color-scheme: dark')
  })
})

describe('writeReport', () => {
  it('writes outside the project and returns the path', async () => {
    const path = await writeReport(review)
    expect(path).toContain(tmpdir())
    expect(path).toMatch(/\.html$/)
    expect(await readFile(path, 'utf8')).toContain('Accessibility')
  })
})

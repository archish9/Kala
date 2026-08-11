import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Review, ReviewItem, ReviewSection } from './critique.js'

/** Findings carry source text, so everything interpolated is escaped. */
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const SEV_LABEL = { error: 'Error', warn: 'Warning', info: 'Note' } as const

const item = (i: ReviewItem): string => `
      <li class="item ${i.sev}">
        <div class="head">
          <span class="sev">${SEV_LABEL[i.sev]}</span>
          <code class="where">${esc(i.where)}</code>
          <span class="src">${i.source}</span>
        </div>
        <p class="msg">${esc(i.msg)}</p>
        ${i.fix ? `<p class="fix">${esc(i.fix)}</p>` : ''}
        <p class="rule"><code>${esc(i.rule)}</code></p>
      </li>`

const section = (s: ReviewSection): string => `
    <section>
      <h2>${esc(s.title)} <span class="count">${s.items.length}</span></h2>
      <ul>${s.items.map(item).join('')}</ul>
    </section>`

export const renderReport = (review: Review): string => {
  const total = review.counts.error + review.counts.warn + review.counts.info

  const body = total === 0
    ? `<section class="clean"><h2>No findings</h2>
         <p>Nothing to fix on this surface.</p></section>`
    : review.sections.map(section).join('')

  // Colours are defined on bare :root and only overridden inside the dark
  // media query, so the report is legible in either scheme.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design review — ${esc(review.surface)}</title>
<style>
  :root {
    --bg: #fbfaf9; --surface: #ffffff; --fg: #1c1917; --muted: #57534e;
    --border: #e7e5e4; --error: #b91c1c; --warn: #b45309; --info: #0369a1;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1c1917; --surface: #292524; --fg: #f5f5f4; --muted: #a8a29e;
      --border: #44403c; --error: #f87171; --warn: #fbbf24; --info: #7dd3fc;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 48px 24px; background: var(--bg); color: var(--fg);
    font: 16px/1.6 ui-sans-serif, system-ui, sans-serif;
  }
  main { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  .meta { color: var(--muted); margin: 0 0 32px; }
  .totals { display: flex; gap: 16px; margin: 0 0 40px; padding: 0; list-style: none; }
  .totals li { padding: 8px 14px; border: 1px solid var(--border); border-radius: 2px;
               background: var(--surface); }
  .totals .n { font-weight: 600; }
  h2 { font-size: 18px; margin: 40px 0 12px; display: flex; gap: 10px; align-items: baseline; }
  .count { color: var(--muted); font-weight: 400; font-size: 14px; }
  ul { list-style: none; margin: 0; padding: 0; }
  .item { background: var(--surface); border: 1px solid var(--border);
          border-left-width: 3px; border-radius: 2px; padding: 14px 16px; margin: 0 0 10px; }
  .item.error { border-left-color: var(--error); }
  .item.warn  { border-left-color: var(--warn); }
  .item.info  { border-left-color: var(--info); }
  .head { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap;
          font-size: 13px; color: var(--muted); }
  .item.error .sev { color: var(--error); }
  .item.warn .sev  { color: var(--warn); }
  .item.info .sev  { color: var(--info); }
  .sev { font-weight: 600; }
  .where { font-family: ui-monospace, monospace; }
  .src { margin-left: auto; }
  .msg { margin: 8px 0 0; }
  .fix { margin: 6px 0 0; color: var(--muted); }
  .rule { margin: 8px 0 0; font-size: 12px; color: var(--muted); }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border);
           color: var(--muted); font-size: 14px; }
</style>
</head>
<body>
<main>
  <h1>Design review</h1>
  <p class="meta">${esc(review.surface)}${
    review.system ? ` &middot; ${esc(review.system)}` : ''
  }</p>

  <ul class="totals">
    <li><span class="n">${review.counts.error}</span> errors</li>
    <li><span class="n">${review.counts.warn}</span> warnings</li>
    <li><span class="n">${review.counts.info}</span> notes</li>
  </ul>

  ${body}

  <footer>
    <p>${review.coverage.analyzed} nodes analyzed, ${review.coverage.skipped} skipped.
       Skipped nodes could not be resolved statically and were not judged.</p>
    ${review.degraded.length > 0
      ? `<p>${review.degraded.length} item(s) degraded: ${
          esc(review.degraded.map(d => d.code).join(', '))}</p>`
      : ''}
  </footer>
</main>
</body>
</html>`
}

export const writeReport = async (review: Review): Promise<string> => {
  // The OS temp directory, never the project: system_bootstrap stays the only
  // tool that writes where the user works.
  const dir = await mkdtemp(join(tmpdir(), 'fe-design-review-'))
  const path = join(dir, `${review.surface.replace(/[^\w-]/g, '-')}.html`)
  await writeFile(path, renderReport(review), 'utf8')
  return path
}

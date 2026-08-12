import { inspectUrl, DEFAULT_VIEWPORTS, type InspectResult } from '@kala/browser'

export type { InspectResult }

/**
 * Widths arrive as plain numbers from the tool call; heights are derived so a
 * caller does not have to think about them.
 */
const heightFor = (width: number): number =>
  width <= 480 ? 812 : width <= 1024 ? 1024 : 900

export const inspect = async (
  url: string, viewports?: number[], screenshot?: boolean
): Promise<InspectResult> => {
  const vps = viewports && viewports.length > 0
    ? viewports.map(width => ({ width, height: heightFor(width) }))
    : DEFAULT_VIEWPORTS

  return inspectUrl(url, vps, screenshot ? { screenshot: true } : {})
}

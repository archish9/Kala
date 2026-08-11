export type Viewport = { width: number; height: number }

export type BrowserNode = {
  id: string
  tag: string
  /** A short CSS path, for naming the element in a finding. */
  selector: string
  text: string | null
  /** Computed colour, as an rgb()/rgba() string. */
  color: string
  /**
   * The effective background, resolved by walking ancestors until an opaque
   * colour is found. `bgResolved` is false when nothing opaque was reachable —
   * for example an element over an image — and contrast must not be judged.
   */
  bg: string
  bgResolved: boolean
  fontSize: number
  fontWeight: number
  rect: { x: number; y: number; w: number; h: number }
  interactive: boolean
}

export type PageFacts = {
  viewport: Viewport
  scrollWidth: number
  nodes: BrowserNode[]
}

export type BrowserLike = {
  newPage(o: { viewport: Viewport }): Promise<PageLike>
  close(): Promise<void>
}

export type PageLike = {
  goto(
    url: string,
    o?: { waitUntil?: 'load' | 'networkidle'; timeout?: number }
  ): Promise<unknown>
  setContent(html: string): Promise<void>
  evaluate<T>(fn: () => T): Promise<T>
  screenshot(o: { type: 'png' }): Promise<Buffer>
  close(): Promise<void>
}

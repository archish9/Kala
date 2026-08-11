import { extname } from 'node:path'
import { extractReact } from '@fe-design/extractor-react'
import { extractVue } from '@fe-design/extractor-vue'
import { extractSvelte } from '@fe-design/extractor-svelte'
import type { IRDoc } from '@fe-design/kernel/ir/types.js'

export type ExtractorFn = (source: string, file: string) => IRDoc

/**
 * Extension to extractor. The spec calls for framework support to be a
 * registration rather than a refactor, so every dispatch decision lives here
 * and nowhere else.
 */
export const EXTRACTORS: Record<string, ExtractorFn> = {
  '.tsx': extractReact,
  '.jsx': extractReact,
  '.vue': extractVue,
  '.svelte': extractSvelte
}

export const SUPPORTED_EXTENSIONS: string[] = Object.keys(EXTRACTORS)

export const extractorFor = (file: string): ExtractorFn | null =>
  EXTRACTORS[extname(file).toLowerCase()] ?? null

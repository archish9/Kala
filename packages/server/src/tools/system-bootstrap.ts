import { access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  loadSystems, selectSystems, composeSystem, emitAll
} from '@kala/taste'
import { SYSTEMS_DIR } from '@kala/packs'
import type { PairReport, DesignSystem } from '@kala/taste'

export type BootstrapProposal = {
  id: string
  fit: number
  rationale: string
  signature: string[]
  palettePreview: string[]
}

export type BootstrapResult =
  | { mode: 'proposed'; proposals: BootstrapProposal[] }
  | {
      mode: 'applied'
      system: string
      files: string[]
      contrastReport: PairReport[]
    }

const exists = async (p: string): Promise<boolean> => {
  try { await access(p); return true } catch { return false }
}

/** Compose once and pull three representative swatches out of the result. */
const previewOf = (system: DesignSystem, accent?: string): string[] => {
  const t = composeSystem(system, accent)
  return [t.ramps.accent[500], t.light.bg, t.light.fg]
}

export const systemBootstrap = async (
  dir: string,
  brief: string,
  opts: { choice?: number; accent?: string; force?: boolean } = {}
): Promise<BootstrapResult> => {
  const root = resolve(dir)

  // Hard error, not degraded: refusing to write is the whole point.
  if (!await exists(root)) {
    throw new Error(`Bootstrap target does not exist: ${root}`)
  }

  const { systems, degraded } = await loadSystems(SYSTEMS_DIR)
  if (systems.length === 0) {
    throw new Error(
      `No design systems could be loaded: ${degraded.map(d => d.detail).join('; ')}`
    )
  }

  const proposals = selectSystems(brief, systems)

  if (opts.choice === undefined) {
    return {
      mode: 'proposed',
      proposals: proposals.map(p => ({
        id: p.system.id,
        fit: p.fit,
        rationale: p.rationale,
        signature: p.system.signature,
        palettePreview: previewOf(p.system, opts.accent)
      }))
    }
  }

  if (opts.choice < 1 || opts.choice > proposals.length) {
    throw new Error(
      `Invalid choice ${opts.choice}: expected 1..${proposals.length}.`
    )
  }

  if (!opts.force && await exists(join(root, 'design.lock.json'))) {
    throw new Error(
      'This project already has a design system (design.lock.json). ' +
      'Pass force to replace it — this rewrites the palette, type, and scales.'
    )
  }

  const chosen = proposals[opts.choice - 1]!
  const tokens = composeSystem(chosen.system, opts.accent)
  const { files } = await emitAll(root, tokens)

  return {
    mode: 'applied',
    system: chosen.system.id,
    files,
    contrastReport: tokens.report
  }
}

import { AXIS_NAMES, type Axes, type AxisName } from './types.js'

type Nudge = Partial<Record<AxisName, number>>

/**
 * Keyword lexicon. Each entry nudges one or more axes from the neutral 0.5
 * midpoint. Values are deliberately small: several weak signals agreeing should
 * outweigh one strong word, because briefs are prose and not a form.
 */
const LEXICON: Array<{ words: string[]; nudge: Nudge }> = [
  { words: ['bank', 'banking', 'compliance', 'audit', 'auditors', 'regulated', 'legal',
            'institutional', 'enterprise', 'procurement', 'formal', 'serious', 'government'],
    nudge: { formality: +0.12, energy: -0.06, expressiveness: -0.06 } },

  { words: ['fintech', 'invoice', 'invoicing', 'billing', 'accounting', 'payroll', 'tax'],
    nudge: { formality: +0.08, density: +0.05 } },

  { words: ['playful', 'fun', 'kids', 'children', 'game', 'gaming', 'toy', 'whimsical',
            'delightful', 'quirky'],
    nudge: { formality: -0.14, energy: +0.16, expressiveness: +0.10 } },

  { words: ['dashboard', 'analytics', 'admin', 'console', 'metrics', 'reporting',
            'table', 'tables', 'dense', 'grid', 'operational'],
    nudge: { density: +0.14, formality: +0.05, expressiveness: -0.05 } },

  { words: ['portfolio', 'editorial', 'magazine', 'publishing', 'gallery', 'showcase',
            'photographer', 'agency', 'creative', 'brand'],
    nudge: { expressiveness: +0.16, density: -0.10, energy: +0.05 } },

  { words: ['calm', 'quiet', 'minimal', 'restrained', 'focused', 'simple', 'clean'],
    nudge: { energy: -0.12, expressiveness: -0.06 } },

  { words: ['bold', 'loud', 'vibrant', 'energetic', 'striking', 'dramatic'],
    nudge: { energy: +0.14, expressiveness: +0.10 } },

  { words: ['wellness', 'health', 'meditation', 'care', 'therapy', 'mindful'],
    nudge: { energy: -0.08, formality: -0.05, expressiveness: +0.05 } },

  { words: ['developer', 'devtool', 'cli', 'api', 'infrastructure', 'engineering', 'terminal'],
    nudge: { formality: +0.08, density: +0.10, expressiveness: -0.08 } },

  { words: ['freelancer', 'freelancers', 'solo', 'indie', 'small', 'personal'],
    nudge: { formality: -0.08, density: -0.05 } },

  { words: ['luxury', 'premium', 'boutique', 'high-end', 'elegant'],
    nudge: { formality: +0.10, expressiveness: +0.10, density: -0.08 } },

  { words: ['marketing', 'landing', 'campaign', 'launch', 'conversion'],
    nudge: { expressiveness: +0.10, energy: +0.08, density: -0.08 } },

  { words: ['docs', 'documentation', 'guide', 'handbook', 'reference', 'blog'],
    nudge: { density: -0.08, expressiveness: +0.05, formality: +0.05 } },

  { words: ['trustworthy', 'trusted', 'secure', 'reliable', 'professional'],
    nudge: { formality: +0.08, energy: -0.05 } },

  { words: ['social', 'community', 'chat', 'messaging', 'feed'],
    nudge: { formality: -0.10, energy: +0.08 } }
]

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

export const briefToAxes = (text: string): { axes: Axes; matched: string[] } => {
  const axes: Axes = { formality: 0.5, density: 0.5, energy: 0.5, expressiveness: 0.5 }
  const matched: string[] = []

  const lower = text.toLowerCase()

  for (const entry of LEXICON) {
    for (const word of entry.words) {
      // Whole-word match: "gaming" must not fire inside "imagining".
      const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
      if (!re.test(lower)) continue
      matched.push(word)
      for (const axis of AXIS_NAMES) {
        const delta = entry.nudge[axis]
        if (delta !== undefined) axes[axis] += delta
      }
    }
  }

  for (const axis of AXIS_NAMES) axes[axis] = clamp01(axes[axis])
  return { axes, matched }
}

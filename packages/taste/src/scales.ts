/**
 * Modular type scale, snapped to whole pixels and capped at seven steps.
 * Beyond that, adjacent steps stop being distinguishable and hierarchy loses
 * its meaning. Two steps below the base and four above covers caption through
 * display without inventing sizes nobody uses.
 */
export const typeScale = (baseSize: number, ratio: number, steps = 7): number[] => {
  const below = 2
  const out = new Set<number>()

  for (let i = -below; i < steps - below; i++) {
    const px = Math.round(baseSize * ratio ** i)
    out.add(Math.max(12, px))
  }

  return [...out].sort((a, b) => a - b).slice(0, steps)
}

const RHYTHM_MULTIPLIERS: Record<'tight' | 'normal' | 'generous', number[]> = {
  tight:    [0, 1, 2, 3, 4, 5, 6, 8, 10],
  normal:   [0, 1, 2, 3, 4, 6, 8, 12, 16],
  generous: [0, 1, 2, 4, 6, 8, 12, 16, 24]
}

export const spaceScale = (
  base: number, rhythm: 'tight' | 'normal' | 'generous'
): number[] => RHYTHM_MULTIPLIERS[rhythm].map(m => m * base)

/**
 * A square option always exists: some elements should not be rounded even in a
 * rounded system, and the alternative is an arbitrary value in the markup.
 */
export const radiusScale = (radius: number): number[] => {
  const out = new Set<number>([0, radius, radius * 2, 9999])
  return [...out].sort((a, b) => a - b)
}

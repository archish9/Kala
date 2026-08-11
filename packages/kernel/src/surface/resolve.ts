const PATTERNS: RegExp[] = [
  /(?:^|\/)app\/(.+?)\/page\.[jt]sx?$/,      // Next app router
  /(?:^|\/)routes\/(.+?)\/\+page\.svelte$/,  // SvelteKit
  /(?:^|\/)pages\/(.+?)\.[jt]sx?$/           // Next pages router
]

export const resolveSurface = (
  file: string,
  overrides: Record<string, string> = {}
): string => {
  const direct = overrides[file]
  if (direct) return direct

  const norm = file.replace(/\\/g, '/')
  for (const re of PATTERNS) {
    const captured = re.exec(norm)?.[1]
    if (captured) return captured.replace(/\/index$/, '')
  }
  return file
}

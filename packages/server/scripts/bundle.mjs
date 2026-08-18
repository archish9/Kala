/**
 * Builds the publish-ready npm package for the MCP server.
 *
 * Output is a self-contained staging directory, `packages/server/dist/npm/`,
 * that `npm publish` is pointed at directly. Staging rather than publishing the
 * workspace package itself keeps the internal name (`@kala/server`, what every
 * `pnpm --filter` in the docs uses) separate from the published name
 * (`kala-mcp`, what `npx` runs), and means nothing is published by accident —
 * the package is exactly what this script put in the directory.
 *
 * The `@kala/*` packages are bundled in; publishing 8 packages that must be
 * versioned in lockstep is worse than one flat file. Everything installed from
 * a registry stays external, because several of them resolve things at runtime
 * that a bundler cannot see: `jiti` transpiles the consumer's tailwind config,
 * `playwright` is imported dynamically and is meant to stay optional, and the
 * framework compilers are large enough that bundling them buys nothing.
 *
 * Pack data (rules, systems, surfaces, guides, catalog) is read from disk at
 * runtime by `@kala/packs`, which walks up from its own module URL looking for
 * each directory. Bundled, that module URL is the bundle's own path, so the
 * data has to ship beside it.
 */
import { build } from 'esbuild'
import { cp, mkdir, readFile, readdir, writeFile, chmod, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(pkgRoot, '../..')
const stage = join(pkgRoot, 'dist/npm')

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

/** Every workspace package, so the published dependency list can be derived. */
const workspacePackages = async () => {
  const roots = ['packages', 'packages/extractors']
  const found = []
  for (const root of roots) {
    for (const entry of await readdir(join(repoRoot, root), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const manifest = join(repoRoot, root, entry.name, 'package.json')
      try {
        found.push(await readJson(manifest))
      } catch {
        // packages/extractors itself has no manifest; skip non-packages.
      }
    }
  }
  return found
}

/**
 * The published `dependencies` are the union of every workspace package's own
 * registry dependencies. Deriving them beats hand-maintaining a second list
 * that silently rots the first time a package picks up a new dependency.
 */
const publishedDependencies = (packages) => {
  const deps = {}
  for (const pkg of packages) {
    for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
      if (range.startsWith('workspace:')) continue
      if (deps[name] && deps[name] !== range) {
        throw new Error(`${name} is declared as both ${deps[name]} and ${range}; reconcile them before publishing.`)
      }
      deps[name] = range
    }
  }
  return Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)))
}

const bundleWorkspaceOnly = {
  name: 'bundle-workspace-only',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === 'entry-point') return null
      const isRelative = args.path.startsWith('.') || args.path.startsWith('/')
      if (isRelative || args.path.startsWith('@kala/')) return null
      return { path: args.path, external: true }
    })
  },
}

await rm(stage, { recursive: true, force: true })
await mkdir(stage, { recursive: true })

const outfile = join(stage, 'bundle.js')
await build({
  absWorkingDir: pkgRoot,
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile,
  plugins: [bundleWorkspaceOnly],
  logLevel: 'info',
})

// esbuild's handling of the entry file's shebang is not something to depend on:
// without it `npx kala-mcp` gets run as a shell script.
const bundled = await readFile(outfile, 'utf8')
if (!bundled.startsWith('#!')) await writeFile(outfile, `#!/usr/bin/env node\n${bundled}`)
await chmod(outfile, 0o755)

for (const dir of ['rules', 'systems', 'surfaces', 'guides', 'catalog']) {
  await cp(join(repoRoot, 'packages/packs', dir), join(stage, dir), { recursive: true })
}

// Apache-2.0 §4 and the MIT attribution for the harvested material travel with
// the artifact, not just the repo. See ATTRIBUTION.md.
for (const file of ['LICENSE', 'NOTICE']) await cp(join(repoRoot, file), join(stage, file))
await cp(join(repoRoot, 'LICENSES'), join(stage, 'LICENSES'), { recursive: true })
await cp(join(repoRoot, 'README.md'), join(stage, 'README.md'))

const server = await readJson(join(pkgRoot, 'package.json'))
await writeFile(
  join(stage, 'package.json'),
  JSON.stringify(
    {
      name: 'kala-mcp',
      version: server.version,
      description: 'MCP server that holds a project’s design system as data and checks frontend code against it.',
      type: 'module',
      bin: { 'kala-mcp': './bundle.js' },
      engines: { node: '>=20' },
      dependencies: publishedDependencies(await workspacePackages()),
      // The `inspect` tool degrades gracefully without it; a ~115MB Chromium
      // download is not something to force on every install.
      peerDependencies: { playwright: '>=1.40.0' },
      peerDependenciesMeta: { playwright: { optional: true } },
      license: 'Apache-2.0',
      homepage: 'https://github.com/archish9/Kala',
      repository: { type: 'git', url: 'git+https://github.com/archish9/Kala.git' },
      keywords: ['mcp', 'design-system', 'frontend', 'ui', 'design-review', 'accessibility'],
    },
    null,
    2,
  ) + '\n',
)

console.log(`staged kala-mcp@${server.version} -> packages/server/dist/npm (npm publish that directory)`)

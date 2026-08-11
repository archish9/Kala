import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const src = (p: string) => resolve(import.meta.dirname, p)

export default defineConfig({
  test: {
    include: ['packages/**/tests/**/*.test.ts'],
    environment: 'node'
  },
  resolve: {
    // Package exports point at built JS so the shipped bin runs under plain
    // node. Tests alias back to source, so the suite never needs a build.
    alias: [
      {
        find: /^@fe-design\/kernel\/(.*)\.js$/,
        replacement: src('packages/kernel/src/$1.ts')
      },
      { find: '@fe-design/kernel', replacement: src('packages/kernel/src/index.ts') },
      {
        find: '@fe-design/extractor-react',
        replacement: src('packages/extractors/react/src/index.ts')
      },
      { find: '@fe-design/packs', replacement: src('packages/packs/src/index.ts') },
      { find: '@fe-design/taste', replacement: src('packages/taste/src/index.ts') }
    ]
  }
})

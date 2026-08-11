import { absent, type Fact } from './fact.js'

export type Len = { px: number }
export type Box = { top: number; right: number; bottom: number; left: number }
export type Color = { hex: string }
export type ShadowSpec = { raw: string }

export type StyleFacts = {
  space: { padding: Fact<Box>; margin: Fact<Box>; gap: Fact<Len> }
  type: {
    size: Fact<Len>; weight: Fact<number>; leading: Fact<Len>
    tracking: Fact<Len>; family: Fact<string>
  }
  color: { fg: Fact<Color>; bg: Fact<Color>; border: Fact<Color> }
  shape: { radius: Fact<Len>; borderWidth: Fact<Len>; shadow: Fact<ShadowSpec> }
  layout: { display: Fact<string>; direction: Fact<string>; align: Fact<string> }
  raw: string[]
}

export const emptyStyleFacts = (): StyleFacts => ({
  space: { padding: absent(), margin: absent(), gap: absent() },
  type: {
    size: absent(), weight: absent(), leading: absent(),
    tracking: absent(), family: absent()
  },
  color: { fg: absent(), bg: absent(), border: absent() },
  shape: { radius: absent(), borderWidth: absent(), shadow: absent() },
  layout: { display: absent(), direction: absent(), align: absent() },
  raw: []
})

export type BranchSemantic =
  | 'loading' | 'error' | 'empty' | 'success' | 'disabled' | 'permission'

export type Branch = {
  id: string
  kind: 'conditional' | 'loop' | 'error-boundary' | 'suspense'
  condition: string
  semantic: BranchSemantic | null
}

export type DataSource = {
  id: string
  kind: 'fetch' | 'query' | 'load'
  raw: string
  branches: string[]
}

export type ImportRec = { name: string; from: string }

export type IRNode = {
  id: string
  kind: 'element' | 'component' | 'text' | 'slot'
  name: string
  parent: string | null
  children: string[]
  style: StyleFacts
  text: string | null
  branch: string | null
  loc: { line: number; col: number }
}

export type IRDoc = {
  file: string
  framework: 'react' | 'vue' | 'svelte' | 'html'
  nodes: IRNode[]
  imports: ImportRec[]
  dataSources: DataSource[]
  branches?: Branch[]
}

export const makeNode = (
  p: Partial<IRNode> & { id: string; name: string }
): IRNode => ({
  kind: 'element',
  parent: null,
  children: [],
  style: emptyStyleFacts(),
  text: null,
  branch: null,
  loc: { line: 1, col: 0 },
  ...p
})

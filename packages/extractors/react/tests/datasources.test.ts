import { describe, it, expect } from 'vitest'
import { extractReact } from '../src/index.js'

describe('extractReact — data sources', () => {
  it('finds a bare fetch call', () => {
    const doc = extractReact(
      `export default function P() {
         const go = () => fetch('/api/x')
         return <button onClick={go}>go</button>
       }`, 'p.tsx')
    expect(doc.dataSources.map(d => d.kind)).toContain('fetch')
  })

  it('finds a react-query hook', () => {
    const doc = extractReact(
      `export default function P() {
         const { data } = useQuery(['k'], load)
         return <div>{data}</div>
       }`, 'p.tsx')
    expect(doc.dataSources.map(d => d.kind)).toContain('query')
  })

  it('finds useSWR and a SvelteKit-style load', () => {
    const swr = extractReact(
      'export default function P() { const { data } = useSWR("/k", f); return <div/> }',
      'p.tsx')
    expect(swr.dataSources.map(d => d.kind)).toContain('query')
  })

  it('keeps the call source text for the finding message', () => {
    const doc = extractReact(
      'export default function P() { const { data } = useQuery(["users"], load); return <div/> }',
      'p.tsx')
    expect(doc.dataSources[0]?.raw).toContain('useQuery')
  })

  it('links every branch in the component to the source', () => {
    const doc = extractReact(
      `export default function P() {
         const { data, isLoading, error } = useQuery(['k'], load)
         if (isLoading) return <Spinner/>
         if (error) return <Err/>
         return <div>{data}</div>
       }`, 'p.tsx')
    const ds = doc.dataSources[0]!
    const semantics = ds.branches
      .map(id => doc.branches!.find(b => b.id === id)?.semantic)
    expect(semantics).toContain('loading')
    expect(semantics).toContain('error')
  })

  it('reports no branches when the component has none', () => {
    const doc = extractReact(
      'export default function P() { const { data } = useQuery(["k"], load); return <div>{data}</div> }',
      'p.tsx')
    expect(doc.dataSources[0]?.branches).toEqual([])
  })

  it('finds nothing in a component that fetches nothing', () => {
    expect(extractReact('export default () => <div>static</div>', 'p.tsx').dataSources)
      .toEqual([])
  })

  it('does not treat a local helper named fetchLabel as a fetch', () => {
    const doc = extractReact(
      'export default function P() { const x = fetchLabel(); return <div>{x}</div> }',
      'p.tsx')
    expect(doc.dataSources).toEqual([])
  })
})

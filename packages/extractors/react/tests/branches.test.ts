import { describe, it, expect } from 'vitest'
import { extractReact } from '../src/index.js'
import { inferSemantic } from '../src/branches.js'

describe('inferSemantic', () => {
  it('recognises loading conditions', () => {
    expect(inferSemantic('isLoading')).toBe('loading')
    expect(inferSemantic('isPending')).toBe('loading')
    expect(inferSemantic('query.isFetching')).toBe('loading')
  })

  it('recognises error conditions', () => {
    expect(inferSemantic('error')).toBe('error')
    expect(inferSemantic('isError')).toBe('error')
    expect(inferSemantic('err !== null')).toBe('error')
  })

  it('recognises empty conditions', () => {
    expect(inferSemantic('items.length === 0')).toBe('empty')
    expect(inferSemantic('!data?.length')).toBe('empty')
    expect(inferSemantic('isEmpty')).toBe('empty')
  })

  it('recognises disabled and permission conditions', () => {
    expect(inferSemantic('disabled')).toBe('disabled')
    expect(inferSemantic('!canEdit')).toBe('permission')
  })

  it('returns null for a condition it cannot classify', () => {
    expect(inferSemantic('ok')).toBeNull()
    expect(inferSemantic('user.name === "bob"')).toBeNull()
  })

  it('does not classify on a substring match', () => {
    expect(inferSemantic('errorlessMode')).toBeNull()
  })

  it('does not read "cancel" as a permission branch', () => {
    expect(inferSemantic('cancel')).toBeNull()
    expect(inferSemantic('isCancelled')).toBeNull()
  })

  it('recognises an optional-chained length check', () => {
    expect(inferSemantic('!data?.length')).toBe('empty')
    expect(inferSemantic('!data.length')).toBe('empty')
  })
})

describe('extractReact — branches', () => {
  it('records an early-return guard as a conditional branch', () => {
    const doc = extractReact(
      `export default function P({ isLoading }: { isLoading: boolean }) {
         if (isLoading) return <Spinner/>
         return <div>done</div>
       }`, 'p.tsx')
    const loading = doc.branches!.find(b => b.semantic === 'loading')
    expect(loading).toBeDefined()
    expect(loading!.kind).toBe('conditional')
  })

  it('records a logical-and guard', () => {
    const doc = extractReact(
      'export default ({items}: any) => <div>{items.length === 0 && <Empty/>}</div>',
      'p.tsx')
    expect(doc.branches!.some(b => b.semantic === 'empty')).toBe(true)
  })

  it('records a ternary as one conditional branch', () => {
    const doc = extractReact(
      'export default ({ok}: any) => <div>{ok ? <A/> : <B/>}</div>', 'p.tsx')
    expect(doc.branches!.filter(b => b.kind === 'conditional').length)
      .toBeGreaterThanOrEqual(1)
  })

  it('records a map call as a loop branch', () => {
    const doc = extractReact(
      'export default ({items}: any) => <ul>{items.map((i: any) => <li key={i}/>)}</ul>',
      'p.tsx')
    expect(doc.branches!.some(b => b.kind === 'loop')).toBe(true)
  })

  it('attaches the branch id to elements rendered inside it', () => {
    const doc = extractReact(
      'export default ({items}: any) => <div>{items.length === 0 && <Empty/>}</div>',
      'p.tsx')
    const empty = doc.nodes.find(n => n.name === 'Empty')!
    expect(empty.branch).not.toBeNull()
    const branch = doc.branches!.find(b => b.id === empty.branch)
    expect(branch?.semantic).toBe('empty')
  })

  it('leaves unconditional elements with a null branch', () => {
    const doc = extractReact('export default () => <div>always</div>', 'p.tsx')
    expect(doc.nodes[0]?.branch).toBeNull()
  })

  it('keeps the condition source text for the finding message', () => {
    const doc = extractReact(
      'export default ({items}: any) => <div>{items.length === 0 && <Empty/>}</div>',
      'p.tsx')
    expect(doc.branches!.some(b => b.condition.includes('items.length'))).toBe(true)
  })
})

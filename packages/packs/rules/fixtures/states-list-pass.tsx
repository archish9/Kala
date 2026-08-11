export default function P({ items }: any) {
  if (items.length === 0) return <Empty/>
  return <ul>{items.map((i: any) => <li key={i}/>)}</ul>
}

export default function P({ items }: any) {
  return <ul>{items.map((i: any) => <li key={i}/>)}</ul>
}

export default function P({ q }: any) {
  const { items, isLoading, error } = useQuery(['k'], q)
  if (isLoading) return <Spinner/>
  if (error) return <Err/>
  return <ul>{items.map((i: any) => <li key={i}/>)}</ul>
}

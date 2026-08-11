export default function P({ q }: any) {
  const { data, error } = useQuery(['k'], q)
  if (error) return <Err/>
  return <div>{data}</div>
}

export default function P({ q }: any) {
  const { data } = useQuery(['k'], q)
  return <div>{data}</div>
}

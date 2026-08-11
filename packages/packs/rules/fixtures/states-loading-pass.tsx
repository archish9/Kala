export default function P({ q }: any) {
  const { data, isLoading, error } = useQuery(['k'], q)
  if (isLoading) return <Spinner/>
  if (error) return <Err/>
  return <div>{data}</div>
}

declare function cn(...a: unknown[]): string

export default function Card({ tone }: { tone: string }) {
  return (
    <div className={`p-4 ${tone}`}>
      <span className={cn('text-sm', tone)}>Hi</span>
    </div>
  )
}

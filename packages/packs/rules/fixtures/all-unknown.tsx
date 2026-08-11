declare function cn(...a: unknown[]): string

export default function X({ tone }: { tone: string }) {
  return (
    <div className={`p-4 ${tone}`}>
      <p className={cn('text-sm text-gray-400', tone)}>hi</p>
    </div>
  )
}

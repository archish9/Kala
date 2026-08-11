export default function Card({ tone }) {
    return (<div className={`p-4 ${tone}`}>
      <span className={cn('text-sm', tone)}>Hi</span>
    </div>);
}

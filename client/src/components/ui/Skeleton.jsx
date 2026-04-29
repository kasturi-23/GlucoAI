export function Skeleton({ className = '', ...props }) {
  return <div className={`skeleton ${className}`} {...props} />;
}

export function CardSkeleton({ rows = 3 }) {
  return (
    <div className="card space-y-3">
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`h-4 w-${i % 2 === 0 ? 'full' : '3/4'}`} />
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="card">
      <Skeleton className="h-5 w-48 mb-4" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

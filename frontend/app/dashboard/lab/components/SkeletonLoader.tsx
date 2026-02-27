export function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-card border border-border rounded-lg p-6 animate-pulse">
          <div className="h-4 bg-background rounded w-1/2 mb-4"></div>
          <div className="h-8 bg-background rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-background rounded w-1/3"></div>
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="bg-card border border-border rounded-lg p-6 animate-pulse">
      <div className="h-6 bg-background rounded w-1/4 mb-6"></div>
      <div className="h-64 bg-background rounded"></div>
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden animate-pulse">
      <div className="p-4 bg-background/50">
        <div className="h-5 bg-background rounded w-1/3"></div>
      </div>
      <div className="divide-y divide-border">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="p-4 flex gap-4">
            <div className="h-4 bg-background rounded flex-1"></div>
            <div className="h-4 bg-background rounded flex-1"></div>
            <div className="h-4 bg-background rounded flex-1"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

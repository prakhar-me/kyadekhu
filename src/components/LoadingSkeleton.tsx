import { gridClass } from './MovieGrid';

export function GridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className={gridClass} aria-busy="true" aria-label="Loading movies">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="skeleton aspect-[2/3] rounded-xl" />
          <div className="skeleton mt-3 h-5 w-4/5 rounded" />
          <div className="skeleton mt-2 h-3 w-1/2 rounded" />
          <div className="skeleton mt-3 h-3 w-full rounded" />
        </div>
      ))}
    </div>
  );
}

export function DetailsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading movie">
      <div className="skeleton h-[42vh] w-full sm:h-[56vh]" />
      <div className="page -mt-28 flex flex-col gap-6 sm:flex-row sm:gap-10">
        <div className="skeleton aspect-[2/3] w-36 shrink-0 rounded-xl sm:w-56" />
        <div className="flex-1 pt-4 sm:pt-32">
          <div className="skeleton h-10 w-3/4 rounded" />
          <div className="skeleton mt-4 h-4 w-1/2 rounded" />
          <div className="skeleton mt-8 h-4 w-full rounded" />
          <div className="skeleton mt-2 h-4 w-11/12 rounded" />
          <div className="skeleton mt-2 h-4 w-2/3 rounded" />
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';

export const gridClass = 'grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 xl:grid-cols-5';

export function MovieGrid({ children }: { children: ReactNode }) {
  return <div className={gridClass}>{children}</div>;
}

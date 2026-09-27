/** Route-level loading state: mirrors the app bar + grouped-list layout so nothing jumps when the screen arrives. */
export function ScreenSkeleton() {
  const bar = "rounded-full bg-surface-2 motion-safe:animate-pulse";
  return (
    <div aria-busy="true" aria-label="Loading" className="px-4 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex h-14 items-center justify-between">
        <div className={`${bar} h-6 w-20`} />
        <div className={`${bar} size-9`} />
      </div>
      <div className={`${bar} mt-4 h-8 w-2/3`} />
      <div className={`${bar} mt-3 h-4 w-1/2`} />
      <div className="mt-8 space-y-3 rounded-[20px] bg-surface p-4">
        <div className={`${bar} h-4 w-full`} />
        <div className={`${bar} h-4 w-5/6`} />
        <div className={`${bar} h-4 w-2/3`} />
      </div>
      <div className="mt-4 h-40 rounded-[20px] bg-surface motion-safe:animate-pulse" />
    </div>
  );
}

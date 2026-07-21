export function ResponseSkeleton() {
  return (
    <div role="status" aria-live="polite" className="mt-6 max-w-xl">
      <span className="sr-only">Generating response…</span>
      <div aria-hidden="true" className="flex flex-col gap-2.5">
        <span className="h-3 w-full animate-pulse rounded-full bg-surface-raised" />
        <span className="h-3 w-[86%] animate-pulse rounded-full bg-surface-raised [animation-delay:120ms]" />
        <span className="h-3 w-[58%] animate-pulse rounded-full bg-surface-raised [animation-delay:240ms]" />
      </div>
    </div>
  );
}

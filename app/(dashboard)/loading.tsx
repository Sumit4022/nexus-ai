export default function WorkspaceLoading() {
  return (
    <main className="mx-auto max-w-[1320px] px-5 py-10 sm:px-8" aria-live="polite">
      <div className="h-3 w-32 animate-pulse rounded bg-violet-300/15" />
      <div className="mt-4 h-9 w-64 animate-pulse rounded-lg bg-white/[.06]" />
      <div className="mt-3 h-4 max-w-lg animate-pulse rounded bg-white/[.04]" />
      <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="surface-card h-48 animate-pulse rounded-2xl" />)}
      </div>
    </main>
  );
}

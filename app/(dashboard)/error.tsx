"use client";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl items-center px-5 py-12 sm:px-8">
      <section className="surface-card w-full rounded-2xl p-7 sm:p-9">
        <p className="eyebrow text-[10px] font-semibold uppercase">Workspace interrupted</p>
        <h1 className="mt-3 text-2xl font-semibold">That didn’t load as expected.</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500">Your account data is safe. Try loading this view again, or return to your dashboard.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => reset()} className="rounded-xl bg-violet-300 px-4 py-2.5 text-sm font-semibold text-[#171322] transition hover:bg-violet-200">Try again</button>
          <a href="/dashboard" className="rounded-xl border border-white/[.1] px-4 py-2.5 text-sm text-gray-300 transition hover:bg-white/[.05]">Go to dashboard</a>
        </div>
      </section>
    </main>
  );
}

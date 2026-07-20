export default function AlertsLoading() {
  return (
    <div className="flex h-screen flex-col bg-[var(--color-base)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <div className="h-5 w-40 animate-pulse rounded bg-white/20" />
        <div className="mt-2 h-6 w-56 animate-pulse rounded bg-white/20" />
      </header>
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-[var(--color-ink)]/50">Loading alert candidates…</p>
      </div>
    </div>
  )
}

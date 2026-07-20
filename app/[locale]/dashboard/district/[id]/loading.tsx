export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--color-base)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-primary)] px-6 py-4">
        <div className="h-3 w-32 animate-pulse rounded bg-white/20" />
        <div className="mt-2 h-5 w-48 animate-pulse rounded bg-white/30" />
      </header>
      <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]" />
        ))}
      </div>
    </div>
  )
}

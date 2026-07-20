export default function Loading() {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--color-base)]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-primary)] border-t-transparent" />
        <p className="text-sm text-[var(--color-ink)]/50">Loading dashboard…</p>
      </div>
    </div>
  )
}

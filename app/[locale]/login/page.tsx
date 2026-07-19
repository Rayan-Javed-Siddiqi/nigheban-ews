import { signIn } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--color-base)] px-4">
      {/* Subtle topographic contour background */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]"
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMid slice"
      >
        {[...Array(10)].map((_, i) => (
          <path
            key={i}
            d={`M -50 ${80 + i * 55} Q 200 ${20 + i * 55}, 400 ${80 + i * 55} T 850 ${80 + i * 55}`}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="1.5"
          />
        ))}
      </svg>

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)]">
            <span className="font-mono text-lg font-semibold text-white">N</span>
          </div>
          <h1 className="text-xl font-semibold text-[var(--color-ink)]">
            Nigheban
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink)]/60">
            Multi-Hazard Early Warning Platform
          </p>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <form action={signIn} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-[var(--color-ink)]"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
                placeholder="you@nigheban.gov.pk"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-[var(--color-ink)]"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-md bg-[var(--color-emergency)]/10 px-3 py-2 text-sm text-[var(--color-emergency)]">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="w-full rounded-md bg-[var(--color-primary)] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
            >
              Sign in
            </button>
          </form>
        </div>

        <p className="mt-6 text-center font-mono text-xs text-[var(--color-ink)]/40">
          KP &amp; GB Provincial Duty Console
        </p>
      </div>
    </main>
  )
}
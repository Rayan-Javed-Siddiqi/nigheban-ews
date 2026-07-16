import { createClient } from '@/lib/supabase/server'

export default async function SourceHealthFooter() {
  const supabase = await createClient()
  const { data: sources } = await supabase
    .from('ingest_status')
    .select('source, status, last_success_at')
    .order('source')

  if (!sources || sources.length === 0) return null

  return (
    <div className="flex items-center gap-4 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-2 text-xs">
      {sources.map((s) => (
        <span key={s.source} className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[var(--color-ink)]/60">
          <span className={`h-1.5 w-1.5 rounded-full ${s.status === 'ok' ? 'bg-[var(--color-primary-hover)]' : 'bg-[var(--color-emergency)]'}`} />
          {s.source}
          {s.last_success_at && (
            <span className="text-[var(--color-ink)]/40">
              {new Date(s.last_success_at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}
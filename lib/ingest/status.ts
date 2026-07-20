import type { SupabaseClient } from '@supabase/supabase-js'

export type IngestStatusValue = 'ok' | 'degraded' | 'failed' | 'unknown'

/** Write ingest heartbeat — never overwrites last_success_at on failure. */
export async function writeIngestStatus(
  supabase: SupabaseClient,
  source: string,
  status: IngestStatusValue,
  error?: string
) {
  const row: Record<string, unknown> = { source, status }

  if (status === 'ok') {
    row.last_success_at = new Date().toISOString()
    row.last_error = null
    row.last_error_at = null
  } else {
    row.last_error = error ?? 'Unknown error'
    row.last_error_at = new Date().toISOString()
  }

  const { error: upsertError } = await supabase
    .from('ingest_status')
    .upsert(row, { onConflict: 'source' })

  if (upsertError) {
    console.error(`[ingest:${source}] ingest_status write failed:`, upsertError.message)
  }
}

/** Persist raw scrape output for audit and schema-drift debugging. */
export async function saveScrapeSnapshot(
  supabase: SupabaseClient,
  params: {
    source: string
    url: string
    statusCode?: number | null
    rawHtml?: string | null
    fetchError?: string | null
  }
) {
  const { error } = await supabase.from('scrape_snapshot').insert({
    source: params.source,
    url: params.url,
    status_code: params.statusCode ?? null,
    raw_html: params.rawHtml?.slice(0, 50000) ?? null,
    fetch_error: params.fetchError ?? null,
  })

  if (error) {
    console.error(`[ingest:${params.source}] scrape_snapshot write failed:`, error.message)
  }
}

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

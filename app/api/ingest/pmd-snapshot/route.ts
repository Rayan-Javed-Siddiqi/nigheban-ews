import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

const PMD_URL = 'https://ffd.pmd.gov.pk/river-flows-comparison'

export async function GET() {
  const supabase = createAdminClient()

  try {
    const res = await fetch(PMD_URL, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    const html = await res.text()

    await supabase.from('scrape_snapshot').insert({
      source: 'pmd_ffd',
      url: PMD_URL,
      status_code: res.status,
      raw_html: html.slice(0, 50000), // cap size, this is a snapshot not a mirror
      fetch_error: res.ok ? null : `HTTP ${res.status}`,
    })

    await supabase.from('ingest_status').upsert(
      {
        source: 'pmd_ffd',
        status: res.ok ? 'ok' : 'degraded',
        last_success_at: res.ok ? new Date().toISOString() : undefined,
        last_error: res.ok ? null : `HTTP ${res.status} — page likely bot-protected/JS-rendered, see scrape_snapshot table`,
        last_error_at: res.ok ? null : new Date().toISOString(),
      },
      { onConflict: 'source' }
    )

    return NextResponse.json({
      fetched: true,
      status_code: res.status,
      html_length: html.length,
      note: 'Snapshot saved to scrape_snapshot table. Parsing not yet implemented (site is JS-rendered/bot-protected) — manual entry remains the working fallback on the District Console.',
    })
  } catch (err) {
    await supabase.from('scrape_snapshot').insert({
      source: 'pmd_ffd',
      url: PMD_URL,
      fetch_error: String(err),
    })

    await supabase.from('ingest_status').upsert(
      { source: 'pmd_ffd', status: 'failed', last_error: String(err), last_error_at: new Date().toISOString() },
      { onConflict: 'source' }
    )

    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
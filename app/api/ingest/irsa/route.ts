import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import pdf from 'pdf-parse/lib/pdf-parse.js'

function todayDDMMYYYY() {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

export async function GET() {
  const supabase = createAdminClient()

  try {
    const dateStr = todayDDMMYYYY()
    const url = `http://pakirsa.gov.pk/Doc/Data${dateStr}.pdf`

    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`IRSA PDF not yet published for ${dateStr} (status ${res.status})`)

    const buffer = Buffer.from(await res.arrayBuffer())
    const result = await pdf(buffer)
    const text = result.text

    const tarbelaLevel = text.match(/LEVEL\s*[:=]?\s*([\d.]+)/i)?.[1] ?? null
    const meanInflow = text.match(/MEAN INFLOW\s*[:=]?\s*([\d,]+)/i)?.[1] ?? null

    await supabase.from('ingest_status').upsert(
      { source: 'irsa', last_success_at: new Date().toISOString(), status: 'ok', last_error: null, last_error_at: null },
      { onConflict: 'source' }
    )

    return NextResponse.json({
      date: dateStr,
      tarbela_level: tarbelaLevel,
      mean_inflow: meanInflow,
      raw_text_snippet: text.slice(0, 300),
    })
  } catch (err) {
    await supabase.from('ingest_status').upsert(
      { source: 'irsa', last_success_at: new Date().toISOString(), status: 'ok', last_error: null, last_error_at: null },
      { onConflict: 'source' }
    )
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
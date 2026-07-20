import { createAdminClient } from '@/lib/supabase/admin'
import { hasReservoirData, parseIrsaReservoirs } from '@/lib/ingest/irsa-parser'
import { saveScrapeSnapshot, writeIngestStatus } from '@/lib/ingest/status'
import { NextResponse } from 'next/server'
import pdf from 'pdf-parse/lib/pdf-parse.js'

const SOURCE = 'irsa'

function todayDDMMYYYY() {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export async function GET() {
  const supabase = createAdminClient()
  const dateStr = todayDDMMYYYY()
  const url = `http://pakirsa.gov.pk/Doc/Data${dateStr}.pdf`

  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`IRSA PDF not yet published for ${dateStr} (status ${res.status})`)
    }

    const buffer = Buffer.from(await res.arrayBuffer())
    const result = await pdf(buffer)
    const text = result.text

    await saveScrapeSnapshot(supabase, {
      source: SOURCE,
      url,
      statusCode: res.status,
      rawHtml: text.slice(0, 50000),
    })

    const readings = parseIrsaReservoirs(text)
    if (!hasReservoirData(readings)) {
      throw new Error(
        'IRSA PDF parsed but no reservoir fields matched — page layout may have changed'
      )
    }

    const readingDate = todayISO()
    let upserted = 0
    const upsertErrors: string[] = []

    for (const r of readings) {
      const { error } = await supabase.from('reservoir_reading').upsert(
        {
          reservoir_name: r.reservoir_name,
          reading_date: readingDate,
          level_ft: r.level_ft,
          inflow_cusecs: r.inflow_cusecs,
          outflow_cusecs: r.outflow_cusecs,
          mean_inflow_cusecs: r.mean_inflow_cusecs,
          raw: r,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'reservoir_name,reading_date' }
      )
      if (error) {
        console.error(`[ingest:${SOURCE}] upsert failed for ${r.reservoir_name}:`, error.message)
        upsertErrors.push(`${r.reservoir_name}: ${error.message}`)
      } else {
        upserted++
      }
    }

    if (upserted === 0) {
      // Still return parsed data — PDF fetch succeeded even if DB write failed
      await writeIngestStatus(
        supabase,
        SOURCE,
        'degraded',
        upsertErrors.join('; ') || 'DB upsert failed'
      )
      return NextResponse.json({
        ok: true,
        degraded: true,
        date: dateStr,
        reservoirs_upserted: 0,
        readings,
        db_errors: upsertErrors,
      })
    }

    await writeIngestStatus(supabase, SOURCE, 'ok')

    return NextResponse.json({
      ok: true,
      date: dateStr,
      reservoirs_upserted: upserted,
      readings,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ingest:${SOURCE}]`, message)

    await saveScrapeSnapshot(supabase, {
      source: SOURCE,
      url,
      statusCode: null,
      fetchError: message,
    })
    await writeIngestStatus(supabase, SOURCE, 'failed', message)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

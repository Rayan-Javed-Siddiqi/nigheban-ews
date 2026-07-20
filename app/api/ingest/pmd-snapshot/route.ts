import { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchPmdFfdSnapshot,
  PMD_RIVER_FLOWS_URL,
  PMD_LISTING_URL,
  riversToLegacyJson,
} from '@/lib/ingest/pmd-fetch'
import { BROWSER_UA, saveScrapeSnapshot, writeIngestStatus } from '@/lib/ingest/status'
import { NextResponse } from 'next/server'

const SOURCE = 'pmd_ffd'

export async function GET() {
  const supabase = createAdminClient()

  try {
    const listingRes = await fetch(PMD_LISTING_URL, {
      headers: { 'User-Agent': BROWSER_UA },
      cache: 'no-store',
    })
    if (listingRes.ok) {
      await saveScrapeSnapshot(supabase, {
        source: SOURCE,
        url: PMD_LISTING_URL,
        statusCode: listingRes.status,
        rawHtml: await listingRes.text(),
      })
    }

    const flowsRes = await fetch(PMD_RIVER_FLOWS_URL, {
      headers: { 'User-Agent': BROWSER_UA },
      cache: 'no-store',
    })
    await saveScrapeSnapshot(supabase, {
      source: `${SOURCE}_river_flows`,
      url: PMD_RIVER_FLOWS_URL,
      statusCode: flowsRes.status,
      rawHtml: flowsRes.ok ? await flowsRes.text() : null,
      fetchError: flowsRes.ok ? null : `HTTP ${flowsRes.status}`,
    })

    const { pdfBuffer, rivers, ...bulletin } = await fetchPmdFfdSnapshot()

    let snapshotPath: string | null = null
    const uploadPath = `pmd/bulletin_${bulletin.bulletin_id}_${Date.now()}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('raw-snapshots')
      .upload(uploadPath, pdfBuffer, { contentType: 'application/pdf' })
    if (!uploadError) snapshotPath = uploadPath

    const { error: insertError } = await supabase.from('pmd_forecasts').insert({
      ...bulletin,
      rivers: riversToLegacyJson(rivers),
      snapshot_path: snapshotPath,
    })
    if (insertError) {
      throw new Error(`pmd_forecasts insert failed: ${insertError.message}`)
    }

    await writeIngestStatus(supabase, SOURCE, 'ok')

    return NextResponse.json({
      ok: true,
      bulletinId: bulletin.bulletin_id,
      matchedByDate: bulletin.matched_by_date,
      warningLevel: bulletin.warning_level,
      riversFound: rivers.length,
      riverFlowsPageOk: flowsRes.ok,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ingest:${SOURCE}]`, message)
    await writeIngestStatus(supabase, SOURCE, 'failed', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

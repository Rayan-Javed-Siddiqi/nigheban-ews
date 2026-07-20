import { createAdminClient } from '@/lib/supabase/admin'
import { BROWSER_UA, saveScrapeSnapshot, writeIngestStatus } from '@/lib/ingest/status'
import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

const SOURCE = 'ndma_scraper'

const SOURCES = [
  { name: 'ndma', url: 'https://ndma.gov.pk', display: 'NDMA' },
  { name: 'pdma_kp', url: 'https://pdma.gov.pk', display: 'PDMA KP' },
] as const

const ALERT_KEYWORDS = [
  'flood', 'rain', 'warning', 'alert', 'advisory', 'earthquake',
  'weather', 'cyclone', 'landslide', 'disaster', 'emergency',
  'monsoon', 'glof', 'avalanche', 'heat', 'cold', 'storm',
  'drought', 'situation', 'update', 'bulletin', 'forecast',
]

function extractAdvisories(html: string, sourceName: string) {
  const $ = cheerio.load(html)
  const advisories: { title: string; body: string; source: string }[] = []

  $('h2, h3, h4').each((_, el) => {
    const title = $(el).text().trim()
    if (title.length < 10) return

    const isAlert = ALERT_KEYWORDS.some((kw) => title.toLowerCase().includes(kw))
    if (!isAlert) return

    advisories.push({
      title: title.slice(0, 200),
      body: `Scraped from ${sourceName}: ${title}`,
      source: sourceName,
    })
  })

  return advisories.slice(0, 10)
}

export async function GET() {
  const supabase = createAdminClient()
  let totalNew = 0
  let totalFound = 0
  const errors: string[] = []

  for (const src of SOURCES) {
    try {
      const res = await fetch(src.url, {
        headers: { 'User-Agent': BROWSER_UA },
        cache: 'no-store',
      })

      if (!res.ok) {
        errors.push(`${src.name}: HTTP ${res.status}`)
        await saveScrapeSnapshot(supabase, {
          source: src.name,
          url: src.url,
          statusCode: res.status,
          fetchError: `HTTP ${res.status}`,
        })
        continue
      }

      const html = await res.text()
      await saveScrapeSnapshot(supabase, {
        source: src.name,
        url: src.url,
        statusCode: res.status,
        rawHtml: html,
      })

      const advisories = extractAdvisories(html, src.name)
      totalFound += advisories.length

      for (const adv of advisories) {
        const { data: existing } = await supabase
          .from('advisory')
          .select('id')
          .eq('title', adv.title)
          .eq('source', adv.source)
          .maybeSingle()

        if (existing) continue

        const { error: insertError } = await supabase.from('advisory').insert({
          title: adv.title,
          body: adv.body,
          source: adv.source,
          is_demo_data: false,
          issued_at: new Date().toISOString(),
        })

        if (insertError) {
          console.error(`[ingest:${SOURCE}] insert failed:`, insertError.message)
        } else {
          totalNew++
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`${src.name}: ${message}`)
      await saveScrapeSnapshot(supabase, {
        source: src.name,
        url: src.url,
        fetchError: message,
      })
    }
  }

  if (totalNew === 0 && errors.length === SOURCES.length) {
    const message = errors.join('; ')
    await writeIngestStatus(supabase, SOURCE, 'failed', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  await writeIngestStatus(
    supabase,
    SOURCE,
    errors.length > 0 ? 'degraded' : 'ok',
    errors.length > 0 ? errors.join('; ') : undefined
  )

  return NextResponse.json({
    ok: true,
    advisories_found: totalFound,
    advisories_inserted: totalNew,
    errors,
  })
}

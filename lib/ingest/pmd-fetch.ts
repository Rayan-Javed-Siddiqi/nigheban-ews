import * as cheerio from 'cheerio'
import pdfParse from 'pdf-parse'
import { BROWSER_UA } from '@/lib/ingest/status'
import { normalizeFloodLevel } from '@/lib/pmd/rivers'

export const PMD_LISTING_URL = 'https://ffd.pmd.gov.pk/bulletin/bulletin'
export const PMD_RIVER_FLOWS_URL = 'https://ffd.pmd.gov.pk/river-flows-comparison'

export interface PmdRiverReading {
  name: string
  location: string | null
  flow_cusecs: number | null
  flood_level: string | null
}

export interface PmdBulletin {
  bulletin_id: number
  matched_by_date: boolean
  warning_level: string | null
  forecast_text: string
  rivers: PmdRiverReading[]
  fetched_at: string
  source_url: string
}

function todayCandidates(): string[] {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const monthShort = monthNames[now.getMonth()].slice(0, 3)

  return [
    `${dd}-${mm}-${yyyy}`,
    `${dd}/${mm}/${yyyy}`,
    `${dd} ${monthNames[now.getMonth()]} ${yyyy}`,
    `${dd} ${monthShort} ${yyyy}`,
    `${monthShort} ${dd}, ${yyyy}`,
  ]
}

interface BulletinLink {
  id: number
  href: string
  matchedByDate: boolean
}

function findTodaysBulletin(html: string): BulletinLink {
  const $ = cheerio.load(html)
  const candidates = todayCandidates()
  const links: { id: number; href: string; rowText: string }[] = []

  $('a[href*="/bulletin/"][href*="/download"]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    const idMatch = href.match(/\/bulletin\/(\d+)\/download/)
    if (!idMatch) return
    const rowText = $(el).closest('tr, li, div').text().trim() || $(el).text().trim()
    links.push({ id: Number(idMatch[1]), href, rowText })
  })

  if (links.length === 0) {
    throw new Error('No bulletin download links found — PMD listing page structure may have changed')
  }

  const dateMatch = links.find((l) => candidates.some((c) => l.rowText.includes(c)))
  if (dateMatch) {
    return { id: dateMatch.id, href: dateMatch.href, matchedByDate: true }
  }

  const highest = links.reduce((a, b) => (b.id > a.id ? b : a))
  return { id: highest.id, href: highest.href, matchedByDate: false }
}

function resolveUrl(href: string, base = PMD_LISTING_URL): string {
  return href.startsWith('http') ? href : new URL(href, base).toString()
}

const FLOOD_LEVEL_RE =
  /\b(Low|Medium|High|Very High|Exceptionally High)\s+Flood\b/i

function parseFlowToken(raw: string): number | null {
  const n = parseInt(raw.replace(/,/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

/** Parse river rows from bulletin PDF plain text. */
export function parseBulletinText(text: string) {
  const warningMatch = text.match(FLOOD_LEVEL_RE)

  const rivers: PmdRiverReading[] = []
  const lines = text.split(/\r?\n/)

  for (const line of lines) {
    const levelMatch = line.match(FLOOD_LEVEL_RE)
    const flowMatch = line.match(/([\d,]+)\s*cusecs/i)
    if (!flowMatch && !levelMatch) continue

    // "Indus at Tarbela 245000 cusecs Low Flood"
    const atMatch = line.match(/([A-Za-z]+)\s+at\s+([A-Za-z\s]+?)(?:\s+\d|\s+Low|\s+Medium|\s+High|$)/i)
    if (atMatch) {
      rivers.push({
        name: atMatch[1].trim(),
        location: atMatch[2].trim(),
        flow_cusecs: flowMatch ? parseFlowToken(flowMatch[1]) : null,
        flood_level: levelMatch ? levelMatch[0].replace(/\s+/g, ' ').trim() : null,
      })
      continue
    }

    const generic = line.match(/([A-Z][a-zA-Z\s]{2,25}?)\s+[:\-]?\s*([\d,]+)\s*cusecs/i)
    if (generic) {
      rivers.push({
        name: generic[1].trim(),
        location: null,
        flow_cusecs: parseFlowToken(generic[2]),
        flood_level: levelMatch ? levelMatch[0].replace(/\s+/g, ' ').trim() : null,
      })
    }
  }

  // Fallback regex if line-based parse found nothing
  if (rivers.length === 0) {
    const riverRowRegex =
      /([A-Z][a-zA-Z\s]{2,30}?)\s+(?:at\s+([A-Za-z\s]+))?[:\-]?\s*([\d,]+)\s*cusecs/gi
    let m: RegExpExecArray | null
    while ((m = riverRowRegex.exec(text)) !== null) {
      rivers.push({
        name: m[1].trim(),
        location: m[2]?.trim() ?? null,
        flow_cusecs: parseFlowToken(m[3]),
        flood_level: null,
      })
    }
  }

  return {
    warningLevel: warningMatch ? warningMatch[0].replace(/\s+/g, ' ').trim() : null,
    forecastText: text.trim(),
    rivers: dedupeRivers(rivers),
  }
}

/** Scrape /river-flows-comparison HTML table (S3 MVP). Returns [] on bot-block. */
export async function fetchPmdRiverFlowsComparison(): Promise<PmdRiverReading[]> {
  const res = await fetch(PMD_RIVER_FLOWS_URL, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' },
    cache: 'no-store',
  })
  if (!res.ok) return []

  const html = await res.text()
  const $ = cheerio.load(html)
  const rivers: PmdRiverReading[] = []

  $('table tr').each((_, row) => {
    const cells = $(row)
      .find('td, th')
      .map((__, c) => $(c).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(Boolean)
    if (cells.length < 2) return

    const joined = cells.join(' ')
    const flowMatch = joined.match(/([\d,]+)\s*cusecs/i)
    const levelMatch = joined.match(FLOOD_LEVEL_RE)
    if (!flowMatch && !levelMatch) return

    const name = cells[0] ?? 'Unknown'
    const location = cells.length > 3 ? cells[1] : null

    rivers.push({
      name,
      location,
      flow_cusecs: flowMatch ? parseFlowToken(flowMatch[1]) : null,
      flood_level: levelMatch ? levelMatch[0].replace(/\s+/g, ' ').trim() : null,
    })
  })

  return dedupeRivers(rivers)
}

export function dedupeRivers(rivers: PmdRiverReading[]): PmdRiverReading[] {
  const seen = new Set<string>()
  const out: PmdRiverReading[] = []
  for (const r of rivers) {
    const key = `${r.name}|${r.location ?? ''}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

/** Merge HTML river table (preferred) with PDF bulletin rivers. */
export function mergeRiverSources(htmlRivers: PmdRiverReading[], pdfRivers: PmdRiverReading[]) {
  if (htmlRivers.length === 0) return pdfRivers
  if (pdfRivers.length === 0) return htmlRivers
  return dedupeRivers([...htmlRivers, ...pdfRivers])
}

/** Legacy shape for DB jsonb compatibility. */
export function riversToLegacyJson(rivers: PmdRiverReading[]) {
  return rivers.map((r) => ({
    name: r.location ? `${r.name} at ${r.location}` : r.name,
    level: r.flood_level,
    flow: r.flow_cusecs != null ? String(r.flow_cusecs) : null,
    flood_level_normalized: normalizeFloodLevel(r.flood_level),
    location: r.location,
    flow_cusecs: r.flow_cusecs,
  }))
}

export function legacyJsonToRivers(raw: unknown): PmdRiverReading[] {
  if (!Array.isArray(raw)) return []
  return raw.map((r: Record<string, unknown>) => ({
    name: String(r.name ?? '').split(' at ')[0] ?? 'Unknown',
    location: (r.location as string) ?? (String(r.name ?? '').includes(' at ') ? String(r.name).split(' at ')[1] : null),
    flow_cusecs:
      r.flow_cusecs != null
        ? Number(r.flow_cusecs)
        : r.flow != null
          ? parseFlowToken(String(r.flow))
          : null,
    flood_level: (r.level as string) ?? (r.flood_level as string) ?? null,
  }))
}

/** Full S3 ingest: daily bulletin PDF + river-flows comparison page. */
export async function fetchPmdFfdSnapshot(): Promise<PmdBulletin & { pdfBuffer: Buffer }> {
  const [htmlRivers, bulletin] = await Promise.all([
    fetchPmdRiverFlowsComparison(),
    fetchPmdBulletin(),
  ])

  const merged = mergeRiverSources(htmlRivers, bulletin.rivers)

  return {
    ...bulletin,
    rivers: merged,
    forecast_text: bulletin.forecast_text,
  }
}

/** Fetch and parse the latest PMD FFD flood bulletin PDF. */
export async function fetchPmdBulletin(): Promise<PmdBulletin & { pdfBuffer: Buffer }> {
  const listingRes = await fetch(PMD_LISTING_URL, {
    headers: { 'User-Agent': BROWSER_UA },
    cache: 'no-store',
  })
  if (!listingRes.ok) {
    throw new Error(`Listing page fetch failed: HTTP ${listingRes.status}`)
  }
  const listingHtml = await listingRes.text()
  const bulletin = findTodaysBulletin(listingHtml)
  const pdfUrl = resolveUrl(bulletin.href)

  const pdfRes = await fetch(pdfUrl, {
    headers: { 'User-Agent': BROWSER_UA },
    cache: 'no-store',
  })
  if (!pdfRes.ok) {
    throw new Error(`Bulletin PDF fetch failed (id ${bulletin.id}): HTTP ${pdfRes.status}`)
  }
  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())
  const { text } = await pdfParse(pdfBuffer)
  const parsed = parseBulletinText(text)

  if (!parsed.forecastText.trim()) {
    throw new Error(
      `PDF parse produced empty text for bulletin ${bulletin.id} — layout change or scanned PDF`
    )
  }

  return {
    bulletin_id: bulletin.id,
    matched_by_date: bulletin.matchedByDate,
    warning_level: parsed.warningLevel,
    forecast_text: parsed.forecastText,
    rivers: parsed.rivers,
    fetched_at: new Date().toISOString(),
    source_url: pdfUrl,
    pdfBuffer,
  }
}

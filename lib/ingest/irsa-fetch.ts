import pdf from 'pdf-parse/lib/pdf-parse.js'
import { hasReservoirData, parseIrsaReservoirs, type ReservoirReading } from '@/lib/ingest/irsa-parser'

function todayDDMMYYYY() {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

export interface ReservoirRow extends ReservoirReading {
  id?: string
  reading_date?: string
  fetched_at?: string
}

/** Fetch and parse today's IRSA daily PDF (Tarbela, Mangla, Chashma). */
export async function fetchIrsaReservoirPdf(): Promise<ReservoirRow[]> {
  const dateStr = todayDDMMYYYY()
  const url = `http://pakirsa.gov.pk/Doc/Data${dateStr}.pdf`

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`IRSA PDF not available for ${dateStr} (HTTP ${res.status})`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const { text } = await pdf(buffer)
  const readings = parseIrsaReservoirs(text)

  if (!hasReservoirData(readings)) {
    throw new Error('IRSA PDF parsed but no reservoir fields matched')
  }

  const now = new Date().toISOString()
  return readings.map((r) => ({
    ...r,
    reading_date: now.slice(0, 10),
    fetched_at: now,
  }))
}

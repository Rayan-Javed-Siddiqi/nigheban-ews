/** PMD FFD river names/locations → map coordinates (approximate gauge points). */
export const PMD_GAUGE_COORDS: Record<
  string,
  { lat: number; lon: number; river: string; label: string }
> = {
  nowshera: { lat: 34.01, lon: 71.98, river: 'Kabul', label: 'Kabul at Nowshera' },
  khairabad: { lat: 34.22, lon: 72.86, river: 'Indus', label: 'Indus at Khairabad' },
  tarbela: { lat: 34.09, lon: 72.82, river: 'Indus', label: 'Indus at Tarbela' },
  mangla: { lat: 33.15, lon: 73.64, river: 'Jhelum', label: 'Jhelum at Mangla' },
  marala: { lat: 32.68, lon: 74.45, river: 'Chenab', label: 'Chenab at Marala' },
  munda: { lat: 34.75, lon: 72.38, river: 'Swat', label: 'Swat at Munda' },
  kalam: { lat: 35.49, lon: 72.58, river: 'Swat', label: 'Swat at Kalam' },
  chitral: { lat: 35.85, lon: 71.79, river: 'Kabul', label: 'Kabul at Chitral' },
  attock: { lat: 33.77, lon: 72.36, river: 'Indus', label: 'Indus at Attock' },
  guddu: { lat: 28.43, lon: 69.74, river: 'Indus', label: 'Indus at Guddu' },
}

/** District → rivers relevant for filtering PMD table rows (MVP focus districts). */
export const DISTRICT_RIVER_KEYWORDS: Record<string, string[]> = {
  Nowshera: ['Kabul', 'Indus', 'Nowshera', 'Attock'],
  Swat: ['Swat', 'Kabul', 'Munda', 'Kalam'],
  Hunza: ['Indus', 'Gilgit'],
  'Chitral Lower': ['Kabul', 'Chitral', 'Swat'],
  'Chitral Upper': ['Kabul', 'Chitral'],
  'Kohistan Lower': ['Indus', 'Kabul'],
  Dir: ['Swat', 'Panjkora', 'Kabul'],
  'DI Khan': ['Indus', 'Gomal'],
  Tank: ['Indus'],
}

export type PmdFloodLevel =
  | 'low'
  | 'medium'
  | 'high'
  | 'very high'
  | 'exceptionally high'
  | 'unknown'

export function normalizeFloodLevel(raw: string | null | undefined): PmdFloodLevel {
  if (!raw) return 'unknown'
  const s = raw.toLowerCase()
  if (s.includes('exceptionally')) return 'exceptionally high'
  if (s.includes('very high')) return 'very high'
  if (s.includes('high')) return 'high'
  if (s.includes('medium')) return 'medium'
  if (s.includes('low')) return 'low'
  return 'unknown'
}

export function floodLevelClass(level: PmdFloodLevel): string {
  switch (level) {
    case 'exceptionally high':
    case 'very high':
      return 'text-[var(--color-emergency)] font-semibold'
    case 'high':
      return 'text-amber-700 font-semibold'
    case 'medium':
      return 'text-amber-600'
    case 'low':
      return 'text-[var(--color-primary)]'
    default:
      return 'text-[var(--color-ink)]/60'
  }
}

export function floodLevelFillColor(level: PmdFloodLevel): [number, number, number, number] {
  switch (level) {
    case 'exceptionally high':
      return [139, 0, 0, 220]
    case 'very high':
      return [179, 38, 30, 210]
    case 'high':
      return [224, 160, 48, 200]
    case 'medium':
      return [242, 201, 76, 190]
    case 'low':
      return [15, 107, 61, 180]
    default:
      return [136, 136, 136, 160]
  }
}

export function riversForDistrict(
  districtName: string,
  rivers: { name: string; location?: string | null; flow: string | null; level: string | null }[]
) {
  const keywords = DISTRICT_RIVER_KEYWORDS[districtName]
  if (!keywords || keywords.length === 0) {
    return rivers.slice(0, 12)
  }
  const filtered = rivers.filter((r) => {
    const hay = `${r.name} ${r.location ?? ''}`.toLowerCase()
    return keywords.some((k) => hay.includes(k.toLowerCase()))
  })
  return filtered.length > 0 ? filtered : rivers.slice(0, 8)
}

export function resolveGaugeCoord(
  name: string,
  location?: string | null
): { lat: number; lon: number; label: string } | null {
  const hay = `${name} ${location ?? ''}`.toLowerCase()
  for (const [key, coord] of Object.entries(PMD_GAUGE_COORDS)) {
    if (hay.includes(key) || hay.includes(coord.river.toLowerCase()) && hay.includes(key)) {
      return { lat: coord.lat, lon: coord.lon, label: coord.label }
    }
  }
  // Match by river name only (first match)
  for (const coord of Object.values(PMD_GAUGE_COORDS)) {
    if (hay.includes(coord.river.toLowerCase())) {
      return { lat: coord.lat, lon: coord.lon, label: `${coord.river} — ${name}` }
    }
  }
  return null
}

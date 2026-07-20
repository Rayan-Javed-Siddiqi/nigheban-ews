export const SEVERITY_RANK: Record<string, number> = {
  emergency: 0,
  warning: 1,
  watch: 2,
  advisory: 3,
}

export function compareSeverity(a: string, b: string): number {
  return (SEVERITY_RANK[a] ?? 99) - (SEVERITY_RANK[b] ?? 99)
}

export function severityBadgeClass(severity: string): string {
  if (severity === 'emergency') return 'bg-[var(--color-emergency)]/15 text-[var(--color-emergency)]'
  if (severity === 'warning') return 'bg-[#E0A030]/15 text-[#E0A030]'
  if (severity === 'watch') return 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
  return 'bg-[var(--color-ink)]/10 text-[var(--color-ink)]/60'
}

export function riskLevelClass(level: string): string {
  if (level === 'high') return 'text-[var(--color-emergency)]'
  if (level === 'medium') return 'text-[#E0A030]'
  if (level === 'low') return 'text-[var(--color-primary-hover)]'
  return 'text-[var(--color-ink)]/50'
}

export function formatPkt(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function hazardIcon(hazard: string): string {
  switch (hazard) {
    case 'fire': return '🔥'
    case 'earthquake': return '⚡'
    case 'flood': return '🌊'
    case 'glof': return '🏔'
    case 'drought': return '☀'
    case 'weather': return '🌧'
    default: return '⚠'
  }
}

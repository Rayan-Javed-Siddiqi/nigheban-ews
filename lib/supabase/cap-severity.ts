type CapSeverity = 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown'

const CAP_SEVERITY_MAP: Record<string, CapSeverity> = {
  emergency: 'Extreme',
  warning: 'Severe',
  watch: 'Moderate',
  advisory: 'Minor',
}

export function toCapSeverity(internalSeverity: string): CapSeverity {
  return CAP_SEVERITY_MAP[internalSeverity] ?? 'Unknown'
}
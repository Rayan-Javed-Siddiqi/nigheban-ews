export const PHASE_LABELS: Record<string, string> = {
  baseline: 'Baseline',
  rising: 'Lake Rising',
  rate_rule_fired: 'Rate Rule Fired',
  candidate: 'Alert Candidate',
  pending_approval: 'Pending Approval',
  issued: 'Issued',
  disseminating: 'Disseminating',
  acknowledged: 'Acknowledged',
  // Nowshera flood phases
  monsoon_build: 'Monsoon Build-up',
  ffd_watch: 'FFD Watch',
  glofas_exceedance: 'GloFAS Exceedance',
  flood_warning: 'Flood Warning',
  evacuation_advised: 'Evacuation Advised',
}

export const PHASE_COLORS: Record<string, string> = {
  baseline: '#6b7280',
  rising: '#d97706',
  rate_rule_fired: '#dc2626',
  candidate: '#dc2626',
  pending_approval: '#ea580c',
  issued: '#b91c1c',
  disseminating: '#2563eb',
  acknowledged: '#16a34a',
  monsoon_build: '#6b7280',
  ffd_watch: '#d97706',
  glofas_exceedance: '#ea580c',
  flood_warning: '#dc2626',
  evacuation_advised: '#b91c1c',
}

export function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase.replace(/_/g, ' ')
}

export function phaseColor(phase: string): string {
  return PHASE_COLORS[phase] ?? '#6b7280'
}

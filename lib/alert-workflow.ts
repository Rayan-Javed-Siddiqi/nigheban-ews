export const SEVERITY_ORDER = ['advisory', 'watch', 'warning', 'emergency'] as const
export type AlertSeverity = (typeof SEVERITY_ORDER)[number]
export type AppRole = 'dg' | 'duty_officer' | 'district_focal' | 'viewer'

export const STATUS_FLOW: Record<string, string[]> = {
  pending: ['draft', 'dismissed'],
  draft: ['pending_approval', 'dismissed'],
  pending_approval: ['issued', 'draft', 'cancelled'],
  issued: ['cancelled', 'expired'],
  approved: ['issued'],
  dismissed: [],
  cancelled: [],
  expired: [],
}

/** DG may issue directly from draft (skip self-approval step). */
export function getAllowedTransitions(
  role: AppRole | null | undefined,
  from: string
): string[] {
  const base = STATUS_FLOW[from] ?? []
  const extras: string[] = []
  if (role === 'dg' && from === 'draft' && !base.includes('issued')) {
    extras.push('issued')
  }
  return [...extras, ...base].filter(
    (to, i, arr) => arr.indexOf(to) === i && canTransition(role, from, to)
  )
}

export function workflowButtonLabel(from: string, to: string): string {
  if (to === 'issued') return 'Issue alert'
  if (from === 'pending' && to === 'draft') return 'Start drafting CAP'
  if (from === 'draft' && to === 'pending_approval') return 'Submit for DG approval'
  if (from === 'pending_approval' && to === 'draft') return 'Return to draft'
  if (from === 'pending_approval' && to === 'cancelled') return 'Reject candidate'
  if (from === 'issued' && to === 'cancelled') return 'Issue all-clear'
  if (to === 'dismissed') return 'Dismiss candidate'
  if (to === 'expired') return 'Mark expired'
  return `Move to ${to.replace(/_/g, ' ')}`
}

export function escalateSeverity(current: string): AlertSeverity | null {
  const idx = SEVERITY_ORDER.indexOf(current as AlertSeverity)
  if (idx < 0 || idx >= SEVERITY_ORDER.length - 1) return null
  return SEVERITY_ORDER[idx + 1]
}

/** Duty officer drafts; only DG issues (from pending_approval or draft). */
export function canTransition(role: AppRole | null | undefined, from: string, to: string): boolean {
  if (!role || role === 'viewer' || role === 'district_focal') return false

  const allowed = STATUS_FLOW[from] ?? []
  const dgDraftIssue = role === 'dg' && from === 'draft' && to === 'issued'
  if (!allowed.includes(to) && !dgDraftIssue) return false

  if (to === 'issued') {
    if (from === 'pending_approval' || from === 'approved') return role === 'dg'
    if (from === 'draft') return role === 'dg'
    return false
  }

  if (to === 'pending_approval') return role === 'duty_officer' || role === 'dg'
  if (to === 'draft') return role === 'duty_officer' || role === 'dg'
  if (to === 'dismissed') return role === 'duty_officer' || role === 'dg'
  if (to === 'cancelled') {
    if (from === 'issued') return role === 'duty_officer' || role === 'dg'
    if (from === 'pending_approval') return role === 'duty_officer' || role === 'dg'
    return false
  }
  if (to === 'expired') return role === 'duty_officer' || role === 'dg'

  return false
}

export function canEscalate(role: AppRole | null | undefined, status: string): boolean {
  if (!role || role === 'viewer' || role === 'district_focal') return false
  return ['draft', 'pending_approval', 'issued'].includes(status)
}

export const URGENCY_OPTIONS = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'expected', label: 'Expected' },
  { value: 'future', label: 'Future' },
  { value: 'past', label: 'Past' },
] as const

export const CERTAINTY_OPTIONS = [
  { value: 'observed', label: 'Observed' },
  { value: 'likely', label: 'Likely' },
  { value: 'possible', label: 'Possible' },
  { value: 'unlikely', label: 'Unlikely' },
] as const

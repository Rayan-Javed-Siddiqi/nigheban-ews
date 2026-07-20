import type { SupabaseClient } from '@supabase/supabase-js'

export const AUDIT_ACTIONS = {
  RULE_FIRED: 'rule_fired',
  STATUS_CHANGE: 'status_change',
  EDIT_CAP: 'edit_cap_fields',
  ESCALATE: 'escalate_severity',
  THRESHOLD_EDIT: 'threshold_edit',
  FANOUT: 'dissemination_fanout_on_issue',
  DRY_RUN: 'dissemination_dry_run_started',
  LIVE_SMS: 'dissemination_live_sms',
  LIVE_WHATSAPP: 'dissemination_live_whatsapp',
  ACK_RECEIVED: 'acknowledgement_received',
  DISSEMINATION_DONE: 'dissemination_completed',
} as const

/** Human-readable labels for audit timeline and global log. */
export const ACTION_LABELS: Record<string, string> = {
  rule_fired: 'Rule fired — alert candidate created',
  status_change: 'Workflow status changed',
  edit_cap_fields: 'CAP fields edited',
  escalate_severity: 'Severity escalated',
  threshold_edit: 'Threshold rule updated',
  candidate_created: 'Alert candidate created',
  dissemination_fanout_on_issue: 'Dissemination plan created on issue',
  dissemination_dry_run_started: 'Dry-run dispatch started',
  dissemination_live_sms: 'Live SMS sent (Twilio)',
  dissemination_live_whatsapp: 'Live WhatsApp sent (Twilio)',
  acknowledgement_received: 'Field acknowledgement received',
  dissemination_completed: 'Dissemination completed',
}

export const LIFECYCLE_ORDER = [
  'rule_fired',
  'status_change',
  'edit_cap_fields',
  'escalate_severity',
  'dissemination_fanout_on_issue',
  'dissemination_dry_run_started',
  'dissemination_live_sms',
  'dissemination_live_whatsapp',
  'acknowledgement_received',
  'dissemination_completed',
] as const

export interface AuditLogRow {
  id: number
  at: string
  actor: string | null
  actor_role: string | null
  action: string
  entity: string | null
  entity_id: string | null
  detail: Record<string, unknown> | null
}

export interface AuditFilters {
  q?: string
  action?: string
  entity?: string
  entityId?: string
  actorRole?: string
  from?: string
  to?: string
  page?: number
  limit?: number
}

export function formatAuditTimestamp(at: string): string {
  return (
    new Date(at).toLocaleString('en-GB', {
      timeZone: 'Asia/Karachi',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + ' PKT'
  )
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replaceAll('_', ' ')
}

export function formatDetail(detail: Record<string, unknown> | null): string {
  if (!detail || Object.keys(detail).length === 0) return ''
  if (typeof detail.old_status === 'string' && typeof detail.new_status === 'string') {
    return `${detail.old_status} → ${detail.new_status}`
  }
  if (typeof detail.mode === 'string') return `mode: ${detail.mode}`
  return JSON.stringify(detail)
}

export async function logAudit(
  supabase: SupabaseClient,
  entry: {
    actor: string
    actor_role: string
    action: string
    entity: string
    entity_id: string
    detail?: Record<string, unknown>
  }
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert(entry)
  if (error) {
    console.error('[audit_log] insert failed:', error.message, entry.action)
  }
}

export function buildAuditQuery(
  supabase: SupabaseClient,
  filters: AuditFilters
) {
  const limit = Math.min(filters.limit ?? 50, 200)
  const page = Math.max(filters.page ?? 1, 1)
  const from = (page - 1) * limit

  let query = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('at', { ascending: false })
    .range(from, from + limit - 1)

  if (filters.action) query = query.eq('action', filters.action)
  if (filters.entity) query = query.eq('entity', filters.entity)
  if (filters.entityId) query = query.eq('entity_id', filters.entityId)
  if (filters.actorRole) query = query.eq('actor_role', filters.actorRole)
  if (filters.from) query = query.gte('at', filters.from)
  if (filters.to) query = query.lte('at', filters.to)
  if (filters.q) {
    const q = filters.q.replace(/[%_]/g, '')
    query = query.or(`action.ilike.%${q}%,entity.ilike.%${q}%,entity_id.ilike.%${q}%`)
  }

  return query
}

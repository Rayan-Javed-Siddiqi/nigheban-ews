import type { SupabaseClient } from '@supabase/supabase-js'
import { actionLabel, formatAuditTimestamp, type AuditLogRow } from '@/lib/audit'

export interface DeliveryStats {
  total: number
  queued: number
  sent: number
  delivered: number
  acknowledged: number
  failed: number
  ackRate: number
  estimatedReach: number
}

export interface PostEventReportData {
  alert: Record<string, unknown>
  districtName: string | null
  province: string | null
  issuerName: string | null
  auditLogs: AuditLogRow[]
  deliveryStats: DeliveryStats | null
  channels: { channel: string; recipient_count: number }[]
  generatedAt: string
}

export async function loadPostEventReport(
  supabase: SupabaseClient,
  alertId: string
): Promise<PostEventReportData | null> {
  const { data: alert } = await supabase
    .from('alert_candidate')
    .select('*, district:district_id(name_en, province)')
    .eq('id', alertId)
    .single()

  if (!alert) return null

  const districtId = alert.district_id as string | null

  const [{ data: auditLogs }, { data: deliveries }, { data: channels }] = await Promise.all([
    supabase.from('audit_log').select('*').eq('entity_id', alertId).order('at', { ascending: true }),
    supabase.from('alert_delivery').select('status').eq('alert_id', alertId),
    districtId
      ? supabase.from('channel_recipient_count').select('channel, recipient_count').eq('district_id', districtId)
      : Promise.resolve({ data: [] as { channel: string; recipient_count: number }[] }),
  ])

  let issuerName: string | null = null
  if (alert.issued_by) {
    const { data: issuer } = await supabase
      .from('profile')
      .select('full_name')
      .eq('id', alert.issued_by)
      .single()
    issuerName = issuer?.full_name ?? null
  }

  let deliveryStats: DeliveryStats | null = null
  if (deliveries && deliveries.length > 0) {
    const stats = {
      total: deliveries.length,
      queued: deliveries.filter((d) => d.status === 'queued').length,
      sent: deliveries.filter((d) => d.status === 'sent').length,
      delivered: deliveries.filter((d) => d.status === 'delivered').length,
      acknowledged: deliveries.filter((d) => d.status === 'acknowledged').length,
      failed: deliveries.filter((d) => d.status === 'failed').length,
    }
    const ackRate =
      stats.total > 0 ? Math.round((stats.acknowledged / stats.total) * 100) : 0
    deliveryStats = {
      ...stats,
      ackRate,
      estimatedReach: (channels ?? []).reduce((s, c) => s + c.recipient_count, 0),
    }
  }

  const district = alert.district as { name_en?: string; province?: string } | null

  return {
    alert,
    districtName: district?.name_en ?? null,
    province: district?.province ?? null,
    issuerName,
    auditLogs: (auditLogs ?? []) as AuditLogRow[],
    deliveryStats,
    channels: channels ?? [],
    generatedAt: formatAuditTimestamp(new Date().toISOString()),
  }
}

export function reportHeadline(data: PostEventReportData): string {
  const a = data.alert
  return (a.headline_en as string) || (a.event_en as string) || (a.title as string) || 'Alert'
}

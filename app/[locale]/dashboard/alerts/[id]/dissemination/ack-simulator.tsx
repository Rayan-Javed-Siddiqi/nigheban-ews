'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type DeliveryRow = {
  id: string
  channel: string
  recipient?: string
  status: string
  status_at: string | null
  ack_at: string | null
}

const CHANNEL_LABELS: Record<string, string> = {
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  email: 'Email',
  app_push: 'App Push',
  siren: 'Siren',
  loudspeaker: 'Loudspeaker',
}

const STATUS_STYLES: Record<string, string> = {
  dry_run: 'bg-slate-500/10 text-slate-600',
  queued: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]',
  sent: 'bg-amber-500/10 text-amber-600',
  delivered: 'bg-emerald-500/10 text-emerald-600',
  acknowledged: 'bg-emerald-600/20 text-emerald-700',
  failed: 'bg-[var(--color-emergency)]/10 text-[var(--color-emergency)]',
}

export default function AckSimulator({
  alertId,
  initialDeliveries,
}: {
  alertId: string
  initialDeliveries: DeliveryRow[]
}) {
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>(initialDeliveries)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Live updates via Supabase Realtime — reflects changes from our own ticks
  // AND from anyone else who has this board open.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`alert_delivery_${alertId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alert_delivery', filter: `alert_id=eq.${alertId}` },
        (payload) => {
          setDeliveries((prev) =>
            prev.map((d) => (d.id === payload.new.id ? { ...d, ...payload.new } as DeliveryRow : d))
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [alertId])

  const tick = async () => {
    const res = await fetch(`/api/alerts/${alertId}/simulate-ack`, { method: 'POST' })
    const data = await res.json()
    if (data.done || (data.advanced === 0 && data.remaining === 0)) {
      stop()
    }
  }

  const start = () => {
    setRunning(true)
    tick() // fire one immediately so it doesn't feel like it's stalled
    intervalRef.current = setInterval(tick, 3000)
  }

  const stop = () => {
    setRunning(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const allSettled = deliveries.every((d) => d.status === 'acknowledged' || d.status === 'failed')

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
        Acknowledgement Simulation
      </h2>

      <div className="space-y-2">
        {deliveries.map((d) => (
          <div key={d.id} className="flex items-center justify-between text-sm">
            <span className="truncate">
              {CHANNEL_LABELS[d.channel] ?? d.channel}
              {d.recipient && !d.recipient.startsWith('batch:') && (
                <span className="ml-2 font-mono text-xs text-[var(--color-ink)]/40">{d.recipient}</span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 font-mono text-xs uppercase ${STATUS_STYLES[d.status] ?? ''}`}>
                {d.status}
              </span>
              {d.ack_at && (
                <span className="text-xs text-[var(--color-ink)]/40">
                  {new Date(d.ack_at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi' })}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-[var(--color-border)] pt-4">
        {allSettled ? (
          <p className="text-sm text-[var(--color-ink)]/60">
            Simulation complete — all channels reached a final state.
          </p>
        ) : running ? (
          <button
            onClick={stop}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-border)]"
          >
            Stop Simulation
          </button>
        ) : (
          <button
            onClick={start}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
          >
            Start Acknowledgement Simulation
          </button>
        )}
        <p className="mt-2 text-xs text-[var(--color-ink)]/50">
          Simulated field response — advances queued → sent → delivered/failed → acknowledged over time.
        </p>
      </div>
    </div>
  )
}
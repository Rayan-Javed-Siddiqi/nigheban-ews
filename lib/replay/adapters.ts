import type { ReplayFrame, ReplayScenario, ReplayFrameData } from './types'
import { isFloodFrame, isGlofFrame } from './types'

export const SCENARIO_MAP_CENTER: Record<string, { longitude: number; latitude: number; zoom: number }> = {
  'hunza-shisper-glof': { longitude: 74.85, latitude: 36.32, zoom: 9 },
  'nowshera-kabul-flood-2025': { longitude: 71.98, latitude: 34.01, zoom: 9 },
}

export function getMapCenter(scenario: ReplayScenario | null) {
  if (!scenario) return { longitude: 72.5, latitude: 35.0, zoom: 6 }
  return SCENARIO_MAP_CENTER[scenario.slug] ?? { longitude: 72.5, latitude: 35.0, zoom: 7 }
}

export function getReplayMarkerGeoJson(frame: ReplayFrame | null, scenario: ReplayScenario | null) {
  if (!frame || !scenario) return null

  const data = frame.frame_data
  if (isGlofFrame(data)) {
    const s = data.station
    const lon = s.lon ?? 74.85
    const lat = s.lat ?? 36.32
    const alertActive = Boolean(data.alert)
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [lon, lat] },
          properties: {
            name: s.name,
            water_level_m: s.water_level_m,
            rate: s.rate_of_rise_m_per_hr,
            status: s.status,
            alert: alertActive,
          },
        },
      ],
    }
  }

  if (isFloodFrame(data)) {
    const g = data.gauge
    const lon = g.lon ?? 71.98
    const lat = g.lat ?? 34.01
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [lon, lat] },
          properties: {
            name: g.name,
            river: g.river,
            discharge_cusecs: g.discharge_cusecs,
            ffd_risk: g.ffd_risk_level,
          },
        },
      ],
    }
  }

  return null
}

export interface ReplayKpiValues {
  activeWarnings: number | string
  districtsAffected: number | string
  populationAffected: string
  deliveryRate: string
  deliveryDetail: string
}

export function getReplayKpis(frame: ReplayFrame | null): ReplayKpiValues | null {
  if (!frame) return null
  const d = frame.frame_data.dissemination
  const alert = frame.frame_data.alert
  const hasAlert = Boolean(alert && alert.status !== 'candidate_pending')

  const delivered = d.delivered + d.acknowledged
  const rate = d.sent > 0 ? Math.round((delivered / d.sent) * 100) : 0

  return {
    activeWarnings: hasAlert ? 1 : 0,
    districtsAffected: hasAlert ? 1 : '—',
    populationAffected: hasAlert ? '~12,400' : '—',
    deliveryRate: d.sent > 0 ? `${rate}%` : '—',
    deliveryDetail: d.sent > 0 ? `(${delivered}/${d.sent})` : '',
  }
}

export function getReplayHazardCard(frame: ReplayFrame | null, scenario: ReplayScenario | null) {
  if (!frame || !scenario) return null
  const data = frame.frame_data

  if (isGlofFrame(data)) {
    if (!data.alert) {
      return {
        hazard: 'glof',
        source: 'Station HZ-07',
        severity: frame.phase === 'rising' ? 'watch' : 'advisory',
        title: `${data.station.name}: ${data.station.water_level_m} m`,
        subtitle: `Rate ${data.station.rate_of_rise_m_per_hr} m/hr`,
      }
    }
    return {
      hazard: 'glof',
      source: 'Rate rule → CAP',
      severity: data.alert.severity.toLowerCase(),
      title: data.alert.event,
      subtitle: `${data.alert.area} · ${data.alert.status.replace(/_/g, ' ')}`,
    }
  }

  if (isFloodFrame(data)) {
    const title = data.hazard?.title ?? data.gauge.name
    return {
      hazard: 'flood',
      source: data.hazard?.source ?? 'FFD / GloFAS',
      severity: (data.hazard?.severity ?? data.gauge.ffd_risk_level).toLowerCase(),
      title,
      subtitle: `${data.gauge.river}: ${data.gauge.discharge_cusecs.toLocaleString()} cusecs · ${data.gauge.level_m} m`,
    }
  }

  return null
}

export function formatReplayDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
}

/** Normalize JSON from Supabase into typed frame_data. */
export function parseFrameData(raw: unknown): ReplayFrameData {
  return raw as ReplayFrameData
}

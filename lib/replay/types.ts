/** Shared replay types — GLOF (Hunza) and flood (Nowshera) frame shapes. */

export interface GlofStationData {
  name: string
  district: string
  water_level_m: number
  rate_of_rise_m_per_hr: number
  battery_voltage: number
  rssi_dbm: number
  status: string
  lat?: number
  lon?: number
}

export interface FloodGaugeData {
  name: string
  river: string
  district: string
  level_m: number
  discharge_cusecs: number
  ffd_risk_level: string
  lat?: number
  lon?: number
}

export interface ReplayAlertData {
  event: string
  severity: string
  urgency: string
  certainty: string
  area: string
  status: string
}

export interface ReplayDisseminationData {
  sent: number
  delivered: number
  failed: number
  acknowledged: number
}

export interface GlofFrameData {
  station: GlofStationData
  alert: ReplayAlertData | null
  dissemination: ReplayDisseminationData
}

export interface FloodFrameData {
  gauge: FloodGaugeData
  hazard?: { title: string; severity: string; source: string } | null
  alert: ReplayAlertData | null
  dissemination: ReplayDisseminationData
  map_overlays?: { glofas_exceedance?: string | null }
}

export type ReplayFrameData = GlofFrameData | FloodFrameData

export interface ReplayFrame {
  id: string
  scenario_id: string
  t_offset_seconds: number
  phase: string
  narration: string | null
  frame_data: ReplayFrameData
}

export interface ReplayScenario {
  id: string
  slug: string
  name: string
  description: string | null
  hazard_type: string
  district: string | null
  duration_seconds: number
  default_speed_multiplier: number
}

export function isGlofFrame(data: ReplayFrameData): data is GlofFrameData {
  return 'station' in data && data.station != null
}

export function isFloodFrame(data: ReplayFrameData): data is FloodFrameData {
  return 'gauge' in data && data.gauge != null
}

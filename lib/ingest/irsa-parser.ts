export interface ReservoirReading {
  reservoir_name: string
  level_ft: number | null
  inflow_cusecs: number | null
  outflow_cusecs: number | null
  mean_inflow_cusecs: number | null
}

const RESERVOIR_NAMES = ['Tarbela', 'Mangla', 'Chashma'] as const

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null
  const n = parseFloat(raw.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Best-effort parse of IRSA daily PDF text into per-reservoir readings. */
export function parseIrsaReservoirs(text: string): ReservoirReading[] {
  const normalized = text.replace(/\r\n/g, '\n')
  const readings: ReservoirReading[] = []

  for (const name of RESERVOIR_NAMES) {
    const blockRegex = new RegExp(
      `${name}[\\s\\S]{0,400}?(?:LEVEL|Level)[\\s:=-]*([\\d.,]+)[\\s\\S]{0,200}?(?:INFLOW|Inflow|Mean Inflow)[\\s:=-]*([\\d.,]+)`,
      'i'
    )
    const blockMatch = normalized.match(blockRegex)

    const level = parseNumber(blockMatch?.[1])
    const meanInflow = parseNumber(blockMatch?.[2])

    const inflowMatch = normalized.match(
      new RegExp(`${name}[\\s\\S]{0,300}?INFLOW[\\s:=-]*([\\d.,]+)`, 'i')
    )
    const outflowMatch = normalized.match(
      new RegExp(`${name}[\\s\\S]{0,300}?OUTFLOW[\\s:=-]*([\\d.,]+)`, 'i')
    )

    readings.push({
      reservoir_name: name,
      level_ft: level,
      inflow_cusecs: parseNumber(inflowMatch?.[1]),
      outflow_cusecs: parseNumber(outflowMatch?.[1]),
      mean_inflow_cusecs: meanInflow,
    })
  }

  return readings
}

export function hasReservoirData(readings: ReservoirReading[]): boolean {
  return readings.some(
    (r) =>
      r.level_ft != null ||
      r.inflow_cusecs != null ||
      r.outflow_cusecs != null ||
      r.mean_inflow_cusecs != null
  )
}

'use client'

interface StationSparklineProps {
  data: number[]
  className?: string
}

export default function StationSparkline({ data, className = '' }: StationSparklineProps) {
  const slots = data.length > 0 ? data : Array(24).fill(0)
  const max = Math.max(...slots, 1)
  const width = 96
  const height = 28
  const step = width / Math.max(slots.length - 1, 1)

  const points = slots
    .map((v, i) => {
      const x = i * step
      const y = height - (v / max) * (height - 4) - 2
      return `${x},${y}`
    })
    .join(' ')

  const hasActivity = slots.some((v) => v > 0)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`text-[var(--color-primary-hover)] ${className}`}
      aria-label="Last 24 hour transmission activity"
    >
      {!hasActivity && (
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--color-border)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      )}
      {hasActivity && (
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
      )}
    </svg>
  )
}

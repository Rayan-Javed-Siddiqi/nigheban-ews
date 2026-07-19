'use client'

import dynamic from 'next/dynamic'

const StationHealthMap = dynamic(() => import('./StationHealthMap'), { ssr: false })

export default function StationHealthMapClient() {
  return <StationHealthMap />
}
'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

export default function StationHealthMap() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'carto-light': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
              'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors © CARTO',
          },
        },
        layers: [{ id: 'carto-light-layer', type: 'raster', source: 'carto-light' }],
      },
      center: [72.5, 35.0],
      zoom: 6,
    })

    mapRef.current = map

    map.on('load', async () => {
      const res = await fetch('/api/stations')
      const geojson = await res.json()

      map.addSource('stations', { type: 'geojson', data: geojson })

      map.addLayer({
        id: 'station-points',
        type: 'circle',
        source: 'stations',
        paint: {
          'circle-radius': 6,
          'circle-color': [
            'match',
            ['get', 'status'],
            'online', '#0F6B3D',
            'degraded', '#E0A030',
            'offline', '#B3261E',
            '#888888',
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#FFFFFF',
        },
      })

      map.on('click', 'station-points', (e) => {
        const feature = e.features?.[0]
        if (!feature) return
        const props = feature.properties as Record<string, string | number | null>
        const lastSeen = props.last_transmission_at
          ? new Date(String(props.last_transmission_at)).toLocaleString('en-GB', {
              timeZone: 'Asia/Karachi',
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'Never'
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(
            `<strong>${props.name}</strong><br/>
             ${props.valley ? `Valley: ${props.valley}<br/>` : ''}
             ${props.district_name ? `District: ${props.district_name}<br/>` : ''}
             Status: ${props.status}<br/>
             Battery: ${props.battery_voltage != null ? props.battery_voltage + 'V' : '—'}<br/>
             Last transmission: ${lastSeen} PKT`
          )
          .addTo(map)
      })

      map.on('mouseenter', 'station-points', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'station-points', () => {
        map.getCanvas().style.cursor = ''
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  return <div ref={mapContainer} className="h-full w-full" />
}
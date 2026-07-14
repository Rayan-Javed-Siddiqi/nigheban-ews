'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

export default function DashboardMap() {
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
        layers: [
          { id: 'carto-light-layer', type: 'raster', source: 'carto-light' },
        ],
      },
      center: [72.5, 35.0],
      zoom: 6,
    })

    mapRef.current = map

    map.on('load', async () => {
      // --- Districts ---
      const res = await fetch('/api/districts')
      const geojson = await res.json()

      map.addSource('districts', {
        type: 'geojson',
        data: geojson,
      })

      map.addLayer({
        id: 'district-fill',
        type: 'fill',
        source: 'districts',
        paint: {
          'fill-color': [
            'match',
            ['get', 'province'],
            'KP', '#0F6B3D',
            'GB', '#01411C',
            '#888888',
          ],
          'fill-opacity': 0.12,
        },
      })

      map.addLayer({
        id: 'district-outline',
        type: 'line',
        source: 'districts',
        paint: {
          'line-color': '#01411C',
          'line-width': 1,
        },
      })

      map.on('click', 'district-fill', (e) => {
        const feature = e.features?.[0]
        if (!feature) return
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(
            `<strong>${feature.properties?.name_en}</strong><br/>${feature.properties?.province}`
          )
          .addTo(map)
      })

      map.on('mouseenter', 'district-fill', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'district-fill', () => {
        map.getCanvas().style.cursor = ''
      })

      // --- Hazard events (earthquakes, etc.) ---
      const hazardRes = await fetch('/api/hazards')
      const hazardGeojson = await hazardRes.json()

      map.addSource('hazards', {
        type: 'geojson',
        data: hazardGeojson,
      })

      map.addLayer({
        id: 'hazard-points',
        type: 'circle',
        source: 'hazards',
        paint: {
          'circle-radius': 8,
          'circle-color': [
            'match',
            ['get', 'severity'],
            'emergency', '#B3261E',
            'warning', '#D97757',
            'watch', '#E0A030',
            '#888888',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
        },
      })

      map.on('click', 'hazard-points', (e) => {
        const feature = e.features?.[0]
        if (!feature) return
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(
            `<strong>${feature.properties?.title}</strong><br/>
             Severity: ${feature.properties?.severity}<br/>
             ${new Date(feature.properties?.starts_at).toLocaleString()}`
          )
          .addTo(map)
      })

      map.on('mouseenter', 'hazard-points', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'hazard-points', () => {
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
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

/* ------------------------------------------------------------------ */
/*  Layer definitions for the toggle panel                            */
/* ------------------------------------------------------------------ */
interface LayerToggle {
  id: string
  label: string
  /** MapLibre layer ids controlled by this toggle */
  layerIds: string[]
  defaultVisible: boolean
}

const LAYER_TOGGLES: LayerToggle[] = [
  { id: 'snow',    label: 'NASA Snow Cover', layerIds: ['snow-cover-layer'], defaultVisible: false },
  { id: 'glacial', label: 'Glacial Lakes',   layerIds: ['glacial-lake-points'], defaultVisible: true  },
  { id: 'drought', label: 'Drought Index',   layerIds: ['drought-choropleth'],  defaultVisible: false },
  { id: 'flood',   label: 'Flood Risk',      layerIds: ['flood-risk-fill'],     defaultVisible: true  },
  { id: 'hazards', label: 'Hazard Events',   layerIds: ['hazard-points', 'hazard-fill', 'hazard-line'], defaultVisible: true  },
]

/* ------------------------------------------------------------------ */
/*  Helper: yesterday in YYYY-MM-DD (for NASA GIBS {Time} parameter)  */
/* ------------------------------------------------------------------ */
function getYesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */
export default function DashboardMap() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  /* Layer visibility state – seeded from defaults */
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    LAYER_TOGGLES.forEach((t) => { init[t.id] = t.defaultVisible })
    return init
  })

  /* Track whether the map style (and therefore layers) has loaded */
  const [mapLoaded, setMapLoaded] = useState(false)

  /* -------------------------------------------------------------- */
  /*  Toggle handler                                                 */
  /* -------------------------------------------------------------- */
  const handleToggle = useCallback(
    (toggleId: string) => {
      setVisibility((prev) => {
        const next = { ...prev, [toggleId]: !prev[toggleId] }

        const map = mapRef.current
        if (map) {
          const toggle = LAYER_TOGGLES.find((t) => t.id === toggleId)
          toggle?.layerIds.forEach((layerId) => {
            if (map.getLayer(layerId)) {
              map.setLayoutProperty(
                layerId,
                'visibility',
                next[toggleId] ? 'visible' : 'none',
              )
            }
          })
        }
        return next
      })
    },
    [],
  )

  /* -------------------------------------------------------------- */
  /*  Map initialisation (runs once)                                 */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const yesterdayStr = getYesterdayStr()

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
      /* ========================================================== */
      /*  1. NASA GIBS Snow Cover – raster tiles & Mask             */
      /* ========================================================== */
      map.addSource('snow-cover', {
        type: 'raster',
        tiles: [
          `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDSI_Snow_Cover/default/2024-02-15/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`,
        ],
        tileSize: 256,
        maxzoom: 8,
      })

      map.addLayer({
        id: 'snow-cover-layer',
        type: 'raster',
        source: 'snow-cover',
        paint: { 
          'raster-opacity': 0.7,
          'raster-hue-rotate': 180,    // Turns the original pinks/reds into cool cyan/light blue
          'raster-contrast': 0.5,      // Softens the colors slightly
        },
        layout: { visibility: 'none' }, // toggled on by user
      })

      /* ========================================================== */
      /*  2. Flood risk overlay (existing)                          */
      /* ========================================================== */
      try {
        const floodRes = await fetch('/api/flood-forecast')
        const floodGeojson = await floodRes.json()

        map.addSource('flood-risk', { type: 'geojson', data: floodGeojson })

        map.addLayer({
          id: 'flood-risk-fill',
          type: 'fill',
          source: 'flood-risk',
          paint: {
            'fill-color': [
              'match',
              ['get', 'risk_level'],
              'high', '#B3261E',
              'medium', '#E0A030',
              'low', '#0F6B3D',
              '#CCCCCC',
            ],
            'fill-opacity': 0.35,
          },
          layout: { visibility: 'visible' },
        })
      } catch (err) {
        console.error('Failed to load flood risk data:', err)
      }

      /* ========================================================== */
      /*  3. Drought choropleth                                     */
      /* ========================================================== */
      try {
        const droughtRes = await fetch('/api/drought')
        const droughtGeojson = await droughtRes.json()

        map.addSource('drought-index', { type: 'geojson', data: droughtGeojson })

        map.addLayer({
          id: 'drought-choropleth',
          type: 'fill',
          source: 'drought-index',
          paint: {
            'fill-color': [
              'step',
              ['get', 'spi_3'],
              '#8B0000',   // spi_3 <= -2.0  → Extreme Drought
              -2.0, '#CC3300',  // -2.0 < spi_3 <= -1.5  → Severe
              -1.5, '#FF6600',  // -1.5 < spi_3 <= -1.0  → Moderate
              -1.0, '#FFD700',  // -1.0 < spi_3 <= 0     → Mild / Normal
              0,    'transparent', // spi_3 > 0 → Wet (hidden)
            ],
            'fill-opacity': 0.4,
          },
          layout: { visibility: 'none' }, // toggled on by user
        })
      } catch (err) {
        console.error('Failed to load drought data:', err)
      }

      /* ========================================================== */
      /*  4. Districts (existing)                                   */
      /* ========================================================== */
      try {
        const res = await fetch('/api/districts')
        const geojson = await res.json()

        map.addSource('districts', { type: 'geojson', data: geojson })

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
          paint: { 'line-color': '#01411C', 'line-width': 1 },
        })

        map.on('click', 'district-fill', (e) => {
          const feature = e.features?.[0]
          if (!feature) return
          new maplibregl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(
              `<strong>${feature.properties?.name_en}</strong><br/>${feature.properties?.province}<br/>
               <a href="/dashboard/district/${feature.properties?.id}" style="color:#01411C;font-weight:600;">Open District Console →</a>`,
            )
            .addTo(map)
        })

        map.on('mouseenter', 'district-fill', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'district-fill', () => {
          map.getCanvas().style.cursor = ''
        })
      } catch (err) {
        console.error('Failed to load district data:', err)
      }

      /* ========================================================== */
      /*  5. Hazard events (Polygons and Points)                    */
      /* ========================================================== */
      try {
        const hazardRes = await fetch('/api/hazards')
        const hazardGeojson = await hazardRes.json()

        map.addSource('hazards', { type: 'geojson', data: hazardGeojson })

        // Render point-based hazards as circles
        map.addLayer({
          id: 'hazard-points',
          type: 'circle',
          source: 'hazards',
          filter: ['==', ['geometry-type'], 'Point'],
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
          layout: { visibility: 'visible' },
        })

        // Render polygon-based hazards (like districts) as a flashing/colored fill
        map.addLayer({
          id: 'hazard-fill',
          type: 'fill',
          source: 'hazards',
          filter: ['!=', ['geometry-type'], 'Point'],
          paint: {
            'fill-color': [
              'match',
              ['get', 'severity'],
              'emergency', '#B3261E',
              'warning', '#D97757',
              'watch', '#E0A030',
              '#888888',
            ],
            'fill-opacity': 0.4,
          },
          layout: { visibility: 'visible' },
        })

        map.addLayer({
          id: 'hazard-line',
          type: 'line',
          source: 'hazards',
          filter: ['!=', ['geometry-type'], 'Point'],
          paint: {
            'line-color': [
              'match',
              ['get', 'severity'],
              'emergency', '#B3261E',
              'warning', '#D97757',
              'watch', '#E0A030',
              '#888888',
            ],
            'line-width': 3,
          },
          layout: { visibility: 'visible' },
        })

        // Add popups for hazard layers
        const handleHazardClick = (e: any) => {
          const feature = e.features?.[0]
          if (!feature) return
          new maplibregl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(
              `<strong>${feature.properties?.title}</strong><br/>
               Severity: <span style="text-transform: uppercase; font-weight: bold;">${feature.properties?.severity}</span><br/>
               ${new Date(feature.properties?.starts_at).toLocaleString()}`,
            )
            .addTo(map)
        }

        map.on('click', 'hazard-points', handleHazardClick)
        map.on('click', 'hazard-fill', handleHazardClick)

        const changeCursor = () => { map.getCanvas().style.cursor = 'pointer' }
        const resetCursor = () => { map.getCanvas().style.cursor = '' }

        map.on('mouseenter', 'hazard-points', changeCursor)
        map.on('mouseleave', 'hazard-points', resetCursor)
        map.on('mouseenter', 'hazard-fill', changeCursor)
        map.on('mouseleave', 'hazard-fill', resetCursor)
      } catch (err) {
        console.error('Failed to load hazard data:', err)
      }

      /* ========================================================== */
      /*  6. Glacial Lakes                                          */
      /* ========================================================== */
      try {
        const glacialRes = await fetch('/api/glacial-lakes')
        const glacialGeojson = await glacialRes.json()

        map.addSource('glacial-lakes', { type: 'geojson', data: glacialGeojson })

        map.addLayer({
          id: 'glacial-lake-points',
          type: 'circle',
          source: 'glacial-lakes',
          paint: {
            'circle-radius': 8,
            'circle-color': [
              'match',
              ['get', 'hazard_class'],
              'High', '#B3261E',
              'Medium', '#E0A030',
              'Low', '#F2C94C',
              '#888888',
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FFFFFF',
          },
          layout: { visibility: 'visible' },
        })

        /* Click popup for glacial lakes */
        map.on('click', 'glacial-lake-points', (e) => {
          const feature = e.features?.[0]
          if (!feature) return
          const p = feature.properties
          new maplibregl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(
              `<strong>${p?.name ?? 'Unnamed Lake'}</strong><br/>
               Valley: ${p?.valley ?? '—'}<br/>
               Hazard class: <span style="font-weight:600;">${p?.hazard_class ?? '—'}</span><br/>
               Downstream pop.: ${p?.downstream_population?.toLocaleString?.() ?? p?.downstream_population ?? '—'}`,
            )
            .addTo(map)
        })

        /* Cursor change on hover */
        map.on('mouseenter', 'glacial-lake-points', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'glacial-lake-points', () => {
          map.getCanvas().style.cursor = ''
        })
      } catch (err) {
        console.error('Failed to load glacial lakes data:', err)
      }

      /* Mark map as loaded so React can sync visibility state */
      setMapLoaded(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  /* -------------------------------------------------------------- */
  /*  Sync React visibility state → MapLibre whenever mapLoaded     */
  /*  (ensures defaults are applied after async layers are added)   */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    if (!mapLoaded) return
    const map = mapRef.current
    if (!map) return

    LAYER_TOGGLES.forEach((toggle) => {
      toggle.layerIds.forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(
            layerId,
            'visibility',
            visibility[toggle.id] ? 'visible' : 'none',
          )
        }
      })
    })
  }, [mapLoaded, visibility])

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */
  return (
    <div className="relative h-full w-full">
      {/* Map canvas */}
      <div ref={mapContainer} className="h-full w-full" />

      {/* ---------------------------------------------------------- */}
      {/*  Layer toggle control panel                                 */}
      {/* ---------------------------------------------------------- */}
      <div className="absolute top-3 right-3 z-10 w-52 rounded-xl bg-black/70 p-4 shadow-lg backdrop-blur-sm">
        <h3 className="mb-3 text-xs font-semibold tracking-wide text-white/80 uppercase">
          Map Layers
        </h3>

        <ul className="space-y-2">
          {LAYER_TOGGLES.map((toggle) => (
            <li key={toggle.id}>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-white/90 select-none">
                <input
                  type="checkbox"
                  checked={visibility[toggle.id]}
                  onChange={() => handleToggle(toggle.id)}
                  className="accent-emerald-500 h-4 w-4 rounded"
                />
                {toggle.label}
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
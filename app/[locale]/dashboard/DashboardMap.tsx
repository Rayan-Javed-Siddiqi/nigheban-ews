'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import DeckGL from '@deck.gl/react'
import { GeoJsonLayer } from '@deck.gl/layers'
import { Map } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'

/* ------------------------------------------------------------------ */
/*  Layer definitions for the toggle panel                            */
/* ------------------------------------------------------------------ */
interface LayerToggle {
  id: string
  label: string
  defaultVisible: boolean
}

const LAYER_TOGGLES: LayerToggle[] = [
  { id: 'snow',    label: 'NASA Snow Cover', defaultVisible: false },
  { id: 'glacial', label: 'Glacial Lakes',   defaultVisible: true  },
  { id: 'drought', label: 'Drought Index',   defaultVisible: false },
  { id: 'flood',   label: 'Flood Risk',      defaultVisible: true  },
  { id: 'hazards', label: 'Hazard Events',   defaultVisible: true  },
]

export default function DashboardMap() {
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    LAYER_TOGGLES.forEach((t) => { init[t.id] = t.defaultVisible })
    return init
  })

  const handleToggle = useCallback((toggleId: string) => {
    setVisibility((prev) => ({ ...prev, [toggleId]: !prev[toggleId] }))
  }, [])

  // Deck.gl Layers
  const layers = useMemo(() => {
    const arr: any[] = []

    // Base Districts layer
    arr.push(
      new GeoJsonLayer({
        id: 'district-layer',
        data: '/api/districts',
        pickable: true,
        stroked: true,
        filled: true,
        lineWidthMinPixels: 1,
        getFillColor: (d: any) => {
          const p = d.properties.province
          if (p === 'KP') return [15, 107, 61, 30] // #0F6B3D ~ 12% opacity
          if (p === 'GB') return [1, 65, 28, 30]
          return [136, 136, 136, 30]
        },
        getLineColor: [1, 65, 28, 255],
        onClick: ({ object }: any) => {
           // Handle navigation or popup
           if (object && object.properties.id) {
             window.location.href = `/dashboard/district/${object.properties.id}`
           }
        }
      })
    )

    if (visibility.flood) {
      arr.push(
        new GeoJsonLayer({
          id: 'flood-layer',
          data: '/api/flood-forecast',
          pickable: true,
          stroked: false,
          filled: true,
          getFillColor: (d: any) => {
            const r = d.properties.risk_level
            if (r === 'high') return [179, 38, 30, 90] // #B3261E
            if (r === 'medium') return [224, 160, 48, 90] // #E0A030
            if (r === 'low') return [15, 107, 61, 90] // #0F6B3D
            return [204, 204, 204, 90]
          }
        })
      )
    }

    if (visibility.drought) {
      arr.push(
        new GeoJsonLayer({
          id: 'drought-layer',
          data: '/api/drought',
          pickable: true,
          stroked: false,
          filled: true,
          getFillColor: (d: any) => {
            const spi = d.properties.spi_3
            if (spi <= -2.0) return [139, 0, 0, 100]
            if (spi <= -1.5) return [204, 51, 0, 100]
            if (spi <= -1.0) return [255, 102, 0, 100]
            if (spi <= 0) return [255, 215, 0, 100]
            return [0, 0, 0, 0]
          }
        })
      )
    }

    if (visibility.hazards) {
      arr.push(
        new GeoJsonLayer({
          id: 'hazard-layer',
          data: '/api/hazards',
          pickable: true,
          stroked: true,
          filled: true,
          pointType: 'circle',
          getPointRadius: 8000, // Deck.gl uses meters by default for radius
          getFillColor: (d: any) => {
            const s = d.properties.severity
            if (s === 'emergency') return [179, 38, 30, 100]
            if (s === 'warning') return [217, 119, 87, 100]
            if (s === 'watch') return [224, 160, 48, 100]
            return [136, 136, 136, 100]
          },
          getLineColor: [255, 255, 255, 255],
          getLineWidth: 200,
        })
      )
    }

    if (visibility.glacial) {
      arr.push(
        new GeoJsonLayer({
          id: 'glacial-lake-layer',
          data: '/api/glacial-lakes',
          pickable: true,
          stroked: true,
          filled: true,
          pointType: 'circle',
          getPointRadius: 6000,
          getFillColor: (d: any) => {
            const h = d.properties.hazard_class
            if (h === 'High') return [179, 38, 30, 255]
            if (h === 'Medium') return [224, 160, 48, 255]
            if (h === 'Low') return [242, 201, 76, 255]
            return [136, 136, 136, 255]
          },
          getLineColor: [255, 255, 255, 255],
          getLineWidth: 200,
        })
      )
    }

    return arr
  }, [visibility])

  const initialViewState = {
    longitude: 72.5,
    latitude: 35.0,
    zoom: 6,
    pitch: 45,
    bearing: 0
  }

  // Handle snow layer as part of base map using Mapbox style
  const mapStyle = useMemo(() => {
    const style: any = {
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
    }

    if (visibility.snow) {
      // Use imagery from 2 days ago to ensure global availability and prevent 400 errors
      const d = new Date();
      d.setDate(d.getDate() - 2);
      const dateStr = d.toISOString().split('T')[0];
      
      style.sources['snow-cover'] = {
        type: 'raster',
        tiles: [
          `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDSI_Snow_Cover/default/${dateStr}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`,
        ],
        tileSize: 256,
      }
      style.layers.push({
        id: 'snow-cover-layer',
        type: 'raster',
        source: 'snow-cover',
        paint: { 
          'raster-opacity': 0.7,
        },
      })
    }

    return style
  }, [visibility.snow])

  return (
    <div className="relative h-full w-full">
      <DeckGL
        initialViewState={initialViewState}
        controller={true}
        layers={layers}
        getTooltip={({object}) => {
          if (!object) return null;
          const { properties } = object;
          if (properties.name_en) return `${properties.name_en}\n${properties.province}`;
          if (properties.title) return `${properties.title}\nSeverity: ${properties.severity}`;
          if (properties.name) return `${properties.name}\nHazard Class: ${properties.hazard_class}`;
          return null;
        }}
      >
        <Map mapStyle={mapStyle} reuseMaps />
      </DeckGL>

      {/* Premium Glassmorphic Layer Toggle Control Panel */}
      <div className="absolute top-6 right-6 z-10 w-64 rounded-2xl bg-white/10 p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] backdrop-blur-xl border border-white/20 transition-all duration-300 hover:shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold tracking-widest text-white/90 uppercase font-sans">
            Map Overlays
          </h3>
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.6)] animate-pulse" />
        </div>

        <ul className="space-y-3">
          {LAYER_TOGGLES.map((toggle) => {
            const isActive = visibility[toggle.id];
            return (
              <li key={toggle.id} className="group flex cursor-pointer items-center justify-between rounded-xl hover:bg-white/5 p-2 transition-colors duration-200" onClick={() => handleToggle(toggle.id)}>
                <span className={`text-sm font-medium transition-colors duration-200 ${isActive ? 'text-white' : 'text-white/60 group-hover:text-white/80'}`}>
                  {toggle.label}
                </span>
                
                {/* Custom animated toggle switch */}
                <div className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none ${isActive ? 'bg-emerald-500' : 'bg-white/20'}`}>
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  )
}
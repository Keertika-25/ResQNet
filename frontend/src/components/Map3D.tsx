import { useEffect, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource, type LngLatLike } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { km, parseDate, type Hospital, type Incident, type Team } from '../api'
import MapView from './MapView'
import { PRIORITY_HEX } from './ui'

// Free OSM vector tiles with building heights (no API key) + public OSRM demo router for road-following routes.
const STYLE = 'https://tiles.openfreemap.org/styles/dark'
const OSRM = 'https://router.project-osrm.org/route/v1/driving/'
const CENTER: [number, number] = [78.475, 17.41]
const GLYPH: Record<string, string> = { Fire: '🔥', 'Medical Emergency': '✚', 'Road Accident': '🚗', 'Building Collapse': '⚠', Flooding: '🌊', Other: '!' }
const ROUTE_COLOR: Record<string, string> = { Assigned: '#60a5fa', 'En Route': '#22c55e', 'On Scene': '#a78bfa' }

// OSM height where tagged; otherwise a stable pseudo-height from the feature id (visual approximation only).
const HEIGHT = ['coalesce', ['get', 'render_height'], ['+', 6, ['%', ['*', ['to-number', ['coalesce', ['id'], 0]], 7], 34]]] as unknown as number

type Route = { coords: [number, number][]; km: number; min: number }
const routeCache = new Map<string, Promise<Route>>()

/** Road route from OSRM, cached; falls back to a straight line if the router is unreachable. */
function getRoute(from: [number, number], to: [number, number]): Promise<Route> {
  const key = `${from.join(',')};${to.join(',')}`
  if (!routeCache.has(key)) {
    const straight = (): Route => {
      const d = km({ lat: from[1], lng: from[0] }, { lat: to[1], lng: to[0] })
      return { coords: [from, to], km: d, min: (d / 30) * 60 } // ponytail: 30 km/h guess when offline
    }
    routeCache.set(key, fetch(`${OSRM}${key}?overview=full&geometries=geojson`)
      .then(r => r.json())
      .then(j => j.code === 'Ok' ? { coords: j.routes[0].geometry.coordinates, km: j.routes[0].distance / 1000, min: j.routes[0].duration / 60 } : straight())
      .catch(straight))
  }
  return routeCache.get(key)!
}

/** Point at fraction t (0..1) along a polyline, by distance. */
function along(coords: [number, number][], t: number): [number, number] {
  const seg = coords.slice(1).map((c, i) => km({ lat: coords[i][1], lng: coords[i][0] }, { lat: c[1], lng: c[0] }))
  let target = seg.reduce((a, b) => a + b, 0) * t
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? Math.min(1, target / seg[i]) : 0
      return [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * f, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * f]
    }
    target -= seg[i]
  }
  return coords[coords.length - 1]
}

function circle([lng, lat]: [number, number], meters: number, steps = 48): [number, number][] {
  const dLat = meters / 111320, dLng = meters / (111320 * Math.cos((lat * Math.PI) / 180))
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI
    return [lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]
  })
}

function el(html: string, className = '') {
  const d = document.createElement('div')
  d.className = className
  d.innerHTML = html
  return d
}

/** Keyed marker reconciliation so 5 s polling doesn't recreate DOM. */
function syncMarkers(map: maplibregl.Map, store: Map<string, maplibregl.Marker>, items: { key: string; at: [number, number]; html: string; z?: number; onClick?: () => void }[]) {
  const keep = new Set(items.map(i => i.key))
  for (const [k, m] of store) if (!keep.has(k)) { m.remove(); store.delete(k) }
  for (const it of items) {
    let m = store.get(it.key)
    if (!m) {
      const node = el(it.html)
      if (it.onClick) node.addEventListener('click', e => { e.stopPropagation(); it.onClick!() })
      node.style.cursor = it.onClick ? 'pointer' : 'default'
      m = new maplibregl.Marker({ element: node }).setLngLat(it.at).addTo(map)
      store.set(it.key, m)
    } else {
      m.setLngLat(it.at)
      if (m.getElement().innerHTML !== it.html) m.getElement().innerHTML = it.html
    }
    m.getElement().style.zIndex = String(it.z ?? 0)
  }
}

const pin = (color: string, label: string, size: number, pulse: boolean) =>
  `<div class="rq-pin ${pulse ? 'rq-pulse' : ''}" style="--c:${color};width:${size}px;height:${size}px">${label}</div>`

export default function Map3D({ incidents, hospitals, teams, selectedId, onSelect, focus, className = 'h-[600px]' }: {
  incidents: Incident[]; hospitals: Hospital[]; teams: Team[]; selectedId?: number | null
  onSelect?: (id: number) => void; focus?: [number, number] | null; className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markers = useRef(new Map<string, maplibregl.Marker>())
  const live = useRef<{ inc: Incident; route: Route }[]>([])
  const fitted = useRef(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState('')
  const [is3d, setIs3d] = useState(true)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // --- create map once ---
  useEffect(() => {
    if (!box.current) return
    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({ container: box.current, style: STYLE, center: CENTER, zoom: 15, pitch: 60, bearing: -20, maxPitch: 75, attributionControl: { compact: true } })
    } catch (e) { setFailed((e as Error).message || 'WebGL is not available'); return }
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.on('error', e => console.warn('map:', e.error?.message))
    map.on('load', () => {
      map.setPaintProperty('background', 'background-color', '#0b1426')
      map.setPaintProperty('water', 'fill-color', '#10264a')
      map.setLayoutProperty('building', 'visibility', 'none')
      for (const id of ['highway_major_inner', 'highway_motorway_inner', 'highway_minor'])
        if (map.getLayer(id)) map.setPaintProperty(id, 'line-color', '#2b3d63')
      map.setLight({ anchor: 'viewport', color: '#dbe7ff', intensity: 0.45, position: [1.2, 210, 40] })
      map.addLayer({
        id: 'buildings-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 12,
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], HEIGHT, 0, '#22314f', 25, '#33476f', 60, '#4b6496', 100, '#6d8cc4'],
          'fill-extrusion-height': HEIGHT,
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.88,
        },
      }, 'highway_name_other')
      map.addSource('zones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'zone-floor', type: 'fill', source: 'zones', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 } })
      map.addLayer({ id: 'zone-column', type: 'fill-extrusion', source: 'zones', paint: {
        'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.28 } })
      map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'route-glow', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 14, 'line-opacity': 0.25, 'line-blur': 6 } })
      map.addLayer({ id: 'route-line', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 5 } })
      map.addLayer({ id: 'route-flow', type: 'line', source: 'routes', layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 2.5, 'line-opacity': 0.85, 'line-dasharray': [0, 4, 3] } })
      setReady(true)
    })
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(box.current)
    // animate: marching dashes along routes + vehicles advancing while En Route
    const steps = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]]
    let raf = 0, last = 0, step = 0
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      if (t - last < 70 || !map.getLayer('route-flow')) return
      last = t
      step = (step + 1) % steps.length
      map.setPaintProperty('route-flow', 'line-dasharray', steps[step])
      for (const { inc, route } of live.current) {
        const m = markers.current.get('v' + inc.id)
        if (!m) continue
        // progress estimated from time since the incident status last changed vs. routed travel time
        const p = inc.status === 'En Route' ? Math.min(0.97, (Date.now() - parseDate(inc.updated_at).getTime()) / 60000 / Math.max(route.min, 1)) : inc.status === 'On Scene' ? 1 : 0
        m.setLngLat(along(route.coords, p))
      }
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); markers.current.clear(); map.remove(); mapRef.current = null }
  }, [])

  // --- data -> layers & markers ---
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const open = (i: Incident) => !['Resolved', 'Closed'].includes(i.status)
    const teamByName = Object.fromEntries(teams.map(t => [t.name, t]))
    ;(map.getSource('zones') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: incidents.filter(i => open(i) && (i.priority === 'Critical' || i.priority === 'High')).map(i => ({
        type: 'Feature', properties: { color: PRIORITY_HEX[i.priority], h: i.priority === 'Critical' ? 90 : 45 },
        geometry: { type: 'Polygon', coordinates: [circle([i.lng, i.lat], i.priority === 'Critical' ? 140 : 90)] },
      })),
    })

    const active = incidents.filter(i => open(i) && i.current_team && teamByName[i.current_team])
    let cancelled = false
    Promise.all(active.map(async i => {
      const t = teamByName[i.current_team!]
      return { inc: i, route: await getRoute([t.base_lng, t.base_lat], [i.lng, i.lat]) }
    })).then(rs => {
      if (cancelled || !mapRef.current) return
      live.current = rs
      ;(map.getSource('routes') as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: rs.map(({ inc, route }) => ({ type: 'Feature', properties: { color: ROUTE_COLOR[inc.status] ?? '#60a5fa' }, geometry: { type: 'LineString', coordinates: route.coords } })),
      })
      syncMarkers(map, markers.current, [
        ...hospitals.map(h => ({ key: 'h' + h.id, at: [h.lng, h.lat] as [number, number], z: 1,
          html: `<div class="rq-tag">${pin('#2563eb', 'H', 26, false)}<span>${h.name}<b>${h.available_beds} beds · ICU ${h.icu_available}</b></span></div>` })),
        ...teams.filter(t => t.status !== 'busy').map(t => ({ key: 't' + t.id, at: [t.base_lng, t.base_lat] as [number, number], z: 1,
          html: pin('#059669', '🚑', 26, false) })),
        ...incidents.map(i => ({ key: 'i' + i.id, at: [i.lng, i.lat] as [number, number], z: i.id === selectedId ? 30 : i.priority === 'Critical' ? 20 : 10,
          onClick: () => onSelectRef.current?.(i.id),
          html: `<div class="rq-tag ${i.id === selectedId ? 'rq-sel' : ''}">${pin(open(i) ? PRIORITY_HEX[i.priority] : '#10b981', GLYPH[i.incident_type] ?? '!', i.id === selectedId ? 38 : 30, open(i) && i.priority === 'Critical')}${open(i) ? `<span>${i.incident_type}<b>${i.priority} · ${i.status}</b></span>` : ''}</div>` })),
        ...rs.map(({ inc, route }) => ({ key: 'v' + inc.id, at: route.coords[0], z: 25,
          html: `<div class="rq-vehicle" style="--c:${ROUTE_COLOR[inc.status]}">🚒</div>` })),
        ...rs.filter(r => r.inc.status !== 'On Scene').map(({ inc, route }) => ({ key: 'e' + inc.id, at: along(route.coords, 0.5), z: 15,
          html: `<div class="rq-eta"><i style="background:${ROUTE_COLOR[inc.status]}"></i>~${Math.round(route.min)} min · ${route.km.toFixed(1)} km</div>` })),
      ])
      if (!fitted.current && incidents.length) {
        fitted.current = true
        // open close-up on the most urgent live incident, like a command-center view
        const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 }
        const top = [...incidents].filter(open).sort((a, b) => rank[a.priority] - rank[b.priority])[0] ?? incidents[0]
        map.flyTo({ center: [top.lng, top.lat], zoom: 15.4, pitch: 62, bearing: -25, duration: 2000 })
      }
    })
    return () => { cancelled = true }
  }, [ready, incidents, hospitals, teams, selectedId])

  const [lat, lng] = focus ?? []
  useEffect(() => {
    if (ready && lat !== undefined && lng !== undefined) mapRef.current?.flyTo({ center: [lng, lat] as LngLatLike, zoom: 15.5, pitch: is3d ? 62 : 0, duration: 1200 })
  }, [ready, lat, lng]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle3d() {
    const next = !is3d
    setIs3d(next)
    mapRef.current?.easeTo({ pitch: next ? 60 : 0, bearing: next ? -20 : 0, duration: 800 })
    mapRef.current?.setLayoutProperty('buildings-3d', 'visibility', next ? 'visible' : 'none')
  }

  const critical = incidents.filter(i => i.priority === 'Critical' && !['Resolved', 'Closed'].includes(i.status)).length
  if (failed) return <MapView incidents={incidents} hospitals={hospitals} teams={teams} selectedId={selectedId} onSelect={onSelect} focus={focus} className={className} />
  return <div className={`relative overflow-hidden rounded-xl bg-navy-950 ${className}`}>
    <div ref={box} className="h-full w-full" />
    {critical > 0 && <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-lg bg-red-600/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-red-900/50 backdrop-blur">
      <span className="h-2 w-2 animate-pulse rounded-full bg-white" />{critical} critical incident{critical > 1 && 's'} active
    </div>}
    <div className="absolute bottom-3 left-3 flex gap-2">
      <button onClick={toggle3d} className="rounded-lg bg-navy-900/90 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/15 backdrop-blur hover:bg-navy-700">{is3d ? '2D view' : '3D view'}</button>
      <div className="hidden items-center gap-3 rounded-lg bg-navy-900/90 px-3 py-1.5 text-[11px] text-slate-300 ring-1 ring-white/15 backdrop-blur md:flex">
        {Object.entries(ROUTE_COLOR).map(([s, c]) => <span key={s} className="flex items-center gap-1.5"><span className="h-1 w-4 rounded" style={{ background: c }} />{s}</span>)}
      </div>
    </div>
    {!ready && <div className="absolute inset-0 grid place-items-center text-sm text-slate-400">Loading 3D city…</div>}
  </div>
}

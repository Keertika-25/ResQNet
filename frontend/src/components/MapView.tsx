import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import type { Hospital, Incident, Team } from '../api'
import { PRIORITY_HEX } from './ui'

export const DEFAULT_CENTER: [number, number] = [17.41, 78.475] // demo city centre (fictional data)

const pin = (color: string, label: string, pulse = false, size = 30) => L.divIcon({
  className: '',
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
  html: `<div class="rq-pin ${pulse ? 'rq-pulse' : ''}" style="--c:${color};width:${size}px;height:${size}px">${label}</div>`,
})
const TYPE_GLYPH: Record<string, string> = {
  'Fire': '🔥', 'Medical Emergency': '✚', 'Road Accident': '🚗', 'Building Collapse': '⚠', 'Flooding': '🌊', 'Other': '!',
}
const incidentIcon = (i: Incident, selected: boolean) =>
  pin(i.status === 'Resolved' || i.status === 'Closed' ? '#10b981' : PRIORITY_HEX[i.priority], TYPE_GLYPH[i.incident_type] ?? '!',
    i.priority === 'Critical' && !['Resolved', 'Closed'].includes(i.status), selected ? 40 : 30)
const hospitalIcon = pin('#2563eb', 'H', false, 28)
const teamIcon = (busy: boolean) => pin(busy ? '#7c3aed' : '#059669', '🚑', false, 28)
const pickIcon = pin('#dc2626', '📍', true, 34)

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || points.length === 0) return
    done.current = true
    if (points.length === 1) map.setView(points[0], 14)
    else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 })
  }, [points, map])
  return null
}

function Picker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onPick(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)) })
  return null
}

function FlyTo({ to }: { to: [number, number] | null }) {
  const map = useMap()
  const [lat, lng] = to ?? []
  useEffect(() => { if (lat !== undefined && lng !== undefined) map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.6 }) }, [lat, lng, map])
  return null
}

// Leaflet doesn't notice container resizes (grid reflow, modal open) — keep tiles filled.
function AutoResize() {
  const map = useMap()
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map])
  return null
}

export default function MapView({ incidents = [], hospitals = [], teams = [], selectedId, onSelect, pick, onPick, focus, className = 'h-96' }: {
  incidents?: Incident[]; hospitals?: Hospital[]; teams?: Team[]; selectedId?: number | null
  onSelect?: (id: number) => void; pick?: [number, number] | null; onPick?: (lat: number, lng: number) => void
  focus?: [number, number] | null; className?: string
}) {
  const points: [number, number][] = [...incidents.map(i => [i.lat, i.lng] as [number, number]), ...hospitals.map(h => [h.lat, h.lng] as [number, number])]
  if (pick) points.push(pick)
  const teamByName = Object.fromEntries(teams.map(t => [t.name, t]))
  return <div className={`relative overflow-hidden rounded-xl ${className}`}>
    <MapContainer center={DEFAULT_CENTER} zoom={13} className="h-full w-full" scrollWheelZoom>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <AutoResize />
      {!onPick && <Fit points={points} />}
      <FlyTo to={focus ?? null} />
      {onPick && <Picker onPick={onPick} />}
      {pick && <Marker position={pick} icon={pickIcon}><Tooltip direction="top" offset={[0, -14]}>Selected location</Tooltip></Marker>}

      {/* route line from the responding team's base to the incident */}
      {incidents.filter(i => i.current_team && teamByName[i.current_team]).map(i => {
        const t = teamByName[i.current_team!]
        return <Polyline key={'r' + i.id} positions={[[t.base_lat, t.base_lng], [i.lat, i.lng]]}
          pathOptions={{ color: i.status === 'On Scene' ? '#7c3aed' : '#2563eb', weight: 4, opacity: 0.8, dashArray: i.status === 'Assigned' ? '6 8' : undefined }} />
      })}

      {hospitals.map(h => <Marker key={'h' + h.id} position={[h.lat, h.lng]} icon={hospitalIcon}>
        <Popup><b>{h.name}</b><br />Beds {h.available_beds}/{h.total_beds} · ICU {h.icu_available}/{h.icu_total}<br />ED: {h.ed_status} ({h.ed_wait_minutes} min wait)</Popup>
      </Marker>)}
      {teams.map(t => <Marker key={'t' + t.id} position={[t.base_lat, t.base_lng]} icon={teamIcon(t.status === 'busy')}>
        <Tooltip direction="top" offset={[0, -12]}>{t.name} · {t.status}</Tooltip>
      </Marker>)}
      {incidents.map(i => <Marker key={i.id} position={[i.lat, i.lng]} icon={incidentIcon(i, i.id === selectedId)}
        zIndexOffset={i.id === selectedId ? 1000 : i.priority === 'Critical' ? 500 : 0}
        eventHandlers={onSelect ? { click: () => onSelect(i.id) } : undefined}>
        <Tooltip direction="top" offset={[0, -14]}><b>{i.code}</b> · {i.incident_type}<br />{i.priority} · {i.status}</Tooltip>
      </Marker>)}
    </MapContainer>
  </div>
}

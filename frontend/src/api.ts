// Thin fetch wrapper + shared types. All data comes from the FastAPI backend.
const BASE = import.meta.env.VITE_API_URL ?? ''

export type Role = 'citizen' | 'dispatcher' | 'rescue' | 'hospital'
export type Priority = 'Low' | 'Medium' | 'High' | 'Critical'
export const INCIDENT_TYPES = ['Road Accident', 'Medical Emergency', 'Fire', 'Building Collapse', 'Flooding', 'Other'] as const
export const SEVERITIES = ['Minor', 'Moderate', 'Serious', 'Life-threatening'] as const
export const PRIORITIES: Priority[] = ['Critical', 'High', 'Medium', 'Low']
export const INCIDENT_STATUSES = ['Reported', 'Assigned', 'En Route', 'On Scene', 'Resolved', 'Closed'] as const

export interface User { id: number; name: string; email: string; phone: string; role: Role; team_id: number | null; hospital_id: number | null }
export interface Incident {
  id: number; code: string; incident_type: string; description: string; reported_severity: string
  people_affected: number; location_text: string; lat: number; lng: number; contact_phone: string
  auto_priority: Priority; priority: Priority; priority_score: number; priority_reason: string; priority_overridden: boolean
  status: string; created_at: string; updated_at: string; closed_at: string | null; reporter_name: string; current_team: string | null
}
export interface Assignment { id: number; incident_id: number; team_id: number; team_name: string; status: string; response_reason: string; created_at: string; updated_at: string }
export interface Update { id: number; kind: string; message: string; created_at: string; author_name: string | null }
export interface IncidentDetail extends Incident { assignments: Assignment[]; updates: Update[] }
export interface AssignmentWithIncident extends Assignment { incident: Incident }
export interface Team { id: number; name: string; team_type: string; members: number; phone: string; base_lat: number; base_lng: number; status: string }
export interface Hospital {
  id: number; name: string; address: string; phone: string; lat: number; lng: number
  total_beds: number; available_beds: number; icu_total: number; icu_available: number
  ed_status: string; ed_wait_minutes: number; specialties: string; notes: string; resources_updated_at: string
}
export interface Stats {
  total: number; active: number; critical: number; unassigned: number; resolved: number
  teams_available: number; teams_total: number; hospitals: number; beds_available: number; icu_available: number
  by_priority: Record<Priority, number>; by_type: Record<string, number>; by_status: Record<string, number>
  trend: { date: string; count: number }[]
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = sessionStorage.getItem('resqnet_token')
  const res = await fetch(BASE + '/api' + path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && token) { sessionStorage.removeItem('resqnet_token'); window.dispatchEvent(new Event('resqnet:logout')) }
    const d = data.detail
    const msg = Array.isArray(d) ? d.map((e: { loc: string[]; msg: string }) => `${e.loc[e.loc.length - 1]}: ${e.msg}`).join('; ') : d
    throw new ApiError(res.status, msg || `Request failed (${res.status})`)
  }
  return data as T
}

// Backend stores naive UTC timestamps.
export const parseDate = (s: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + 'Z')
export const fmtTime = (s: string) => parseDate(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
export function ago(s: string) {
  const m = Math.max(0, Math.round((Date.now() - parseDate(s).getTime()) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h} h ${m % 60} min ago` : `${Math.floor(h / 24)} d ago`
}
export function elapsed(s: string) {
  const sec = Math.max(0, Math.floor((Date.now() - parseDate(s).getTime()) / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`
}
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (x: number) => (x * Math.PI) / 180
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

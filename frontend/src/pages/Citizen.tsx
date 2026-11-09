import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, ChevronRight, Crosshair, MapPin, Send } from 'lucide-react'
import { ago, api, fmtTime, INCIDENT_STATUSES, INCIDENT_TYPES, SEVERITIES, type Incident, type IncidentDetail } from '../api'
import { useAuth, usePoll } from '../auth'
import Layout from '../components/Layout'
import MapView from '../components/MapView'
import { Alert, Button, Card, Disclaimer, Empty, Field, inputCls, PriorityBadge, StatusBadge, Timeline } from '../components/ui'

const EMPTY = { incident_type: '', description: '', reported_severity: '', people_affected: 1, location_text: '', lat: '', lng: '', contact_phone: '' }

export function ReportEmergency() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [f, setF] = useState({ ...EMPTY, contact_phone: user?.phone ?? '' })
  const [preview, setPreview] = useState<{ priority: string; reason: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<IncidentDetail | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const pick: [number, number] | null = f.lat !== '' && f.lng !== '' && !isNaN(+f.lat) && !isNaN(+f.lng) ? [+f.lat, +f.lng] : null

  // live, transparent priority suggestion from the backend rules
  useEffect(() => {
    if (!f.incident_type || !f.reported_severity || +f.people_affected < 1) { setPreview(null); return }
    const t = setTimeout(() => api<{ priority: string; reason: string }>('/classification/preview', {
      body: { incident_type: f.incident_type, reported_severity: f.reported_severity, people_affected: +f.people_affected, description: f.description },
    }).then(setPreview).catch(() => setPreview(null)), 300)
    return () => clearTimeout(t)
  }, [f.incident_type, f.reported_severity, f.people_affected, f.description])

  function locate() {
    if (!navigator.geolocation) return setError('Geolocation is not available in this browser — click the map or type coordinates.')
    navigator.geolocation.getCurrentPosition(
      p => setF(x => ({ ...x, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })),
      () => setError('Could not get your location — click the map or type coordinates.'))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!pick) return setError('Please choose the location on the map or enter latitude and longitude.')
    setBusy(true)
    try {
      setCreated(await api<IncidentDetail>('/incidents', { body: { ...f, people_affected: +f.people_affected, lat: +f.lat, lng: +f.lng } }))
      setF({ ...EMPTY, contact_phone: user?.phone ?? '' })
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  if (created) return <Layout title="Report submitted">
    <Card className="mx-auto max-w-xl text-center" bodyClass="p-8">
      <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
      <h2 className="mt-4 text-xl font-bold">Your emergency has been reported</h2>
      <p className="mt-1 text-sm text-slate-500">It is now visible to dispatchers. Keep this incident ID for reference.</p>
      <div className="mx-auto mt-5 w-fit rounded-xl bg-navy-900 px-6 py-3 font-mono text-2xl font-bold tracking-wider text-white">{created.code}</div>
      <div className="mt-4 flex justify-center gap-2"><PriorityBadge p={created.priority} /><StatusBadge s={created.status} /></div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => nav(`/citizen/incidents/${created.id}`)}>Track this incident</Button>
        <Button variant="outline" onClick={() => setCreated(null)}>Report another</Button>
      </div>
    </Card>
  </Layout>

  return <Layout title="Report an emergency" subtitle="Your report goes straight to the dispatch team">
    <Alert kind="info">This is an academic prototype. It does <b>not</b> contact real emergency services — in a real emergency call your local emergency number.</Alert>
    <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.1fr]" noValidate={false}>
      <Card title="Incident details">
        <div className="space-y-4">
          <Field label="Incident type" required>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {INCIDENT_TYPES.map(t => <label key={t} className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${f.incident_type === t ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 hover:border-slate-400'}`}>
                <input type="radio" name="type" value={t} checked={f.incident_type === t} onChange={set('incident_type')} className="sr-only" required />{t}
              </label>)}
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Severity" required>
              <select className={inputCls} value={f.reported_severity} onChange={set('reported_severity')} required>
                <option value="">Select severity…</option>{SEVERITIES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="People affected" required>
              <input type="number" min={1} max={10000} className={inputCls} value={f.people_affected} onChange={set('people_affected')} required />
            </Field>
          </div>
          <Field label="Description" required hint={`${f.description.length}/2000 · at least 10 characters`}>
            <textarea className={inputCls} rows={4} minLength={10} maxLength={2000} required value={f.description} onChange={set('description')}
              placeholder="What happened? Are people injured or trapped? Any hazards?" />
          </Field>
          <Field label="Contact phone"><input className={inputCls} value={f.contact_phone} onChange={set('contact_phone')} /></Field>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested priority</span>
              {preview ? <PriorityBadge p={preview.priority} /> : <span className="text-xs text-slate-400">Choose type & severity</span>}
            </div>
            {preview && <p className="mt-1 text-xs text-slate-500">{preview.reason}</p>}
            <div className="mt-2"><Disclaimer /></div>
          </div>
        </div>
      </Card>

      <Card title="Location" icon={<MapPin className="h-4 w-4 text-red-500" />}
        action={<Button type="button" variant="outline" className="px-3 py-1.5 text-xs" onClick={locate}><Crosshair className="h-3.5 w-3.5" />Use my location</Button>}>
        <p className="mb-2 text-xs text-slate-500">Click the map to drop a pin, or enter coordinates manually.</p>
        <MapView className="h-80" pick={pick} focus={pick} onPick={(lat, lng) => setF(x => ({ ...x, lat: String(lat), lng: String(lng) }))} />
        <div className="mt-4 space-y-4">
          <Field label="Address / landmark" required>
            <input className={inputCls} value={f.location_text} onChange={set('location_text')} required minLength={3} placeholder="e.g. Near City Mall, Main Road" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Latitude" required><input className={inputCls} type="number" step="any" min={-90} max={90} value={f.lat} onChange={set('lat')} required /></Field>
            <Field label="Longitude" required><input className={inputCls} type="number" step="any" min={-180} max={180} value={f.lng} onChange={set('lng')} required /></Field>
          </div>
          <Alert>{error}</Alert>
          <Button type="submit" variant="danger" busy={busy} className="w-full py-3 text-base"><Send className="h-4 w-4" />Submit emergency report</Button>
        </div>
      </Card>
    </form>
  </Layout>
}

export function MyIncidents() {
  const { data, error } = usePoll<Incident[]>('/incidents')
  return <Layout title="My incidents" subtitle="Live status of everything you have reported" actions={<Link to="/citizen"><Button variant="danger">Report emergency</Button></Link>}>
    <Alert>{error}</Alert>
    {data && data.length === 0 && <Empty>You haven’t reported any incidents yet.</Empty>}
    <div className="grid gap-3">
      {data?.map(i => <Link key={i.id} to={`/citizen/incidents/${i.id}`}
        className="group flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-bold">{i.code}</span><PriorityBadge p={i.priority} small /><StatusBadge s={i.status} /></div>
          <div className="mt-1 truncate text-sm font-medium text-slate-800">{i.incident_type} · {i.location_text}</div>
          <div className="text-xs text-slate-400">Reported {ago(i.created_at)}{i.current_team && ` · ${i.current_team} responding`}</div>
        </div>
        <Stepper status={i.status} compact />
        <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-blue-500" />
      </Link>)}
    </div>
  </Layout>
}

export function Stepper({ status, compact }: { status: string; compact?: boolean }) {
  const idx = INCIDENT_STATUSES.indexOf(status as never)
  return <ol className={`flex items-center ${compact ? 'hidden gap-1 md:flex' : 'gap-0'}`} aria-label={`Status: ${status}`}>
    {INCIDENT_STATUSES.map((s, n) => <li key={s} className={`flex items-center ${compact ? '' : 'flex-1'}`}>
      <div className="flex flex-col items-center">
        <span className={`grid place-items-center rounded-full font-bold ${compact ? 'h-2.5 w-2.5' : 'h-8 w-8 text-xs'} ${n < idx ? 'bg-emerald-500 text-white' : n === idx ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-200 text-slate-500'}`}>{!compact && n + 1}</span>
        {!compact && <span className={`mt-1 whitespace-nowrap text-[11px] font-medium ${n <= idx ? 'text-slate-800' : 'text-slate-400'}`}>{s}</span>}
      </div>
      {n < INCIDENT_STATUSES.length - 1 && <span className={`${compact ? 'w-3' : 'mx-1 mb-5 flex-1'} h-0.5 ${n < idx ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
    </li>)}
  </ol>
}

export function IncidentTrack() {
  const { id } = useParams()
  const { data: inc, error } = usePoll<IncidentDetail>(`/incidents/${id}`)
  return <Layout title={inc ? `Incident ${inc.code}` : 'Incident'} subtitle="Updates refresh automatically"
    actions={<Link to="/citizen/incidents"><Button variant="outline">All my incidents</Button></Link>}>
    <Alert>{error}</Alert>
    {inc && <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <Card><Stepper status={inc.status} /></Card>
        <Card title="Details" action={<div className="flex gap-2"><PriorityBadge p={inc.priority} /><StatusBadge s={inc.status} /></div>}>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {[['Type', inc.incident_type], ['Reported severity', inc.reported_severity], ['People affected', inc.people_affected],
              ['Reported', fmtTime(inc.created_at)], ['Location', inc.location_text], ['Responding team', inc.current_team ?? (inc.status === 'Reported' ? 'Awaiting assignment' : '—')]]
              .map(([k, v]) => <div key={k}><dt className="text-xs font-semibold uppercase text-slate-400">{k}</dt><dd className="font-medium text-slate-800">{v}</dd></div>)}
            <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase text-slate-400">Description</dt><dd className="text-slate-700">{inc.description}</dd></div>
          </dl>
          <MapView className="mt-4 h-64" incidents={[inc]} />
        </Card>
      </div>
      <Card title="Activity timeline"><Timeline updates={inc.updates} /></Card>
    </div>}
  </Layout>
}

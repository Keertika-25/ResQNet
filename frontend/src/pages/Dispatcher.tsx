import { useState } from 'react'
import { Activity, AlertOctagon, Ambulance, BedDouble, Building2, Clock, Filter, Layers, RotateCcw, Siren, Users } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ago, api, elapsed, fmtTime, INCIDENT_STATUSES, INCIDENT_TYPES, km, PRIORITIES, type Hospital, type Incident, type IncidentDetail, type Stats, type Team } from '../api'
import { useAuth, usePoll } from '../auth'
import Layout from '../components/Layout'
import Map3D from '../components/Map3D'
import MapView from '../components/MapView'
import { Alert, Button, Card, Disclaimer, Empty, inputCls, Modal, PRIORITY_HEX, PriorityBadge, StatCard, StatusBadge, Timeline, useTick } from '../components/ui'

const OPEN = ['Reported', 'Assigned', 'En Route', 'On Scene']
const RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

export default function Dispatcher() {
  const { logout } = useAuth()
  const incidents = usePoll<Incident[]>('/incidents')
  const stats = usePoll<Stats>('/stats')
  const teams = usePoll<Team[]>('/teams')
  const hospitals = usePoll<Hospital[]>('/hospitals', 10000)
  const [flt, setFlt] = useState({ priority: '', type: '', status: '', activeOnly: false })
  const [selected, setSelected] = useState<number | null>(null)
  const [focus, setFocus] = useState<[number, number] | null>(null)
  useTick()

  const all = incidents.data ?? []
  const filtered = all.filter(i =>
    (!flt.priority || i.priority === flt.priority) && (!flt.type || i.incident_type === flt.type) &&
    (!flt.status || i.status === flt.status) && (!flt.activeOnly || OPEN.includes(i.status)))
  const queue = all.filter(i => OPEN.includes(i.status)).sort((a, b) => RANK[a.priority] - RANK[b.priority] || +new Date(b.created_at) - +new Date(a.created_at))
  const s = stats.data
  const refresh = () => { incidents.reload(); stats.reload(); teams.reload(); hospitals.reload() }
  const open = (i: Incident) => { setSelected(i.id); setFocus([i.lat, i.lng]) }

  async function reset() {
    if (!confirm('Reset ALL data to the demo dataset? Every change made so far will be lost.')) return
    await api('/demo/reset', { body: {} })
    logout()
  }

  return <Layout title="Emergency Command Center" subtitle={<span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Live · auto-refresh every 5 s</span>}
    actions={<Button variant="ghost" onClick={reset} title="Reset demo data"><RotateCcw className="h-4 w-4" /><span className="hidden sm:inline">Reset demo</span></Button>}>
    <Alert>{incidents.error || stats.error}</Alert>

    {/* KPI strip */}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
      <StatCard tone="slate" icon={<Layers />} label="Total incidents" value={s?.total ?? '–'} sub={`${s?.resolved ?? 0} resolved/closed`} />
      <StatCard tone="blue" icon={<Activity />} label="Active incidents" value={s?.active ?? '–'} sub={`${s?.unassigned ?? 0} awaiting assignment`} />
      <StatCard tone="red" icon={<AlertOctagon />} label="Critical (active)" value={s?.critical ?? '–'} sub={`${s?.by_priority.High ?? 0} high priority`} />
      <StatCard tone="green" icon={<Ambulance />} label="Teams available" value={s ? `${s.teams_available}/${s.teams_total}` : '–'} sub="Rescue units ready" />
      <StatCard tone="blue" icon={<Building2 />} label="Hospitals" value={s?.hospitals ?? '–'} sub="Reporting capacity" />
      <StatCard tone="orange" icon={<BedDouble />} label="Beds available" value={s?.beds_available ?? '–'} sub={`${s?.icu_available ?? 0} ICU beds`} />
    </div>

    {/* Command view: queue | map | resources */}
    <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)_320px]">
      <Card title={<>Live alert queue <span className="rounded-full bg-red-100 px-2 text-xs text-red-700">{queue.length}</span></>} icon={<Siren className="h-4 w-4 text-red-600" />}
        bodyClass="max-h-[460px] space-y-2 overflow-y-auto p-3 xl:max-h-[620px]" className="order-2 xl:order-1">
        {queue.length === 0 && <Empty>No active incidents.</Empty>}
        {queue.map(i => <button key={i.id} onClick={() => open(i)}
          className={`w-full rounded-xl border-l-4 p-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-blue-400 ${selected === i.id ? 'bg-blue-50' : i.priority === 'Critical' ? 'bg-red-50/70' : 'bg-white'}`}
          style={{ borderLeftColor: PRIORITY_HEX[i.priority] }}>
          <div className="flex items-center justify-between gap-2">
            <PriorityBadge p={i.priority} small />
            <span className="flex items-center gap-1 font-mono text-xs font-semibold text-slate-600"><Clock className="h-3 w-3" />{elapsed(i.created_at)}</span>
          </div>
          <div className="mt-1.5 text-sm font-semibold text-slate-900">{i.incident_type}</div>
          <div className="truncate text-xs text-slate-500">{i.location_text}</div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <StatusBadge s={i.status} />
            <span className="truncate text-[11px] text-slate-500">{i.current_team ?? 'Unassigned'}</span>
          </div>
        </button>)}
      </Card>

      <Card className="order-1 xl:order-2" bodyClass="p-2" title="Operations map" icon={<Activity className="h-4 w-4 text-blue-600" />}
        action={<div className="hidden gap-3 text-[11px] text-slate-500 sm:flex">
          {PRIORITIES.map(p => <span key={p} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIORITY_HEX[p] }} />{p}</span>)}
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" />Hospital</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />Team</span>
        </div>}>
        <Map3D className="h-[460px] xl:h-[620px]" incidents={filtered} hospitals={hospitals.data ?? []} teams={teams.data ?? []}
          selectedId={selected} onSelect={id => setSelected(id)} focus={focus} />
      </Card>

      <div className="order-3 space-y-4 xl:col-span-2 xl:grid xl:grid-cols-2 xl:gap-4 xl:space-y-0 2xl:col-span-1 2xl:block 2xl:space-y-4">
        <Card title="Rescue teams" icon={<Users className="h-4 w-4 text-emerald-600" />} bodyClass="divide-y divide-slate-100">
          {teams.data?.map(t => {
            const job = all.find(i => i.current_team === t.name)
            return <div key={t.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{t.name}</span><StatusBadge s={t.status} /></div>
              <div className="text-xs text-slate-500">{t.team_type} · {t.members} members</div>
              {job && <button onClick={() => open(job)} className="mt-1 text-xs font-medium text-blue-600 hover:underline">{job.code} · {job.status}</button>}
            </div>
          })}
        </Card>
        <Card title="Hospital capacity" icon={<Building2 className="h-4 w-4 text-blue-600" />} bodyClass="divide-y divide-slate-100">
          {hospitals.data?.map(h => <div key={h.id} className="space-y-2 px-4 py-3">
            <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{h.name}</span><StatusBadge s={h.ed_status} /></div>
            <Meter label="Beds" have={h.available_beds} total={h.total_beds} />
            <Meter label="ICU" have={h.icu_available} total={h.icu_total} />
            <div className="text-[11px] text-slate-400">ED wait ~{h.ed_wait_minutes} min · updated {ago(h.resources_updated_at)}</div>
          </div>)}
        </Card>
      </div>
    </div>

    {/* Table + analytics */}
    <div className="mt-4 grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card title="All incidents" icon={<Filter className="h-4 w-4 text-slate-500" />} bodyClass="p-0"
        action={<span className="text-xs text-slate-500">{filtered.length} of {all.length}</span>}>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-3">
          {([['priority', 'Priority', PRIORITIES], ['type', 'Type', INCIDENT_TYPES], ['status', 'Status', INCIDENT_STATUSES]] as const).map(([k, label, opts]) =>
            <label key={k} className="text-xs font-medium text-slate-500">{label}
              <select className={`${inputCls} mt-1 w-40 py-1.5`} value={flt[k]} onChange={e => setFlt({ ...flt, [k]: e.target.value })}>
                <option value="">All</option>{opts.map(o => <option key={o}>{o}</option>)}
              </select>
            </label>)}
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded accent-blue-600" checked={flt.activeOnly} onChange={e => setFlt({ ...flt, activeOnly: e.target.checked })} />Active only
          </label>
          {(flt.priority || flt.type || flt.status || flt.activeOnly) && <Button variant="ghost" className="py-1.5" onClick={() => setFlt({ priority: '', type: '', status: '', activeOnly: false })}>Clear</Button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>{['Incident ID', 'Type', 'Location', 'Priority', 'Status', 'Team', 'Reported', ''].map(h => <th key={h} className="px-4 py-2.5">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(i => <tr key={i.id} className={`cursor-pointer hover:bg-blue-50/50 ${selected === i.id ? 'bg-blue-50' : ''}`} onClick={() => open(i)}>
                <td className="px-4 py-3 font-mono text-xs font-semibold">{i.code}</td>
                <td className="px-4 py-3 font-medium">{i.incident_type}</td>
                <td className="max-w-[220px] truncate px-4 py-3 text-slate-600">{i.location_text}</td>
                <td className="px-4 py-3"><PriorityBadge p={i.priority} small />{i.priority_overridden && <span className="ml-1 text-[10px] text-slate-400" title="Overridden by dispatcher">✎</span>}</td>
                <td className="px-4 py-3"><StatusBadge s={i.status} /></td>
                <td className="px-4 py-3 text-slate-600">{i.current_team ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{ago(i.created_at)}</td>
                <td className="px-4 py-3"><Button variant="outline" className="px-3 py-1 text-xs" onClick={e => { e.stopPropagation(); open(i) }}>Review</Button></td>
              </tr>)}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="p-6"><Empty>No incidents match these filters.</Empty></div>}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-1">
        <Card title="Active incidents by priority">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={PRIORITIES.map(p => ({ p, n: s?.by_priority[p] ?? 0 }))} margin={{ left: -20 }}>
              <XAxis dataKey="p" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="n" name="Incidents" radius={[6, 6, 0, 0]}>{PRIORITIES.map(p => <Cell key={p} fill={PRIORITY_HEX[p]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Reports – last 7 days">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={s?.trend.map(t => ({ ...t, d: new Date(t.date + 'T00:00').toLocaleDateString([], { weekday: 'short' }) })) ?? []} margin={{ left: -20 }}>
              <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2563eb" stopOpacity={0.4} /><stop offset="1" stopColor="#2563eb" stopOpacity={0} /></linearGradient></defs>
              <XAxis dataKey="d" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip /><Area type="monotone" dataKey="count" name="Reports" stroke="#2563eb" strokeWidth={2} fill="url(#g)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>

    {selected && <IncidentPanel id={selected} teams={teams.data ?? []} hospitals={hospitals.data ?? []} onClose={() => setSelected(null)} onChanged={refresh} />}
  </Layout>
}

function Meter({ label, have, total }: { label: string; have: number; total: number }) {
  const pct = total ? (have / total) * 100 : 0
  const color = pct < 10 ? 'bg-red-500' : pct < 25 ? 'bg-orange-500' : 'bg-emerald-500'
  return <div>
    <div className="flex justify-between text-xs"><span className="text-slate-500">{label}</span><span className="font-semibold">{have}<span className="font-normal text-slate-400">/{total}</span></span></div>
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>
  </div>
}

function IncidentPanel({ id, teams, hospitals, onClose, onChanged }: { id: number; teams: Team[]; hospitals: Hospital[]; onClose: () => void; onChanged: () => void }) {
  const { data: inc, reload, error: loadErr } = usePoll<IncidentDetail>(`/incidents/${id}`)
  const [prio, setPrio] = useState({ priority: '', reason: '' })
  const [teamId, setTeamId] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState({ error: '', ok: '' })
  const [busy, setBusy] = useState('')

  async function act(key: string, path: string, body: unknown, ok: string, method?: string) {
    setBusy(key); setMsg({ error: '', ok: '' })
    try { await api(path, { body, method }); setMsg({ error: '', ok }); reload(); onChanged() }
    catch (e) { setMsg({ error: (e as Error).message, ok: '' }) } finally { setBusy('') }
  }
  if (!inc) return <Modal title="Loading…" onClose={onClose}><Alert>{loadErr}</Alert></Modal>

  const isOpen = OPEN.includes(inc.status)
  const active = inc.assignments.find(a => ['Assigned', 'Accepted', 'En Route', 'On Scene'].includes(a.status))
  const available = teams.filter(t => t.status === 'available')
  const near = [...hospitals].map(h => ({ h, d: km(inc, h) })).sort((a, b) => a.d - b.d)

  return <Modal wide onClose={onClose} title={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{inc.code}</span><PriorityBadge p={inc.priority} /><StatusBadge s={inc.status} /></span>}>
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-5">
        <div>
          <h4 className="text-lg font-bold">{inc.incident_type} <span className="text-sm font-normal text-slate-500">· {inc.reported_severity} · {inc.people_affected} affected</span></h4>
          <p className="mt-1 text-sm text-slate-700">{inc.description}</p>
          <p className="mt-2 text-xs text-slate-500">📍 {inc.location_text} ({inc.lat.toFixed(4)}, {inc.lng.toFixed(4)})<br />
            Reported by {inc.reporter_name}{inc.contact_phone && ` · ${inc.contact_phone}`} · {fmtTime(inc.created_at)}</p>
        </div>
        <MapView className="h-52" incidents={[inc]} hospitals={hospitals} teams={teams} />

        <div className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between"><h5 className="text-sm font-semibold">Priority</h5>
            <span className="text-xs text-slate-500">Suggested: <PriorityBadge p={inc.auto_priority} small /></span></div>
          <p className="mt-1 text-xs text-slate-500">{inc.priority_reason}</p>
          {inc.priority_overridden && <p className="mt-1 text-xs font-medium text-orange-600">Overridden by dispatcher → {inc.priority}</p>}
          {inc.status !== 'Closed' && <div className="mt-3 grid gap-2 sm:grid-cols-[130px_1fr_auto]">
            <select aria-label="New priority" className={inputCls} value={prio.priority} onChange={e => setPrio({ ...prio, priority: e.target.value })}>
              <option value="">Override…</option>{PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </select>
            <input aria-label="Reason for override" className={inputCls} placeholder="Reason (required)" value={prio.reason} onChange={e => setPrio({ ...prio, reason: e.target.value })} />
            <Button variant="outline" busy={busy === 'prio'} disabled={!prio.priority || prio.reason.trim().length < 3}
              onClick={() => act('prio', `/incidents/${id}/priority`, prio, 'Priority updated.', 'PATCH').then(() => setPrio({ priority: '', reason: '' }))}>Apply</Button>
          </div>}
          <div className="mt-2"><Disclaimer /></div>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <h5 className="text-sm font-semibold">Rescue team</h5>
          {active ? <div className="mt-2 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-sm">
            <span className="font-medium text-blue-900">{active.team_name}</span><StatusBadge s={active.status} /></div>
            : isOpen ? <div className="mt-2 flex gap-2">
              <select aria-label="Team to assign" className={inputCls} value={teamId} onChange={e => setTeamId(e.target.value)}>
                <option value="">{available.length ? 'Select an available team…' : 'No teams available'}</option>
                {available.map(t => <option key={t.id} value={t.id}>{t.name} ({t.team_type}) · {km(inc, { lat: t.base_lat, lng: t.base_lng }).toFixed(1)} km</option>)}
              </select>
              <Button busy={busy === 'assign'} disabled={!teamId} onClick={() => act('assign', `/incidents/${id}/assign`, { team_id: +teamId }, 'Team assigned.').then(() => setTeamId(''))}>Assign</Button>
            </div> : <p className="mt-1 text-sm text-slate-500">No active assignment.</p>}
          {inc.assignments.filter(a => a !== active).map(a => <div key={a.id} className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{a.team_name}{a.response_reason && ` — “${a.response_reason}”`}</span><StatusBadge s={a.status} /></div>)}
        </div>

        {inc.status !== 'Closed' && <div className="rounded-xl border border-slate-200 p-4">
          <h5 className="text-sm font-semibold">Close incident</h5>
          <p className="text-xs text-slate-500">{inc.status === 'Resolved' ? 'The team has completed this operation.' : active ? 'Available once the assigned team completes its work.' : 'Not resolved by a team — a note is required (e.g. false alarm, duplicate).'}</p>
          <div className="mt-2 flex gap-2">
            <input aria-label="Closing note" className={inputCls} placeholder="Closing note" value={note} onChange={e => setNote(e.target.value)} disabled={!!active} />
            <Button variant="success" busy={busy === 'close'} disabled={!!active || (inc.status !== 'Resolved' && note.trim().length < 3)}
              onClick={() => act('close', `/incidents/${id}/close`, { note }, 'Incident closed.')}>Close</Button>
          </div>
        </div>}
        <Alert>{msg.error}</Alert><Alert kind="success">{msg.ok}</Alert>
      </div>

      <div className="space-y-5">
        <div>
          <h5 className="mb-2 text-sm font-semibold">Nearest hospitals</h5>
          <div className="space-y-2">{near.map(({ h, d }) => <div key={h.id} className="rounded-xl border border-slate-200 p-3 text-sm">
            <div className="flex items-center justify-between"><span className="font-semibold">{h.name}</span><span className="text-xs font-medium text-slate-500">{d.toFixed(1)} km</span></div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-600">
              <span>Beds <b>{h.available_beds}</b>/{h.total_beds}</span><span>ICU <b className={h.icu_available === 0 ? 'text-red-600' : ''}>{h.icu_available}</b>/{h.icu_total}</span>
              <span>ED <b>{h.ed_status}</b> (~{h.ed_wait_minutes}m)</span>
            </div>
            <div className="text-[11px] text-slate-400">Updated {ago(h.resources_updated_at)}</div>
          </div>)}</div>
        </div>
        <div><h5 className="mb-3 text-sm font-semibold">Timeline</h5><Timeline updates={inc.updates} /></div>
      </div>
    </div>
  </Modal>
}

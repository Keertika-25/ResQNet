import { useState } from 'react'
import { Check, Clock, MapPin, Navigation, Phone, Users, X } from 'lucide-react'
import { ago, api, elapsed, fmtTime, type AssignmentWithIncident, type Team } from '../api'
import { usePoll } from '../auth'
import Layout from '../components/Layout'
import MapView from '../components/MapView'
import { Alert, Button, Card, Empty, Field, inputCls, Modal, PriorityBadge, StatusBadge, useTick } from '../components/ui'

const ACTIVE = ['Assigned', 'Accepted', 'En Route', 'On Scene']
const NEXT: Record<string, { to: string; label: string }> = {
  Accepted: { to: 'En Route', label: 'Mark En Route' },
  'En Route': { to: 'On Scene', label: 'Mark On Scene' },
  'On Scene': { to: 'Completed', label: 'Mark Completed' },
}
const STEPS = ['Assigned', 'Accepted', 'En Route', 'On Scene', 'Completed']

export default function Rescue() {
  const { data, error, reload } = usePoll<AssignmentWithIncident[]>('/assignments/mine')
  const teams = usePoll<Team[]>('/teams', 15000)
  const [rejecting, setRejecting] = useState<AssignmentWithIncident | null>(null)
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState({ error: '', ok: '' })
  const [busy, setBusy] = useState('')
  useTick()

  const team = teams.data?.[0]
  const active = data?.filter(a => ACTIVE.includes(a.status)) ?? []
  const past = data?.filter(a => !ACTIVE.includes(a.status)) ?? []

  async function act(key: string, path: string, body: unknown, ok: string) {
    setBusy(key); setMsg({ error: '', ok: '' })
    try { await api(path, { body }); setMsg({ error: '', ok }); reload(); teams.reload(); return true }
    catch (e) { setMsg({ error: (e as Error).message, ok: '' }); return false } finally { setBusy('') }
  }

  return <Layout title={team?.name ?? 'Rescue team'} subtitle={team && `${team.team_type} · ${team.members} members · ${team.phone}`}
    actions={team && <StatusBadge s={team.status} />}>
    <Alert>{error}</Alert>
    <div className="space-y-2"><Alert>{msg.error}</Alert><Alert kind="success">{msg.ok}</Alert></div>

    <h2 className="mb-3 mt-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Active assignments ({active.length})</h2>
    {data && active.length === 0 && <Empty>No active assignments. New dispatches appear here automatically.</Empty>}
    <div className="grid gap-4">
      {active.map(a => {
        const i = a.incident, next = NEXT[a.status], step = STEPS.indexOf(a.status)
        return <Card key={a.id} className={i.priority === 'Critical' ? 'ring-2 ring-red-500/40' : ''} bodyClass="p-0">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px]">
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold">{i.code}</span><PriorityBadge p={i.priority} /><StatusBadge s={a.status} />
                <span className="ml-auto flex items-center gap-1 font-mono text-sm font-semibold text-slate-600"><Clock className="h-4 w-4" />{elapsed(i.created_at)}</span>
              </div>
              <h3 className="mt-2 text-lg font-bold">{i.incident_type}</h3>
              <p className="mt-1 text-sm text-slate-700">{i.description}</p>
              <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-red-500" />{i.location_text}</span>
                <span className="flex items-center gap-2"><Users className="h-4 w-4" />{i.people_affected} affected · {i.reported_severity}</span>
                {i.contact_phone && <span className="flex items-center gap-2"><Phone className="h-4 w-4" />{i.contact_phone} ({i.reporter_name})</span>}
                <span className="flex items-center gap-2"><Navigation className="h-4 w-4" />{i.lat.toFixed(5)}, {i.lng.toFixed(5)}</span>
              </div>
              <ol className="mt-4 flex flex-wrap gap-1.5">{STEPS.map((s, n) =>
                <li key={s} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${n < step ? 'bg-emerald-100 text-emerald-700' : n === step ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{s}</li>)}
              </ol>
              <div className="mt-4 flex flex-wrap gap-2">
                {a.status === 'Assigned' && <>
                  <Button variant="success" busy={busy === `acc${a.id}`} onClick={() => act(`acc${a.id}`, `/assignments/${a.id}/respond`, { accept: true }, 'Assignment accepted.')}><Check className="h-4 w-4" />Accept</Button>
                  <Button variant="outline" onClick={() => { setRejecting(a); setReason('') }}><X className="h-4 w-4" />Reject</Button>
                </>}
                {next && <Button variant={next.to === 'Completed' ? 'success' : 'primary'} busy={busy === `st${a.id}`}
                  onClick={() => act(`st${a.id}`, `/assignments/${a.id}/status`, { status: next.to }, `Status updated: ${next.to}.`)}>{next.label}</Button>}
              </div>
              <p className="mt-3 text-xs text-slate-400">Assigned {ago(a.created_at)}</p>
            </div>
            <MapView className="h-64 rounded-none lg:h-full lg:min-h-[280px] lg:rounded-r-2xl" incidents={[i]} teams={team ? [team] : []} />
          </div>
        </Card>
      })}
    </div>

    <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Previous assignments</h2>
    <Card bodyClass="overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>{['Incident', 'Type', 'Location', 'Priority', 'Outcome', 'Updated'].map(h => <th key={h} className="px-4 py-2.5">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {past.map(a => <tr key={a.id}>
            <td className="px-4 py-3 font-mono text-xs font-semibold">{a.incident.code}</td>
            <td className="px-4 py-3">{a.incident.incident_type}</td>
            <td className="max-w-[220px] truncate px-4 py-3 text-slate-600">{a.incident.location_text}</td>
            <td className="px-4 py-3"><PriorityBadge p={a.incident.priority} small /></td>
            <td className="px-4 py-3"><StatusBadge s={a.status} />{a.response_reason && <div className="mt-1 text-xs text-slate-500">“{a.response_reason}”</div>}</td>
            <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmtTime(a.updated_at)}</td>
          </tr>)}
        </tbody>
      </table>
      {data && past.length === 0 && <div className="p-6"><Empty>No previous assignments.</Empty></div>}
    </Card>

    {rejecting && <Modal title={`Reject ${rejecting.incident.code}?`} onClose={() => setRejecting(null)}>
      <p className="text-sm text-slate-600">The incident returns to the dispatcher queue for reassignment.</p>
      <div className="mt-4"><Field label="Reason" required>
        <textarea autoFocus rows={3} className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Vehicle under maintenance, out of range…" />
      </Field></div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
        <Button variant="danger" disabled={reason.trim().length < 3} busy={busy === 'rej'}
          onClick={async () => { if (await act('rej', `/assignments/${rejecting.id}/respond`, { accept: false, reason }, 'Assignment rejected.')) setRejecting(null) }}>Reject assignment</Button>
      </div>
    </Modal>}
  </Layout>
}

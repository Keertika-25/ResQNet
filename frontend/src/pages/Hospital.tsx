import { useEffect, useState, type FormEvent } from 'react'
import { BedDouble, Clock, Eye, HeartPulse, Minus, Plus, RefreshCw, Siren } from 'lucide-react'
import { ago, api, fmtTime, type Hospital as H } from '../api'
import { usePoll } from '../auth'
import Layout from '../components/Layout'
import MapView from '../components/MapView'
import { Alert, Button, Card, Field, inputCls, StatCard } from '../components/ui'

const ED = ['Open', 'Limited', 'Diverting', 'Closed'] as const
const ED_STYLE: Record<string, string> = { Open: 'border-emerald-500 bg-emerald-50 text-emerald-700', Limited: 'border-amber-500 bg-amber-50 text-amber-700', Diverting: 'border-orange-500 bg-orange-50 text-orange-700', Closed: 'border-red-500 bg-red-50 text-red-700' }
type Form = Omit<H, 'id' | 'resources_updated_at'>

export default function Hospital() {
  const { data, error, reload } = usePoll<H>('/hospitals/mine', 30000)
  const [f, setF] = useState<Form | null>(null)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState({ error: '', ok: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => { // load server copy unless the admin is mid-edit
    if (data && !dirty) setF(data) // extra read-only fields are ignored by the API
  }, [data, dirty])

  if (!f || !data) return <Layout title="Hospital resources"><Alert>{error}</Alert></Layout>
  const upd = (patch: Partial<Form>) => { setF({ ...f, ...patch }); setDirty(true); setMsg({ error: '', ok: '' }) }
  const num = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => upd({ [k]: e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0) } as Partial<Form>)
  const txt = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => upd({ [k]: e.target.value } as Partial<Form>)

  async function save(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true); setMsg({ error: '', ok: '' })
    try { await api('/hospitals/mine', { method: 'PUT', body: f }); setDirty(false); await reload(); setMsg({ error: '', ok: 'Saved. Dispatchers now see the updated availability.' }) }
    catch (err) { setMsg({ error: (err as Error).message, ok: '' }) } finally { setBusy(false) }
  }

  const Stepper = ({ label, k, max, icon }: { label: string; k: 'available_beds' | 'icu_available'; max: number; icon: React.ReactNode }) =>
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">{icon}{label}</div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => upd({ [k]: Math.max(0, f[k] - 1) })} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-300 hover:bg-slate-50"><Minus className="h-4 w-4" /></button>
        <input aria-label={label} type="number" min={0} max={max} value={f[k]} onChange={num(k)} className={`${inputCls} w-24 text-center text-2xl font-bold`} />
        <button type="button" aria-label={`Increase ${label}`} onClick={() => upd({ [k]: Math.min(max, f[k] + 1) })} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-300 hover:bg-slate-50"><Plus className="h-4 w-4" /></button>
        <span className="text-sm text-slate-500">of {max}</span>
      </div>
      {f[k] > max && <p className="mt-1 text-xs text-red-600">Cannot exceed total ({max}).</p>}
    </div>

  return <Layout title={data.name} subtitle={data.address}
    actions={<span className="hidden items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 sm:inline-flex"><Eye className="h-3.5 w-3.5" />Visible to dispatchers</span>}>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard tone="green" icon={<BedDouble />} label="Available beds" value={`${data.available_beds}/${data.total_beds}`} />
      <StatCard tone={data.icu_available === 0 ? 'red' : 'blue'} icon={<HeartPulse />} label="ICU available" value={`${data.icu_available}/${data.icu_total}`} />
      <StatCard tone={data.ed_status === 'Open' ? 'green' : 'orange'} icon={<Siren />} label="Emergency dept." value={data.ed_status} sub={`~${data.ed_wait_minutes} min wait`} />
      <StatCard tone="slate" icon={<Clock />} label="Last updated" value={<span className="text-base">{ago(data.resources_updated_at)}</span>} sub={fmtTime(data.resources_updated_at)} />
    </div>

    <form onSubmit={save} className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr]">
      <div className="space-y-4">
        <Card title="Live resource availability" action={dirty && <span className="text-xs font-medium text-orange-600">Unsaved changes</span>}>
          <div className="grid gap-4 md:grid-cols-2">
            <Stepper label="Available beds" k="available_beds" max={f.total_beds} icon={<BedDouble className="h-4 w-4 text-emerald-600" />} />
            <Stepper label="ICU beds available" k="icu_available" max={f.icu_total} icon={<HeartPulse className="h-4 w-4 text-red-600" />} />
          </div>
          <div className="mt-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Emergency department</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Emergency department status">
              {ED.map(s => <button type="button" role="radio" aria-checked={f.ed_status === s} key={s} onClick={() => upd({ ed_status: s })}
                className={`rounded-lg border-2 px-3 py-2 text-sm font-semibold ${f.ed_status === s ? ED_STYLE[s] : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>{s}</button>)}
            </div>
            <div className="mt-3 max-w-xs"><Field label="ED wait time (minutes)"><input type="number" min={0} max={1440} className={inputCls} value={f.ed_wait_minutes} onChange={num('ed_wait_minutes')} /></Field></div>
          </div>
          <div className="mt-5 space-y-2"><Alert>{msg.error}</Alert><Alert kind="success">{msg.ok}</Alert></div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" busy={busy} disabled={!dirty}>Save changes</Button>
            {!dirty && <Button type="button" variant="outline" busy={busy} onClick={() => save()} title="Re-publish the same figures with a fresh timestamp"><RefreshCw className="h-4 w-4" />Confirm figures are current</Button>}
            {dirty && <Button type="button" variant="ghost" onClick={() => setDirty(false)}>Discard</Button>}
          </div>
        </Card>
      </div>

      <Card title="Hospital information">
        <div className="space-y-4">
          <Field label="Name" required><input required className={inputCls} value={f.name} onChange={txt('name')} /></Field>
          <Field label="Address" required><input required className={inputCls} value={f.address} onChange={txt('address')} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone" required><input required className={inputCls} value={f.phone} onChange={txt('phone')} /></Field>
            <Field label="Specialties"><input className={inputCls} value={f.specialties} onChange={txt('specialties')} /></Field>
            <Field label="Total beds"><input type="number" min={0} className={inputCls} value={f.total_beds} onChange={num('total_beds')} /></Field>
            <Field label="Total ICU beds"><input type="number" min={0} className={inputCls} value={f.icu_total} onChange={num('icu_total')} /></Field>
          </div>
          <Field label="Notes for dispatchers"><textarea rows={2} className={inputCls} value={f.notes} onChange={txt('notes')} /></Field>
          <Field label="Location" hint="Click the map to move the hospital pin.">
            <MapView className="h-48" pick={[f.lat, f.lng]} focus={[f.lat, f.lng]} onPick={(lat, lng) => upd({ lat, lng })} />
          </Field>
        </div>
      </Card>
    </form>
  </Layout>
}

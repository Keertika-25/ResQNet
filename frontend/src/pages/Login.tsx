import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Ambulance, Building2, Radio, User as UserIcon } from 'lucide-react'
import { api, type User } from '../api'
import { useAuth } from '../auth'
import { Logo } from '../components/Layout'
import { Alert, Button, Field, inputCls } from '../components/ui'

export const HOME: Record<string, string> = { citizen: '/citizen', dispatcher: '/dispatcher', rescue: '/rescue', hospital: '/hospital' }

// Fictional demo accounts created by the backend seed script.
const DEMO = [
  { email: 'citizen@resqnet.demo', label: 'Citizen', icon: UserIcon },
  { email: 'dispatcher@resqnet.demo', label: 'Dispatcher', icon: Radio },
  { email: 'rescue2@resqnet.demo', label: 'Rescue Team', icon: Ambulance },
  { email: 'hospital1@resqnet.demo', label: 'Hospital Admin', icon: Building2 },
]

export default function Login() {
  const { user, setSession } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={HOME[user.role]} replace />

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const body = mode === 'login' ? { email: form.email, password: form.password } : form
      const r = await api<{ access_token: string; user: User }>(`/auth/${mode}`, { body })
      setSession(r.access_token, r.user)
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  return <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
    <div className="relative hidden overflow-hidden bg-navy-950 p-12 text-white lg:flex lg:flex-col">
      <div className="pointer-events-none absolute inset-0 opacity-40"
        style={{ backgroundImage: 'radial-gradient(circle at 30% 40%, rgba(220,38,38,.45), transparent 35%), radial-gradient(circle at 75% 70%, rgba(37,99,235,.45), transparent 40%), linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: 'auto, auto, 40px 40px, 40px 40px' }} />
      <div className="relative"><Logo light /></div>
      <div className="relative my-auto max-w-lg">
        <span className="inline-flex items-center gap-2 rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-300 ring-1 ring-red-500/30">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> One system · four perspectives
        </span>
        <h1 className="mt-5 text-4xl font-extrabold leading-tight">Intelligent emergency response &amp; rescue coordination</h1>
        <p className="mt-4 text-slate-300">Citizens report, dispatchers prioritise and assign, rescue teams respond, hospitals share capacity — all on one live, shared incident record.</p>
        <div className="mt-8 grid grid-cols-2 gap-3 text-sm">
          {[['Report', 'Citizens submit geo-located emergencies'], ['Prioritise', 'Transparent rule-based triage aid'], ['Dispatch', 'Assign available rescue teams'], ['Coordinate', 'Live hospital bed & ICU capacity']].map(([t, d]) =>
            <div key={t} className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10"><div className="font-semibold">{t}</div><div className="text-xs text-slate-400">{d}</div></div>)}
        </div>
      </div>
      <p className="relative text-xs text-slate-500">Academic prototype — does not connect to real emergency services.</p>
    </div>

    <div className="flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 lg:hidden"><Logo /></div>
        <h2 className="text-2xl font-bold text-slate-900">{mode === 'login' ? 'Sign in' : 'Create citizen account'}</h2>
        <p className="mt-1 text-sm text-slate-500">{mode === 'login' ? 'Access is routed to your role’s dashboard.' : 'Register to report and track emergencies.'}</p>
        <div className="mt-5 grid grid-cols-2 rounded-lg bg-slate-200/70 p-1 text-sm font-semibold" role="tablist">
          {(['login', 'register'] as const).map(m => <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => { setMode(m); setError('') }}
            className={`rounded-md py-1.5 ${mode === m ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}>{m === 'login' ? 'Sign in' : 'Register'}</button>)}
        </div>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {mode === 'register' && <>
            <Field label="Full name" required><input className={inputCls} value={form.name} onChange={set('name')} required minLength={2} autoComplete="name" /></Field>
            <Field label="Phone"><input className={inputCls} value={form.phone} onChange={set('phone')} autoComplete="tel" /></Field>
          </>}
          <Field label="Email" required><input type="email" className={inputCls} value={form.email} onChange={set('email')} required autoComplete="email" /></Field>
          <Field label="Password" required hint={mode === 'register' ? 'At least 8 characters with letters and numbers.' : undefined}>
            <input type="password" className={inputCls} value={form.password} onChange={set('password')} required minLength={mode === 'register' ? 8 : 1}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </Field>
          <Alert>{error}</Alert>
          <Button type="submit" busy={busy} className="w-full py-2.5">{mode === 'login' ? 'Sign in' : 'Create account'}</Button>
        </form>

        {mode === 'login' && <div className="mt-8">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Demo accounts (fictional)</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {DEMO.map(d => <button key={d.email} type="button" onClick={() => setForm({ ...form, email: d.email, password: 'Demo@1234' })}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-blue-400 hover:bg-blue-50">
              <d.icon className="h-4 w-4 text-blue-600" /><span className="font-medium">{d.label}</span>
            </button>)}
          </div>
          <p className="mt-2 text-xs text-slate-400">Fills the form — all demo accounts use the password shown in the README.</p>
        </div>}
      </div>
    </div>
  </div>
}

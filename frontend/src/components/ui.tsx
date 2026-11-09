import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'
import { fmtTime, type Update } from '../api'

export const PRIORITY_STYLE: Record<string, string> = {
  Critical: 'bg-red-600 text-white ring-red-600',
  High: 'bg-orange-500 text-white ring-orange-500',
  Medium: 'bg-amber-100 text-amber-800 ring-amber-300',
  Low: 'bg-slate-100 text-slate-700 ring-slate-300',
}
export const PRIORITY_HEX: Record<string, string> = { Critical: '#dc2626', High: '#f97316', Medium: '#f59e0b', Low: '#64748b' }

const STATUS_STYLE: Record<string, string> = {
  Reported: 'bg-rose-50 text-rose-700 ring-rose-200',
  Assigned: 'bg-blue-50 text-blue-700 ring-blue-200',
  Accepted: 'bg-blue-50 text-blue-700 ring-blue-200',
  'En Route': 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  'On Scene': 'bg-violet-50 text-violet-700 ring-violet-200',
  Resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Closed: 'bg-slate-100 text-slate-600 ring-slate-200',
  Rejected: 'bg-slate-100 text-slate-500 ring-slate-200 line-through',
  available: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  busy: 'bg-orange-50 text-orange-700 ring-orange-200',
  off_duty: 'bg-slate-100 text-slate-500 ring-slate-200',
  Open: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Limited: 'bg-amber-50 text-amber-700 ring-amber-200',
  Diverting: 'bg-orange-50 text-orange-700 ring-orange-200',
}

export function PriorityBadge({ p, small }: { p: string; small?: boolean }) {
  return <span className={`inline-flex items-center rounded-full font-semibold ring-1 ${small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'} ${PRIORITY_STYLE[p]}`}>
    {p === 'Critical' && <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}{p}
  </span>
}

export function StatusBadge({ s }: { s: string }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLE[s] ?? 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
    {s === 'off_duty' ? 'Off duty' : s[0].toUpperCase() + s.slice(1)}
  </span>
}

export function Card({ title, icon, action, children, className = '', bodyClass = 'p-5' }:
  { title?: ReactNode; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
    {title && <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">{icon}{title}</h2>{action}
    </header>}
    <div className={bodyClass}>{children}</div>
  </section>
}

export function StatCard({ label, value, sub, icon, tone }: { label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; tone: 'red' | 'blue' | 'green' | 'orange' | 'slate' }) {
  const tones = { red: 'bg-red-50 text-red-600', blue: 'bg-blue-50 text-blue-600', green: 'bg-emerald-50 text-emerald-600', orange: 'bg-orange-50 text-orange-600', slate: 'bg-slate-100 text-slate-600' }
  return <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>{icon}</div>
    <div className="min-w-0">
      <div className="text-2xl font-bold leading-tight text-slate-900">{value}</div>
      <div className="truncate text-xs font-medium text-slate-500">{label}</div>
      {sub && <div className="truncate text-[11px] text-slate-400">{sub}</div>}
    </div>
  </div>
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' | 'success' | 'ghost' | 'outline'; busy?: boolean }
export function Button({ variant = 'primary', busy, className = '', children, disabled, ...rest }: BtnProps) {
  const v = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500',
    ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-400',
    outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400',
  }[variant]
  return <button {...rest} disabled={disabled || busy}
    className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`}>
    {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}{children}
  </button>
}

export const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30'

export function Field({ label, children, hint, required }: { label: string; children: ReactNode; hint?: ReactNode; required?: boolean }) {
  return <label className="block">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}{required && <span className="text-red-500"> *</span>}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
  </label>
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'info' | 'success'; children: ReactNode }) {
  if (!children) return null
  const s = { error: 'border-red-200 bg-red-50 text-red-700', info: 'border-blue-200 bg-blue-50 text-blue-800', success: 'border-emerald-200 bg-emerald-50 text-emerald-800' }[kind]
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${s}`}>
    {kind === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}<div>{children}</div>
  </div>
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onMouseDown={onClose}>
    <div role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}
      className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl ${wide ? 'max-w-4xl' : 'max-w-lg'}`}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3.5">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>
}

const DOT: Record<string, string> = { created: 'bg-red-500', priority: 'bg-orange-500', assignment: 'bg-blue-500', status: 'bg-indigo-500', closed: 'bg-emerald-500' }
export function Timeline({ updates }: { updates: Update[] }) {
  return <ol className="relative space-y-4 border-l-2 border-slate-200 pl-5">
    {updates.map(u => <li key={u.id} className="relative">
      <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${DOT[u.kind] ?? 'bg-slate-400'}`} />
      <p className="text-sm text-slate-800">{u.message}</p>
      <p className="text-xs text-slate-400">{fmtTime(u.created_at)}{u.author_name && ` · ${u.author_name}`}</p>
    </li>)}
  </ol>
}

export function Disclaimer() {
  return <p className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-500">
    <Info className="mt-px h-3.5 w-3.5 shrink-0" />
    Priority is suggested by a transparent rule-based prototype aid — not a medical triage system. Dispatchers review and may override it.
  </p>
}

/** Re-render every second for live elapsed timers. */
export function useTick(ms = 1000) {
  const [, set] = useState(0)
  useEffect(() => { const t = setInterval(() => set(x => x + 1), ms); return () => clearInterval(t) }, [ms])
}

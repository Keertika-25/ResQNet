import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Ambulance, Building2, FilePlus2, History, LayoutDashboard, LogOut, Menu, ShieldAlert, X } from 'lucide-react'
import { useAuth } from '../auth'

const NAV = {
  citizen: [{ to: '/citizen', label: 'Report Emergency', icon: FilePlus2 }, { to: '/citizen/incidents', label: 'My Incidents', icon: History }],
  dispatcher: [{ to: '/dispatcher', label: 'Command Center', icon: LayoutDashboard }],
  rescue: [{ to: '/rescue', label: 'Assignments', icon: Ambulance }],
  hospital: [{ to: '/hospital', label: 'Hospital Resources', icon: Building2 }],
}
const ROLE_LABEL = { citizen: 'Citizen', dispatcher: 'Dispatcher', rescue: 'Rescue Team', hospital: 'Hospital Admin' }

export function Logo({ light }: { light?: boolean }) {
  return <div className="flex items-center gap-2.5">
    <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-red-500 to-red-700 shadow-lg shadow-red-900/40">
      <ShieldAlert className="h-5 w-5 text-white" />
    </div>
    <div>
      <div className={`text-lg font-extrabold leading-none tracking-tight ${light ? 'text-white' : 'text-navy-900'}`}>ResQ<span className="text-red-500">Net</span></div>
      <div className={`text-[10px] font-medium uppercase tracking-widest ${light ? 'text-slate-400' : 'text-slate-500'}`}>Emergency Coordination</div>
    </div>
  </div>
}

export default function Layout({ title, subtitle, actions, children }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  if (!user) return null
  const nav = (
    <nav className="flex h-full flex-col bg-navy-900 px-3 py-5 text-slate-300">
      <div className="px-2"><Logo light /></div>
      <div className="mt-8 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{ROLE_LABEL[user.role]} workspace</div>
      <ul className="mt-2 space-y-1">
        {NAV[user.role].map(({ to, label, icon: Icon }) => <li key={to}>
          <NavLink to={to} end onClick={() => setOpen(false)} className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'hover:bg-navy-700 hover:text-white'}`}>
            <Icon className="h-[18px] w-[18px]" />{label}
          </NavLink>
        </li>)}
      </ul>
      <div className="mt-auto space-y-3">
        <div className="rounded-xl bg-navy-800 p-3 text-[11px] leading-snug text-slate-400">
          <b className="text-amber-400">Academic prototype.</b> Does not contact real emergency services. In a real emergency call your local emergency number.
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-navy-800 p-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">{user.name[0]}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{user.name}</div>
            <div className="truncate text-[11px] text-slate-400">{user.email}</div>
          </div>
          <button onClick={logout} aria-label="Log out" title="Log out" className="rounded-lg p-1.5 text-slate-400 hover:bg-navy-700 hover:text-white"><LogOut className="h-4 w-4" /></button>
        </div>
      </div>
    </nav>
  )
  return <div className="min-h-screen lg:pl-64">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{nav}</aside>
    {open && <div className="fixed inset-0 z-[1100] lg:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className="relative h-full w-64">{nav}
        <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-2 top-5 p-1 text-slate-400"><X /></button></div>
    </div>}
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
      <button className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold text-slate-900">{title}</h1>
        {subtitle && <div className="truncate text-xs text-slate-500">{subtitle}</div>}
      </div>
      {actions}
    </header>
    <main className="p-4 sm:p-6">{children}</main>
  </div>
}

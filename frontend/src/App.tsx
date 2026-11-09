import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { Role } from './api'
import { AuthProvider, useAuth } from './auth'
import { IncidentTrack, MyIncidents, ReportEmergency } from './pages/Citizen'
import Dispatcher from './pages/Dispatcher'
import Hospital from './pages/Hospital'
import Login, { HOME } from './pages/Login'
import Rescue from './pages/Rescue'

function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const { user, ready } = useAuth()
  if (!ready) return <div className="grid min-h-screen place-items-center text-slate-500">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={HOME[user.role]} replace />
  return children
}

export default function App() {
  return <AuthProvider><BrowserRouter><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/citizen" element={<Guard role="citizen"><ReportEmergency /></Guard>} />
    <Route path="/citizen/incidents" element={<Guard role="citizen"><MyIncidents /></Guard>} />
    <Route path="/citizen/incidents/:id" element={<Guard role="citizen"><IncidentTrack /></Guard>} />
    <Route path="/dispatcher" element={<Guard role="dispatcher"><Dispatcher /></Guard>} />
    <Route path="/rescue" element={<Guard role="rescue"><Rescue /></Guard>} />
    <Route path="/hospital" element={<Guard role="hospital"><Hospital /></Guard>} />
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes></BrowserRouter></AuthProvider>
}

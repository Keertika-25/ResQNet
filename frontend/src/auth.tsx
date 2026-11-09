import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type User } from './api'

interface AuthCtx { user: User | null; ready: boolean; setSession: (token: string, user: User) => void; logout: () => void }
const Ctx = createContext<AuthCtx>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  const logout = useCallback(() => { sessionStorage.removeItem('resqnet_token'); setUser(null) }, [])

  useEffect(() => {
    if (!sessionStorage.getItem('resqnet_token')) { setReady(true); return }
    api<User>('/auth/me').then(setUser).catch(() => logout()).finally(() => setReady(true))
  }, [logout])

  useEffect(() => {
    window.addEventListener('resqnet:logout', logout)
    return () => window.removeEventListener('resqnet:logout', logout)
  }, [logout])

  const setSession = (token: string, u: User) => { sessionStorage.setItem('resqnet_token', token); setUser(u) }
  return <Ctx.Provider value={{ user, ready, setSession, logout }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)

/** Load data and re-poll every `ms` so all dashboards reflect changes made elsewhere. */
export function usePoll<T>(path: string | null, ms = 5000) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!path) return
    try { setData(await api<T>(path)); setError('') } catch (e) { setError((e as Error).message) }
  }, [path])
  useEffect(() => {
    load()
    const t = setInterval(load, ms)
    return () => clearInterval(t)
  }, [load, ms])
  return { data, error, reload: load }
}

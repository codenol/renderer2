import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { AuthUser, UserRole } from '@/renderer/types'

const BACKEND = 'http://localhost:3001'
const TOKEN_KEY = 'skala_access_token'

interface AuthState {
  user: AuthUser | null
  loading: boolean
  token: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>
  logout: () => void
  forgotPassword: (email: string) => Promise<string | null>
  resetPassword: (token: string, password: string) => Promise<void>
  updateProfile: (firstName: string, lastName: string) => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [loading, setLoading] = useState(true)

  const saveToken = useCallback((t: string | null) => {
    if (t) {
      localStorage.setItem(TOKEN_KEY, t)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
    setToken(t)
  }, [])

  // Validate token on mount
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (!stored) {
      setLoading(false)
      return
    }
    fetch(`${BACKEND}/api/auth/me`, {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUser(data) })
      .catch(() => saveToken(null))
      .finally(() => setLoading(false))
  }, [saveToken])

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${BACKEND}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Login failed')
    saveToken(data.accessToken)
    setUser(data.user)
  }, [saveToken])

  const register = useCallback(async (email: string, password: string, firstName: string, lastName: string) => {
    const res = await fetch(`${BACKEND}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, firstName, lastName }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Registration failed')
    saveToken(data.accessToken)
    setUser(data.user)
  }, [saveToken])

  const logout = useCallback(() => {
    saveToken(null)
    setUser(null)
  }, [saveToken])

  const forgotPassword = useCallback(async (email: string): Promise<string | null> => {
    const res = await fetch(`${BACKEND}/api/auth/forgot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Forgot password failed')
    return data.token || null
  }, [])

  const resetPassword = useCallback(async (token: string, password: string) => {
    const res = await fetch(`${BACKEND}/api/auth/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Reset password failed')
    }
  }, [])

  const updateProfile = useCallback(async (firstName: string, lastName: string) => {
    if (!token) return
    const res = await fetch(`${BACKEND}/api/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ firstName, lastName }),
    })
    if (res.ok) {
      const data = await res.json()
      setUser(data)
    }
  }, [token])

  return (
    <AuthContext.Provider value={{
      user, loading, token,
      login, register, logout, forgotPassword, resetPassword, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function useAuthHeader(): Record<string, string> {
  const { token } = useAuth()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

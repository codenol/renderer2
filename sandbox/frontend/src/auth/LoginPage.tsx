import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from './AuthContext'
import styles from './AuthLayout.module.scss'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={submit}>
        <div className={styles.logo}>S^R</div>
        <h1 className={styles.title}>Вход</h1>

        {error && <div className={styles.error}>{error}</div>}

        <label className={styles.label}>Email</label>
        <input
          className={styles.input}
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="serg@skala.dev"
          autoFocus
          required
        />

        <label className={styles.label}>Пароль</label>
        <input
          className={styles.input}
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
          required
        />

        <button className={styles.btn} type="submit" disabled={submitting}>
          {submitting ? 'Вход...' : 'Войти'}
        </button>

        <div className={styles.links}>
          <Link to="/register">Создать аккаунт</Link>
          <Link to="/forgot-password">Забыли пароль?</Link>
        </div>
      </form>
    </div>
  )
}

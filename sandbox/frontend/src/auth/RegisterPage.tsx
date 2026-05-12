import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from './AuthContext'
import styles from './AuthLayout.module.scss'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Пароль должен быть не менее 6 символов'); return }
    setSubmitting(true)
    try {
      await register(email, password, firstName, lastName)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={submit}>
        <div className={styles.logo}>S^R</div>
        <h1 className={styles.title}>Регистрация</h1>
        <p className={styles.subtitle}>После регистрации вам будет доступен просмотр. Чтобы комментировать или загружать макеты, роль изменит дизайнер.</p>

        {error && <div className={styles.error}>{error}</div>}

        <label className={styles.label}>Email</label>
        <input className={styles.input} type="email" value={email}
          onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus required />

        <label className={styles.label}>Пароль (мин. 6 символов)</label>
        <input className={styles.input} type="password" value={password}
          onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />

        <label className={styles.label}>Имя</label>
        <input className={styles.input} value={firstName}
          onChange={e => setFirstName(e.target.value)} placeholder="Ваше имя" required />

        <label className={styles.label}>Фамилия</label>
        <input className={styles.input} value={lastName}
          onChange={e => setLastName(e.target.value)} placeholder="Ваша фамилия" required />

        <button className={styles.btn} type="submit" disabled={submitting}>
          {submitting ? 'Регистрация...' : 'Зарегистрироваться'}
        </button>

        <div className={styles.links}>
          <Link to="/login">Уже есть аккаунт? Войти</Link>
        </div>
      </form>
    </div>
  )
}

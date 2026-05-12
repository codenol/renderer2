import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from './AuthContext'
import styles from './AuthLayout.module.scss'

export function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>()
  const { resetPassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [status, setStatus] = useState<'form' | 'sending' | 'done'>('form')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Пароль должен быть не менее 6 символов'); return }
    if (password !== repeat) { setError('Пароли не совпадают'); return }
    if (!token) { setError('Токен не найден'); return }
    setStatus('sending')
    try {
      await resetPassword(token, password)
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сброса пароля')
      setStatus('form')
    }
  }

  if (status === 'done') {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.logo}>S^R</div>
          <h1 className={styles.title}>Пароль изменён</h1>
          <p className={styles.subtitle}>Теперь вы можете войти с новым паролем.</p>
          <button className={styles.btn} onClick={() => navigate('/login')}>Войти</button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={submit}>
        <div className={styles.logo}>S^R</div>
        <h1 className={styles.title}>Новый пароль</h1>

        {error && <div className={styles.error}>{error}</div>}

        <label className={styles.label}>Новый пароль (мин. 6 символов)</label>
        <input className={styles.input} type="password" value={password}
          onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoFocus required />

        <label className={styles.label}>Повторите пароль</label>
        <input className={styles.input} type="password" value={repeat}
          onChange={e => setRepeat(e.target.value)} placeholder="••••••••" required />

        <button className={styles.btn} type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? 'Сохранение...' : 'Сохранить пароль'}
        </button>

        <div className={styles.links}>
          <Link to="/login">← Назад к входу</Link>
        </div>
      </form>
    </div>
  )
}

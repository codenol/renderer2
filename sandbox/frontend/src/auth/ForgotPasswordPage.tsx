import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthContext'
import styles from './AuthLayout.module.scss'

export function ForgotPasswordPage() {
  const { forgotPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setStatus('sending')
    try {
      const token = await forgotPassword(email)
      setResetToken(token)
      setStatus('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
      setStatus('idle')
    }
  }

  if (status === 'sent') {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.logo}>S^R</div>
          <h1 className={styles.title}>Письмо отправлено</h1>
          <p className={styles.subtitle}>
            Если пользователь с email <strong>{email}</strong> существует, на него отправлена ссылка для сброса пароля.
          </p>
          {resetToken && (
            <div className={styles.tokenBox}>
              <span className={styles.tokenLabel}>Reset-токен (dev-режим):</span>
              <code className={styles.tokenCode}>{resetToken}</code>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>
                Перейдите по ссылке:{' '}
                <Link to={`/reset-password/${resetToken}`} style={{ color: '#2d98b4' }}>
                  /reset-password/{resetToken}
                </Link>
              </p>
            </div>
          )}
          <div className={styles.links} style={{ marginTop: 16 }}>
            <Link to="/login">← Назад к входу</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={submit}>
        <div className={styles.logo}>S^R</div>
        <h1 className={styles.title}>Восстановление пароля</h1>
        <p className={styles.subtitle}>Введите email, на который зарегистрирован аккаунт.</p>

        {error && <div className={styles.error}>{error}</div>}

        <label className={styles.label}>Email</label>
        <input className={styles.input} type="email" value={email}
          onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus required />

        <button className={styles.btn} type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? 'Отправка...' : 'Отправить'}
        </button>

        <div className={styles.links}>
          <Link to="/login">← Назад к входу</Link>
        </div>
      </form>
    </div>
  )
}

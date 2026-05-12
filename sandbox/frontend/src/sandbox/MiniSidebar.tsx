import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import type { UserRole } from '@/renderer/types'
import styles from './AppLayout.module.scss'

const ROLE_COLORS: Record<UserRole, string> = {
  designer: '#8b5cf6', analyst: '#2d98b4', pm: '#f59e0b',
  frontend: '#f472b6', backend: '#4ade80', qa: '#ef4444', guest: '#94a3b8',
}

const ROLE_LABELS: Record<UserRole, string> = {
  designer: 'Дизайнер', analyst: 'Аналитик', pm: 'ПО',
  frontend: 'Фронтенд', backend: 'Бэкенд', qa: 'QA', guest: 'Гость',
}

interface MiniSidebarProps {
  commentMode?: boolean
  onToggleComment?: () => void
  onOpenShare?: () => void
  onOpenYaml?: () => void
  showActions?: boolean
}

export function MiniSidebar({
  commentMode = false,
  onToggleComment,
  onOpenShare,
  onOpenYaml,
  showActions = false,
}: MiniSidebarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  const isDesigner = user?.role === 'designer'
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || '?'
  const initials = [user?.firstName, user?.lastName]
    .filter(Boolean).map(s => s[0]).join('').toUpperCase() || '?'

  const onHome = location.pathname !== '/'

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  return (
    <div className={styles.sidebar}>
      {/* Top slot */}
      <div className={styles.sidebarTop}>
        <button
          className={`${styles.sidebarBtn} ${!onHome ? styles['sidebarBtn--active'] : ''}`}
          onClick={() => navigate('/')}
          title="Список продуктов"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </button>
      </div>

      {/* Middle — context actions */}
      <div className={styles.sidebarMiddle}>
        {showActions && (
          <>
            {onToggleComment && user?.role !== 'guest' && (
              <button
                className={`${styles.sidebarBtn} ${commentMode ? styles['sidebarBtn--active'] : ''}`}
                onClick={onToggleComment}
                title={commentMode ? 'Выйти из режима комментирования' : 'Комментировать'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
            )}
            {isDesigner && onOpenYaml && (
              <button
                className={styles.sidebarBtn}
                onClick={onOpenYaml}
                title="Редактор YAML"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6"/>
                  <polyline points="8 6 2 12 8 18"/>
                </svg>
              </button>
            )}
            {isDesigner && onOpenShare && (
              <button
                className={styles.sidebarBtn}
                onClick={onOpenShare}
                title="Поделиться"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3"/>
                  <circle cx="6" cy="12" r="3"/>
                  <circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
              </button>
            )}
          </>
        )}
      </div>

      <div className={styles.sidebarSpacer} />

      {/* Bottom slot — profile + settings */}
      <div className={styles.sidebarBottom}>
        <div className={styles.profileWrap} ref={profileRef}>
          <button
            className={styles.sidebarBtn}
            onClick={() => setProfileOpen(v => !v)}
            title={fullName}
          >
            <span className={styles.avatarDot} style={{ background: ROLE_COLORS[user?.role ?? 'guest'] }}>
              {initials}
            </span>
          </button>
          {profileOpen && (
            <div className={styles.profileDropdown}>
              <div className={styles.profileHeader}>
                <span className={styles.profileDot} style={{ background: ROLE_COLORS[user?.role ?? 'guest'] }}>
                  {initials}
                </span>
                <div>
                  <div className={styles.profileName}>{fullName}</div>
                  <div className={styles.profileRole} style={{ color: ROLE_COLORS[user?.role ?? 'guest'] }}>
                    {ROLE_LABELS[user?.role ?? 'guest']}
                  </div>
                  <div className={styles.profileEmail}>{user?.email}</div>
                </div>
              </div>
              <button className={styles.profileLogout} onClick={() => { logout(); navigate('/login') }}>
                Выйти
              </button>
            </div>
          )}
        </div>
        <button className={styles.sidebarBtn} title="Настройки (заглушка)" onClick={() => {}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

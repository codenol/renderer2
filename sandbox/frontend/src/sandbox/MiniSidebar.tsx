import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { LIcon } from '@/renderer/components/LIcon'
import { SettingsModal } from './SettingsModal'
import { AboutModal } from './AboutModal'
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
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
          <LIcon name="layout-dashboard" size={20} />
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
                  <LIcon name="message-square" size={20} />
                </button>
            )}
            {isDesigner && onOpenYaml && (
              <button
                className={styles.sidebarBtn}
                onClick={onOpenYaml}
                title="Редактор YAML"
              >
                <LIcon name="code" size={20} />
              </button>
            )}
            {isDesigner && onOpenShare && (
              <button
                className={styles.sidebarBtn}
                onClick={onOpenShare}
                title="Поделиться"
              >
                <LIcon name="share-2" size={20} />
              </button>
            )}
          </>
        )}
      </div>

      <div className={styles.sidebarSpacer} />

      {/* Bottom slot — settings + profile */}
      <div className={styles.sidebarBottom}>
        <button className={styles.sidebarBtn} title="О программе" onClick={() => setAboutOpen(true)}>
          <LIcon name="help-circle" size={20} />
        </button>
        <button className={styles.sidebarBtn} title="Настройки" onClick={() => setSettingsOpen(true)}>
          <LIcon name="settings" size={20} />
        </button>
        <div className={styles.profileWrap} ref={profileRef}>
          <button className={styles.sidebarBtn} onClick={() => setProfileOpen(v => !v)} title={fullName}>
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
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  )
}

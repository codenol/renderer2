import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { ScreenJSON, CommentTree, Comment, UserRole } from '@/renderer/types'
import { Renderer } from '@/renderer/Renderer'
import { CommentLayer } from './CommentLayer'
import { useAuth } from '@/auth/AuthContext'
import { buildTree } from './apiClient'
import styles from './BranchView.module.scss'

const BACKEND = 'http://localhost:3001'
const ROLE_LABELS: Record<UserRole, string> = {
  designer: 'Дизайнер', analyst: 'Аналитик', pm: 'ПО',
  frontend: 'Фронтенд', backend: 'Бэкенд', qa: 'QA', guest: 'Гость',
}
const ROLE_COLORS: Record<UserRole, string> = {
  designer: '#8b5cf6', analyst: '#2d98b4', pm: '#f59e0b',
  frontend: '#f472b6', backend: '#4ade80', qa: '#ef4444', guest: '#94a3b8',
}
const ALL_ROLES = Object.keys(ROLE_LABELS) as UserRole[]

export function ShareView() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user: authUser } = useAuth()

  const [screenJson, setScreenJson] = useState<ScreenJSON | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentTree, setCommentTree] = useState<CommentTree[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [branchSlug, setBranchSlug] = useState('')
  const [versionId, setVersionId] = useState(0)
  const [commentMode, setCommentMode] = useState(false)

  // Identity: prefer auth user, fallback to localStorage for anonymous visitors
  const [firstName, setFirstName] = useState(
    () => authUser?.firstName || localStorage.getItem('share_firstname') || ''
  )
  const [lastName, setLastName] = useState(
    () => authUser?.lastName || localStorage.getItem('share_lastname') || ''
  )
  const [userRole, setUserRole] = useState<UserRole>(
    () => (authUser?.role as UserRole) || (localStorage.getItem('share_role') as UserRole) || 'analyst'
  )
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Аноним'
  const initials = [firstName, lastName].filter(Boolean).map(s => s[0]).join('').toUpperCase() || '?'

  const [showIdentityModal, setShowIdentityModal] = useState(false)
  const [modalFirstName, setModalFirstName] = useState('')
  const [modalLastName, setModalLastName] = useState('')
  const [modalRole, setModalRole] = useState<UserRole>('analyst')

  const [toastMsg, setToastMsg] = useState('')
  const [copyToast, setCopyToast] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Use auth user identity when available
  useEffect(() => {
    if (authUser) {
      setFirstName(authUser.firstName)
      setLastName(authUser.lastName)
      setUserRole(authUser.role as UserRole)
    }
  }, [authUser])

  function showToast(msg: string) {
    setToastMsg(msg); setCopyToast(true)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setCopyToast(false), 3000)
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${BACKEND}/api/shares/${token}`)
        if (!res.ok) throw new Error('Share not found')
        const data = await res.json()
        setScreenJson(data.screen)
        setTitle(data.title || 'Без названия')
        setBranchSlug(data.branchSlug)
        setVersionId(data.versionId)
        const commentsRes = await fetch(`${BACKEND}/api/shares/${token}/comments`)
        if (commentsRes.ok) {
          const commentsData: Comment[] = await commentsRes.json()
          setComments(commentsData)
          setCommentTree(buildTree(commentsData))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  // Persist identity for anonymous visitors
  useEffect(() => {
    if (!authUser) {
      localStorage.setItem('share_firstname', firstName)
      localStorage.setItem('share_lastname', lastName)
      localStorage.setItem('share_role', userRole)
    }
  }, [firstName, lastName, userRole, authUser])

  async function handleAdd(data: { versionId: number; parentId?: number | null; nodeId?: string; x?: number; y?: number; text: string; author: string; role: UserRole }) {
    const res = await fetch(`${BACKEND}/api/shares/${token}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Ошибка создания комментария')
    const newComment = await res.json()
    setComments(prev => [...prev, newComment])
    setCommentTree(buildTree([...comments, newComment]))
  }

  async function handleUpdate() { showToast('Принять/отклонить может только дизайнер') }
  async function handleDelete() { showToast('Удаление недоступно в режиме просмотра') }

  function checkIdentity(): boolean {
    if (!firstName.trim() || !lastName.trim()) {
      setModalFirstName(firstName); setModalLastName(lastName); setModalRole(userRole)
      setShowIdentityModal(true); return false
    }
    return true
  }

  function confirmIdentity() {
    setFirstName(modalFirstName); setLastName(modalLastName); setUserRole(modalRole)
    setShowIdentityModal(false); setCommentMode(true)
  }

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /><span>Загружаем...</span></div>
  if (error || !screenJson) return (
    <div className={styles.error}>
      <div className={styles.errorCode}>404</div>
      <div className={styles.errorText}>Страница не найдена или срок действия ссылки истёк</div>
      <button className={styles.errorBtn} onClick={() => navigate('/')}>← На главную</button>
    </div>
  )

  return (
    <div className={styles.wrap}>
      <div className={styles.topBar}>
        <button className={styles.topBarLogo} onClick={() => navigate('/')}>S^R</button>
        <div className={styles.topBarInfo}>
          <span className={styles.topBarTitle}>{title}</span>
          <span className={styles.topBarSlug}>🔗 Общий доступ</span>
        </div>
        <div className={styles.topBarActions}>
          <span className={styles.identityBtn} style={{ padding: '0 8px', gap: 6, opacity: 0.8 }}>
            <span className={styles.identityDot} style={{ background: ROLE_COLORS[userRole] }}>{initials}</span>
            <span className={styles.identityName} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{fullName}</span>
          </span>
          <button
            className={`${styles.btnComment} ${commentMode ? styles['btnComment--active'] : ''}`}
            onClick={() => { if (!commentMode && !checkIdentity()) return; setCommentMode(v => !v) }}
          >
            {commentMode ? 'Выйти из режима комментирования' : 'Комментировать'}
          </button>
        </div>
      </div>

      {commentMode && <div className={styles.commentHint}>Кликните на любой элемент экрана, чтобы оставить комментарий · Esc — выйти</div>}
      {copyToast && <div className={styles.copyToast}>{toastMsg}</div>}

      {showIdentityModal && (
        <div className={styles.yamlOverlay} onClick={() => setShowIdentityModal(false)}>
          <div className={styles.yamlModal} onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className={styles.yamlHeader}>
              <span className={styles.yamlTitle}>Представьтесь, пожалуйста</span>
              <button className={styles.yamlClose} onClick={() => setShowIdentityModal(false)}>✕</button>
            </div>
            <div className={styles.yamlBody} style={{ padding: '16px 20px' }}>
              <p style={{ margin: '0 0 12px', fontSize: 14 }}>Анонимные комментарии запрещены. Укажите имя и фамилию.</p>
              <input className={styles.identityInput} placeholder="Имя" value={modalFirstName}
                onChange={e => setModalFirstName(e.target.value)} style={{ marginBottom: 8 }} autoFocus />
              <input className={styles.identityInput} placeholder="Фамилия" value={modalLastName}
                onChange={e => setModalLastName(e.target.value)} style={{ marginBottom: 12 }} />
              <div className={styles.rolePills}>
                {ALL_ROLES.filter(r => r !== 'designer').map(r => (
                  <button key={r}
                    className={`${styles.rolePill} ${r === modalRole ? styles['rolePill--active'] : ''}`}
                    style={r === modalRole ? { background: ROLE_COLORS[r], borderColor: ROLE_COLORS[r] } : {}}
                    onClick={() => setModalRole(r)}
                  >{ROLE_LABELS[r]}</button>
                ))}
              </div>
            </div>
            <div className={styles.yamlFooter}>
              <div style={{ flex: 1 }} />
              <button className={`${styles.yamlBtn} ${styles.yamlBtnApply}`}
                onClick={confirmIdentity}
                disabled={!modalFirstName.trim() || !modalLastName.trim()}
              >Продолжить</button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.canvas}>
        <div className={styles.screen}>
          <Renderer screen={screenJson} commentMode={commentMode} />
          <CommentLayer
            slug={branchSlug} commentMode={commentMode} currentVersionId={versionId}
            firstName={firstName} lastName={lastName} userRole={userRole}
            comments={commentTree}
            onAdd={handleAdd} onUpdate={handleUpdate} onDelete={handleDelete}
          />
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import yaml from 'js-yaml'
import type { ScreenJSON, Comment, UserRole } from '@/renderer/types'
import { Renderer } from '@/renderer/Renderer'
import styles from './BranchView.module.scss'

const ROLE_LABELS: Record<UserRole, string> = {
  designer: 'Дизайнер',
  analyst: 'Аналитик',
  pm: 'ПО',
  frontend: 'Фронтенд',
  backend: 'Бэкенд',
  qa: 'QA',
}

const ROLE_COLORS: Record<UserRole, string> = {
  designer: '#8b5cf6',
  analyst: '#2d98b4',
  pm: '#f59e0b',
  frontend: '#f472b6',
  backend: '#4ade80',
  qa: '#ef4444',
}

const ALL_ROLES = Object.keys(ROLE_LABELS) as UserRole[]

// In-memory comments store (per session, lost on reload)
const sessionComments = new Map<string, Comment[]>()

export function BranchView() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const [branchTitle, setBranchTitle] = useState<string>('')
  const [screenJson, setScreenJson] = useState<ScreenJSON | null>(null)
  const [loadingScreen, setLoadingScreen] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ─── Comments ──────────────────────────────────────────────────────────
  const [comments, setComments] = useState<Comment[]>([])
  const [commentMode, setCommentMode] = useState(false)
  const [copyToast, setCopyToast] = useState(false)
  const copyToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── YAML modal ─────────────────────────────────────────────────────────
  const [yamlOpen, setYamlOpen] = useState(false)
  const [yamlText, setYamlText] = useState('')
  const [yamlCopied, setYamlCopied] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const yamlFileRef = useRef<HTMLInputElement>(null)

  // ─── User identity ──────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState(
    () => localStorage.getItem('sandbox_firstname') ?? ''
  )
  const [lastName, setLastName] = useState(
    () => localStorage.getItem('sandbox_lastname') ?? ''
  )
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Аноним'
  const initials = [firstName, lastName]
    .filter(Boolean)
    .map(s => s[0])
    .join('')
    .toUpperCase() || '?'
  const [userRole, setUserRole] = useState<UserRole>(
    () => (localStorage.getItem('sandbox_role') as UserRole) ?? 'designer'
  )
  const [identityOpen, setIdentityOpen] = useState(false)
  const identityRef = useRef<HTMLDivElement>(null)

  // ─── Close dropdowns on outside click ───────────────────────────────────
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (identityRef.current && !identityRef.current.contains(e.target as Node)) {
        setIdentityOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // ─── Persist identity ────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('sandbox_firstname', firstName)
    localStorage.setItem('sandbox_lastname', lastName)
    localStorage.setItem('sandbox_role', userRole)
  }, [firstName, lastName, userRole])

  // ─── Initial load (embedded data only — no backend) ──────────────────────
  useEffect(() => {
    if (!slug) return
    setLoadingScreen(true)

    const embeddedEl = document.getElementById('embedded-screen')
    const embeddedData = embeddedEl?.textContent?.trim()
    if (embeddedData) {
      try {
        const screen: ScreenJSON = JSON.parse(embeddedData)
        setBranchTitle(screen.meta?.title || 'Без названия')
        setScreenJson(screen)
        setLoadingScreen(false)
        // Load session comments for this slug
        setComments(sessionComments.get(slug) || [])
        return
      } catch {
        setError('Ошибка парсинга встроенных данных экрана')
        setLoadingScreen(false)
        return
      }
    }

    setError('Экран не найден. Запустите: node sandbox/scripts/embed-screen.js <screen.yaml>')
    setLoadingScreen(false)
  }, [slug])

  // ─── Comment mutations (in-memory only) ──────────────────────────────────
  const addComment = useCallback((data: {
    nodeId?: string; x?: number; y?: number
    text: string; author: string; role: UserRole
  }) => {
    if (!slug) return
    const c: Comment = {
      id: Date.now(),
      branchSlug: slug,
      versionId: 1,
      versionNumber: 1,
      nodeId: data.nodeId ?? null,
      x: data.x ?? null,
      y: data.y ?? null,
      text: data.text,
      author: data.author,
      role: data.role,
      status: 'open',
      rejectReason: null,
      createdAt: new Date().toISOString(),
    }
    const list = sessionComments.get(slug) || []
    list.push(c)
    sessionComments.set(slug, list)
    setComments(list)
  }, [slug])

  const updateComment = useCallback((
    id: number, status: 'resolved' | 'rejected', rejectReason?: string
  ) => {
    setComments(prev => prev.map(c =>
      c.id === id ? { ...c, status, rejectReason: rejectReason ?? null } : c
    ))
  }, [])

  const deleteComment = useCallback((id: number) => {
    setComments(prev => prev.filter(c => c.id !== id))
  }, [])

  // ─── Copy comments to clipboard ──────────────────────────────────────────
  function copyComments() {
    if (!comments.length) {
      navigator.clipboard.writeText('Комментариев нет.')
      return
    }
    let text = `=== Комментарии: ${branchTitle} ===\n\n`
    comments.forEach((c, i) => {
      const roleLabel = ROLE_LABELS[c.role]
      const statusLabel =
        c.status === 'resolved' ? '  ✓ Выполнено' :
        c.status === 'rejected' ? `  ✗ Отклонено: ${c.rejectReason}` : ''
      text += `${i + 1}. [${roleLabel} · ${c.author}]${statusLabel}\n`
      if (c.nodeId) text += `   → Элемент: #${c.nodeId}\n`
      text += `   "${c.text}"\n`
      text += `   ${new Date(c.createdAt).toLocaleString('ru-RU')}\n\n`
    })
    navigator.clipboard.writeText(text.trim())
    if (copyToastTimer.current) clearTimeout(copyToastTimer.current)
    setCopyToast(true)
    copyToastTimer.current = setTimeout(() => setCopyToast(false), 2500)
  }

  // ─── Download current version JSON ───────────────────────────────────────
  function downloadJson() {
    if (!screenJson) return
    const blob = new Blob([JSON.stringify(screenJson, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}-v1.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── YAML modal helpers ──────────────────────────────────────────────────
  function getYamlContent(): string {
    if (!screenJson) return ''
    try {
      return yaml.dump(screenJson, {
        lineWidth: -1,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
        indent: 2,
      })
    } catch {
      return JSON.stringify(screenJson, null, 2)
    }
  }

  function openYamlModal() {
    setYamlText(getYamlContent())
    setYamlError(null)
    setYamlCopied(false)
    setYamlOpen(true)
  }

  function applyYaml() {
    setYamlError(null)
    let parsed: unknown
    try {
      parsed = yaml.load(yamlText, { schema: yaml.FAILSAFE_SCHEMA })
    } catch (e) {
      setYamlError(e instanceof Error ? e.message : 'Ошибка парсинга YAML')
      return
    }
    if (!parsed || typeof parsed !== 'object') {
      setYamlError('YAML должен содержать объект')
      return
    }
    const json = parsed as ScreenJSON
    if (!json.pages || !Array.isArray(json.pages)) {
      setYamlError('YAML должен содержать раздел pages')
      return
    }
    setScreenJson(json)
    setBranchTitle(json.meta?.title || branchTitle)
    setYamlOpen(false)
  }

  function copyYaml() {
    navigator.clipboard.writeText(yamlText)
    setYamlCopied(true)
    setTimeout(() => setYamlCopied(false), 2000)
  }

  function downloadYaml() {
    const blob = new Blob([yamlText], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}-v1.yaml`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function onUploadYamlFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const text = await file.text()
    setYamlText(text)
    setYamlError(null)
    let parsed: unknown
    try {
      parsed = yaml.load(text, { schema: yaml.FAILSAFE_SCHEMA })
    } catch (err) {
      setYamlError(err instanceof Error ? err.message : 'Ошибка парсинга YAML')
      return
    }
    if (!parsed || typeof parsed !== 'object') {
      setYamlError('YAML должен содержать объект')
      return
    }
    const json = parsed as ScreenJSON
    if (!json.pages || !Array.isArray(json.pages)) {
      setYamlError('YAML должен содержать раздел pages')
      return
    }
    setScreenJson(json)
    setBranchTitle(json.meta?.title || branchTitle)
    setYamlOpen(false)
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={styles.error}>
        <div className={styles.errorCode}>404</div>
        <div className={styles.errorText}>{error}</div>
        <button className={styles.errorBtn} onClick={() => navigate('/')}>← На главную</button>
      </div>
    )
  }

  if (!screenJson || loadingScreen) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <span>Загружаем экран...</span>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <button className={styles.topBarLogo} onClick={() => navigate('/')}>S^R</button>

        <div className={styles.topBarInfo}>
          <span className={styles.topBarTitle}>{branchTitle}</span>
          <span className={styles.topBarSlug}>{slug}</span>
        </div>

        <div className={styles.topBarActions}>
          {/* Identity selector */}
          <div className={styles.identityWrap} ref={identityRef}>
            <button
              className={styles.identityBtn}
              onClick={() => setIdentityOpen(v => !v)}
              title="Ваша роль и имя"
            >
              <span
                className={styles.identityDot}
                style={{ background: ROLE_COLORS[userRole] }}
              >
                {initials}
              </span>
              <span className={styles.identityName}>{fullName}</span>
              <span className={styles.identityRole}>{ROLE_LABELS[userRole]}</span>
              <span className={styles.identityChevron}>▾</span>
            </button>
            {identityOpen && (
              <div className={styles.identityDropdown}>
                <input
                  className={styles.identityInput}
                  placeholder="Имя"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  autoFocus
                />
                <input
                  className={styles.identityInput}
                  placeholder="Фамилия"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                />
                <div className={styles.rolePills}>
                  {ALL_ROLES.map(r => (
                    <button
                      key={r}
                      className={`${styles.rolePill} ${r === userRole ? styles['rolePill--active'] : ''}`}
                      style={r === userRole ? { background: ROLE_COLORS[r], borderColor: ROLE_COLORS[r] } : {}}
                      onClick={() => setUserRole(r)}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* YAML viewer */}
          <button
            className={styles.topBarBtn}
            onClick={openYamlModal}
            title="Редактор YAML"
          >
            YAML
          </button>

          {/* Copy comments */}
          <button
            className={styles.topBarBtn}
            onClick={copyComments}
            title="Копировать комментарии в буфер"
          >
            Копировать комментарии в буфер
          </button>

          <input
            ref={yamlFileRef}
            type="file"
            accept=".yaml,.yml"
            style={{ display: 'none' }}
            onChange={onUploadYamlFile}
          />

          {/* Comment mode */}
          <button
            className={`${styles.btnComment} ${commentMode ? styles['btnComment--active'] : ''}`}
            onClick={() => setCommentMode(v => !v)}
            title={commentMode ? 'Выйти из режима комментирования' : 'Комментировать'}
          >
            {commentMode ? 'Выйти из режима комментирования' : 'Комментировать'}
          </button>
        </div>
      </div>

      {commentMode && (
        <div className={styles.commentHint}>
          Кликните на любой элемент экрана, чтобы оставить комментарий · Esc — выйти
        </div>
      )}

      {/* Copy toast */}
      {copyToast && (
        <div className={styles.copyToast}>Скопировано в буфер</div>
      )}

      {/* YAML modal */}
      {yamlOpen && (
        <div className={styles.yamlOverlay} onClick={() => setYamlOpen(false)}>
          <div className={styles.yamlModal} onClick={e => e.stopPropagation()}>
            <div className={styles.yamlHeader}>
              <span className={styles.yamlTitle}>YAML — {branchTitle}</span>
              <button className={styles.yamlClose} onClick={() => setYamlOpen(false)}>✕</button>
            </div>
            {yamlError && (
              <div className={styles.yamlError}>{yamlError}</div>
            )}
            <div className={styles.yamlBody}>
              <textarea
                className={styles.yamlTextarea}
                value={yamlText}
                onChange={e => { setYamlText(e.target.value); setYamlError(null) }}
                spellCheck={false}
              />
            </div>
            <div className={styles.yamlFooter}>
              <button
                className={`${styles.yamlBtn} ${styles.yamlBtnApply}`}
                onClick={applyYaml}
              >
                Применить
              </button>
              <button
                className={`${styles.yamlBtn} ${styles.yamlBtnUpload}`}
                onClick={() => yamlFileRef.current?.click()}
              >
                Загрузить файл
              </button>
              <div style={{ flex: 1 }} />
              <button
                className={`${styles.yamlBtn} ${styles.yamlBtnCopy} ${yamlCopied ? styles.yamlBtnCopied : ''}`}
                onClick={copyYaml}
              >
                {yamlCopied ? '✓ Скопировано' : 'Скопировать'}
              </button>
              <button
                className={`${styles.yamlBtn} ${styles.yamlBtnDownload}`}
                onClick={downloadYaml}
              >
                Скачать .yaml
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className={styles.canvas}>
        <div className={styles.screen}>
          <Renderer screen={screenJson} commentMode={commentMode} />
          {slug && (
            <CommentLayer
              slug={slug}
              commentMode={commentMode}
              currentVersionId={1}
              firstName={firstName}
              lastName={lastName}
              userRole={userRole}
              comments={comments}
              onAdd={addComment}
              onUpdate={updateComment}
              onDelete={deleteComment}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── CommentLayer (inlined, no backend dependency) ──────────────────────────

interface CommentLayerProps {
  slug: string
  commentMode: boolean
  currentVersionId: number
  firstName: string
  lastName: string
  userRole: UserRole
  comments: Comment[]
  onAdd: (data: { nodeId?: string; x?: number; y?: number; text: string; author: string; role: UserRole }) => void
  onUpdate: (id: number, status: 'resolved' | 'rejected', rejectReason?: string) => void
  onDelete: (id: number) => void
}

function CommentLayer({
  slug, commentMode, currentVersionId, firstName, lastName, userRole,
  comments, onAdd, onUpdate, onDelete,
}: CommentLayerProps) {
  const [activeComment, setActiveComment] = useState<Comment | null>(null)
  const [newText, setNewText] = useState('')
  const [rejectText, setRejectText] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!commentMode) return
    const target = e.target as HTMLElement
    const nodeId = target.closest('[data-node-id]')?.getAttribute('data-node-id')
    if (!nodeId) return
    const rect = target.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    onAdd({ nodeId, x, y, text: '', author: [firstName, lastName].filter(Boolean).join(' ') || 'Аноним', role: userRole })
  }, [commentMode, onAdd, firstName, lastName, userRole])

  useEffect(() => {
    if (!commentMode) return
    window.addEventListener('click', handleClick as unknown as EventListener, true)
    return () => window.removeEventListener('click', handleClick as unknown as EventListener, true)
  }, [commentMode, handleClick])

  const handleStatus = (c: Comment, status: 'resolved' | 'rejected') => {
    if (status === 'rejected') {
      setEditingId(c.id)
      setShowReject(true)
      setRejectText('')
    } else {
      onUpdate(c.id, status)
    }
  }

  const confirmReject = () => {
    if (editingId && rejectText.trim()) {
      onUpdate(editingId, 'rejected', rejectText.trim())
      setShowReject(false)
      setEditingId(null)
    }
  }

  const filtered = comments.filter(c => c.versionId === currentVersionId)

  return (
    <>
      {/* Comment markers */}
      {filtered.map(c => (
        <div
          key={c.id}
          className={styles.commentMarker}
          style={{ left: c.x, top: c.y }}
          onClick={() => setActiveComment(activeComment?.id === c.id ? null : c)}
        >
          <span className={styles.commentDot} style={{ background: ROLE_COLORS[c.role] }}>
            {c.status === 'resolved' ? '✓' : c.status === 'rejected' ? '✗' : comments.indexOf(c) + 1}
          </span>
        </div>
      ))}

      {/* Active comment popup */}
      {activeComment && (
        <div className={styles.commentPopup}>
          <div className={styles.commentPopupHeader}>
            <span style={{ color: ROLE_COLORS[activeComment.role] }}>
              {ROLE_LABELS[activeComment.role]} · {activeComment.author}
            </span>
            <button className={styles.commentPopupClose} onClick={() => setActiveComment(null)}>✕</button>
          </div>
          <div className={styles.commentPopupText}>{activeComment.text}</div>
          {activeComment.nodeId && (
            <div className={styles.commentPopupNode}>#{activeComment.nodeId}</div>
          )}
          {activeComment.status === 'open' && (
            <div className={styles.commentPopupActions}>
              <button className={styles.commentPopupBtn} onClick={() => handleStatus(activeComment, 'resolved')}>
                ✓ Выполнено
              </button>
              <button className={styles.commentPopupBtn} onClick={() => handleStatus(activeComment, 'rejected')}>
                ✗ Отклонить
              </button>
              <button className={styles.commentPopupBtn} onClick={() => onDelete(activeComment.id)}>
                Удалить
              </button>
            </div>
          )}
          {activeComment.status === 'rejected' && activeComment.rejectReason && (
            <div className={styles.commentPopupReject}>Отклонено: {activeComment.rejectReason}</div>
          )}
        </div>
      )}

      {/* Reject modal */}
      {showReject && (
        <div className={styles.rejectOverlay} onClick={() => { setShowReject(false); setEditingId(null) }}>
          <div className={styles.rejectModal} onClick={e => e.stopPropagation()}>
            <div className={styles.rejectTitle}>Причина отклонения</div>
            <textarea
              className={styles.rejectTextarea}
              value={rejectText}
              onChange={e => setRejectText(e.target.value)}
              placeholder="Опишите причину..."
              autoFocus
            />
            <div className={styles.rejectActions}>
              <button className={styles.rejectBtn} onClick={() => { setShowReject(false); setEditingId(null) }}>Отмена</button>
              <button className={`${styles.rejectBtn} ${styles.rejectBtnConfirm}`} onClick={confirmReject}>Отклонить</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import yaml from 'js-yaml'
import type { ScreenJSON, Comment, CommentTree, UserRole } from '@/renderer/types'
import { Renderer } from '@/renderer/Renderer'
import { CommentLayer } from './CommentLayer'
import { useApiClient } from './apiClient'
import styles from './BranchView.module.scss'

const BACKEND = 'http://localhost:3001'
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

export function BranchView() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const {
    comments,
    commentTree,
    loading,
    connected,
    error: apiError,
    branchTitle,
    screenJson,
    versions,
    currentVersionId,
    setCurrentVersionId,
    addComment,
    updateComment,
    deleteComment,
    createShare,
    setScreenJson: setApiScreenJson,
  } = useApiClient(slug || '')

  const localScreenJson = screenJson
  const setLocalScreenJson = setApiScreenJson
  const localBranchTitle = branchTitle

  // ─── Comment mode & toast ────────────────────────────────────────────────
  const [commentMode, setCommentMode] = useState(false)
  const [copyToast, setCopyToast] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const copyToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [commentError, setCommentError] = useState<string | null>(null)

  function showToast(msg: string) {
    setToastMsg(msg)
    setCopyToast(true)
    if (copyToastTimer.current) clearTimeout(copyToastTimer.current)
    copyToastTimer.current = setTimeout(() => setCopyToast(false), 3000)
  }

  // ─── YAML modal ──────────────────────────────────────────────────────────
  const [yamlOpen, setYamlOpen] = useState(false)
  const [yamlText, setYamlText] = useState('')
  const [yamlCopied, setYamlCopied] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const yamlFileRef = useRef<HTMLInputElement>(null)

  // ─── User identity ───────────────────────────────────────────────────────
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

  // ─── Anonymous enforcement ───────────────────────────────────────────────
  const [showIdentityModal, setShowIdentityModal] = useState(false)
  const [modalFirstName, setModalFirstName] = useState('')
  const [modalLastName, setModalLastName] = useState('')
  const [modalRole, setModalRole] = useState<UserRole>('analyst')

  // ─── Version dropdown ─────────────────────────────────────────────────────
  const [versionOpen, setVersionOpen] = useState(false)
  const versionRef = useRef<HTMLDivElement>(null)

  // ─── Share ────────────────────────────────────────────────────────────────
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [sharing, setSharing] = useState(false)

  // ─── Close dropdowns on outside click ────────────────────────────────────
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (identityRef.current && !identityRef.current.contains(e.target as Node)) setIdentityOpen(false)
      if (versionRef.current && !versionRef.current.contains(e.target as Node)) setVersionOpen(false)
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

  // ─── Escape key ──────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setCommentMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ─── Copy comments to clipboard ─────────────────────────────────────────
  function copyComments() {
    const currentComments = comments.filter(c => c.versionId === currentVersionId)
    if (!currentComments.length) {
      navigator.clipboard.writeText('Комментариев нет.')
      return
    }
    let text = `=== Комментарии: ${localBranchTitle} (версия ${getCurrentVersionNumber()}) ===\n\n`
    currentComments.forEach((c, i) => {
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
    showToast('Скопировано в буфер')
  }

  function getCurrentVersionNumber(): number {
    return versions.find(v => v.id === currentVersionId)?.versionNumber || 1
  }

  // ─── Version switching ────────────────────────────────────────────────────
  async function switchVersion(versionId: number) {
    setVersionOpen(false)
    if (versionId === currentVersionId) return
    setCurrentVersionId(versionId)
    try {
      const res = await fetch(`${BACKEND}/api/branches/${slug}/versions/${versionId}`)
      if (!res.ok) return
      const data = await res.json()
      setLocalScreenJson(data.screen)
    } catch {}
  }

  // ─── YAML modal helpers ───────────────────────────────────────────────────
  function getYamlContent(): string {
    if (!localScreenJson) return ''
    try {
      return yaml.dump(localScreenJson, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false, indent: 2 })
    } catch {
      return JSON.stringify(localScreenJson, null, 2)
    }
  }

  function openYamlModal() {
    setYamlText(getYamlContent())
    setYamlError(null)
    setYamlCopied(false)
    setYamlOpen(true)
  }

  async function applyYaml() {
    setYamlError(null)
    let parsed: unknown
    try {
      parsed = yaml.load(yamlText, { schema: yaml.FAILSAFE_SCHEMA })
    } catch (e) {
      setYamlError(e instanceof Error ? e.message : 'Ошибка парсинга YAML')
      return
    }
    if (!parsed || typeof parsed !== 'object') { setYamlError('YAML должен содержать объект'); return }
    const json = parsed as ScreenJSON
    if (!json.pages || !Array.isArray(json.pages)) { setYamlError('YAML должен содержать раздел pages'); return }

    // Save as new version via backend
    if (slug && connected) {
      try {
        const res = await fetch(`${BACKEND}/api/branches/${slug}/versions`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/yaml' },
          body: yamlText,
        })
        if (res.ok) {
          const newVer = await res.json()
          setCurrentVersionId(newVer.id)
          showToast(`Создана версия ${newVer.versionNumber}`)
        } else {
          // Fallback: just apply locally
          setLocalScreenJson(json)
        }
      } catch {
        setLocalScreenJson(json)
      }
    } else {
      setLocalScreenJson(json)
    }
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
    a.href = url; a.download = `${slug}-v${getCurrentVersionNumber()}.yaml`; a.click()
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
    if (!parsed || typeof parsed !== 'object') { setYamlError('YAML должен содержать объект'); return }
    const json = parsed as ScreenJSON
    if (!json.pages || !Array.isArray(json.pages)) { setYamlError('YAML должен содержать раздел pages'); return }

    // Save via backend
    if (slug && connected) {
      try {
        const res = await fetch(`${BACKEND}/api/branches/${slug}/versions`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/yaml' },
          body: text,
        })
        if (res.ok) {
          const newVer = await res.json()
          setCurrentVersionId(newVer.id)
          showToast(`Создана версия ${newVer.versionNumber}`)
        } else {
          setLocalScreenJson(json)
        }
      } catch {
        setLocalScreenJson(json)
      }
    } else {
      setLocalScreenJson(json)
    }
    setYamlOpen(false)
  }

  // ─── Share ────────────────────────────────────────────────────────────────
  async function handleShare() {
    if (!currentVersionId) return
    setSharing(true)
    try {
      const result = await createShare(currentVersionId)
      const url = `${window.location.origin}/share/${result.token}`
      setShareUrl(url)
      setShareOpen(true)
    } catch {
      showToast('Ошибка создания ссылки')
    } finally {
      setSharing(false)
    }
  }

  function copyShareUrl() {
    navigator.clipboard.writeText(shareUrl)
    setShareOpen(false)
    showToast('Ссылка скопирована в буфер')
  }

  // ─── Anonymous check ─────────────────────────────────────────────────────
  function checkIdentity(): boolean {
    if (!firstName.trim() || !lastName.trim()) {
      setModalFirstName(firstName)
      setModalLastName(lastName)
      setModalRole(userRole)
      setShowIdentityModal(true)
      return false
    }
    return true
  }

  function confirmIdentity() {
    setFirstName(modalFirstName)
    setLastName(modalLastName)
    setUserRole(modalRole)
    setShowIdentityModal(false)
  }

  // ─── Error state ─────────────────────────────────────────────────────────
  if (apiError && !loading && !localScreenJson) {
    return (
      <div className={styles.error}>
        <div className={styles.errorCode}>404</div>
        <div className={styles.errorText}>{apiError}</div>
        <button className={styles.errorBtn} onClick={() => navigate('/')}>← На главную</button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <span>Загружаем экран...</span>
      </div>
    )
  }

  if (!localScreenJson) {
    return (
      <div className={styles.error}>
        <div className={styles.errorCode}>404</div>
        <div className={styles.errorText}>Экран не найден</div>
        <button className={styles.errorBtn} onClick={() => navigate('/')}>← На главную</button>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <button className={styles.topBarLogo} onClick={() => navigate('/')}>S^R</button>

        <div className={styles.topBarInfo}>
          <span className={styles.topBarTitle}>{localBranchTitle}</span>
          <span className={styles.topBarSlug}>{slug}</span>
        </div>

        <div className={styles.topBarActions}>
          {/* Version switcher */}
          {versions.length > 1 && (
            <div className={styles.versionWrap} ref={versionRef}>
              <button
                className={styles.versionBtn}
                onClick={() => setVersionOpen(v => !v)}
              >
                Версия {getCurrentVersionNumber()} из {versions.length}
                <span className={styles.versionChevron}>▾</span>
              </button>
              {versionOpen && (
                <div className={styles.versionDropdown}>
                  {versions.map(v => (
                    <button
                      key={v.id}
                      className={`${styles.versionItem} ${v.id === currentVersionId ? styles['versionItem--active'] : ''}`}
                      onClick={() => switchVersion(v.id)}
                    >
                      <span>Версия {v.versionNumber}</span>
                      <span className={styles.versionItemDate}>
                        {new Date(v.createdAt).toLocaleString('ru-RU')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* WS status */}
          <span className={styles.wsStatus} title={connected ? 'Подключено' : 'Офлайн'}>
            {connected ? '⚡' : '⏳'}
          </span>

          {/* Identity selector */}
          <div className={styles.identityWrap} ref={identityRef}>
            <button
              className={styles.identityBtn}
              onClick={() => setIdentityOpen(v => !v)}
              title="Ваша роль и имя"
            >
              <span className={styles.identityDot} style={{ background: ROLE_COLORS[userRole] }}>
                {initials}
              </span>
              <span className={styles.identityName}>{fullName}</span>
              <span className={styles.identityRole}>{ROLE_LABELS[userRole]}</span>
              <span className={styles.identityChevron}>▾</span>
            </button>
            {identityOpen && (
              <div className={styles.identityDropdown}>
                <input className={styles.identityInput} placeholder="Имя" value={firstName}
                  onChange={e => setFirstName(e.target.value)} autoFocus />
                <input className={styles.identityInput} placeholder="Фамилия" value={lastName}
                  onChange={e => setLastName(e.target.value)} />
                <div className={styles.rolePills}>
                  {ALL_ROLES.map(r => (
                    <button key={r}
                      className={`${styles.rolePill} ${r === userRole ? styles['rolePill--active'] : ''}`}
                      style={r === userRole ? { background: ROLE_COLORS[r], borderColor: ROLE_COLORS[r] } : {}}
                      onClick={() => setUserRole(r)}
                    >{ROLE_LABELS[r]}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* YAML viewer */}
          <button className={styles.topBarBtn} onClick={openYamlModal} title="Редактор YAML">YAML</button>

          {/* Share */}
          <button className={styles.topBarBtn} onClick={handleShare} disabled={sharing} title="Поделиться">
            {sharing ? '...' : 'Поделиться'}
          </button>

          {/* Copy comments */}
          <button className={styles.topBarBtn} onClick={copyComments} title="Копировать комментарии в буфер">
            Копировать комментарии в буфер
          </button>

          <input ref={yamlFileRef} type="file" accept=".yaml,.yml" style={{ display: 'none' }}
            onChange={onUploadYamlFile} />

          {/* Comment mode */}
          <button
            className={`${styles.btnComment} ${commentMode ? styles['btnComment--active'] : ''}`}
            onClick={() => {
              if (!commentMode && !checkIdentity()) return
              setCommentMode(v => !v)
            }}
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

      {commentError && (
        <div className={styles.commentError}>{commentError}</div>
      )}

      {/* Copy toast */}
      {copyToast && (
        <div className={styles.copyToast}>{toastMsg}</div>
      )}

      {/* Identity modal */}
      {showIdentityModal && (
        <div className={styles.yamlOverlay} onClick={() => setShowIdentityModal(false)}>
          <div className={styles.yamlModal} onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className={styles.yamlHeader}>
              <span className={styles.yamlTitle}>Представьтесь, пожалуйста</span>
              <button className={styles.yamlClose} onClick={() => setShowIdentityModal(false)}>✕</button>
            </div>
            <div className={styles.yamlBody} style={{ padding: '16px 20px' }}>
              <p style={{ margin: '0 0 12px', fontSize: 14, color: '#64748b' }}>
                Анонимные комментарии запрещены. Укажите имя и фамилию.
              </p>
              <input className={styles.identityInput} placeholder="Имя" value={modalFirstName}
                onChange={e => setModalFirstName(e.target.value)}
                style={{ marginBottom: 8, width: '100%', boxSizing: 'border-box' }} autoFocus />
              <input className={styles.identityInput} placeholder="Фамилия" value={modalLastName}
                onChange={e => setModalLastName(e.target.value)}
                style={{ marginBottom: 12, width: '100%', boxSizing: 'border-box' }} />
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
                style={{ opacity: (!modalFirstName.trim() || !modalLastName.trim()) ? 0.5 : 1 }}
              >Продолжить</button>
            </div>
          </div>
        </div>
      )}

      {/* Share modal */}
      {shareOpen && (
        <div className={styles.yamlOverlay} onClick={() => setShareOpen(false)}>
          <div className={styles.yamlModal} onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className={styles.yamlHeader}>
              <span className={styles.yamlTitle}>Поделиться</span>
              <button className={styles.yamlClose} onClick={() => setShareOpen(false)}>✕</button>
            </div>
            <div className={styles.yamlBody} style={{ padding: '16px 20px' }}>
              <p style={{ margin: '0 0 8px', fontSize: 14 }}>
                Версия {getCurrentVersionNumber()} · {localBranchTitle}
              </p>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
                По этой ссылке можно просматривать страницу и оставлять комментарии.
              </p>
              <input
                className={styles.identityInput}
                value={shareUrl}
                readOnly
                style={{ width: '100%', boxSizing: 'border-box', cursor: 'pointer' }}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
            </div>
            <div className={styles.yamlFooter}>
              <div style={{ flex: 1 }} />
              <button className={`${styles.yamlBtn} ${styles.yamlBtnCopy}`} onClick={copyShareUrl}>
                Копировать ссылку
              </button>
            </div>
          </div>
        </div>
      )}

      {/* YAML modal */}
      {yamlOpen && (
        <div className={styles.yamlOverlay} onClick={() => setYamlOpen(false)}>
          <div className={styles.yamlModal} onClick={e => e.stopPropagation()}>
            <div className={styles.yamlHeader}>
              <span className={styles.yamlTitle}>YAML — {localBranchTitle}</span>
              <button className={styles.yamlClose} onClick={() => setYamlOpen(false)}>✕</button>
            </div>
            {yamlError && <div className={styles.yamlError}>{yamlError}</div>}
            <div className={styles.yamlBody}>
              <textarea className={styles.yamlTextarea} value={yamlText}
                onChange={e => { setYamlText(e.target.value); setYamlError(null) }}
                spellCheck={false} />
            </div>
            <div className={styles.yamlFooter}>
              <button className={`${styles.yamlBtn} ${styles.yamlBtnApply}`} onClick={applyYaml}>Применить</button>
              <button className={`${styles.yamlBtn} ${styles.yamlBtnUpload}`}
                onClick={() => yamlFileRef.current?.click()}>Загрузить файл</button>
              <div style={{ flex: 1 }} />
              <button className={`${styles.yamlBtn} ${styles.yamlBtnCopy} ${yamlCopied ? styles.yamlBtnCopied : ''}`}
                onClick={copyYaml}>{yamlCopied ? '✓ Скопировано' : 'Скопировать'}</button>
              <button className={`${styles.yamlBtn} ${styles.yamlBtnDownload}`}
                onClick={downloadYaml}>Скачать .yaml</button>
            </div>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className={styles.canvas}>
        <div className={styles.screen}>
          <Renderer screen={localScreenJson} commentMode={commentMode} />
          {slug && (
            <CommentLayer
              slug={slug}
              commentMode={commentMode}
              currentVersionId={currentVersionId}
              firstName={firstName}
              lastName={lastName}
              userRole={userRole}
              comments={commentTree}
              onAdd={async (data) => {
                await addComment(data)
              }}
              onUpdate={async (id, status, rejectReason) => {
                await updateComment(id, status, userRole, rejectReason)
              }}
              onDelete={async (id) => {
                await deleteComment(id)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

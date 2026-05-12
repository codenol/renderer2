import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import yaml from 'js-yaml'
import type { ScreenJSON, UserRole } from '@/renderer/types'
import { Renderer } from '@/renderer/Renderer'
import { CommentLayer } from './CommentLayer'
import { useApiClient } from './apiClient'
import { useAuth } from '@/auth/AuthContext'
import { useSidebarActions } from './SidebarActions'
import { YamlEditorModal } from './YamlEditorModal'
import styles from './BranchView.module.scss'

const BACKEND = 'http://localhost:3001'
const ROLE_LABELS: Record<UserRole, string> = {
  designer: 'Дизайнер', analyst: 'Аналитик', pm: 'ПО',
  frontend: 'Фронтенд', backend: 'Бэкенд', qa: 'QA', guest: 'Гость',
}

export function BranchView() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { setActions } = useSidebarActions()
  const userRole = user?.role ?? 'guest'
  const firstName = user?.firstName ?? ''
  const lastName = user?.lastName ?? ''

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
  const localBranchTitle = branchTitle

  const [commentMode, setCommentMode] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [copyToast, setCopyToast] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [commentError, setCommentError] = useState<string | null>(null)

  // ─── YAML modal ──────────────────────────────────────────────────────────
  const [yamlOpen, setYamlOpen] = useState(false)
  const [yamlText, setYamlText] = useState('')
  const [yamlCopied, setYamlCopied] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)

  // ─── Version dropdown ─────────────────────────────────────────────────────
  const [versionOpen, setVersionOpen] = useState(false)
  const versionRef = useRef<HTMLDivElement>(null)

  // ─── Share ────────────────────────────────────────────────────────────────
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [sharing, setSharing] = useState(false)

  // ─── Register sidebar actions ─────────────────────────────────────────────
  useEffect(() => {
    setActions({
      commentMode,
      onToggleComment: () => {
        if (userRole === 'guest') return
        setCommentMode(v => !v)
      },
      onOpenShare: () => { handleShare() },
      onOpenYaml: () => { openYamlModal() },
    })
    return () => setActions(null)
  }, [commentMode, userRole, slug, localScreenJson, currentVersionId])

  // ─── Close dropdowns ──────────────────────────────────────────────────────
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (versionRef.current && !versionRef.current.contains(e.target as Node)) setVersionOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // ─── Escape key ──────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setCommentMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ─── Toast on comment mode ────────────────────────────────────────────────
  useEffect(() => {
    if (commentMode) showToast('Режим комментариев — кликните на элемент экрана · Esc — выйти')
  }, [commentMode])

  function showToast(msg: string) {
    setToastMsg(msg)
    setCopyToast(true)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setCopyToast(false), 3000)
  }

  function getCurrentVersionNumber(): number {
    return versions.find(v => v.id === currentVersionId)?.versionNumber || 1
  }

  async function switchVersion(versionId: number) {
    setVersionOpen(false)
    if (versionId === currentVersionId) return
    setCurrentVersionId(versionId)
    try {
      const token = localStorage.getItem('skala_access_token')
      const res = await fetch(`${BACKEND}/api/branches/${slug}/versions/${versionId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) return
      setApiScreenJson((await res.json()).screen)
    } catch {}
  }

  // ─── YAML helpers ────────────────────────────────────────────────────────
  function getYamlContent(): string {
    if (!localScreenJson) return ''
    try {
      return yaml.dump(localScreenJson, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false, indent: 2 })
    } catch { return JSON.stringify(localScreenJson, null, 2) }
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
    try { parsed = yaml.load(yamlText, { schema: yaml.FAILSAFE_SCHEMA }) } catch (e) {
      setYamlError(e instanceof Error ? e.message : 'Ошибка парсинга YAML'); return
    }
    if (!parsed || typeof parsed !== 'object') { setYamlError('YAML должен содержать объект'); return }
    const json = parsed as ScreenJSON
    if (!json.pages || !Array.isArray(json.pages)) { setYamlError('YAML должен содержать раздел pages'); return }

    if (slug && connected && userRole === 'designer') {
      const token = localStorage.getItem('skala_access_token')
      try {
        const res = await fetch(`${BACKEND}/api/branches/${slug}/versions`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/yaml', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: yamlText,
        })
        if (res.ok) { const v = await res.json(); setCurrentVersionId(v.id); showToast(`Версия ${v.versionNumber} создана`) }
        else setApiScreenJson(json)
      } catch { setApiScreenJson(json) }
    } else { setApiScreenJson(json) }
    setYamlOpen(false)
  }

  function copyYaml() { navigator.clipboard.writeText(yamlText); setYamlCopied(true); setTimeout(() => setYamlCopied(false), 2000) }
  function downloadYaml() {
    const blob = new Blob([yamlText], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${slug}-v${getCurrentVersionNumber()}.yaml`; a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Share ────────────────────────────────────────────────────────────────
  async function handleShare() {
    if (!currentVersionId) return
    setSharing(true)
    try {
      const result = await createShare(currentVersionId)
      setShareUrl(`${window.location.origin}/share/${result.token}`)
      setShareOpen(true)
    } catch { showToast('Ошибка создания ссылки') }
    finally { setSharing(false) }
  }

  function copyShareUrl() { navigator.clipboard.writeText(shareUrl); setShareOpen(false); showToast('Ссылка скопирована') }

  // ─── Copy comments ────────────────────────────────────────────────────────
  function copyComments() {
    const currentComments = comments.filter(c => c.versionId === currentVersionId)
    if (!currentComments.length) { navigator.clipboard.writeText('Нет комментариев.'); return }
    let text = `=== ${localBranchTitle} (v${getCurrentVersionNumber()}) ===\n\n`
    currentComments.forEach((c, i) => {
      const label = ROLE_LABELS[c.role]
      const st = c.status === 'resolved' ? ' ✓' : c.status === 'rejected' ? ` ✗ ${c.rejectReason}` : ''
      text += `${i + 1}. [${label} · ${c.author}]${st}\n${c.nodeId ? `   #${c.nodeId}\n` : ''}   "${c.text}"\n   ${new Date(c.createdAt).toLocaleString('ru-RU')}\n\n`
    })
    navigator.clipboard.writeText(text.trim())
    showToast('Скопировано в буфер')
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (apiError && !loading && !localScreenJson) {
    return <div className={styles.error}><div className={styles.errorCode}>404</div><div className={styles.errorText}>{apiError}</div><button className={styles.errorBtn} onClick={() => navigate('/')}>← На главную</button></div>
  }

  if (loading) {
    return <div className={styles.loading}><div className={styles.spinner} /><span>Загружаем экран...</span></div>
  }

  if (!localScreenJson) {
    return <div className={styles.error}><div className={styles.errorCode}>404</div><div className={styles.errorText}>Экран не найден</div><button className={styles.errorBtn} onClick={() => navigate('/')}>← На главную</button></div>
  }

  return (
    <div className={styles.wrap}>
      {commentError && <div className={styles.commentError}>{commentError}</div>}
      {copyToast && <div className={styles.copyToast}>{toastMsg}</div>}

      {/* YAML modal */}
      <YamlEditorModal
        open={yamlOpen}
        onClose={() => setYamlOpen(false)}
        title={`YAML — ${localBranchTitle}`}
        yamlText={yamlText}
        onYamlChange={t => { setYamlText(t); setYamlError(null) }}
        yamlError={yamlError || ''}
        onSubmit={applyYaml}
        submitLabel="Применить"
        submitting={false}
        showCopyDownload
        onCopy={copyYaml}
        copied={yamlCopied}
        onDownload={downloadYaml}
        onFileSelect={text => { setYamlText(text); setYamlError(null) }}
      />

      {/* Share modal */}
      {shareOpen && (
        <div className={styles.yamlOverlay} onClick={() => setShareOpen(false)}>
          <div className={styles.yamlModal} onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className={styles.yamlHeader}><span className={styles.yamlTitle}>Поделиться</span><button className={styles.yamlClose} onClick={() => setShareOpen(false)}>✕</button></div>
              <div className={styles.yamlBody} style={{ padding: '16px 20px' }}>
                <p style={{ margin: '0 0 8px', fontSize: 14 }}>Версия {getCurrentVersionNumber()} · {localBranchTitle}</p>
                <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.6 }}>По этой ссылке можно просматривать страницу и оставлять комментарии.</p>
                <input className={styles.identityInput} value={shareUrl} readOnly style={{ cursor: 'pointer' }} onClick={(e) => (e.target as HTMLInputElement).select()} />
            </div>
            <div className={styles.yamlFooter}><div style={{ flex: 1 }} /><button className={`${styles.yamlBtn} ${styles.yamlBtnCopy}`} onClick={copyShareUrl}>Копировать ссылку</button></div>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className={styles.canvas}>
        <div className={`${styles.screen} ${commentMode ? styles['screen--comment'] : ''}`}>
          <Renderer screen={localScreenJson} commentMode={commentMode} />
          {slug && (
            <CommentLayer
              slug={slug} commentMode={commentMode} currentVersionId={currentVersionId}
              firstName={firstName} lastName={lastName} userRole={userRole}
              comments={commentTree}
              onAdd={async (data) => { await addComment(data) }}
              onUpdate={async (id, status, rejectReason) => { await updateComment(id, status, userRole, rejectReason) }}
              onDelete={async (id) => { await deleteComment(id) }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

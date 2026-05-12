import { useState, useCallback, useRef } from 'react'
import type { Comment, UserRole } from '@/renderer/types'
import styles from './CommentLayer.module.scss'

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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?'
}

const POPUP_HEIGHT = 220

interface Pending {
  x: number   // % on canvas
  y: number   // % on canvas
  vx: number  // viewport px (for fixed popup)
  vy: number  // viewport px
  flipDown: boolean
  nodeId?: string
}

interface CommentLayerProps {
  slug: string
  commentMode: boolean
  currentVersionId: number
  firstName: string
  lastName: string
  userRole: UserRole
  comments: Comment[]
  onAdd: (data: {
    versionId: number; nodeId?: string; x?: number; y?: number
    text: string; author: string; role: UserRole
  }) => Promise<void>
  onUpdate: (id: number, status: 'resolved' | 'rejected', rejectReason?: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

export function CommentLayer({
  commentMode, currentVersionId,
  firstName, lastName, userRole,
  comments, onAdd, onUpdate, onDelete,
}: CommentLayerProps) {
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Аноним'
  const [pending, setPending] = useState<Pending | null>(null)
  const [text, setText] = useState('')
  const [activeComment, setActiveComment] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Reject flow: store which comment is being rejected + reason text
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [rejectText, setRejectText] = useState('')

  const popupRef = useRef<HTMLDivElement>(null)

  // ─── Click to place comment ──────────────────────────────────────────────
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!commentMode) return
    if (popupRef.current?.contains(e.target as Node)) return
    if ((e.target as HTMLElement).closest('[data-comment-marker]')) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    const nodeEl = (e.target as HTMLElement).closest('[data-node-id]')
    const nodeId = nodeEl?.getAttribute('data-node-id') ?? undefined

    const flipDown = e.clientY < POPUP_HEIGHT + 24
    setPending({ x, y, vx: e.clientX, vy: e.clientY, flipDown, nodeId })
    setActiveComment(null)
    setRejectingId(null)
  }, [commentMode])

  // ─── Submit new comment ──────────────────────────────────────────────────
  async function submitComment() {
    if (!text.trim() || !pending) return
    setSubmitting(true)
    try {
      await onAdd({
        versionId: currentVersionId,
        nodeId: pending.nodeId,
        x: pending.x,
        y: pending.y,
        text: text.trim(),
        author: fullName,
        role: userRole,
      })
      setPending(null)
      setText('')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Resolve / reject ────────────────────────────────────────────────────
  async function resolveComment(id: number) {
    await onUpdate(id, 'resolved')
    setActiveComment(null)
  }

  async function rejectComment(id: number) {
    if (!rejectText.trim()) return
    await onUpdate(id, 'rejected', rejectText.trim())
    setRejectingId(null)
    setRejectText('')
    setActiveComment(null)
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  const currentComments = comments.filter(c => c.versionId === currentVersionId)
  const olderComments = comments.filter(c => c.versionId !== currentVersionId)

  const allSorted = [...olderComments, ...currentComments]

  return (
    <div
      className={`${styles.layer} ${commentMode ? styles['layer--active'] : ''}`}
      onClick={handleClick}
    >
      {/* Existing comment markers */}
      {allSorted.map(c => {
        const isCurrent = c.versionId === currentVersionId
        const isOpen = c.status === 'open'

        return (
          <div
            key={c.id}
            data-comment-marker
            className={`${styles.marker} ${!isCurrent ? styles['marker--old'] : ''} ${c.status !== 'open' ? styles[`marker--${c.status}`] : ''}`}
            style={{
              left: `${c.x ?? 50}%`,
              top: `${c.y ?? 50}%`,
              background: ROLE_COLORS[c.role],
            }}
            onClick={e => {
              e.stopPropagation()
              setActiveComment(activeComment === c.id ? null : c.id)
              setPending(null)
              setRejectingId(null)
              setRejectText('')
            }}
          >
            {c.status === 'resolved' ? '✓' : c.status === 'rejected' ? '✗' : getInitials(c.author)}

            {/* Version badge for old comments */}
            {!isCurrent && (
              <span className={styles.markerVersionBadge}>v{c.versionNumber}</span>
            )}

            {/* Tooltip */}
            {activeComment === c.id && (
              <div
                className={styles.markerTooltip}
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div className={styles.tooltipHeader}>
                  <span
                    className={styles.tooltipDot}
                    style={{ background: ROLE_COLORS[c.role] }}
                  />
                  <span className={styles.tooltipRole} style={{ color: ROLE_COLORS[c.role] }}>
                    {ROLE_LABELS[c.role]}
                  </span>
                  <span className={styles.tooltipAuthor}>{c.author}</span>
                  {!isCurrent && (
                    <span className={styles.tooltipVersion}>v{c.versionNumber}</span>
                  )}
                  <button
                    className={styles.tooltipDelete}
                    onClick={() => { onDelete(c.id); setActiveComment(null) }}
                    title="Удалить"
                  >✕</button>
                </div>

                {/* Text */}
                <div className={styles.tooltipText}>{c.text}</div>

                {/* Node */}
                {c.nodeId && (
                  <div className={styles.tooltipNode}>
                    Элемент: <code>#{c.nodeId}</code>
                  </div>
                )}

                {/* Date */}
                <div className={styles.tooltipDate}>
                  {new Date(c.createdAt).toLocaleString('ru-RU')}
                </div>

                {/* Status badge for resolved/rejected */}
                {c.status === 'resolved' && (
                  <div className={styles.statusResolved}>✓ Выполнено</div>
                )}
                {c.status === 'rejected' && (
                  <div className={styles.statusRejected}>
                    ✗ Отклонено{c.rejectReason ? `: ${c.rejectReason}` : ''}
                  </div>
                )}

                {/* Actions for open comments */}
                {isOpen && rejectingId !== c.id && (
                  <div className={styles.tooltipActions}>
                    <button
                      className={styles.btnResolve}
                      onClick={() => resolveComment(c.id)}
                    >
                      ✓ Выполнено
                    </button>
                    <button
                      className={styles.btnReject}
                      onClick={() => { setRejectingId(c.id); setRejectText('') }}
                    >
                      ✗ Отклонить
                    </button>
                  </div>
                )}

                {/* Reject form */}
                {isOpen && rejectingId === c.id && (
                  <div className={styles.rejectForm}>
                    <textarea
                      className={styles.rejectInput}
                      placeholder="Причина отклонения..."
                      value={rejectText}
                      onChange={e => setRejectText(e.target.value)}
                      rows={2}
                      autoFocus
                    />
                    <div className={styles.rejectActions}>
                      <button
                        className={styles.rejectCancel}
                        onClick={() => { setRejectingId(null); setRejectText('') }}
                      >
                        Отмена
                      </button>
                      <button
                        className={styles.rejectSubmit}
                        onClick={() => rejectComment(c.id)}
                        disabled={!rejectText.trim()}
                      >
                        Отклонить
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* New comment popup */}
      {pending && (
        <div
          ref={popupRef}
          className={`${styles.popup} ${pending.flipDown ? styles['popup--down'] : ''}`}
          style={{ left: pending.vx, top: pending.vy }}
          onClick={e => e.stopPropagation()}
        >
          {/* Who's commenting */}
          <div className={styles.popupWho}>
            <span
              className={styles.popupWhoRole}
              style={{ background: ROLE_COLORS[userRole] }}
            />
            <span className={styles.popupWhoName}>{fullName}</span>
            <span className={styles.popupWhoRoleLabel}>{ROLE_LABELS[userRole]}</span>
          </div>

          {pending.nodeId && (
            <div className={styles.popupNode}>
              Элемент: <code>#{pending.nodeId}</code>
            </div>
          )}

          <textarea
            className={styles.popupTextarea}
            placeholder="Комментарий..."
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && e.metaKey) submitComment()
              if (e.key === 'Escape') setPending(null)
            }}
          />

          <div className={styles.popupActions}>
            <button className={styles.popupCancel} onClick={() => setPending(null)}>Отмена</button>
            <button
              className={styles.popupSubmit}
              onClick={submitComment}
              disabled={!text.trim() || submitting}
            >
              {submitting ? '...' : 'Отправить'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react'
import type { Comment, CommentTree, UserRole } from '@/renderer/types'
import styles from './CommentLayer.module.scss'

const BACKEND = 'http://localhost:3001'

const ROLE_LABELS: Record<UserRole, string> = {
  designer: 'Дизайнер',
  analyst: 'Аналитик',
  pm: 'ПО',
  frontend: 'Фронтенд',
  backend: 'Бэкенд',
  qa: 'QA',
  guest: 'Гость',
}

const ROLE_COLORS: Record<UserRole, string> = {
  designer: '#8b5cf6',
  analyst: '#2d98b4',
  pm: '#f59e0b',
  frontend: '#f472b6',
  backend: '#4ade80',
  qa: '#ef4444',
  guest: '#94a3b8',
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?'
}

function flattenCommentTree(tree: CommentTree[]): Comment[] {
  const result: Comment[] = []
  const walk = (items: CommentTree[]) => {
    for (const item of items) {
      const { replies, ...rest } = item
      result.push(rest)
      if (replies && replies.length > 0) walk(replies)
    }
  }
  walk(tree)
  return result
}

function getReplyCount(tree: CommentTree[]): number {
  let count = 0
  for (const item of tree) {
    if (item.replies && item.replies.length > 0) {
      count += item.replies.length
      count += getReplyCount(item.replies)
    }
  }
  return count
}

interface Pending {
  x: number
  y: number
  vx: number
  vy: number
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
  comments: CommentTree[]
  onAdd: (data: {
    versionId: number
    parentId?: number | null
    nodeId?: string
    x?: number
    y?: number
    text: string
    author: string
    role: UserRole
  }) => Promise<void>
  onUpdate: (id: number, status: 'resolved' | 'rejected', rejectReason?: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

export function CommentLayer({
  slug,
  commentMode, currentVersionId,
  firstName, lastName, userRole,
  comments: commentTree, onAdd, onUpdate, onDelete,
}: CommentLayerProps) {
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Аноним'
  const isDesigner = userRole === 'designer'

  // ─── New comment popup state ──────────────────────────────────────────────
  const [pending, setPending] = useState<Pending | null>(null)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ─── Active tooltip state ─────────────────────────────────────────────────
  const [activeComment, setActiveComment] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null)
  const [tooltipVisible, setTooltipVisible] = useState(false)

  // ─── Reject state ─────────────────────────────────────────────────────────
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [rejectText, setRejectText] = useState('')

  // ─── Inline reply state ───────────────────────────────────────────────────
  const [replyText, setReplyText] = useState('')
  const [replySubmitting, setReplySubmitting] = useState(false)

  // ─── Refs ─────────────────────────────────────────────────────────────────
  const popupRef = useRef<HTMLDivElement>(null)
  const markerRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const tooltipRef = useRef<HTMLDivElement>(null)

  // ─── Flatten comments (needed early for LLM init) ─────────────────────────
  const allComments = flattenCommentTree(commentTree)
  const flatMap = new Map<number, Comment>()
  for (const c of allComments) flatMap.set(c.id, c)

  // ─── LLM toggle state ─────────────────────────────────────────────────────
  const [llmIds, setLlmIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    const ids = new Set<number>()
    for (const c of allComments) {
      if (c.isLLM) ids.add(c.id)
    }
    setLlmIds(ids)
  }, [commentTree])

  async function toggleLLM(id: number) {
    const isLLM = !llmIds.has(id)
    setLlmIds(prev => {
      const next = new Set(prev)
      isLLM ? next.add(id) : next.delete(id)
      return next
    })
    const token = localStorage.getItem('skala_access_token')
    await fetch(`${BACKEND}/api/branches/${slug}/comments/${id}/llm`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ isLlm: isLLM }),
    })
  }

  // ─── Tooltip positioning: measure real height ─────────────────────────────
  useLayoutEffect(() => {
    if (activeComment === null || !tooltipRef.current) {
      setTooltipPos(null)
      setTooltipVisible(false)
      return
    }
    const markerEl = markerRefs.current.get(activeComment)
    if (!markerEl) return

    const markerRect = markerEl.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    const tooltipHeight = tooltipRect.height
    const tooltipWidth = tooltipRect.width
    const margin = 12

    const centerX = markerRect.left + markerRect.width / 2
    const spaceAbove = markerRect.top - margin
    const spaceBelow = window.innerHeight - markerRect.bottom - margin

    let left = centerX - tooltipWidth / 2
    left = Math.max(margin, Math.min(window.innerWidth - margin - tooltipWidth, left))

    let top: number
    if (spaceBelow >= tooltipHeight) {
      top = markerRect.bottom + margin
    } else if (spaceAbove >= tooltipHeight) {
      top = markerRect.top - tooltipHeight - margin
    } else {
      top = Math.max(margin, window.innerHeight - margin - tooltipHeight)
    }

    setTooltipPos({ left, top })
    setTooltipVisible(true)
  }, [activeComment])

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

    const popupWidth = 280
    const popupHeight = 260
    const margin = 16
    const vx = Math.max(margin + popupWidth / 2, Math.min(window.innerWidth - margin - popupWidth / 2, e.clientX))
    const vy = Math.max(margin, Math.min(window.innerHeight - margin - popupHeight, e.clientY))

    const flipDown = e.clientY < popupHeight + 24
    setPending({ x, y, vx, vy, flipDown, nodeId })
    setActiveComment(null)
    setRejectingId(null)
    setReplyText('')
  }, [commentMode])

  // ─── Submit new comment ──────────────────────────────────────────────────
  async function submitComment() {
    if (!text.trim() || !pending) return
    setSubmitting(true)
    try {
      await onAdd({
        versionId: currentVersionId,
        parentId: null,
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

  // ─── Submit inline reply ─────────────────────────────────────────────────
  async function submitReply(parentId: number) {
    if (!replyText.trim()) return
    setReplySubmitting(true)
    try {
      await onAdd({
        versionId: currentVersionId,
        parentId,
        text: replyText.trim(),
        author: fullName,
        role: userRole,
      })
      setReplyText('')
    } finally {
      setReplySubmitting(false)
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

  // ─── Build marker list with thread awareness ─────────────────────────────
  function collectCommentsForMarkers(tree: CommentTree[], versionId: number): Comment[] {
    const result: Comment[] = []
    for (const item of tree) {
      const { replies, ...rest } = item
      if (rest.versionId === versionId || !rest.parentId) {
        result.push(rest)
      }
      if (replies) result.push(...collectCommentsForMarkers(replies, versionId))
    }
    return result
  }

  const currentComments = collectCommentsForMarkers(commentTree, currentVersionId)
  const olderComments = allComments.filter(c => c.versionId !== currentVersionId && !c.parentId)
  const allSorted = [...olderComments, ...currentComments]

  function countReplies(cid: number): number {
    const item = flatMap.get(cid)
    if (!item) return 0
    const treeItem = findInTree(commentTree, cid)
    if (!treeItem?.replies) return 0
    return getReplyCount(treeItem.replies) + treeItem.replies.length
  }

  function findInTree(tree: CommentTree[], id: number): CommentTree | null {
    for (const item of tree) {
      if (item.id === id) return item
      if (item.replies) {
        const found = findInTree(item.replies, id)
        if (found) return found
      }
    }
    return null
  }

  // ─── Render replies in tooltip ───────────────────────────────────────────
  function renderReplies(parentId: number, depth: number = 1) {
    if (depth > 3) return null
    const replies = allComments.filter(c => c.parentId === parentId)
    if (!replies.length) return null
    return (
      <div className={styles.threadReplies}>
        {replies.map(r => {
          const isOpen = r.status === 'open'
          return (
            <div key={r.id} className={styles.threadReply}>
              <div className={styles.replyHeader}>
                <span className={styles.replyDot} style={{ background: ROLE_COLORS[r.role] }} />
                <span className={styles.replyRole} style={{ color: ROLE_COLORS[r.role] }}>
                  {ROLE_LABELS[r.role]}
                </span>
                <span className={styles.replyAuthor}>{r.author}</span>
                <span className={styles.replyDate}>
                  {new Date(r.createdAt).toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                {isDesigner && (
                  <button
                    className={`${styles.btnLlmMini} ${llmIds.has(r.id) ? styles['btnLlmMini--active'] : ''}`}
                    onClick={() => toggleLLM(r.id)}
                    title={llmIds.has(r.id) ? 'Убрать LLM-пометку' : 'Пометить для LLM'}
                  >
                    ✨
                  </button>
                )}
              </div>
              <div className={styles.replyText}>{r.text}</div>
              {r.status === 'resolved' && <div className={styles.statusResolvedMini}>✓ Выполнено</div>}
              {r.status === 'rejected' && <div className={styles.statusRejectedMini}>✗ Отклонено{r.rejectReason ? `: ${r.rejectReason}` : ''}</div>}
              {isOpen && isDesigner && (
                <div className={styles.replyActions}>
                  <button className={styles.btnResolveMini} onClick={() => resolveComment(r.id)}>✓</button>
                  <button className={styles.btnRejectMini} onClick={() => { setRejectingId(r.id); setRejectText('') }}>✗</button>
                </div>
              )}
              {renderReplies(r.id, depth + 1)}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div
      className={`${styles.layer} ${commentMode ? styles['layer--active'] : ''}`}
      onClick={handleClick}
    >
      {/* Existing comment markers */}
      {allSorted.map(c => {
        const isCurrent = c.versionId === currentVersionId
        const replyCount = countReplies(c.id)

        return (
          <div
            key={c.id}
            ref={el => { if (el) markerRefs.current.set(c.id, el); else markerRefs.current.delete(c.id) }}
            data-comment-marker
            className={`${styles.marker} ${!isCurrent ? styles['marker--old'] : ''} ${c.status !== 'open' ? styles[`marker--${c.status}`] : ''} ${replyCount > 0 ? styles['marker--thread'] : ''}`}
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
              setReplyText('')
            }}
          >
            {c.status === 'resolved' ? '✓' : c.status === 'rejected' ? '✗' : getInitials(c.author)}

            {!isCurrent && (
              <span className={styles.markerVersionBadge}>v{c.versionNumber}</span>
            )}

            {llmIds.has(c.id) && (
              <span className={styles.markerLlmBadge}>✦</span>
            )}

            {replyCount > 0 && (
              <span className={styles.markerReplyBadge}>{replyCount}</span>
            )}
          </div>
        )
      })}

      {/* Active comment tooltip — fixed position, measured height */}
      {activeComment !== null && tooltipPos && (() => {
        const c = allSorted.find(x => x.id === activeComment)
        if (!c) return null
        const isCurrent = c.versionId === currentVersionId
        const isOpen = c.status === 'open'

        return (
          <div
            ref={tooltipRef}
            className={styles.markerTooltip}
            style={{
              left: tooltipPos.left,
              top: tooltipPos.top,
              opacity: tooltipVisible ? 1 : 0,
              pointerEvents: tooltipVisible ? 'auto' : 'none',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className={styles.tooltipHeader}>
              <span className={styles.tooltipDot} style={{ background: ROLE_COLORS[c.role] }} />
              <span className={styles.tooltipRole} style={{ color: ROLE_COLORS[c.role] }}>
                {ROLE_LABELS[c.role]}
              </span>
              <span className={styles.tooltipAuthor}>{c.author}</span>
              {!isCurrent && (
                <span className={styles.tooltipVersion}>v{c.versionNumber}</span>
              )}
              {isDesigner && (
                <button
                  className={`${styles.btnLlm} ${llmIds.has(c.id) ? styles['btnLlm--active'] : ''}`}
                  onClick={() => toggleLLM(c.id)}
                  title={llmIds.has(c.id) ? 'Убрать LLM-пометку' : 'Пометить для LLM'}
                >
                  ✨
                </button>
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

            {/* Status badge */}
            {c.status === 'resolved' && (
              <div className={styles.statusResolved}>✓ Выполнено</div>
            )}
            {c.status === 'rejected' && (
              <div className={styles.statusRejected}>
                ✗ Отклонено{c.rejectReason ? `: ${c.rejectReason}` : ''}
              </div>
            )}

            {/* Thread replies */}
            {renderReplies(c.id)}

            {/* Inline reply (for open comments) */}
            {isOpen && (
              <div className={styles.replyInline}>
                <textarea
                  className={styles.replyInput}
                  placeholder="Ответить..."
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  rows={2}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && e.metaKey) submitReply(c.id)
                    if (e.key === 'Escape') setReplyText('')
                  }}
                />
                <button
                  className={styles.replySubmit}
                  onClick={() => submitReply(c.id)}
                  disabled={!replyText.trim() || replySubmitting}
                >
                  {replySubmitting ? '...' : 'Отправить'}
                </button>
              </div>
            )}

            {/* Actions for open comments (designer only) */}
            {isOpen && rejectingId !== c.id && isDesigner && (
              <div className={styles.tooltipActions}>
                <button className={styles.btnResolve} onClick={() => resolveComment(c.id)}>
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
                  >Отмена</button>
                  <button
                    className={styles.rejectSubmit}
                    onClick={() => rejectComment(c.id)}
                    disabled={!rejectText.trim()}
                  >Отклонить</button>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* New comment popup (only for new comments, not replies) */}
      {pending && (
        <div
          ref={popupRef}
          className={`${styles.popup} ${pending.flipDown ? styles['popup--down'] : ''}`}
          style={{ left: pending.vx, top: pending.vy }}
          onClick={e => e.stopPropagation()}
        >
          <div className={styles.popupWho}>
            <span className={styles.popupWhoRole} style={{ background: ROLE_COLORS[userRole] }} />
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

import { useState, useCallback, useRef } from 'react'
import type { Comment, CommentTree, UserRole } from '@/renderer/types'
import styles from './CommentLayer.module.scss'

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

const POPUP_HEIGHT = 220

interface Pending {
  x: number
  y: number
  vx: number
  vy: number
  flipDown: boolean
  nodeId?: string
  parentId?: number | null
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
  commentMode, currentVersionId,
  firstName, lastName, userRole,
  comments: commentTree, onAdd, onUpdate, onDelete,
}: CommentLayerProps) {
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Аноним'
  const isDesigner = userRole === 'designer'
  const [pending, setPending] = useState<Pending | null>(null)
  const [text, setText] = useState('')
  const [activeComment, setActiveComment] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [rejectText, setRejectText] = useState('')

  const popupRef = useRef<HTMLDivElement>(null)

  const allComments = flattenCommentTree(commentTree)
  const flatMap = new Map<number, Comment>()
  for (const c of allComments) flatMap.set(c.id, c)

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

    // Clamp popup to viewport
    const popupWidth = 280
    const popupHeight = 260
    const margin = 16
    const vx = Math.max(margin + popupWidth / 2, Math.min(window.innerWidth - margin - popupWidth / 2, e.clientX))
    const vy = Math.max(margin, Math.min(window.innerHeight - margin - popupHeight, e.clientY))

    const flipDown = e.clientY < popupHeight + 24
    setPending({ x, y, vx, vy, flipDown, nodeId, parentId: null })
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
        parentId: pending.parentId,
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

  // ─── Reply handler ───────────────────────────────────────────────────────
  function startReply(parentComment: Comment) {
    setActiveComment(null)
    setPending({
      x: parentComment.x ?? 50,
      y: parentComment.y ?? 50,
      vx: Math.min(window.innerWidth - 360, Math.max(280, window.innerWidth / 2)),
      vy: Math.min(window.innerHeight - 300, Math.max(100, window.innerHeight / 3)),
      flipDown: false,
      nodeId: parentComment.nodeId,
      parentId: parentComment.id,
    })
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

  // Count replies for a comment
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
      <div className={styles.threadReplies} style={{ marginLeft: depth === 1 ? 0 : 0 }}>
        {replies.map(r => {
          const isOpen = r.status === 'open'
          return (
            <div key={r.id} className={styles.threadReply}>
              <div className={styles.tooltipHeader} style={{ padding: '6px 8px 4px' }}>
                <span className={styles.tooltipDot} style={{ background: ROLE_COLORS[r.role] }} />
                <span className={styles.tooltipRole} style={{ color: ROLE_COLORS[r.role], fontSize: 11 }}>
                  {ROLE_LABELS[r.role]}
                </span>
                <span className={styles.tooltipAuthor} style={{ fontSize: 11 }}>{r.author}</span>
                <span className={styles.tooltipDate} style={{ fontSize: 10, marginLeft: 'auto' }}>
                  {new Date(r.createdAt).toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className={styles.tooltipText} style={{ fontSize: 12, padding: '4px 8px 4px' }}>{r.text}</div>
              {r.status === 'resolved' && <div className={styles.statusResolved} style={{ fontSize: 11, padding: '2px 8px' }}>✓ Выполнено</div>}
              {r.status === 'rejected' && <div className={styles.statusRejected} style={{ fontSize: 11, padding: '2px 8px' }}>✗ Отклонено{r.rejectReason ? `: ${r.rejectReason}` : ''}</div>}
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
        const isOpen = c.status === 'open'
        const replyCount = countReplies(c.id)

        return (
          <div
            key={c.id}
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
            }}
          >
            {c.status === 'resolved' ? '✓' : c.status === 'rejected' ? '✗' : getInitials(c.author)}

            {!isCurrent && (
              <span className={styles.markerVersionBadge}>v{c.versionNumber}</span>
            )}

            {replyCount > 0 && (
              <span className={styles.markerReplyBadge}>{replyCount}</span>
            )}

            {/* Tooltip */}
            {activeComment === c.id && (
              <div
                className={styles.markerTooltip}
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

                {/* Thread replies */}
                {renderReplies(c.id)}

                {/* Actions for open comments */}
                {isOpen && rejectingId !== c.id && (
                  <div className={styles.tooltipActions}>
                    {isDesigner && (
                      <>
                        <button className={styles.btnResolve} onClick={() => resolveComment(c.id)}>
                          ✓ Выполнено
                        </button>
                        <button
                          className={styles.btnReject}
                          onClick={() => { setRejectingId(c.id); setRejectText('') }}
                        >
                          ✗ Отклонить
                        </button>
                      </>
                    )}
                    <button className={styles.btnReply} onClick={() => startReply(c)}>
                      ↩ Ответить
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
            )}
          </div>
        )
      })}

      {/* New comment / Reply popup */}
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
            {pending.parentId && (
              <span className={styles.popupReplyLabel}>→ ответ</span>
            )}
          </div>

          {pending.nodeId && (
            <div className={styles.popupNode}>
              Элемент: <code>#{pending.nodeId}</code>
            </div>
          )}

          <textarea
            className={styles.popupTextarea}
            placeholder={pending.parentId ? 'Ответ..."' : 'Комментарий...'}
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

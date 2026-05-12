import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { Comment, CommentTree, ScreenJSON, BranchVersion, UserRole, WsEvent, AddCommentData, ApiClient } from '@/renderer/types'

const BACKEND = 'http://localhost:3001'

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('skala_access_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function buildTree(comments: Comment[]): CommentTree[] {
  const roots: CommentTree[] = []
  const map = new Map<number, CommentTree>()
  for (const c of comments) {
    map.set(c.id, { ...c, replies: [] })
  }
  for (const c of comments) {
    const node = map.get(c.id)!
    if (c.parentId !== null && c.parentId !== undefined && map.has(c.parentId)) {
      map.get(c.parentId)!.replies!.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

export function useApiClient(branchSlug: string): ApiClient {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [branchTitle, setBranchTitle] = useState('')
  const [screenJson, setScreenJson] = useState<ScreenJSON | null>(null)
  const [versions, setVersions] = useState<BranchVersion[]>([])
  const [currentVersionId, setCurrentVersionId] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)

  const commentTree = useMemo(() => buildTree(comments), [comments])

  // ─── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!branchSlug) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const [branchRes, commentsRes, versionsRes] = await Promise.all([
          fetch(`${BACKEND}/api/branches/${branchSlug}`, { headers: getAuthHeaders() }),
          fetch(`${BACKEND}/api/branches/${branchSlug}/comments`, { headers: getAuthHeaders() }),
          fetch(`${BACKEND}/api/branches/${branchSlug}/versions`, { headers: getAuthHeaders() }),
        ])

        if (!branchRes.ok) throw new Error(`Branch not found: ${branchRes.status}`)
        const branch = await branchRes.json()

        const commentsData: Comment[] = commentsRes.ok ? await commentsRes.json() : []
        const versionsData: BranchVersion[] = versionsRes.ok ? await versionsRes.json() : []

        if (cancelled) return

        setScreenJson(branch.screen)
        setBranchTitle(branch.title)
        setCurrentVersionId(branch.versionId)
        setComments(commentsData)
        setVersions(versionsData)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Ошибка загрузки')
          // Fallback: try embedded
          const embeddedEl = document.getElementById('embedded-screen')
          const embeddedData = embeddedEl?.textContent?.trim()
          if (embeddedData) {
            try {
              const screen: ScreenJSON = JSON.parse(embeddedData)
              setScreenJson(screen)
              setBranchTitle(screen.meta?.title || 'Без названия')
              setCurrentVersionId(1)
              setVersions([{ id: 1, branchSlug, versionNumber: 1, createdAt: new Date().toISOString() }])
            } catch {}
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [branchSlug])

  // ─── WebSocket ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!branchSlug) return

    const ws = new WebSocket(`ws://localhost:3001/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', branch: branchSlug }))
    }

    ws.onmessage = (event) => {
      let parsed: WsEvent
      try { parsed = JSON.parse(event.data) } catch { return }

      switch (parsed.type) {
        case 'subscribed':
          setConnected(true)
          break
        case 'comment.created':
          setComments(prev => {
            if (prev.some(c => c.id === parsed.payload.id)) return prev
            return [...prev, parsed.payload]
          })
          break
        case 'comment.updated':
          setComments(prev => {
            if (!prev.some(c => c.id === parsed.payload.id)) return prev
            return prev.map(c => c.id === parsed.payload.id ? parsed.payload : c)
          })
          break
        case 'comment.deleted':
          setComments(prev => prev.filter(c => c.id !== parsed.payload.id))
          break
        case 'version.created':
          // Reload versions list
          fetch(`${BACKEND}/api/branches/${branchSlug}/versions`, { headers: getAuthHeaders() })
            .then(r => r.json())
            .then((v: BranchVersion[]) => setVersions(v))
            .catch(() => {})
          break
      }
    }

    ws.onclose = () => { setConnected(false) }

    return () => { ws.close() }
  }, [branchSlug])

  // ─── Mutation functions ───────────────────────────────────────────────────
  const addComment = useCallback(async (data: AddCommentData) => {
    if (!data.author?.trim()) throw new Error('author is required')
    const res = await fetch(`${BACKEND}/api/branches/${branchSlug}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Ошибка создания комментария')
    }
    const created: Comment = await res.json()
    setComments(prev => {
      if (prev.some(c => c.id === created.id)) return prev
      return [...prev, created]
    })
  }, [branchSlug])

  const updateComment = useCallback(async (
    id: number, status: 'resolved' | 'rejected', role: UserRole, rejectReason?: string
  ) => {
    const res = await fetch(`${BACKEND}/api/branches/${branchSlug}/comments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ status, role, rejectReason }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Ошибка обновления')
    }
    const updated: Comment = await res.json()
    setComments(prev => prev.map(c => c.id === updated.id ? updated : c))
  }, [branchSlug])

  const deleteComment = useCallback(async (id: number) => {
    const res = await fetch(`${BACKEND}/api/branches/${branchSlug}/comments/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
    if (!res.ok) throw new Error('Ошибка удаления')
    setComments(prev => prev.filter(c => c.id !== id))
  }, [branchSlug])

  const createShare = useCallback(async (versionId: number) => {
    const res = await fetch(`${BACKEND}/api/branches/${branchSlug}/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ versionId }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Ошибка создания ссылки')
    }
    return res.json()
  }, [branchSlug])

  return {
    comments,
    commentTree,
    loading,
    connected,
    error,
    branchTitle,
    screenJson,
    versions,
    setVersions,
    currentVersionId,
    setCurrentVersionId,
    addComment,
    updateComment,
    deleteComment,
    createShare,
    setScreenJson,
  }
}

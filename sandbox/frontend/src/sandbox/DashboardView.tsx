import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { LIcon } from '@/renderer/components/LIcon'
import styles from './DashboardView.module.scss'

const BACKEND = 'http://localhost:3001'

interface HierarchyFeature {
  slug: string
  title: string
  nodeType: string
  isArchived: boolean
  versionCount: number
  latestVersion: number
  createdAt: string
}

interface HierarchyPage {
  slug: string
  title: string
  nodeType: string
  isArchived: boolean
  createdAt: string
  features: HierarchyFeature[]
}

interface HierarchyProduct {
  slug: string
  title: string
  nodeType: string
  isArchived: boolean
  createdAt: string
  pages: HierarchyPage[]
}

export function DashboardView() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isDesigner = user?.role === 'designer'
  const [products, setProducts] = useState<HierarchyProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedPage, setSelectedPage] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [createType, setCreateType] = useState<'product' | 'page' | 'feature'>('product')
  const [createParentSlug, setCreateParentSlug] = useState('')
  const [createTitle, setCreateTitle] = useState('')
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState('')

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; slug: string; type: string; title: string; isArchived: boolean } | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)

  // Rename dialog
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameSlug, setRenameSlug] = useState('')
  const [renameTitle, setRenameTitle] = useState('')
  const [renameSubmitting, setRenameSubmitting] = useState(false)

  // Delete confirmation
  const [deleteSlug, setDeleteSlug] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const token = localStorage.getItem('skala_access_token')
    try {
      const url = `${BACKEND}/api/hierarchy` + (showArchived ? '?showArchived=true' : '')
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('Failed to load')
      setProducts(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }, [showArchived])

  useEffect(() => { load() }, [load])

  // Close context menu on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
        setCtxMenu(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function toggleExpand(slug: string) {
    const next = new Set(expanded)
    if (next.has(slug)) next.delete(slug); else next.add(slug)
    setExpanded(next)
  }

  function openContext(e: React.MouseEvent, slug: string, type: string, title: string, isArchived: boolean) {
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, slug, type, title, isArchived })
  }

  async function archiveItem(slug: string, archive: boolean) {
    const token = localStorage.getItem('skala_access_token')
    await fetch(`${BACKEND}/api/branches/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ isArchived: archive }),
    })
    setCtxMenu(null)
    load()
  }

  function renameItem(slug: string) {
    setRenameSlug(slug)
    setRenameTitle(ctxMenu?.title || '')
    setCtxMenu(null)
    setRenameOpen(true)
  }

  async function confirmRename() {
    if (!renameTitle.trim()) return
    setRenameSubmitting(true)
    const token = localStorage.getItem('skala_access_token')
    await fetch(`${BACKEND}/api/branches/${renameSlug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ title: renameTitle.trim() }),
    })
    setRenameOpen(false)
    setRenameSubmitting(false)
    load()
  }

  function deleteItem() {
    setDeleteSlug(ctxMenu?.slug || '')
    setCtxMenu(null)
  }

  async function confirmDelete() {
    if (!deleteSlug) return
    const token = localStorage.getItem('skala_access_token')
    await fetch(`${BACKEND}/api/branches/${deleteSlug}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} })
    setDeleteSlug(null)
    load()
  }

  async function handleCreate() {
    if (!createTitle.trim()) return
    setCreateSubmitting(true)
    setCreateError('')
    const token = localStorage.getItem('skala_access_token')
    const endpoint = createType === 'product' ? 'products' : createType === 'page' ? 'pages' : 'features'
    const body: Record<string, string> = { title: createTitle.trim() }
    if (createParentSlug) body.parentSlug = createParentSlug
    try {
      const res = await fetch(`${BACKEND}/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Ошибка') }
      setCreateOpen(false)
      load()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setCreateSubmitting(false)
    }
  }

  function openCreate(type: 'product' | 'page' | 'feature', parentSlug?: string) {
    setCreateType(type)
    setCreateParentSlug(parentSlug || '')
    setCreateTitle('')
    setCreateError('')
    setCreateOpen(true)
  }

  if (loading) {
    return (
      <div className={styles.stateWrap}>
        <div className={styles.spinner} />
        <span>Загружаем...</span>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>Продукты</h1>
        <div className={styles.headerActions}>
          <label className={styles.archiveToggle}>
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            Показать архивные
          </label>
          {isDesigner && (
            <button className={styles.createBtn} onClick={() => openCreate('product')}>
              + Продукт
            </button>
          )}
          </div>
        </div>
      )}

      {/* Rename dialog */}
      {renameOpen && (
        <div className={styles.modalOverlay} onClick={() => setRenameOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Переименовать</span>
              <button className={styles.modalClose} onClick={() => setRenameOpen(false)}>
                <LIcon name="x" size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <input
                className={styles.modalInput}
                placeholder="Новое название"
                value={renameTitle}
                onChange={e => setRenameTitle(e.target.value)}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && confirmRename()}
              />
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.modalCancel} onClick={() => setRenameOpen(false)}>Отмена</button>
              <button className={styles.modalSubmit} onClick={confirmRename} disabled={!renameTitle.trim() || renameSubmitting}>
                {renameSubmitting ? '...' : 'Переименовать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteSlug && (
        <div className={styles.modalOverlay} onClick={() => setDeleteSlug(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Удалить</span>
              <button className={styles.modalClose} onClick={() => setDeleteSlug(null)}>
                <LIcon name="x" size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ margin: 0, fontSize: 14 }}>Удалить навсегда? Восстановление невозможно.</p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.modalCancel} onClick={() => setDeleteSlug(null)}>Отмена</button>
              <button className={`${styles.modalSubmit}`}
                style={{ background: '#dc2626' }}
                onClick={confirmDelete}
              >Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* Create dialog */}
      {createOpen && (
        <div className={styles.modalOverlay} onClick={() => setCreateOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>
                {createType === 'product' ? 'Новый продукт' : createType === 'page' ? 'Новая страница' : 'Новая фича'}
              </span>
              <button className={styles.modalClose} onClick={() => setCreateOpen(false)}>
                <LIcon name="x" size={18} />
              </button>
            </div>
            {createError && <div className={styles.error}>{createError}</div>}
            <div className={styles.modalBody}>
              <input
                className={styles.modalInput}
                placeholder="Название"
                value={createTitle}
                onChange={e => setCreateTitle(e.target.value)}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.modalCancel} onClick={() => setCreateOpen(false)}>Отмена</button>
              <button className={styles.modalSubmit} onClick={handleCreate} disabled={!createTitle.trim() || createSubmitting}>
                {createSubmitting ? '...' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

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

  async function renameItem(slug: string) {
    const name = window.prompt('Новое название:', ctxMenu?.title || '')
    if (!name?.trim() || name.trim() === ctxMenu?.title) { setCtxMenu(null); return }
    const token = localStorage.getItem('skala_access_token')
    await fetch(`${BACKEND}/api/branches/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ title: name.trim() }),
    })
    setCtxMenu(null)
    load()
  }

  async function deleteItem(slug: string) {
    if (!window.confirm('Удалить навсегда?')) { setCtxMenu(null); return }
    const token = localStorage.getItem('skala_access_token')
    await fetch(`${BACKEND}/api/branches/${slug}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} })
    setCtxMenu(null)
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

      {error && <div className={styles.error}>{error}</div>}

      {products.length === 0 && !showArchived && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <LIcon name="package" size={48} strokeWidth={1.2} />
          </div>
          <div className={styles.emptyText}>Нет продуктов</div>
          {isDesigner && (
            <button className={styles.createBtn} onClick={() => openCreate('product')}>
              Создать первый продукт
            </button>
          )}
        </div>
      )}

      <div className={styles.list}>
        {products.map(p => {
          const isExp = expanded.has(p.slug)
          return (
            <div key={p.slug} className={`${styles.card} ${p.isArchived ? styles['card--archived'] : ''}`}>
              <div className={styles.cardHeader} onClick={() => toggleExpand(p.slug)}>
                <span className={styles.cardChevron}>
                  <LIcon name={isExp ? 'chevron-down' : 'chevron-right'} size={14} />
                </span>
                <span className={styles.cardIcon}>
                  <LIcon name="package" size={18} strokeWidth={1.6} />
                </span>
                <span className={styles.cardTitle}>{p.title}</span>
                {p.isArchived && <span className={styles.cardBadge}>архив</span>}
                {isDesigner && (
                  <button className={styles.cardMenu} onClick={e => openContext(e, p.slug, 'product', p.title, p.isArchived)}>
                    <LIcon name="more-vertical" size={16} />
                  </button>
                )}
              </div>

              {isExp && (
                <div className={styles.cardChildren}>
                  {p.pages.length === 0 ? (
                    <div className={styles.emptyRow}>
                      <span className={styles.emptyRowText}>Нет страниц</span>
                      {isDesigner && (
                        <button className={styles.createSmall} onClick={() => openCreate('page', p.slug)}>
                          + Страница
                        </button>
                      )}
                    </div>
                  ) : (
                    p.pages.map(pg => {
                      const isPgExp = expanded.has(pg.slug)
                      return (
                        <div key={pg.slug} className={`${styles.subCard} ${pg.isArchived ? styles['card--archived'] : ''}`}>
                          <div className={styles.subCardHeader} onClick={() => toggleExpand(pg.slug)}>
                            <span className={styles.cardChevron}>
                              <LIcon name={isPgExp ? 'chevron-down' : 'chevron-right'} size={14} />
                            </span>
                            <span className={styles.cardIcon}>
                              <LIcon name="file-text" size={18} strokeWidth={1.6} />
                            </span>
                            <span className={styles.cardTitle}>{pg.title}</span>
                            {pg.isArchived && <span className={styles.cardBadge}>архив</span>}
                            {isDesigner && (
                              <>
                                <button className={styles.cardMenu} onClick={e => openContext(e, pg.slug, 'page', pg.title, pg.isArchived)}>
                                  <LIcon name="more-vertical" size={16} />
                                </button>
                              </>
                            )}
                          </div>

                          {isPgExp && (
                            <div className={styles.cardChildren}>
                              {pg.features.length === 0 ? (
                                <div className={styles.emptyRow}>
                                  <span className={styles.emptyRowText}>Нет фич</span>
                                </div>
                              ) : (
                                pg.features.map(f => (
                                  <div
                                    key={f.slug}
                                    className={`${styles.featRow} ${f.isArchived ? styles['card--archived'] : ''}`}
                                    onClick={() => navigate(`/branch/${f.slug}`)}
                                  >
                                    <span className={styles.cardIcon}>
                                      <LIcon name="layout" size={16} strokeWidth={1.6} />
                                    </span>
                                    <span className={styles.featTitle}>{f.title}</span>
                                    {f.versionCount > 0 && (
                                      <span className={styles.featVersion}>
                                        v{f.latestVersion} ({f.versionCount})
                                      </span>
                                    )}
                                    {f.versionCount === 0 && (
                                      <span className={styles.featNoVersion}>нет версий</span>
                                    )}
                                    {isDesigner && (
                                      <button className={styles.cardMenu} onClick={e => openContext(e, f.slug, 'feature', f.title, f.isArchived)}>
                                        <LIcon name="more-vertical" size={16} />
                                      </button>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div ref={ctxRef} className={styles.contextMenu} style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          {ctxMenu.type === 'product' && (
            <button className={styles.contextItem} onClick={() => { setCtxMenu(null); openCreate('page', ctxMenu.slug) }}>
              <LIcon name="file-plus" size={14} strokeWidth={1.6} style={{ marginRight: 8, verticalAlign: 'middle' }} />
              Добавить страницу
            </button>
          )}
          {ctxMenu.type === 'page' && (
            <button className={styles.contextItem} onClick={() => { setCtxMenu(null); openCreate('feature', ctxMenu.slug) }}>
              <LIcon name="clipboard-plus" size={14} strokeWidth={1.6} style={{ marginRight: 8, verticalAlign: 'middle' }} />
              Добавить фичу
            </button>
          )}
          <div className={styles.contextSep} />
          <button className={styles.contextItem} onClick={() => renameItem(ctxMenu.slug)}>
            <LIcon name="edit" size={14} strokeWidth={1.6} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Переименовать
          </button>
          <button className={styles.contextItem} onClick={() => archiveItem(ctxMenu.slug, !ctxMenu.isArchived)}>
            <LIcon name="archive" size={14} strokeWidth={1.6} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            {ctxMenu.isArchived ? 'Разархивировать' : 'Архивировать'}
          </button>
          <button className={`${styles.contextItem} ${styles['contextItem--danger']}`} onClick={() => deleteItem(ctxMenu.slug)}>
            <LIcon name="trash-2" size={14} strokeWidth={1.6} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Удалить
          </button>
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

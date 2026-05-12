import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import yaml from 'js-yaml'
import type { ScreenJSON } from '@/renderer/types'
import { useAuth } from '@/auth/AuthContext'
import { LIcon } from '@/renderer/components/LIcon'
import { YamlEditorModal } from './YamlEditorModal'
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
  versions: { id: number; versionNumber: number; name?: string; isArchived: boolean; createdAt: string }[]
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
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; slug: string; type: string; title: string; isArchived: boolean; versionId?: number } | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)

  // Rename modal
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameSlug, setRenameSlug] = useState('')
  const [renameVersionId, setRenameVersionId] = useState<number | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [renameSubmitting, setRenameSubmitting] = useState(false)

  // Delete modal
  const [deleteSlug, setDeleteSlug] = useState<string | null>(null)

  // Toast
  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToastMsg(msg); setToastVisible(true)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastVisible(false), 3000)
  }

  // Version YAML modal
  const [versionYamlOpen, setVersionYamlOpen] = useState(false)
  const [versionYamlText, setVersionYamlText] = useState('')
  const [versionYamlError, setVersionYamlError] = useState('')
  const [versionYamlFeatureSlug, setVersionYamlFeatureSlug] = useState('')
  const [versionYamlFeatureTitle, setVersionYamlFeatureTitle] = useState('')
  const [versionYamlNextNum, setVersionYamlNextNum] = useState(1)
  const [versionYamlSubmitting, setVersionYamlSubmitting] = useState(false)

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

  function openContext(e: React.MouseEvent, slug: string, type: string, title: string, isArchived: boolean, versionId?: number) {
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, slug, type, title, isArchived, versionId })
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
    setRenameVersionId(null)
    setRenameTitle(ctxMenu?.title || '')
    setCtxMenu(null)
    setRenameOpen(true)
  }

  function renameVersionItem(versionId: number) {
    setRenameVersionId(versionId)
    setRenameSlug('')
    setRenameTitle(ctxMenu?.title || '')
    setCtxMenu(null)
    setRenameOpen(true)
  }

  async function confirmRename() {
    if (renameVersionId) {
      setRenameSubmitting(true)
      const token = localStorage.getItem('skala_access_token')
      await fetch(`${BACKEND}/api/versions/${renameVersionId}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: renameTitle.trim() }),
      })
      setRenameSubmitting(false)
      setRenameOpen(false)
      load()
      return
    }
    if (!renameSlug) return
    setRenameSubmitting(true)
    const token = localStorage.getItem('skala_access_token')
    await fetch(`${BACKEND}/api/branches/${renameSlug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ title: renameTitle.trim() }),
    })
    setRenameSubmitting(false)
    setRenameOpen(false)
    load()
  }

  async function archiveVersion(versionId: number, archive: boolean) {
    const token = localStorage.getItem('skala_access_token')
    await fetch(`${BACKEND}/api/versions/${versionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ isArchived: archive }),
    })
    setCtxMenu(null)
    load()
  }

  async function cloneVersion(versionId: number, branchSlug: string) {
    setCtxMenu(null)
    const token = localStorage.getItem('skala_access_token')
    const getRes = await fetch(`${BACKEND}/api/branches/${branchSlug}/versions/${versionId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!getRes.ok) { showToast('Ошибка клонирования'); return }
    const data = await getRes.json()
    const yamlStr = yaml.dump(data.screen, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false, indent: 2 })
    const postRes = await fetch(`${BACKEND}/api/branches/${branchSlug}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/yaml', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: yamlStr,
    })
    if (postRes.ok) {
      const v = await postRes.json()
      showToast(`Версия ${v.versionNumber} клонирована`)
    } else {
      showToast('Ошибка клонирования')
    }
    load()
  }

  async function downloadVersionYaml(versionId: number, branchSlug: string) {
    setCtxMenu(null)
    const token = localStorage.getItem('skala_access_token')
    const res = await fetch(`${BACKEND}/api/branches/${branchSlug}/versions/${versionId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) { showToast('Ошибка загрузки'); return }
    const data = await res.json()
    const yamlStr = yaml.dump(data.screen, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false, indent: 2 })
    const blob = new Blob([yamlStr], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${branchSlug}-v${data.versionNumber}.yaml`
    a.click()
    URL.revokeObjectURL(url)
  }

  function deleteItem(slug: string) {
    setDeleteSlug(slug)
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

  async function openVersionYaml(slug: string, title: string) {
    const token = localStorage.getItem('skala_access_token')
    let screen
    let nextNum = 1
    try {
      const res = await fetch(`${BACKEND}/api/branches/${slug}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const branch = await res.json()
        nextNum = (branch.versionNumber || 0) + 1
        screen = branch.screen
      }
    } catch {}
    // If feature has no versions yet, create empty template
    if (!screen) {
      screen = {
        meta: { title: title || 'Без названия' },
        pages: [{ id: 'main', path: '/', layout: { type: 'vstack', id: 'root', props: { gap: 16 } } }],
      }
    }
    setVersionYamlFeatureSlug(slug)
    setVersionYamlFeatureTitle(title)
    setVersionYamlNextNum(nextNum)
    try {
      setVersionYamlText(yaml.dump(screen, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false, indent: 2 }))
    } catch {
      setVersionYamlText(JSON.stringify(screen, null, 2))
    }
    setVersionYamlError('')
    setVersionYamlOpen(true)
  }

  async function submitVersionYaml() {
    setVersionYamlError('')
    let parsed: unknown
    try { parsed = yaml.load(versionYamlText, { schema: yaml.FAILSAFE_SCHEMA }) } catch (e) {
      setVersionYamlError(e instanceof Error ? e.message : 'Ошибка парсинга YAML'); return
    }
    if (!parsed || typeof parsed !== 'object') { setVersionYamlError('YAML должен содержать объект'); return }
    const json = parsed as ScreenJSON
    if (!json.pages || !Array.isArray(json.pages)) { setVersionYamlError('YAML должен содержать раздел pages'); return }

    setVersionYamlSubmitting(true)
    const token = localStorage.getItem('skala_access_token')
    try {
      const res = await fetch(`${BACKEND}/api/branches/${versionYamlFeatureSlug}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/yaml', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: versionYamlText,
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || 'Ошибка создания версии')
      }
      await res.json()
      setVersionYamlOpen(false)
      load()
    } catch (err) {
      setVersionYamlError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setVersionYamlSubmitting(false)
    }
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
                                pg.features.map(f => {
                                  const isFExp = expanded.has(f.slug)
                                  return (
                                    <div key={f.slug} className={`${f.isArchived ? styles['card--archived'] : ''}`}>
                                      <div className={styles.subCardHeader} onClick={() => toggleExpand(f.slug)}
                                        style={{ paddingLeft: 54 }}>
                                        <span className={styles.cardChevron}>
                                          <LIcon name={isFExp ? 'chevron-down' : 'chevron-right'} size={14} />
                                        </span>
                                        <span className={styles.cardIcon}>
                                          <LIcon name="layout" size={16} strokeWidth={1.6} />
                                        </span>
                                        <span className={styles.cardTitle}>{f.title}</span>
                                        {f.versionCount > 0 && (
                                          (() => {
                                            const latestV = (f.versions || []).find(v => v.versionNumber === f.latestVersion)
                                            const dateStr = latestV ? new Date(latestV.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
                                            const nameStr = latestV?.name || ''
                                            return <span className={styles.featVersion}>
                                              v{f.latestVersion}{nameStr ? ` — ${nameStr}` : ''} · {dateStr}
                                            </span>
                                          })()
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
                                      {isFExp && (
                                        <div className={styles.cardChildren}>
                                          {(f.versions || []).length === 0 ? (
                                            <div className={styles.emptyRow}>
                                              <span className={styles.emptyRowText}>Нет версий</span>
                                            </div>
                                          ) : (
                                            (f.versions || []).map(v => (
                                              <div
                                                key={v.id}
                                                className={styles.featRow}
                                                onClick={() => navigate(`/branch/${f.slug}`)}
                                                style={{ paddingLeft: 86 }}
                                              >
                                                <LIcon name="git-branch" size={14} style={{ flexShrink: 0, color: 'var(--color-icon-secondary, #9ca3af)' }} />
                                                <span className={styles.featTitle} style={{ flex: 1 }}>Версия {v.versionNumber}{v.name ? ` — ${v.name}` : ''}</span>
                                                <span className={styles.featVersion} style={{ marginRight: 8 }}>
                                                  {new Date(v.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                                {isDesigner && (
                                                  <button className={styles.cardMenu} onClick={e => { e.stopPropagation(); openContext(e, f.slug, 'version', `Версия ${v.versionNumber}`, !!v.isArchived, v.id) }}>
                                                    <LIcon name="more-vertical" size={14} />
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
          {ctxMenu.type === 'version' && (
            <>
              <button className={styles.contextItem} onClick={() => renameVersionItem(ctxMenu.versionId!)}>
                <LIcon name="edit" size={14} strokeWidth={1.6} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                Переименовать
              </button>
              <button className={styles.contextItem} onClick={() => archiveVersion(ctxMenu.versionId!, !ctxMenu.isArchived)}>
                <LIcon name="archive" size={14} strokeWidth={1.6} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                {ctxMenu.isArchived ? 'Разархивировать' : 'Архивировать'}
              </button>
              <button className={styles.contextItem} onClick={() => cloneVersion(ctxMenu.versionId!, ctxMenu.slug)}>
                <LIcon name="copy" size={14} strokeWidth={1.6} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                Клонировать
              </button>
              <button className={styles.contextItem} onClick={() => downloadVersionYaml(ctxMenu.versionId!, ctxMenu.slug)}>
                <LIcon name="download" size={14} strokeWidth={1.6} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                Скачать YAML
              </button>
            </>
          )}
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

      {/* Rename modal */}
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
              <input className={styles.modalInput} placeholder="Новое название" value={renameTitle}
                onChange={e => setRenameTitle(e.target.value)} autoFocus
                onKeyDown={e => e.key === 'Enter' && confirmRename()} />
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
              <button className={styles.modalSubmit} style={{ background: '#dc2626' }} onClick={confirmDelete}>Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* Version YAML modal */}
      <YamlEditorModal
        open={versionYamlOpen}
        onClose={() => setVersionYamlOpen(false)}
        title={`Новая версия · ${versionYamlFeatureTitle} · v${versionYamlNextNum}`}
        yamlText={versionYamlText}
        onYamlChange={t => { setVersionYamlText(t); setVersionYamlError('') }}
        yamlError={versionYamlError}
        onSubmit={submitVersionYaml}
        submitLabel={`Создать версию ${versionYamlNextNum}`}
        submitting={versionYamlSubmitting}
        onFileSelect={text => { setVersionYamlText(text); setVersionYamlError('') }}
      />

      {/* Toast */}
      {toastVisible && <div className={styles.copyToast}>{toastMsg}</div>}
    </div>
  )
}

import React, { useState, useMemo, useRef, useEffect } from 'react'
import styles from './ReportBuilder.module.scss'

export interface ReportField {
  key: string
  label: string
  type?: 'text' | 'badge' | 'status-badge' | 'progress'
}

export interface ReportFilter {
  id: number
  field: string
  operator: string
  value: string
}

interface ReportTemplate {
  name: string
  selectedFields: string[]
  filters: { field: string; operator: string; value: string }[]
  groupBy: string | null
  sortBy: string | null
}

const TPL_STORAGE = 'report-builder-templates'

interface ReportBuilderProps {
  allFields: ReportField[]
  allData: Record<string, string>[]
  defaultFields?: string[]
  defaultFilters?: { field: string; operator: string; value: string }[]
  defaultGroupBy?: string | null
  defaultSort?: string | null
}

const OP_LABELS: Record<string, string> = {
  equals: 'равно',
  contains: 'содержит',
  not_equals: 'не равно',
}

export function ReportBuilder({
  allFields,
  allData,
  defaultFields,
  defaultFilters,
  defaultGroupBy,
  defaultSort,
}: ReportBuilderProps) {
  // ─── State ──────────────────────────────────────────────────────────────
  const [selectedFields, setSelectedFields] = useState<string[]>(
    () => defaultFields ?? allFields.map(f => f.key)
  )
  const [filters, setFilters] = useState<ReportFilter[]>(() =>
    (defaultFilters ?? []).map((f, i) => ({ id: i, ...f }))
  )
  const [nextFilterId, setNextFilterId] = useState(filters.length)
  const [groupBy, setGroupBy] = useState<string | null>(defaultGroupBy ?? null)
  const [sortBy, setSortBy] = useState<string | null>(defaultSort ?? null)

  // Filter form state
  const [ffField, setFfField] = useState('')
  const [ffOp, setFfOp] = useState('equals')
  const [ffVal, setFfVal] = useState('')

  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!exportOpen) return
    function handler(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportOpen])

  // ─── Templates ──────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<ReportTemplate[]>(() => {
    try { return JSON.parse(localStorage.getItem(TPL_STORAGE) || '[]') }
    catch { return [] }
  })
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null)
  const [showSaveTpl, setShowSaveTpl] = useState(false)
  const [tplName, setTplName] = useState('')
  const saveTplInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (showSaveTpl) saveTplInputRef.current?.focus()
  }, [showSaveTpl])

  function saveTemplate() {
    if (!tplName.trim()) return
    const tpl: ReportTemplate = {
      name: tplName.trim(),
      selectedFields: [...selectedFields],
      filters: filters.map(({ id, ...f }) => f),
      groupBy,
      sortBy,
    }
    const updated = templates.filter(t => t.name !== tplName.trim())
    updated.push(tpl)
    setTemplates(updated)
    try { localStorage.setItem(TPL_STORAGE, JSON.stringify(updated)) } catch {/* ignore */}
    setActiveTemplate(tplName.trim())
    setTplName('')
    setShowSaveTpl(false)
  }

  function loadTemplate(name: string) {
    const t = templates.find(t => t.name === name)
    if (!t) return
    setActiveTemplate(name)
    setSelectedFields([...t.selectedFields])
    setFilters(t.filters.map((f, i) => ({ id: i, ...f })))
    setNextFilterId(t.filters.length)
    setGroupBy(t.groupBy)
    setSortBy(t.sortBy)
  }

  function deleteTemplate(name: string) {
    const updated = templates.filter(t => t.name !== name)
    setTemplates(updated)
    try { localStorage.setItem(TPL_STORAGE, JSON.stringify(updated)) } catch {/* ignore */}
    if (activeTemplate === name) setActiveTemplate(null)
  }

  const allFieldKeys = allFields.map(f => f.key)

  // ─── Toggle field ───────────────────────────────────────────────────────
  function toggleField(key: string) {
    setSelectedFields(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  // ─── Add filter ─────────────────────────────────────────────────────────
  function addFilter() {
    if (!ffField || !ffVal.trim()) return
    const id = nextFilterId
    setFilters(prev => [...prev, { id, field: ffField, operator: ffOp, value: ffVal.trim() }])
    setNextFilterId(id + 1)
    setFfVal('')
  }

  // ─── Remove filter ─────────────────────────────────────────────────────
  function removeFilter(id: number) {
    setFilters(prev => prev.filter(f => f.id !== id))
  }

  // ─── Compute data ──────────────────────────────────────────────────────
  const filteredData = useMemo(() => {
    let data = [...allData]
    for (const f of filters) {
      const fieldDef = allFields.find(af => af.key === f.field)
      if (!fieldDef) continue
      data = data.filter(row => {
        const val = (row[f.field] ?? '').toLowerCase()
        const search = f.value.toLowerCase()
        if (f.operator === 'equals') return val === search
        if (f.operator === 'contains') return val.includes(search)
        if (f.operator === 'not_equals') return val !== search
        return true
      })
    }
    return data
  }, [allData, filters, allFields])

  const sortedData = useMemo(() => {
    if (!sortBy) return filteredData
    const [field, dir] = sortBy.split('-')
    const dirNum = dir === 'desc' ? -1 : 1
    return [...filteredData].sort((a, b) => {
      const va = (a[field] ?? '').toLowerCase()
      const vb = (b[field] ?? '').toLowerCase()
      if (va < vb) return -1 * dirNum
      if (va > vb) return 1 * dirNum
      return 0
    })
  }, [filteredData, sortBy])

  const groupedData = useMemo(() => {
    if (!groupBy) return { sections: [] as { title: string; rows: Record<string, string>[] }[] }
    const groups = new Map<string, Record<string, string>[]>()
    for (const row of sortedData) {
      const key = row[groupBy] ?? '—'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    }
    return {
      sections: [...groups.entries()].map(([title, rows]) => ({
        title: `${title} (${rows.length})`,
        rows,
      })),
    }
  }, [sortedData, groupBy])

  // ─── Visible columns (respect selectedFields order) ────────────────────
  const visibleColumns = selectedFields.map(key => allFields.find(f => f.key === key)!).filter(Boolean)

  // ─── Unselected fields for dropdown ─────────────────────────────────────
  const unselectedFields = allFields.filter(f => !selectedFields.includes(f.key))

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Toolbar */}
      <div className={styles.rbToolbar}>
        <div className={styles.rbRow} style={{ marginBottom: 10 }}>
          <span className={styles.rbLabel}>Колонки:</span>
          {selectedFields.map((key, idx) => {
            const f = allFields.find(af => af.key === key)!
            return (
              <button
                key={f.key}
                className={styles.rbChip}
                data-selected="true"
                draggable
                onClick={() => toggleField(f.key)}
                onDragStart={e => {
                  e.dataTransfer.setData('text/plain', String(idx))
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={e => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDrop={e => {
                  e.preventDefault()
                  const fromIdx = parseInt(e.dataTransfer.getData('text/plain'))
                  if (isNaN(fromIdx) || fromIdx === idx) return
                  setSelectedFields(prev => {
                    const next = [...prev]
                    const [moved] = next.splice(fromIdx, 1)
                    next.splice(idx, 0, moved)
                    return next
                  })
                }}
              >
                {f.label}
                <span className={styles.rbChipClose}>×</span>
              </button>
            )
          })}
          {unselectedFields.map(f => (
            <button
              key={f.key}
              className={styles.rbChip}
              data-selected={false}
              onClick={() => toggleField(f.key)}
            >
              {f.label}
            </button>
          ))}

        </div>

        <div className={styles.rbRow} style={{ marginBottom: 10 }}>
          <span className={styles.rbLabel}>Группировка:</span>
          <select
            className={styles.rbDropdown}
            value={groupBy ?? ''}
            onChange={e => setGroupBy(e.target.value || null)}
          >
            <option value="">Не выбрано</option>
            {allFields.map(f => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>

          <span className={styles.rbLabel} style={{ marginLeft: 8 }}>Сортировка:</span>
          <select
            className={styles.rbDropdown}
            value={sortBy ?? ''}
            onChange={e => setSortBy(e.target.value || null)}
          >
            <option value="">Не выбрано</option>
            {allFields.map(f => (
              <optgroup key={f.key} label={f.label}>
                <option value={`${f.key}-asc`}>{f.label} ↑</option>
                <option value={`${f.key}-desc`}>{f.label} ↓</option>
              </optgroup>
            ))}
          </select>

          <span className={styles.rbDivider} />

          <span className={styles.rbLabel}>Фильтр:</span>
          <select
            className={styles.rbDropdown}
            style={{ minWidth: 120 }}
            value={ffField}
            onChange={e => setFfField(e.target.value)}
          >
            <option value="">Поле</option>
            {allFields.map(f => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
          <select
            className={styles.rbDropdown}
            style={{ minWidth: 110 }}
            value={ffOp}
            onChange={e => setFfOp(e.target.value)}
          >
            {Object.entries(OP_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <input
            className={styles.rbInput}
            placeholder="Значение"
            value={ffVal}
            onChange={e => setFfVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addFilter() }}
          />
          <button className={styles.rbBtn} onClick={addFilter}>Добавить</button>
        </div>

        <div className={styles.rbRow}>
          {filters.length > 0 && (
            <>
              <span className={styles.rbLabel}>Активные фильтры:</span>
              {filters.map(f => (
                <button
                  key={f.id}
                  className={styles.rbChip}
                  data-filter="true"
                  title="Нажмите чтобы убрать"
                >
                  {allFields.find(af => af.key === f.field)?.label ?? f.field} {OP_LABELS[f.operator] ?? f.operator} {f.value}
                  <span
                    className={styles.rbChipClose}
                    onClick={(e) => { e.stopPropagation(); removeFilter(f.id) }}
                  >
                    ×
                  </span>
                </button>
              ))}
              <span className={styles.rbDivider} />
            </>
          )}
          <span className={styles.rbLabel}>Шаблон:</span>
          <select
            className={styles.rbDropdown}
            value=""
            onChange={e => {
              const v = e.target.value
              if (v === '__save__') { setShowSaveTpl(true); return }
              if (v) loadTemplate(v); e.currentTarget.value = ''
            }}
          >
            <option value="">Выбрать шаблон...</option>
            {templates.map(t => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
            <option disabled>──────────</option>
            <option value="__save__">+ Сохранить как шаблон...</option>
          </select>
          {activeTemplate && (
            <span className={styles.rbLabel} style={{ color: '#2d98b4' }}>→ {activeTemplate}</span>
          )}
          {activeTemplate && (
            <button
              className={styles.rbBtn}
              style={{ background: '#d9534f', fontSize: 12, padding: '4px 10px' }}
              onClick={() => deleteTemplate(activeTemplate)}
            >
              Удалить
            </button>
          )}
          {showSaveTpl && (
            <>
              <input
                ref={saveTplInputRef}
                className={styles.rbInput}
                placeholder="Название шаблона"
                value={tplName}
                onChange={e => setTplName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveTemplate()
                  if (e.key === 'Escape') { setShowSaveTpl(false); setTplName('') }
                }}
              />
              <button className={styles.rbBtn} onClick={saveTemplate}>Сохранить</button>
              <button
                className={styles.rbBtn}
                style={{ background: '#818594' }}
                onClick={() => { setShowSaveTpl(false); setTplName('') }}
              >
                Отмена
              </button>
            </>
          )}
          <div style={{ flex: 1 }} />
          <div className={styles.rbExportWrap} ref={exportRef}>
            <button
              className={`${styles.rbBtn} ${styles.rbBtnExport}`}
              onClick={() => setExportOpen(v => !v)}
            >
              Экспорт ▾
            </button>
            {exportOpen && (
              <div className={styles.rbExportMenu}>
                <button className={styles.rbExportItem} onClick={() => setExportOpen(false)}>CSV</button>
                <button className={styles.rbExportItem} onClick={() => setExportOpen(false)}>PDF</button>
                <button className={styles.rbExportItem} onClick={() => setExportOpen(false)}>Excel</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <table className={styles.rbTable}>
        <thead>
          <tr>
            {visibleColumns.map(col => (
              <th
                key={col.key}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  const [curField, curDir] = (sortBy ?? '').split('-')
                  if (curField === col.key && curDir === 'asc') setSortBy(`${col.key}-desc`)
                  else setSortBy(`${col.key}-asc`)
                }}
              >
                {col.label}
                {sortBy?.startsWith(col.key) && (
                  <span style={{ marginLeft: 4, fontSize: 10 }}>
                    {sortBy.endsWith('-asc') ? '↑' : '↓'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groupBy && groupedData.sections.length > 0 ? (
            groupedData.sections.map((section, si) => (
              <React.Fragment key={`sec-${si}`}>
                <tr className={styles.rbSectionRow}>
                  <td colSpan={visibleColumns.length}>{section.title}</td>
                </tr>
                {section.rows.map((row, ri) => (
                  <tr key={`${si}-${ri}`}>
                    {visibleColumns.map(col => (
                      <td key={col.key}>{row[col.key] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))
          ) : (
            sortedData.map((row, ri) => (
              <tr key={ri}>
                {visibleColumns.map(col => (
                  <td key={col.key}>{row[col.key] ?? ''}</td>
                ))}
              </tr>
            ))
          )}
          {sortedData.length === 0 && (
            <tr>
              <td colSpan={visibleColumns.length || 1} style={{ textAlign: 'center', color: '#818594', padding: 32 }}>
                Нет данных по заданным фильтрам
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

import React, { useState, useMemo, useRef, useEffect } from 'react'
import styles from './ReportBuilder2.module.scss'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DataModelFieldType {
  key: string
  label: string
}

export interface DataModelType {
  key: string
  label: string
  parentType: string | null
  fields: DataModelFieldType[]
}

export interface DataModel {
  types: DataModelType[]
}

export interface CMDBRow extends Record<string, string> {
  id: string
  type: string
  parent_id: string | null
}

export interface ReportFilter {
  id: number
  field: string
  operator: string
  value: string
}

export interface ReportTemplate {
  name: string
  selectedTypes: string[]
  selectedFields: string[]
  filters: { field: string; operator: string; value: string }[]
  groupBy: string[]
  sortBy: string | null
}

export interface ReportView {
  id: string
  label: string
  defaultTypes: string[]
  defaultFields: string[]
  defaultGroupBy: string[]
  defaultSort?: string | null
  defaultFilters?: { field: string; operator: string; value: string }[]
}

interface ReportBuilder2Props {
  dataModel: DataModel
  allData: CMDBRow[]
  views?: ReportView[]
  defaultView?: string
  defaultTypes?: string[]
  defaultFields?: string[]
  defaultGroupBy?: string[]
  defaultSort?: string | null
  defaultFilters?: { field: string; operator: string; value: string }[]
}

const OP_LABELS: Record<string, string> = {
  equals: 'равно',
  contains: 'содержит',
  not_equals: 'не равно',
}

const TPL_STORAGE = 'report-builder2-templates'

// ─── Helpers ───────────────────────────────────────────────────────────────

function resolveParentField(row: CMDBRow, allData: CMDBRow[], fieldKey: string): string {
  const dotIdx = fieldKey.indexOf('.')
  if (dotIdx === -1) return row[fieldKey] ?? '—'
  const ancestorType = fieldKey.slice(0, dotIdx)
  const field = fieldKey.slice(dotIdx + 1)
  let current: CMDBRow | undefined = row
  while (current) {
    if (current.type === ancestorType) return current[field] ?? '—'
    if (!current.parent_id) break
    current = allData.find(r => r.id === current!.parent_id)
  }
  return '—'
}

function getRowValue(row: CMDBRow, allData: CMDBRow[], fieldKey: string): string {
  if (fieldKey.includes('.')) return resolveParentField(row, allData, fieldKey)
  return row[fieldKey] ?? '—'
}

function getAllAvailableFields(dataModel: DataModel, selectedTypes: string[]): DataModelFieldType[] {
  const result: DataModelFieldType[] = []
  const seen = new Set<string>()

  function addTypeFields(typeKey: string, ancestorChain: string[]) {
    const typeDef = dataModel.types.find(t => t.key === typeKey)
    if (!typeDef) return
    for (const f of typeDef.fields) {
      const key = f.key
      if (!seen.has(key)) {
        seen.add(key)
        result.push({ key, label: f.label })
      }
    }
    for (const ancestorKey of ancestorChain) {
      const ancestorDef = dataModel.types.find(t => t.key === ancestorKey)
      if (!ancestorDef) continue
      for (const f of ancestorDef.fields) {
        const key = `${ancestorKey}.${f.key}`
        if (!seen.has(key)) {
          seen.add(key)
          result.push({ key, label: `${ancestorDef.label}.${f.label}` })
        }
      }
    }
    if (typeDef.parentType && !ancestorChain.includes(typeDef.parentType)) {
      addTypeFields(typeDef.parentType, [...ancestorChain, typeDef.parentType])
    }
  }

  for (const tk of selectedTypes) {
    addTypeFields(tk, [])
  }
  return result
}

// ─── Component ─────────────────────────────────────────────────────────────

export function ReportBuilder2({
  dataModel,
  allData,
  views,
  defaultView,
  defaultTypes,
  defaultFields,
  defaultGroupBy,
  defaultSort,
  defaultFilters,
}: ReportBuilder2Props) {
  // ─── State ──────────────────────────────────────────────────────────────
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    () => defaultTypes ?? dataModel.types.map(t => t.key)
  )
  const [selectedFields, setSelectedFields] = useState<string[]>(
    () => defaultFields ?? []
  )
  const [filters, setFilters] = useState<ReportFilter[]>(() =>
    (defaultFilters ?? []).map((f, i) => ({ id: i, ...f }))
  )
  const [nextFilterId, setNextFilterId] = useState(filters.length)
  const [groupBy, setGroupBy] = useState<string[]>(defaultGroupBy ?? [])
  const [sortBy, setSortBy] = useState<string | null>(defaultSort ?? null)
  const [activeView, setActiveView] = useState<string | null>(defaultView ?? null)

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

  // ─── Templates ─────────────────────────────────────────────────────────
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
      selectedTypes: [...selectedTypes],
      selectedFields: [...selectedFields],
      filters: filters.map(({ id, ...f }) => f),
      groupBy: [...groupBy],
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
    setSelectedTypes([...t.selectedTypes])
    setSelectedFields([...t.selectedFields])
    setFilters(t.filters.map((f, i) => ({ id: i, ...f })))
    setNextFilterId(t.filters.length)
    setGroupBy([...t.groupBy])
    setSortBy(t.sortBy)
  }

  function deleteTemplate(name: string) {
    const updated = templates.filter(t => t.name !== name)
    setTemplates(updated)
    try { localStorage.setItem(TPL_STORAGE, JSON.stringify(updated)) } catch {/* ignore */}
    if (activeTemplate === name) setActiveTemplate(null)
  }

  // ─── Apply view ─────────────────────────────────────────────────────────
  function applyView(viewId: string) {
    const v = views?.find(v => v.id === viewId)
    if (!v) return
    setActiveView(viewId)
    setSelectedTypes([...v.defaultTypes])
    setSelectedFields([...v.defaultFields])
    setGroupBy([...v.defaultGroupBy])
    setSortBy(v.defaultSort ?? null)
    if (v.defaultFilters) {
      setFilters(v.defaultFilters.map((f, i) => ({ id: i, ...f })))
      setNextFilterId(v.defaultFilters.length)
    } else {
      setFilters([])
      setNextFilterId(0)
    }
  }

  // ─── Toggle type ────────────────────────────────────────────────────────
  function toggleType(key: string) {
    setSelectedTypes(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

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

  function removeFilter(id: number) {
    setFilters(prev => prev.filter(f => f.id !== id))
  }

  // ─── Available fields (auto-includes parent fields) ─────────────────────
  const allAvailableFields = useMemo(
    () => getAllAvailableFields(dataModel, selectedTypes),
    [dataModel, selectedTypes]
  )

  // ─── Compute data ──────────────────────────────────────────────────────
  const typeFilteredData = useMemo(() => {
    if (selectedTypes.length === 0) return allData
    return allData.filter(r => selectedTypes.includes(r.type))
  }, [allData, selectedTypes])

  const filteredData = useMemo(() => {
    let data = [...typeFilteredData]
    for (const f of filters) {
      data = data.filter(row => {
        const val = getRowValue(row, allData, f.field).toLowerCase()
        const search = f.value.toLowerCase()
        if (f.operator === 'equals') return val === search
        if (f.operator === 'contains') return val.includes(search)
        if (f.operator === 'not_equals') return val !== search
        return true
      })
    }
    return data
  }, [typeFilteredData, filters, allData])

  const sortedData = useMemo(() => {
    if (!sortBy) return filteredData
    const [field, dir] = sortBy.split('-')
    const dirNum = dir === 'desc' ? -1 : 1
    return [...filteredData].sort((a, b) => {
      const va = getRowValue(a, allData, field).toLowerCase()
      const vb = getRowValue(b, allData, field).toLowerCase()
      if (va < vb) return -1 * dirNum
      if (va > vb) return 1 * dirNum
      return 0
    })
  }, [filteredData, sortBy, allData])

  // ─── Multi-level grouping ──────────────────────────────────────────────
  const groupedData = useMemo(() => {
    if (groupBy.length === 0) return { sections: [] as { title: string; rows: CMDBRow[] }[] }

    function groupRows(rows: CMDBRow[], level: number): { title: string; rows: CMDBRow[]; children?: ReturnType<typeof groupRows>[] }[] {
      if (level >= groupBy.length) return []
      const groups = new Map<string, CMDBRow[]>()
      for (const row of rows) {
        const key = getRowValue(row, allData, groupBy[level]) ?? '—'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(row)
      }
      return [...groups.entries()].map(([title, rows]) => ({
        title: `${title} (${rows.length})`,
        rows,
        children: level < groupBy.length - 1 ? groupRows(rows, level + 1) : undefined,
      }))
    }

    return { sections: groupRows(sortedData, 0) }
  }, [sortedData, groupBy, allData])

  // ─── Visible columns ───────────────────────────────────────────────────
  const visibleColumns = useMemo(
    () => selectedFields.map(key => allAvailableFields.find(f => f.key === key)).filter(Boolean) as DataModelFieldType[],
    [selectedFields, allAvailableFields]
  )

  const unselectedFields = allAvailableFields.filter(f => !selectedFields.includes(f.key))

  // ─── Render multi-level grouped rows ───────────────────────────────────
  function renderGroupedSections(sections: { title: string; rows: CMDBRow[]; children?: { title: string; rows: CMDBRow[]; children?: unknown[] }[] }[], depth: number): React.ReactNode[] {
    const result: React.ReactNode[] = []
    for (const section of sections) {
      result.push(
        <tr key={`sec-${depth}-${section.title}`} className={styles.rbSectionRow} style={{ paddingLeft: depth * 16 }}>
          <td colSpan={visibleColumns.length} style={{ paddingLeft: 8 + depth * 20 }}>
            {section.title}
          </td>
        </tr>
      )
      if (section.children && section.children.length > 0) {
        result.push(...renderGroupedSections(section.children as any, depth + 1))
      } else {
        for (const row of section.rows) {
          result.push(
            <tr key={`row-${depth}-${row.id}`}>
              {visibleColumns.map(col => (
                <td key={col.key}>{getRowValue(row, allData, col.key)}</td>
              ))}
            </tr>
          )
        }
      }
    }
    return result
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Toolbar */}
      <div className={styles.rbToolbar}>
        {/* Row 1: Views + Types */}
        <div className={styles.rbRow} style={{ marginBottom: 10 }}>
          {views && views.length > 0 && (
            <>
              <span className={styles.rbLabel}>Представление:</span>
              <select
                className={styles.rbDropdown}
                value={activeView ?? ''}
                onChange={e => { if (e.target.value) applyView(e.target.value) }}
              >
                <option value="">Выбрать...</option>
                {views.map(v => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
              <span className={styles.rbDivider} />
            </>
          )}
          <span className={styles.rbLabel}>Типы:</span>
          {dataModel.types.map(t => (
            <button
              key={t.key}
              className={styles.rbChip}
              data-selected={selectedTypes.includes(t.key)}
              onClick={() => toggleType(t.key)}
            >
              {t.label}
              {selectedTypes.includes(t.key) && (
                <span className={styles.rbChipClose}>×</span>
              )}
            </button>
          ))}
        </div>

        {/* Row 2: Columns */}
        <div className={styles.rbRow} style={{ marginBottom: 10 }}>
          <span className={styles.rbLabel}>Колонки:</span>
          {selectedFields.map((key, idx) => {
            const f = allAvailableFields.find(af => af.key === key)
            if (!f) return null
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

        {/* Row 3: Grouping + Sorting + Filters */}
        <div className={styles.rbRow} style={{ marginBottom: 10 }}>
          <span className={styles.rbLabel}>Группировка:</span>
          <select
            className={styles.rbDropdown}
            value=""
            onChange={e => {
              const v = e.target.value
              if (v && !groupBy.includes(v)) {
                setGroupBy(prev => [...prev, v])
              }
              e.currentTarget.value = ''
            }}
          >
            <option value="">+ Добавить уровень...</option>
            {allAvailableFields.map(f => (
              <option key={f.key} value={f.key} disabled={groupBy.includes(f.key)}>
                {f.label}{groupBy.includes(f.key) ? ' ✓' : ''}
              </option>
            ))}
          </select>
          {groupBy.map((gk, i) => {
            const f = allAvailableFields.find(af => af.key === gk)
            return (
              <button
                key={gk}
                className={styles.rbChip}
                data-selected="true"
                onClick={() => setGroupBy(prev => prev.filter(k => k !== gk))}
              >
                {i + 1}. {f?.label ?? gk}
                <span className={styles.rbChipClose}>×</span>
              </button>
            )
          })}

          <span className={styles.rbLabel} style={{ marginLeft: 8 }}>Сортировка:</span>
          <select
            className={styles.rbDropdown}
            value={sortBy ?? ''}
            onChange={e => setSortBy(e.target.value || null)}
          >
            <option value="">Не выбрано</option>
            {allAvailableFields.map(f => (
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
            {allAvailableFields.map(f => (
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

        {/* Row 4: Active filters + Templates + Export */}
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
                  {allAvailableFields.find(af => af.key === f.field)?.label ?? f.field} {OP_LABELS[f.operator] ?? f.operator} {f.value}
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
          {groupBy.length > 0 && groupedData.sections.length > 0 ? (
            renderGroupedSections(groupedData.sections as any, 0)
          ) : (
            sortedData.map((row) => (
              <tr key={row.id}>
                {visibleColumns.map(col => (
                  <td key={col.key}>{getRowValue(row, allData, col.key)}</td>
                ))}
              </tr>
            ))
          )}
          {(groupBy.length > 0 ? groupedData.sections.length : sortedData.length) === 0 && (
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

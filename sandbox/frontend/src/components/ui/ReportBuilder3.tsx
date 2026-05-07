import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Eraser } from 'lucide-react'
import styles from './ReportBuilder3.module.scss'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DataModelFieldType {
  key: string
  label: string
  exportLabel?: string
}

export interface FieldGroup {
  typeKey: string
  typeLabel: string
  fields: DataModelFieldType[]
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
  not_contains: 'не содержит',
  is_empty: 'пусто',
  is_not_empty: 'не пусто',
}

const TPL_STORAGE = 'report-builder3-templates'

// ─── Module mapping (hardware view) ────────────────────────────────────────

interface ModuleInfo {
  module_name: string
  node_name: string
}

const MODULE_MAP: Record<string, ModuleInfo> = {
  'server.monitoring': { module_name: 'Базовый модуль', node_name: 'Вычислительный узел (Узел мониторинга и регистрации)' },
  'server.management': { module_name: 'Модуль координации', node_name: 'Вычислительный узел (Узел управления и распределения)' },
  'server.virtualization': { module_name: 'Модуль виртуализации', node_name: 'Вычислительный узел (Узел виртуализации)' },
  'switch.100GbE': { module_name: 'Модуль коммутации, вычисления и хранения', node_name: 'Сетевой узел 100 Гбит/с' },
  'switch.10/25GbE': { module_name: 'Модуль коммутации, вычисления и хранения', node_name: 'Сетевой узел 10/25 Гбит/с' },
  'switch.1GbE': { module_name: 'Базовый модуль', node_name: 'Сетевой узел 1 Гбит/с' },
  'disk_shelf': { module_name: 'Базовый модуль', node_name: 'Узел расширения хранения' },
}

function resolveModuleInfo(row: CMDBRow): ModuleInfo | null {
  if (row.type === 'server' && row.srv_role) {
    const key = `server.${row.srv_role}`
    return MODULE_MAP[key] ?? null
  }
  if (row.type === 'switch' && row.sw_speed) {
    const key = `switch.${row.sw_speed}`
    return MODULE_MAP[key] ?? null
  }
  if (row.type === 'disk_shelf') {
    return MODULE_MAP['disk_shelf']
  }
  return null
}

function generateCableKits(data: CMDBRow[], allData: CMDBRow[]): CMDBRow[] {
  const kits: CMDBRow[] = []
  const seen = new Set<string>()
  for (const row of data) {
    if (row.type === 'cable_kit') continue
    const mi = resolveModuleInfo(row)
    if (!mi) continue
    const pakId = row.parent_id
    if (!pakId) continue
    const key = `${pakId}|${mi.module_name}`
    if (seen.has(key)) continue
    seen.add(key)
    kits.push({
      id: `cable-${key.replace(/[^a-zA-Z0-9]/g, '-')}`,
      type: 'cable_kit',
      parent_id: pakId,
      module_name: mi.module_name,
      node_name: 'Комплект коммутации (кабельная система)',
      equipment_name: '',
      article: '',
      serial_numbers: '',
    })
  }
  return kits
}

function getPakRow(pakId: string | null, allData: CMDBRow[]): CMDBRow | undefined {
  if (!pakId) return undefined
  return allData.find(r => r.id === pakId && r.type === 'pak')
}

function getPakHeader(pak: CMDBRow): string {
  const name = pak.pak_name ?? '—'
  const serial = pak.pak_serial ?? ''
  const type = pak.pak_type ?? ''
  let header = `Машина виртуализации СКАЛА-Р ${type} (РМБГ.466535.002-535), (Номер записи в Реестре 10516902)`
  if (serial) header += `, серийный номер ${serial}`
  return header
}

function countModulesPerPak(allData: CMDBRow[]): Record<string, Record<string, number>> {
  const counts: Record<string, Record<string, number>> = {}
  for (const row of allData) {
    if (row.type === 'cable_kit') continue
    const mi = resolveModuleInfo(row)
    if (!mi) continue
    const pakId = row.parent_id
    if (!pakId) continue
    if (!counts[pakId]) counts[pakId] = {}
    counts[pakId][mi.module_name] = (counts[pakId][mi.module_name] ?? 0) + 1
  }
  return counts
}

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
  if (fieldKey === 'module_name' || fieldKey === 'node_name') {
    const mi = resolveModuleInfo(row)
    return mi ? mi[fieldKey] : (row[fieldKey] ?? '—')
  }
  if (fieldKey.includes('.')) return resolveParentField(row, allData, fieldKey)
  return row[fieldKey] ?? '—'
}

interface FieldResult {
  flat: DataModelFieldType[]
  groups: FieldGroup[]
}

function getAllAvailableFields(dataModel: DataModel, selectedTypes: string[]): FieldResult {
  const flat: DataModelFieldType[] = []
  const seen = new Set<string>()
  const groups: FieldGroup[] = []

  function collectAncestorKeys(typeKey: string): string[] {
    const chain: string[] = []
    let current: string | null = typeKey
    while (current) {
      const typeDef = dataModel.types.find(t => t.key === current)
      if (!typeDef) break
      current = typeDef.parentType
      if (current) chain.push(current)
    }
    return chain.reverse()
  }

  for (const tk of selectedTypes) {
    const typeDef = dataModel.types.find(t => t.key === tk)
    if (!typeDef) continue

    const ancestorKeys = collectAncestorKeys(tk)

    for (const ak of ancestorKeys) {
      const ancDef = dataModel.types.find(t => t.key === ak)
      if (!ancDef) continue
      for (const f of ancDef.fields) {
        const key = `${ak}.${f.key}`
        if (!seen.has(key)) {
          seen.add(key)
          flat.push({ key, label: f.label, exportLabel: f.label })
        }
      }
    }

    const ownFields: DataModelFieldType[] = []
    for (const f of typeDef.fields) {
      if (!seen.has(f.key)) {
        seen.add(f.key)
        flat.push({ key: f.key, label: f.label, exportLabel: f.label })
      }
      ownFields.push({ key: f.key, label: f.label, exportLabel: f.label })
    }

    groups.push({ typeKey: tk, typeLabel: typeDef.label, fields: ownFields })
  }

  return { flat, groups }
}

// ─── Component ─────────────────────────────────────────────────────────────

export function ReportBuilder3({
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
  // ─── State ─────────────────────────────────────────────────────────────
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

  const [ffField, setFfField] = useState('')
  const [ffOp, setFfOp] = useState('equals')
  const [ffVal, setFfVal] = useState('')

  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [visibleCount, setVisibleCount] = useState(10)
  const [dragColIndex, setDragColIndex] = useState<number | null>(null)
  function toggleCollapsedGroup(typeKey: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(typeKey)) next.delete(typeKey)
      else next.add(typeKey)
      return next
    })
  }
  useEffect(() => {
    if (!exportOpen) return
    function handler(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportOpen])

  useEffect(() => {
    if (tableRef.current) {
      tableRef.current.scrollTop = tableRef.current.scrollHeight
    }
  }, [visibleCount])

  // ─── Views (built-in + user-saved) ─────────────────────────────────────
  const [userViews, setUserViews] = useState<ReportTemplate[]>(() => {
    try { return JSON.parse(localStorage.getItem(TPL_STORAGE) || '[]') }
    catch { return [] }
  })
  const [activeUserView, setActiveUserView] = useState<string | null>(null)
  const [showSaveView, setShowSaveView] = useState(false)
  const [viewName, setViewName] = useState('')
  const saveViewInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (showSaveView) saveViewInputRef.current?.focus()
  }, [showSaveView])

  function saveUserView() {
    if (!viewName.trim()) return
    const v: ReportTemplate = {
      name: viewName.trim(),
      selectedTypes: [...selectedTypes],
      selectedFields: [...selectedFields],
      filters: filters.map(({ id, ...f }) => f),
      groupBy: [...groupBy],
      sortBy,
    }
    const updated = userViews.filter(t => t.name !== v.name)
    updated.push(v)
    setUserViews(updated)
    try { localStorage.setItem(TPL_STORAGE, JSON.stringify(updated)) } catch {/* ignore */}
    setActiveUserView(v.name)
    setActiveView(null)
    setViewName('')
    setShowSaveView(false)
  }

  function loadUserView(name: string) {
    const t = userViews.find(t => t.name === name)
    if (!t) return
    setActiveUserView(name)
    setActiveView(null)
    setVisibleCount(10)
    setSelectedTypes([...t.selectedTypes])
    setSelectedFields([...t.selectedFields])
    setFilters(t.filters.map((f, i) => ({ id: i, ...f })))
    setNextFilterId(t.filters.length)
    setGroupBy([...t.groupBy])
    setSortBy(t.sortBy)
  }

  function deleteUserView(name: string) {
    const updated = userViews.filter(t => t.name !== name)
    setUserViews(updated)
    try { localStorage.setItem(TPL_STORAGE, JSON.stringify(updated)) } catch {/* ignore */}
    if (activeUserView === name) setActiveUserView(null)
  }

  // ─── Apply view ─────────────────────────────────────────────────────────
  function applyView(viewId: string) {
    const v = views?.find(v => v.id === viewId)
    if (!v) return
    setActiveView(viewId)
    setActiveUserView(null)
    setVisibleCount(10)
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
    setVisibleCount(10)
    setSelectedTypes(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  function resetActiveView() {
    setActiveView(null)
    setActiveUserView(null)
  }

  function clearAll() {
    resetActiveView()
    setGroupBy([])
    setFilters([])
    setNextFilterId(0)
    setVisibleCount(10)
  }

  function clearSources() {
    setSelectedTypes([])
    setVisibleCount(10)
  }

  // ─── Toggle field ───────────────────────────────────────────────────────
  function toggleField(key: string) {
    resetActiveView()
    setSelectedFields(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  // ── Add filter ─────────────────────────────────────────────────────────
  function addFilter() {
    if (!ffField) return
    if (ffOp !== 'is_empty' && ffOp !== 'is_not_empty' && !ffVal.trim()) return
    const id = nextFilterId
    resetActiveView()
    setVisibleCount(10)
    setFilters(prev => [...prev, { id, field: ffField, operator: ffOp, value: ffOp === 'is_empty' || ffOp === 'is_not_empty' ? '' : ffVal.trim() }])
    setNextFilterId(id + 1)
    setFfVal('')
  }

  function removeFilter(id: number) {
    resetActiveView()
    setVisibleCount(10)
    setFilters(prev => prev.filter(f => f.id !== id))
  }

  // ─── Available fields ──────────────────────────────────────────────────
  const { flat: allAvailableFields, groups: fieldGroups } = useMemo(
    () => getAllAvailableFields(dataModel, selectedTypes),
    [dataModel, selectedTypes]
  )

  // ── View type detection ───────────────────────────────────────────────
  const isHardwareView = activeView === 'hardware'
  const isSoftwareView = activeView === 'software'
  const isInstalledSoftwareView = activeView === 'installed_software'

  // ─── Compute base data ─────────────────────────────────────────────────
  const typeFilteredData = useMemo(() => {
    if (selectedTypes.length === 0) return []
    return allData.filter(r => selectedTypes.includes(r.type))
  }, [allData, selectedTypes])

  const filteredData = useMemo(() => {
    let data = [...typeFilteredData]
    for (const f of filters) {
      data = data.filter(row => {
        if (f.operator === 'is_empty' || f.operator === 'is_not_empty') {
          const val = getRowValue(row, allData, f.field)
          const isEmpty = val === '' || val === '—' || val === 'null' || val === 'undefined'
          if (f.operator === 'is_empty') return isEmpty
          return !isEmpty
        }
        const val = getRowValue(row, allData, f.field).toLowerCase()
        const search = f.value.toLowerCase()
        if (f.operator === 'equals') return val === search
        if (f.operator === 'contains') return val.includes(search)
        if (f.operator === 'not_equals') return val !== search
        if (f.operator === 'not_contains') return !val.includes(search)
        return true
      })
    }
    return data
  }, [typeFilteredData, filters, allData])

  // ─── Hardware view: add cable kits, compute module fields ──────────────
  const hardwareData = useMemo(() => {
    if (!isHardwareView) return filteredData
    const kits = generateCableKits(filteredData, allData)
    return [...filteredData, ...kits]
  }, [filteredData, isHardwareView, allData])

  // ─── Software view: compute total_quantity ─────────────────────────────
  const moduleCounts = useMemo(() => countModulesPerPak(allData), [allData])

  const softwareData = useMemo(() => {
    if (!isSoftwareView) return filteredData
    return filteredData.map(row => {
      if (row.type !== 'software_license') return row
      const pakId = row.parent_id
      const moduleName = row.module_name
      const qpm = parseInt(row.quantity_per_module) || 0
      const mc = pakId && moduleName ? (moduleCounts[pakId]?.[moduleName] ?? 1) : 1
      return { ...row, total_quantity: String(qpm * mc) }
    })
  }, [filteredData, isSoftwareView, moduleCounts])

  const displayData = isHardwareView ? hardwareData : isSoftwareView ? softwareData : filteredData

  const sortedData = useMemo(() => {
    if (!sortBy) return displayData
    const [field, dir] = sortBy.split('-')
    const dirNum = dir === 'desc' ? -1 : 1
    return [...displayData].sort((a, b) => {
      const va = getRowValue(a, allData, field).toLowerCase()
      const vb = getRowValue(b, allData, field).toLowerCase()
      if (va < vb) return -1 * dirNum
      if (va > vb) return 1 * dirNum
      return 0
    })
  }, [displayData, sortBy, allData])

  // ─── Multi-level grouping ──────────────────────────────────────────────
  const groupedData = useMemo(() => {
    if (groupBy.length === 0 || selectedTypes.length === 0) return { sections: [] as { title: string; rows: CMDBRow[] }[] }

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

  // ─── Hardware view: grouped by PAK → module → node with aggregation ────
  interface HardwareGroup {
    pakId: string
    pak: CMDBRow
    modules: {
      moduleName: string
      nodes: {
        nodeName: string
        rows: CMDBRow[]
        quantity: number
        serialNumbers: string[]
      }[]
    }[]
  }

  const hardwareGrouped = useMemo((): HardwareGroup[] => {
    if (!isHardwareView || groupBy.length === 0) return []

    const pakMap = new Map<string, HardwareGroup>()
    for (const row of sortedData) {
      const pakId = row.parent_id
      if (!pakId) continue
      const pak = getPakRow(pakId, allData)
      if (!pak) continue
      if (!pakMap.has(pakId)) {
        pakMap.set(pakId, { pakId, pak, modules: [] })
      }
      const g = pakMap.get(pakId)!
      const mi = resolveModuleInfo(row)
      const moduleName = row.module_name ?? mi?.module_name ?? '—'
      const nodeName = row.node_name ?? mi?.node_name ?? '—'

      let mod = g.modules.find(m => m.moduleName === moduleName)
      if (!mod) {
        mod = { moduleName, nodes: [] }
        g.modules.push(mod)
      }
      let node = mod.nodes.find(n => n.nodeName === nodeName)
      if (!node) {
        node = { nodeName, rows: [], quantity: 0, serialNumbers: [] }
        mod.nodes.push(node)
      }
      node.rows.push(row)
      node.quantity++
      if (row.disk_serial) node.serialNumbers.push(row.disk_serial)
      if (row.sw_serial && !node.serialNumbers.includes(row.sw_serial)) node.serialNumbers.push(row.sw_serial)
      if (row.srv_serial && !node.serialNumbers.includes(row.srv_serial)) node.serialNumbers.push(row.srv_serial)
      if (row.shelf_serial && !node.serialNumbers.includes(row.shelf_serial)) node.serialNumbers.push(row.shelf_serial)
    }
    return [...pakMap.values()]
  }, [sortedData, isHardwareView, groupBy, allData])

  // ─── Software view: grouped by PAK → module → manufacturer ─────────────
  interface SoftwareGroup {
    pakId: string
    pak: CMDBRow
    modules: {
      moduleName: string
      manufacturers: {
        manufacturer: string
        rows: CMDBRow[]
      }[]
    }[]
  }

  const softwareGrouped = useMemo((): SoftwareGroup[] => {
    if (!isSoftwareView || groupBy.length === 0) return []

    const pakMap = new Map<string, SoftwareGroup>()
    for (const row of sortedData) {
      if (row.type !== 'software_license') continue
      const pakId = row.parent_id
      if (!pakId) continue
      const pak = getPakRow(pakId, allData)
      if (!pak) continue
      if (!pakMap.has(pakId)) {
        pakMap.set(pakId, { pakId, pak, modules: [] })
      }
      const g = pakMap.get(pakId)!
      const moduleName = row.module_name ?? '—'
      const manufacturer = row.manufacturer ?? '—'

      let mod = g.modules.find(m => m.moduleName === moduleName)
      if (!mod) {
        mod = { moduleName, manufacturers: [] }
        g.modules.push(mod)
      }
      let mf = mod.manufacturers.find(m => m.manufacturer === manufacturer)
      if (!mf) {
        mf = { manufacturer, rows: [] }
        mod.manufacturers.push(mf)
      }
      mf.rows.push(row)
    }
    return [...pakMap.values()]
  }, [sortedData, isSoftwareView, groupBy, allData])

  // ─── Visible columns ──────────────────────────────────────────────────
  const visibleColumns = useMemo(() => {
    const cols = selectedFields.map(key => {
      const f = allAvailableFields.find(af => af.key === key)
      if (!f) return null
      // Find source type label
      let sourceLabel: string | undefined
      for (const g of fieldGroups) {
        if (g.fields.some(gf => gf.key === key)) {
          sourceLabel = g.typeLabel
          break
        }
      }
      const label = sourceLabel ? `${f.label} (${sourceLabel})` : f.label
      return { ...f, label }
    }).filter(Boolean) as DataModelFieldType[]
    // Prepend a synthetic type column for disambiguation
    const typeCol: DataModelFieldType = { key: '__type', label: 'Тип', exportLabel: 'Тип' }
    return [typeCol, ...cols]
  }, [selectedFields, allAvailableFields, fieldGroups])

  const unselectedFields = allAvailableFields.filter(f => !selectedFields.includes(f.key))

  // ─── Render helpers ────────────────────────────────────────────────────
  function renderCell(row: CMDBRow, col: DataModelFieldType): string {
    if (col.key === '__type') {
      const typeDef = dataModel.types.find(t => t.key === row.type)
      return typeDef?.label ?? row.type
    }
    const val = getRowValue(row, allData, col.key)
    if (col.key === 'article' && val === '—') return ''
    return val
  }

  function renderGroupedSections(sections: { title: string; rows: CMDBRow[]; children?: { title: string; rows: CMDBRow[]; children?: unknown[] }[] }[], depth: number): React.ReactNode[] {
    const result: React.ReactNode[] = []
    for (let si = 0; si < sections.length; si++) {
      const section = sections[si]
      result.push(
        <tr key={`sec-${depth}-${si}-${section.title}`} className={styles.rbSectionRow}>
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
                <td key={col.key}>{renderCell(row, col)}</td>
              ))}
            </tr>
          )
        }
      }
    }
    return result
  }

  function renderHardwareView(): React.ReactNode {
    if (hardwareGrouped.length === 0) {
      return (
        <tr>
          <td colSpan={7} style={{ textAlign: 'center', color: '#818594', padding: 32 }}>
            Нет данных по заданным фильтрам
          </td>
        </tr>
      )
    }

    const rows: React.ReactNode[] = []
    let globalNum = 0

    for (const g of hardwareGrouped) {
      rows.push(
        <tr key={`pak-header-${g.pakId}`} className={styles.rbPakHeader}>
          <td colSpan={7}>{getPakHeader(g.pak)}</td>
        </tr>
      )

      let rowNum = 0
      for (const mod of g.modules) {
        for (const node of mod.nodes) {
          rowNum++
          globalNum++
          rows.push(
            <tr key={`hw-${g.pakId}-${mod.moduleName}-${node.nodeName}`}>
              <td style={{ textAlign: 'center', fontWeight: 500 }}>{rowNum}.</td>
              <td>{mod.moduleName}</td>
              <td style={{ textAlign: 'center' }}>1</td>
              <td>{node.nodeName}</td>
              <td>{node.rows[0]?.equipment_name ?? ''}</td>
              <td>{node.rows[0]?.article ?? ''}</td>
              <td style={{ textAlign: 'center' }}>{node.quantity}</td>
            </tr>
          )
        }
      }
    }
    return rows
  }

  function renderSoftwareView(): React.ReactNode {
    if (softwareGrouped.length === 0) {
      return (
        <tr>
          <td colSpan={6} style={{ textAlign: 'center', color: '#818594', padding: 32 }}>
            Нет данных по заданным фильтрам
          </td>
        </tr>
      )
    }

    const rows: React.ReactNode[] = []
    let globalNum = 0

    for (const g of softwareGrouped) {
      rows.push(
        <tr key={`pak-header-${g.pakId}`} className={styles.rbPakHeader}>
          <td colSpan={6}>{getPakHeader(g.pak)}</td>
        </tr>
      )

      let rowNum = 0
      for (const mod of g.modules) {
        for (const mf of mod.manufacturers) {
          for (const row of mf.rows) {
            rowNum++
            globalNum++
            const qpm = row.quantity_per_module ?? '1'
            const total = row.total_quantity ?? qpm
            rows.push(
              <tr key={`sw-${row.id}`}>
                <td style={{ textAlign: 'center', fontWeight: 500 }}>{rowNum}.</td>
                <td>{mod.moduleName}</td>
                <td>{mf.manufacturer}</td>
                <td style={{ maxWidth: 300, fontSize: 12 }}>{row.product_name ?? ''}</td>
                <td>{row.article ?? ''}</td>
                <td style={{ textAlign: 'center' }}>{total}</td>
              </tr>
            )
          }
        }
      }
    }
    return rows
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.rbLayout}>
      {/* Side Panel */}
      <div className={styles.rbSidePanel}>
        <div className={styles.rbSideCard}>
          <div className={styles.rbSideCardHeader}>
            <div className={styles.rbSideCardTitle}>Источники</div>
            <button
              className={styles.rbBtnIcon}
              onClick={clearSources}
              title="Очистить источники"
            >
              <Eraser size={14} />
            </button>
          </div>
          <div className={styles.rbSideCardContent}>
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
        </div>

        <div className={styles.rbSideScroll}>
          {/* Column Cards */}
          {dataModel.types.map(t => {
            const group = fieldGroups.find(g => g.typeKey === t.key)
            if (!group) return null
            const coll = collapsedGroups.has(group.typeKey)
            const someSelected = group.fields.some(f => selectedFields.includes(f.key))
            return (
              <div key={group.typeKey} className={styles.rbSideCard} style={{ marginTop: 8 }}>
                <button
                  className={styles.rbSideCardTitle}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '20px 20px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--color-text-secondary, #818594)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                  onClick={() => toggleCollapsedGroup(group.typeKey)}
                >
                  {coll ? '▶' : '▼'} {group.typeLabel}
                  {someSelected && <span style={{ color: '#2d98b4' }}>·</span>}
                </button>
                {!coll && (
                  <div className={styles.rbSideCardContent}>
                    {group.fields.map(f => {
                      const isSelected = selectedFields.includes(f.key)
                      return (
                        <button
                          key={f.key}
                          className={styles.rbChip}
                          data-selected={isSelected}
                          onClick={() => toggleField(f.key)}
                          style={{ width: '100%', justifyContent: 'space-between' }}
                        >
                          {f.label}
                          {isSelected && <span className={styles.rbChipClose}>×</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.rbMain}>
        {/* Toolbar */}
        <div className={styles.rbToolbar}>
        <div className={styles.rbRow} style={{ marginBottom: 10 }}>
          <span className={styles.rbLabel}>Представление:</span>
          <select
            className={styles.rbDropdown}
            value={activeUserView ? `user:${activeUserView}` : (activeView || '')}
            onChange={e => {
              const v = e.target.value
              if (!v) return
              if (v === '__save__') { setShowSaveView(true); return }
              if (v.startsWith('user:')) {
                loadUserView(v.slice(5))
              } else {
                applyView(v)
              }
            }}
          >
            <option value="">Выбрать...</option>
            {views?.map(v => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
            {userViews.length > 0 && (
              <>
                <option disabled>──────────</option>
                {userViews.map(v => (
                  <option key={v.name} value={`user:${v.name}`}>{v.name}</option>
                ))}
              </>
            )}
            <option disabled>──────────</option>
            <option value="__save__">+ Сохранить как представление...</option>
          </select>
          {activeUserView && (
            <button
              className={styles.rbBtn}
              style={{ background: '#d9534f', fontSize: 12, padding: '4px 10px' }}
              onClick={() => deleteUserView(activeUserView)}
            >
              Удалить
            </button>
          )}
          {showSaveView && (
            <>
              <input
                ref={saveViewInputRef}
                className={styles.rbInput}
                placeholder="Название представления"
                value={viewName}
                onChange={e => setViewName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveUserView()
                  if (e.key === 'Escape') { setShowSaveView(false); setViewName('') }
                }}
              />
              <button className={styles.rbBtn} onClick={saveUserView}>Сохранить</button>
              <button
                className={styles.rbBtn}
                style={{ background: '#818594' }}
                onClick={() => { setShowSaveView(false); setViewName('') }}
              >
                Отмена
              </button>
            </>
          )}
          <div style={{ flex: 1 }} />
          {sortedData.length > 0 && !isHardwareView && !isSoftwareView && (
            <span className={styles.rbCountLabel}>
              Найдено {sortedData.length} · Показано {Math.min(sortedData.length, visibleCount)}
            </span>
          )}
          <button
            className={styles.rbBtnGhost}
            onClick={clearAll}
          >
            Очистить
          </button>
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

        <div className={styles.rbRow} style={{ marginBottom: 10 }}>
          <span className={styles.rbLabel}>Группировка:</span>
          <select
            className={styles.rbDropdown}
            value=""
            onChange={e => {
              const v = e.target.value
              if (v && !groupBy.includes(v)) {
                resetActiveView()
                setVisibleCount(10)
                setGroupBy(prev => [...prev, v])
              }
              e.currentTarget.value = ''
            }}
          >
            <option value="">+ Добавить уровень...</option>
            {fieldGroups.map(group => (
              <optgroup key={group.typeKey} label={group.typeLabel}>
                {group.fields.map(f => (
                  <option key={f.key} value={f.key} disabled={groupBy.includes(f.key)}>
                    {f.label}{groupBy.includes(f.key) ? ' ✓' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {groupBy.map((gk, i) => {
            const f = allAvailableFields.find(af => af.key === gk)
            let sourceLabel: string | undefined
            for (const g of fieldGroups) {
              if (g.fields.some(gf => gf.key === gk)) {
                sourceLabel = g.typeLabel
                break
              }
            }
            const label = sourceLabel ? `${f?.label ?? gk} (${sourceLabel})` : (f?.label ?? gk)
            return (
              <button
                key={gk}
                className={styles.rbChip}
                data-filter="true"
                onClick={() => { resetActiveView(); setVisibleCount(10); setGroupBy(prev => prev.filter(k => k !== gk)) }}
              >
                {i + 1}. {label}
                <span className={styles.rbChipClose}>×</span>
              </button>
            )
          })}
        </div>

        <div className={styles.rbRow} style={{ marginBottom: 10 }}>
          <span className={styles.rbLabel}>Фильтр:</span>
          <select
            className={styles.rbDropdown}
            style={{ minWidth: 120 }}
            value={ffField}
            onChange={e => setFfField(e.target.value)}
          >
            <option value="">Поле</option>
            {fieldGroups.map(group => (
              <optgroup key={group.typeKey} label={group.typeLabel}>
                {group.fields.map(f => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </optgroup>
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
            placeholder={ffOp === 'is_empty' || ffOp === 'is_not_empty' ? '(не требуется)' : 'Значение'}
            value={ffVal}
            onChange={e => setFfVal(e.target.value)}
            disabled={ffOp === 'is_empty' || ffOp === 'is_not_empty'}
            onKeyDown={e => { if (e.key === 'Enter') addFilter() }}
          />
          <button className={styles.rbBtnOutline} onClick={addFilter}>+</button>
          {filters.length > 0 && (
            <>
              {filters.map(f => {
                const fld = allAvailableFields.find(af => af.key === f.field)
                let sourceLabel: string | undefined
                for (const g of fieldGroups) {
                  if (g.fields.some(gf => gf.key === f.field)) {
                    sourceLabel = g.typeLabel
                    break
                  }
                }
                const label = sourceLabel ? `${fld?.label ?? f.field} (${sourceLabel})` : (fld?.label ?? f.field)
                return (
                  <button
                    key={f.id}
                    className={styles.rbChip}
                    data-filter="true"
                    title="Нажмите чтобы убрать"
                  >
                    {label} {OP_LABELS[f.operator] ?? f.operator}{f.operator !== 'is_empty' && f.operator !== 'is_not_empty' ? ` ${f.value}` : ''}
                    <span
                      className={styles.rbChipClose}
                      onClick={(e) => { e.stopPropagation(); removeFilter(f.id) }}
                    >
                      ×
                    </span>
                  </button>
                )
              })}
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className={styles.rbTableWrap} ref={tableRef}>
      <table className={styles.rbTable}>
        <thead>
          <tr>
            {isHardwareView ? (
              <>
                <th style={{ width: 40 }}>№</th>
                <th>Модуль</th>
                <th style={{ width: 60, textAlign: 'center' }}>Кол-во модулей</th>
                <th>Наименование узла</th>
                <th>Наименование оборудования</th>
                <th>Артикул оборудования</th>
                <th style={{ width: 60, textAlign: 'center' }}>Кол-во, шт.</th>
              </>
            ) : isSoftwareView ? (
              <>
                <th style={{ width: 40 }}>№</th>
                <th>Модуль</th>
                <th>Производитель</th>
                <th>Наименование товара</th>
                <th>Артикул</th>
                <th style={{ width: 80, textAlign: 'center' }}>Кол-во в 1 модуле</th>
              </>
            ) : (
              <>
                {visibleColumns.map((col, colIdx) => {
                  const [curField, curDir] = (sortBy ?? '').split('-')
                  const isActive = curField === col.key
                  return (
                    <th
                      key={col.key}
                      draggable={col.key !== '__type'}
                      style={{ cursor: col.key === '__type' ? 'default' : 'grab' }}
                      onClick={() => {
                        if (curField === col.key && curDir === 'asc') setSortBy(`${col.key}-desc`)
                        else setSortBy(`${col.key}-asc`)
                      }}
                      onDragStart={e => {
                        if (col.key === '__type') return
                        setDragColIndex(colIdx)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragOver={e => {
                        if (dragColIndex === null || col.key === '__type') return
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={e => {
                        e.preventDefault()
                        if (dragColIndex === null || colIdx === dragColIndex || col.key === '__type') return
                        const keys = selectedFields.map(k => k)
                        const [moved] = keys.splice(dragColIndex - 1, 1)
                        keys.splice(colIdx - 1, 0, moved)
                        setSelectedFields(keys)
                        setDragColIndex(null)
                      }}
                      onDragEnd={() => setDragColIndex(null)}
                    >
                      <div className={styles.rbThContent}>
                        {col.label}
                        <span className={`${styles.rbSortIcon} ${isActive ? styles.active : ''}`}>
                          {isActive ? (curDir === 'asc' ? '↑' : '↓') : '⇅'}
                        </span>
                      </div>
                    </th>
                  )
                })}
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {isHardwareView ? renderHardwareView() :
           isSoftwareView ? renderSoftwareView() :
            groupBy.length > 0 && groupedData.sections.length > 0 ? (
             renderGroupedSections(groupedData.sections as any, 0)
           ) : (
             sortedData.slice(0, visibleCount).map((row) => (
               <tr key={row.id}>
                 {visibleColumns.map(col => (
                   <td key={col.key}>{renderCell(row, col)}</td>
                 ))}
               </tr>
             ))
           )}
          {!isHardwareView && !isSoftwareView && (groupBy.length > 0 ? groupedData.sections.length : sortedData.length) === 0 && (
            <tr>
              <td colSpan={visibleColumns.length || 1} style={{ textAlign: 'center', color: '#818594', padding: 32 }}>
                Нет данных по заданным фильтрам
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {sortedData.length > 0 && !isHardwareView && !isSoftwareView && (
        <div className={styles.rbTableFooter}>
          {sortedData.length > visibleCount && (
            <button className={styles.rbShowMore} onClick={() => setVisibleCount(v => v + 20)}>
              Показать ещё
            </button>
          )}
        </div>
      )}
      </div>
      </div>
    </div>
  )
}

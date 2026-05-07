import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ScreenNode, ScreenModal, SidebarItem, BreadcrumbItem, BreadcrumbOption, TableColumn } from './types'
import { useScreen } from './context/ScreenContext'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Badge } from '@/components/ui/Badge'
import { Message } from '@/components/ui/Message'
import { Progress } from '@/components/ui/Progress'
import { MultiSelectDropdown, type MultiSelectOption } from '@/components/ui/MultiSelectDropdown'
import { ReportBuilder, type ReportField } from '@/components/ui/ReportBuilder'
import { ReportBuilder2 } from '@/components/ui/ReportBuilder2'
import { ReportBuilder3 } from '@/components/ui/ReportBuilder3'
import { Sidebar } from './components/Sidebar'
import { LIcon } from './components/LIcon'
import styles from './NodeRenderer.module.scss'

interface NodeRendererProps {
  node: ScreenNode
  modals: ScreenModal[]
  onOpenModal: (id: string) => void
  onToast: (msg: string) => void
  commentMode?: boolean
}

export function NodeRenderer({ node, modals, onOpenModal, onToast, commentMode }: NodeRendererProps) {
  const navigate = useNavigate()
  const screen = useScreen()
  // Resolve props through screen context — replaces $state.*, $computed.*, %if(), %includes()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolvedProps = (screen.resolve(node.props ?? {}) ?? {}) as Record<string, any>
  const p = resolvedProps

  // Parse and execute action strings (legacy) + dispatch screen actions (v2)
  const handleAction = (action?: string) => {
    if (!action || action === 'none') return
    if (action.startsWith('navigate:')) navigate(action.slice(9))
    else if (action.startsWith('modal:')) screen.dispatch({ type: 'MODAL_OPEN', target: action.slice(6) })
    else if (action.startsWith('toast:')) screen.dispatch({ type: 'TOAST', text: action.slice(6) })
  }

  // Execute an on: handler via screen dispatch
  const fireHandler = (handlerName: string) => {
    if (!node.on) return
    const action = node.on[handlerName]
    if (action) screen.dispatch(action)
  }

  const renderChildren = (children?: ScreenNode[]) =>
    children?.map(child => (
      <NodeRenderer
        key={child.id}
        node={child}
        modals={modals}
        onOpenModal={onOpenModal}
        onToast={onToast}
        commentMode={commentMode}
      />
    ))

  const dataAttrs = { 'data-node-id': node.id }

  // ─── Layout ───────────────────────────────────────────────────────────────
  if (node.type === 'app-shell') {
    const sidebarNode     = p.sidebar     as ScreenNode | undefined
    const breadcrumbsNode = p.breadcrumbs as ScreenNode | undefined
    const contentNode     = p.content     as ScreenNode | undefined
    return (
      <div className={styles.appShell} {...dataAttrs}>
        {sidebarNode && (
          <NodeRenderer node={sidebarNode} modals={modals} onOpenModal={onOpenModal} onToast={onToast} commentMode={commentMode} />
        )}
        {/* Main — vertical flex, gap=16, breadcrumbs (hug) + content (grow) */}
        <div className={styles.appShellMain}>
          {breadcrumbsNode && (
            <NodeRenderer node={breadcrumbsNode} modals={modals} onOpenModal={onOpenModal} onToast={onToast} commentMode={commentMode} />
          )}
          <div className={styles.appShellContent}>
            {contentNode && (
              <NodeRenderer node={contentNode} modals={modals} onOpenModal={onOpenModal} onToast={onToast} commentMode={commentMode} />
            )}
          </div>
        </div>
      </div>
    )
  }

  if (node.type === 'vstack') {
    return (
      <div
        className={styles.vstack}
        style={{ gap: `${clampGap(p.gap)}px` }}
        {...dataAttrs}
      >
        {renderChildren(node.children)}
      </div>
    )
  }

  if (node.type === 'hstack') {
    return (
      <div
        className={styles.hstack}
        style={{
          gap: `${clampGap(p.gap)}px`,
          justifyContent: mapJustify(p.justify as string),
          alignItems: p.align as string ?? 'center',
        }}
        {...dataAttrs}
      >
        {renderChildren(node.children)}
      </div>
    )
  }

  if (node.type === 'grid') {
    const cols = typeof p.columns === 'number' ? `repeat(${p.columns}, 1fr)` : String(p.columns ?? '1fr')
    return (
      <div
        className={styles.grid}
        style={{ gridTemplateColumns: cols, gap: `${clampGap(p.gap)}px` }}
        {...dataAttrs}
      >
        {renderChildren(node.children)}
      </div>
    )
  }

  if (node.type === 'card') {
    return (
      <div className={styles.card} style={{ padding: `${p.padding ?? 24}px` }} {...dataAttrs}>
        {p.title && <div className={styles.cardTitle}>{String(p.title)}</div>}
        {renderChildren(node.children)}
      </div>
    )
  }

  if (node.type === 'text') {
    const variant = (p.variant as string) ?? 'body'
    return (
      <p className={`${styles.text} ${styles[`text--${variant}`]}`} {...dataAttrs}>
        {String(p.text ?? '')}
      </p>
    )
  }

  if (node.type === 'divider') {
    return <hr className={styles.divider} {...dataAttrs} />
  }

  // icon — renders any lucide icon by name, e.g. { type: 'icon', props: { name: 'activity', size: 20 } }
  if (node.type === 'icon') {
    return (
      <span
        {...dataAttrs}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: (p.color as string) || 'currentColor',
          flexShrink: 0,
        }}
      >
        <LIcon
          name={String(p.name ?? 'circle')}
          size={Number(p.size ?? 20)}
          strokeWidth={Number(p.strokeWidth ?? 1.6)}
        />
      </span>
    )
  }

  // menu-button — minibar icon button, 40×40, with active/hover states
  // Props: icon (lucide name), active (bool), title (string), onClick (action)
  // States per Figma 1827-16065:
  //   default:      transparent bg, icon #75777B
  //   hover:        bg #EEF1F5
  //   active:       bg #EEF1F5, border 1px solid #2D98B4
  //   active+hover: bg #60C4DD, icon white
  if (node.type === 'menu-button') {
    const isActive = Boolean(p.active)
    return (
      <button
        className={`${styles.menuButton} ${isActive ? styles.menuButtonActive : ''}`}
        title={String(p.title ?? '')}
        onClick={() => handleAction(p.onClick as string)}
        {...dataAttrs}
      >
        <LIcon name={String(p.icon ?? 'circle')} size={20} strokeWidth={1.6} />
      </button>
    )
  }

  // ─── Navigation ───────────────────────────────────────────────────────────
  if (node.type === 'sidebar') {
    const items = (p.items as SidebarItem[]) ?? []
    return (
      <Sidebar
        items={items}
        logo={p.logo as { mark?: string; text?: string } | undefined}
        avatarLabel={p.avatarLabel as string | undefined}
        collapsed={Boolean(p.collapsed)}
        data-node-id={node.id}
      />
    )
  }

  if (node.type === 'breadcrumbs') {
    const items = (p.items as BreadcrumbItem[]) ?? []
    const lastIdx = items.length - 1
    return (
      <nav className={styles.breadcrumbs} aria-label="breadcrumb" {...dataAttrs}>
        {items.map((item, i) => (
          <span key={i} className={styles.breadcrumbItem}>
            {i > 0 && <span className={styles.breadcrumbSep}>•</span>}
            <BcItem item={item} isCurrent={i === lastIdx} navigate={navigate} />
          </span>
        ))}
      </nav>
    )
  }

  if (node.type === 'tab-menu') {
    const items = (p.items as Array<{ id: string; label: string }>) ?? []
    const activeId = p.activeId as string | undefined
    const panels = node.children?.filter(c => c.type === 'tab-panel') ?? []
    const activePanel = panels.find(c => c.props?.tabId === activeId) ?? panels[0]

    const handleTabClick = (tabId: string) => {
      // Fire the tabChange handler from node.on if present
      if (node.on?.tabChange) {
        screen.dispatch({ ...node.on.tabChange, value: tabId } as any)
      }
    }

    return (
      <div className={styles.tabMenu} {...dataAttrs}>
        <div className={styles.tabBar}>
          {items.map(item => (
            <button
              key={item.id}
              className={`${styles.tab} ${item.id === activeId ? styles['tab--active'] : ''}`}
              onClick={() => handleTabClick(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        {activePanel && renderChildren(activePanel.children)}
      </div>
    )
  }

  // ─── Actions ──────────────────────────────────────────────────────────────
  if (node.type === 'button') {
    const hasOnClick = !!(node.on?.click)
    return (
      <Button
        label={String(p.label ?? 'Button')}
        size={(p.size as 'sm' | 'lg') ?? 'lg'}
        variant={(p.variant as 'accent' | 'default' | 'ghost') ?? 'accent'}
        onClick={() => {
          if (hasOnClick) fireHandler('click')
          else handleAction(p.onClick as string)
        }}
      />
    )
  }

  if (node.type === 'button-chip') {
    const hasOnClick = !!(node.on?.click)
    return (
      <button
        className={`${styles.chip} ${p.selected ? styles['chip--selected'] : ''} ${p.variant === 'accent' ? styles['chip--accent'] : ''} ${p.size === 'sm' ? styles['chip--sm'] : ''}`}
        onClick={() => {
          if (hasOnClick) fireHandler('click')
          else handleAction(p.onClick as string)
        }}
        {...dataAttrs}
      >
        {String(p.label ?? '')}
      </button>
    )
  }

  // button-dropdown — кнопка с выпадающим меню
  if (node.type === 'button-dropdown') {
    const [open, setOpen] = useState(false)
    const wrapRef = useRef<HTMLDivElement>(null)
    const items = (p.items as Array<{ id: string; label: string; icon?: string }>) ?? []

    useEffect(() => {
      if (!open) return
      function handler(e: MouseEvent) {
        if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
          setOpen(false)
        }
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, [open])

    return (
      <div className={styles.btnDropdownWrap} ref={wrapRef} {...dataAttrs}>
        <button
          className={`${styles.btnDropdown} ${p.variant === 'accent' ? styles.btnDropdownAccent : ''} ${p.size === 'sm' ? styles.btnDropdownSm : ''} ${open ? styles.btnDropdownOpen : ''}`}
          onClick={() => setOpen(v => !v)}
          type="button"
        >
          {p.icon && <LIcon name={String(p.icon)} size={p.size === 'sm' ? 14 : 16} strokeWidth={1.8} />}
          <span>{String(p.label ?? 'Menu')}</span>
          <LIcon name="chevron-down" size={p.size === 'sm' ? 12 : 14} strokeWidth={2} className={styles.btnDropdownChevron} />
        </button>
        {open && (
          <div className={styles.btnDropdownMenu} role="menu">
            {items.map(item => (
              <button
                key={item.id}
                className={styles.btnDropdownItem}
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  if (node.on?.[item.id]) fireHandler(item.id)
                }}
              >
                {item.icon && <LIcon name={item.icon} size={16} strokeWidth={1.8} />}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── Forms ────────────────────────────────────────────────────────────────
  if (node.type === 'input') {
    const hasLabel = !!p.label
    return (
      <div className={`${styles.formField} ${!hasLabel ? styles.formFieldInline : ''}`} {...dataAttrs}>
        {hasLabel && <label className={styles.label}>{String(p.label)}</label>}
        <input
          className={`${styles.input} ${p.size === 'sm' ? styles['input--sm'] : ''} ${p.error ? styles['input--error'] : ''}`}
          placeholder={String(p.placeholder ?? '')}
          defaultValue={String(p.value ?? '')}
          disabled={Boolean(p.disabled)}
          onChange={e => {
            if (node.on?.change) {
              screen.dispatch({ ...node.on.change, value: e.target.value } as any)
            }
          }}
        />
        {p.error && p.errorText && <span className={styles.errorText}>{String(p.errorText)}</span>}
        {p.hint && <span className={styles.hint}>{String(p.hint)}</span>}
      </div>
    )
  }

  if (node.type === 'textarea') {
    return (
      <div className={styles.formField} {...dataAttrs}>
        {p.label && <label className={styles.label}>{String(p.label)}</label>}
        <textarea
          className={styles.textarea}
          placeholder={String(p.placeholder ?? '')}
          defaultValue={String(p.value ?? '')}
          rows={Number(p.rows ?? 4)}
          disabled={Boolean(p.disabled)}
        />
      </div>
    )
  }

  if (node.type === 'checkbox') {
    return (
      <label className={styles.checkboxLabel} {...dataAttrs}>
        <input
          type="checkbox"
          checked={Boolean(p.checked)}
          onChange={() => fireHandler('change')}
          disabled={Boolean(p.disabled)}
        />
        <span>{String(p.label ?? '')}</span>
      </label>
    )
  }

  if (node.type === 'switch') {
    return (
      <label className={styles.switchLabel} {...dataAttrs}>
        <div
          className={`${styles.switch} ${p.checked ? styles['switch--on'] : ''}`}
          onClick={() => fireHandler('change')}
          role="switch"
          aria-checked={Boolean(p.checked)}
          tabIndex={0}
        >
          <div className={styles.switchThumb} />
        </div>
        {p.label && <span>{String(p.label)}</span>}
      </label>
    )
  }

  if (node.type === 'dropdown') {
    const options = (p.options as Array<{ value: string; label: string }>) ?? []
    const hasLabel = !!p.label
    return (
      <div className={`${styles.formField} ${!hasLabel ? styles.formFieldInline : ''}`} {...dataAttrs}>
        {hasLabel && <label className={styles.label}>{String(p.label)}</label>}
        <select
          className={`${styles.select} ${p.size === 'sm' ? styles['select--sm'] : ''}`}
          value={String(p.value ?? '')}
          onChange={e => {
            if (node.on?.change) {
              screen.dispatch({ ...node.on.change, value: e.target.value } as any)
            }
          }}
        >
          {p.placeholder && <option value="">{String(p.placeholder)}</option>}
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    )
  }

  // multi-select-dropdown — dropdown with search + checkboxes
  if (node.type === 'multi-select-dropdown') {
    const options = (p.options as MultiSelectOption[]) ?? []
    const value = (p.value as string[]) ?? []
    return (
      <MultiSelectDropdown
        label={String(p.label ?? '')}
        options={options}
        value={value}
        placeholder={p.placeholder as string | undefined}
        allLabel={p.allLabel as string | undefined}
        onChange={vals => {
          if (node.on?.change) {
            screen.dispatch({ ...node.on.change, value: vals } as any)
          }
        }}
      />
    )
  }

  // ─── Table Controls ───────────────────────────────────────────────────────
  // Left zone: search input + filter chips (left→right)
  // Right zone: action buttons (left→right, last = accent)
  if (node.type === 'table-controls') {
    const search = p.search as { placeholder?: string } | undefined
    const filters = (p.filters as Array<{ id: string; label: string; active?: boolean }>) ?? []
    const actions = (p.actions as Array<{ id: string; label?: string; icon?: string; variant?: string; size?: string; onClick?: string }>) ?? []
    return (
      <div className={styles.tableControls} {...dataAttrs}>
        <div className={styles.tableControlsLeft}>
          {search !== undefined && (
            <div className={styles.tableControlsSearch}>
              <LIcon name="search" size={16} strokeWidth={1.8} className={styles.tableControlsSearchIcon} />
              <input
                className={styles.tableControlsSearchInput}
                placeholder={search.placeholder ?? 'Поиск'}
              />
            </div>
          )}
          {filters.map(f => (
            <button
              key={f.id}
              className={`${styles.chip} ${f.active ? styles['chip--selected'] : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className={styles.tableControlsRight}>
          {actions.map(a => (
            <Button
              key={a.id}
              label={a.label ?? ''}
              icon={a.icon}
              size={(a.size as 'sm' | 'lg') ?? 'sm'}
              variant={(a.variant as 'accent' | 'default' | 'ghost') ?? 'ghost'}
              onClick={() => handleAction(a.onClick)}
            />
          ))}
        </div>
      </div>
    )
  }

  // ─── Table ────────────────────────────────────────────────────────────────
  // Columns: { key, label, width?, type?, sortable?, sortDir?: 'asc'|'desc', align? }
  // Data: array of row objects keyed by column.key
   if (node.type === 'table') {
     const rawCols = p.columns
     const rawData = p.data
     const columns: TableColumn[] = Array.isArray(rawCols) ? rawCols : []
     const data: Record<string, unknown>[] = Array.isArray(rawData) ? rawData : []
     return (
       <div className={styles.tableWrap} {...dataAttrs}>
         <table className={styles.table}>
           <thead>
             <tr>
               {columns.map(col => {
                 const sortIconName = col.sortDir === 'asc' ? 'chevron-up' : col.sortDir === 'desc' ? 'chevron-down' : 'chevrons-up-down'
                 const isActiveSort = Boolean(col.sortDir)
                 return (
                   <th key={col.key} style={{ width: col.width, textAlign: col.align ?? 'left' }}>
                     {col.sortable ? (
                       <span className={styles.thInner}>
                         <span>{col.label}</span>
                         <LIcon
                           name={sortIconName}
                           size={14}
                           strokeWidth={1.8}
                           className={`${styles.sortIcon} ${isActiveSort ? styles.sortIconActive : ''}`}
                         />
                       </span>
                     ) : col.label}
                   </th>
                 )
               })}
             </tr>
           </thead>
           <tbody>
             {data.map((row, ri) => {
               const r = row as Record<string, unknown>
               // Section header row
               if (r._isSectionHeader) {
                 return (
                   <tr key={`sh-${ri}`} className={styles.sectionHeader}>
                     <td colSpan={columns.length}>
                       {String(r._sectionTitle)}
                     </td>
                   </tr>
                 )
               }
               const groupSpan = r._groupSpan as Record<string, number> | undefined
               return (
                 <tr key={ri}>
                   {columns.map(col => {
                     // Row number column
                     if (col.key === '_rowNumber') {
                       return (
                         <td key={col.key} style={{ textAlign: col.align ?? 'center' }}>
                           {r._rowNumber !== undefined ? String(r._rowNumber) : ''}
                         </td>
                       )
                     }
                     // Grouped column: skip if span is 0 (covered by rowspan above)
                     if (col.groupBy && groupSpan && groupSpan[col.key] === 0) {
                       return null
                     }
                     const rowspan = col.groupBy && groupSpan ? groupSpan[col.key] : undefined
                     return (
                       <td
                         key={col.key}
                         style={{ textAlign: col.align ?? 'left' }}
                         rowSpan={rowspan && rowspan > 1 ? rowspan : undefined}
                       >
                         {renderTableCell(col, row[col.key], handleAction)}
                       </td>
                     )
                   })}
                 </tr>
               )
             })}
           </tbody>
         </table>
       </div>
     )
   }

  // ─── Data Display ─────────────────────────────────────────────────────────
  if (node.type === 'status-badge') {
    return (
      <StatusBadge
        status={(p.status as 'active' | 'warning' | 'critical') ?? 'active'}
        label={p.label as string | undefined}
      />
    )
  }

  if (node.type === 'badge') {
    return <Badge label={String(p.label ?? '')} variant={p.variant as 'gray-strong'} />
  }

  if (node.type === 'progress') {
    return <Progress value={Number(p.value ?? 0)} label={p.label as string | undefined} />
  }

  if (node.type === 'metric-card') {
    const statusClass = (p.status as string) ?? 'normal'
    return (
      <div className={`${styles.metricCard} ${styles[`metricCard--${statusClass}`]}`} {...dataAttrs}>
        <div className={styles.metricLabel}>{String(p.label ?? '')}</div>
        <div className={styles.metricValue}>
          {p.value}{p.unit && <span className={styles.metricUnit}>{String(p.unit)}</span>}
        </div>
        {p.showProgress !== false && typeof p.value === 'number' && (
          <Progress value={Number(p.value)} />
        )}
      </div>
    )
  }

  // ─── Feedback ─────────────────────────────────────────────────────────────
  if (node.type === 'message') {
    return (
      <Message
        type={(p.type as 'info' | 'warning' | 'error' | 'success') ?? 'info'}
        text={String(p.text ?? '')}
        title={p.title as string | undefined}
      />
    )
  }

  if (node.type === 'tooltip') {
    return (
      <div className={styles.tooltipWrap} {...dataAttrs}>
        {renderChildren(node.children)}
        <div className={`${styles.tooltipBox} ${styles[`tooltipBox--${p.position ?? 'top'}`]}`}>
          {String(p.text ?? '')}
        </div>
      </div>
    )
  }

  if (node.type === 'modal-trigger') {
    return (
      <div onClick={() => handleAction(p.onClick as string)} {...dataAttrs}>
        {renderChildren(node.children)}
      </div>
    )
  }

  // reorder-list — draggable list for column ordering
  if (node.type === 'reorder-list') {
    const [dragIdx, setDragIdx] = useState<number | null>(null)
    const options = (p.options as Array<{ value: string; label: string }>) ?? []
    const value = (p.value as string[]) ?? []

    const handleDragStart = (idx: number) => setDragIdx(idx)
    const handleDragOver = (e: React.DragEvent, idx: number) => {
      e.preventDefault()
      if (dragIdx === null || dragIdx === idx) return
      const next = [...value]
      const [item] = next.splice(dragIdx, 1)
      next.splice(idx, 0, item)
      setDragIdx(idx)
      if (node.on?.change) {
        screen.dispatch({ ...node.on.change, value: next } as any)
      }
    }

    return (
      <div className={styles.reorderList} {...dataAttrs}>
        {p.label && <label className={styles.label}>{String(p.label)}</label>}
        <div className={styles.reorderListInner}>
          {value.map((val, i) => {
            const opt = options.find(o => o.value === val)
            return (
              <div
                key={val}
                draggable
                className={`${styles.reorderItem} ${dragIdx === i ? styles.reorderItemDragging : ''}`}
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDragEnd={() => setDragIdx(null)}
              >
                <LIcon name="grip-vertical" size={16} strokeWidth={2} className={styles.reorderGrip} />
                <span>{opt?.label || val}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // filter-group — dynamic filters for each selected column
  if (node.type === 'filter-group') {
    const fields = (p.fields as Array<{ key: string; label: string }>) ?? []
    const values = (p.values as Record<string, string[]>) ?? {}
    const activeFilters = (p.activeFilters as Record<string, string[]>) ?? {}

    return (
      <div className={styles.filterGroup} {...dataAttrs}>
        {fields.map(f => (
          <MultiSelectDropdown
            key={f.key}
            label={f.label}
            options={(values[f.key] || []).map(v => ({ value: v, label: v }))}
            value={activeFilters[f.key] || []}
            placeholder="Все"
            allLabel="Все"
            onChange={vals => {
              if (node.on?.change) {
                const newFilters = { ...activeFilters, [f.key]: vals }
                screen.dispatch({ ...node.on.change, value: newFilters } as any)
              }
            }}
          />
        ))}
      </div>
    )
  }

  // ─── Report Builder (interactive table builder) ───────────────────────────
  if (node.type === 'report-builder') {
    const fields = (p.allFields as ReportField[]) ?? []
    const data = (p.allData as Record<string, string>[]) ?? []
    const defFields = p.defaultFields as string[] | undefined
    const defFilters = p.defaultFilters as { field: string; operator: string; value: string }[] | undefined
    const defGroup = p.defaultGroupBy as string | null | undefined
    const defSort = p.defaultSort as string | null | undefined
    return (
      <div {...dataAttrs}>
        <ReportBuilder
          allFields={fields}
          allData={data}
          defaultFields={defFields}
          defaultFilters={defFilters}
          defaultGroupBy={defGroup ?? null}
          defaultSort={defSort ?? null}
        />
      </div>
    )
  }

  // ─── Report Builder 2 (CMDB hierarchical) ────────────────────────────────
  if (node.type === 'report-builder2') {
    const dm = p.dataModel as { types: { key: string; label: string; parentType: string | null; fields: { key: string; label: string }[] }[] }
    const data = (p.allData as Record<string, string>[]) ?? []
    const vw = p.views as { id: string; label: string; defaultTypes: string[]; defaultFields: string[]; defaultGroupBy: string[]; defaultSort?: string | null; defaultFilters?: { field: string; operator: string; value: string }[] }[] | undefined
    const dv = p.defaultView as string | undefined
    const dt = p.defaultTypes as string[] | undefined
    const df = p.defaultFields as string[] | undefined
    const dg = p.defaultGroupBy as string[] | undefined
    const ds = p.defaultSort as string | null | undefined
    const dfl = p.defaultFilters as { field: string; operator: string; value: string }[] | undefined
    return (
      <div {...dataAttrs}>
        <ReportBuilder2
          dataModel={dm}
          allData={data}
          views={vw}
          defaultView={dv}
          defaultTypes={dt}
          defaultFields={df}
          defaultGroupBy={dg}
          defaultSort={ds ?? null}
          defaultFilters={dfl}
        />
      </div>
    )
  }

  // ─── Report Builder 3 (CMDB hierarchical v3) ────────────────────────────────
  if (node.type === 'report-builder3') {
    const dm = p.dataModel as { types: { key: string; label: string; parentType: string | null; fields: { key: string; label: string }[] }[] }
    const data = (p.allData as Record<string, string>[]) ?? []
    const vw = p.views as { id: string; label: string; defaultTypes: string[]; defaultFields: string[]; defaultGroupBy: string[]; defaultSort?: string | null; defaultFilters?: { field: string; operator: string; value: string }[] }[] | undefined
    const dv = p.defaultView as string | undefined
    const dt = p.defaultTypes as string[] | undefined
    const df = p.defaultFields as string[] | undefined
    const dg = p.defaultGroupBy as string[] | undefined
    const ds = p.defaultSort as string | null | undefined
    const dfl = p.defaultFilters as { field: string; operator: string; value: string }[] | undefined
    return (
      <div {...dataAttrs}>
        <ReportBuilder3
          dataModel={dm}
          allData={data}
          views={vw}
          defaultView={dv}
          defaultTypes={dt}
          defaultFields={df}
          defaultGroupBy={dg}
          defaultSort={ds ?? null}
          defaultFilters={dfl}
        />
      </div>
    )
  }

  // ─── Fallback ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.unknown} {...dataAttrs}>
      {`[unknown: ${node.type}]`}
      {renderChildren(node.children)}
    </div>
  )
}

// ─── Breadcrumb item with optional dropdown ───────────────────────────────────

interface BcItemProps {
  item: BreadcrumbItem
  isCurrent: boolean
  navigate: (path: string) => void
}

function BcItem({ item, isCurrent, navigate }: BcItemProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const hasOptions = item.options && item.options.length > 0

  const label = (
    <span className={isCurrent ? styles.breadcrumbCurrent : styles.breadcrumbLink}>
      {item.label}
    </span>
  )

  if (!hasOptions) {
    // Simple link or static label
    if (item.href && !isCurrent) {
      return (
        <button className={styles.breadcrumbLink} onClick={() => navigate(item.href!)}>
          {item.label}
        </button>
      )
    }
    return <span className={isCurrent ? styles.breadcrumbCurrent : styles.breadcrumbLink}>{item.label}</span>
  }

  // Dropdown variant
  return (
    <div className={styles.bcDropWrap} ref={wrapRef}>
      <button
        className={`${isCurrent ? styles.breadcrumbCurrent : styles.breadcrumbLink} ${styles.bcDropTrigger}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {item.label}
        <span className={`${styles.bcChevron} ${open ? styles.bcChevronOpen : ''}`}>▾</span>
      </button>
      {open && (
        <div className={styles.bcDropdown} role="listbox">
          {(item.options as BreadcrumbOption[]).map((opt, i) => (
            <button
              key={i}
              className={`${styles.bcDropItem} ${opt.active ? styles.bcDropItemActive : ''}`}
              role="option"
              aria-selected={opt.active}
              onClick={() => { navigate(opt.href); setOpen(false) }}
            >
              {opt.active && <span className={styles.bcDropItemDot} />}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Layout containers (vstack/hstack/grid) must NOT have padding from JSON.
// Only gap is allowed, capped at 24px to prevent oversized spacing.
const GAP_MAX = 24
function clampGap(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v) || 16
  return Math.min(Math.max(n, 0), GAP_MAX)
}

// parsePadding is only used for card-like nodes (card itself).
// It caps each side at 32px to prevent absurd values from JSON.
function parsePadding(v: unknown): string {
  const CAP = 32
  if (!v) return '0'
  if (typeof v === 'number') return `${Math.min(v, CAP)}px`
  return String(v).split(/\s+/).map(x => `${Math.min(Number(x) || 0, CAP)}px`).join(' ')
}

function mapJustify(v?: string): string {
  const map: Record<string, string> = {
    start: 'flex-start', end: 'flex-end', center: 'center', 'space-between': 'space-between'
  }
  return map[v ?? 'start'] ?? 'flex-start'
}

function renderTableCell(col: TableColumn, value: unknown, handleAction: (a?: string) => void) {
  if (col.type === 'status-badge') {
    return <StatusBadge status={(value as 'active' | 'warning' | 'critical') ?? 'active'} />
  }
  if (col.type === 'badge') {
    return <Badge label={String(value ?? '')} />
  }
  if (col.type === 'progress') {
    return <Progress value={Number(value ?? 0)} />
  }
  if (col.type === 'button' && value && typeof value === 'object') {
    const v = value as Record<string, unknown>
    return (
      <Button
        label={String(v.label ?? 'Action')}
        size={(v.size as 'sm' | 'lg') ?? 'sm'}
        variant={(v.variant as 'accent' | 'default' | 'ghost') ?? 'default'}
        onClick={() => handleAction(v.onClick as string)}
      />
    )
  }
  return <span>{String(value ?? '')}</span>
}

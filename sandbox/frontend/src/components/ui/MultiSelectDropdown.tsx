import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { LIcon } from '@/renderer/components/LIcon'
import styles from './MultiSelectDropdown.module.scss'

export interface MultiSelectOption {
  value: string
  label: string
  children?: MultiSelectOption[]
}

interface MultiSelectDropdownProps {
  label: string
  options: MultiSelectOption[]
  value: string[]
  placeholder?: string
  onChange: (values: string[]) => void
  allLabel?: string
}

function getLeafValues(opt: MultiSelectOption): string[] {
  if (!opt.children || opt.children.length === 0) return [opt.value]
  return opt.children.flatMap(getLeafValues)
}

function getAllLeafValues(options: MultiSelectOption[]): string[] {
  return options.flatMap(getLeafValues)
}

function getNodeState(opt: MultiSelectOption, selected: string[]): 'checked' | 'partial' | 'unchecked' {
  if (!opt.children || opt.children.length === 0) {
    return selected.includes(opt.value) ? 'checked' : 'unchecked'
  }
  const childStates = opt.children.map(c => getNodeState(c, selected))
  if (childStates.every(s => s === 'checked')) return 'checked'
  if (childStates.some(s => s === 'checked' || s === 'partial')) return 'partial'
  return 'unchecked'
}

export function MultiSelectDropdown({
  label,
  options,
  value,
  placeholder,
  onChange,
  allLabel = 'Все',
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const target = e.target as Node
      if (dropdownRef.current && dropdownRef.current.contains(target)) return
      if (wrapRef.current && wrapRef.current.contains(target)) return
      setOpen(false)
      setSearch('')
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 260),
        zIndex: 9999,
      })
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [open])

  const toggleExpand = useCallback((val: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(val)) next.delete(val)
      else next.add(val)
      return next
    })
  }, [])

  const allLeafValues = getAllLeafValues(options)
  const allSelected = allLeafValues.length > 0 && allLeafValues.every(v => value.includes(v))
  const someSelected = value.length > 0 && !allSelected

  const toggleAll = useCallback(() => {
    if (allSelected) onChange([])
    else onChange(allLeafValues)
  }, [allSelected, allLeafValues, onChange])

  const toggleNode = useCallback((opt: MultiSelectOption) => {
    const leaves = getLeafValues(opt)
    const state = getNodeState(opt, value)
    if (state === 'checked') {
      onChange(value.filter(v => !leaves.includes(v)))
    } else {
      const next = new Set(value)
      leaves.forEach(v => next.add(v))
      onChange(Array.from(next))
    }
  }, [value, onChange])

  const toggleLeaf = useCallback((leafVal: string) => {
    onChange(value.includes(leafVal) ? value.filter(v => v !== leafVal) : [...value, leafVal])
  }, [value, onChange])

  const displayText = value.length === 0
    ? (placeholder ?? label)
    : value.length === allLeafValues.length
      ? allLabel
      : `${value.length} выбрано`

  function filterOptions(opts: MultiSelectOption[], query: string): MultiSelectOption[] {
    if (!query) return opts
    const q = query.toLowerCase()
    return opts.reduce<MultiSelectOption[]>((acc, opt) => {
      if (opt.children) {
        const filteredChildren = filterOptions(opt.children, q)
        if (filteredChildren.length > 0 || opt.label.toLowerCase().includes(q)) {
          acc.push({ ...opt, children: filteredChildren.length > 0 ? filteredChildren : opt.children })
        }
      } else if (opt.label.toLowerCase().includes(q)) {
        acc.push(opt)
      }
      return acc
    }, [])
  }

  const filtered = filterOptions(options, search)

  function renderOption(opt: MultiSelectOption, depth: number): React.ReactNode {
    const hasChildren = opt.children && opt.children.length > 0
    const isExpanded = expanded.has(opt.value)
    const state = hasChildren ? getNodeState(opt, value) : (value.includes(opt.value) ? 'checked' : 'unchecked')
    const paddingLeft = depth * 20 + 12

    return (
      <div key={opt.value}>
        <div
          className={`${styles.optionRow} ${state === 'checked' ? styles.optionRowChecked : ''}`}
          style={{ paddingLeft: `${paddingLeft}px` }}
        >
          {hasChildren ? (
            <button
              className={styles.expandBtn}
              onClick={(e) => { e.stopPropagation(); toggleExpand(opt.value) }}
              type="button"
            >
              <LIcon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={14} strokeWidth={2} />
            </button>
          ) : (
            <span className={styles.expandSpacer} />
          )}

          <button
            className={`${styles.checkbox} ${styles[`checkbox--${state}`]}`}
            onClick={() => hasChildren ? toggleNode(opt) : toggleLeaf(opt.value)}
            type="button"
          >
            {state === 'checked' && <LIcon name="check" size={12} strokeWidth={3} />}
            {state === 'partial' && <span className={styles.checkboxDash} />}
          </button>

          <span
            className={styles.optionLabel}
            onClick={() => hasChildren ? toggleNode(opt) : toggleLeaf(opt.value)}
          >
            {opt.label}
          </span>
        </div>

        {hasChildren && isExpanded && (
          <div className={styles.children}>
            {opt.children!.map(child => renderOption(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const dropdownContent = (
    <div ref={dropdownRef} className={styles.dropdown} style={dropdownStyle}>
      <div className={styles.searchWrap}>
        <LIcon name="search" size={14} strokeWidth={2} className={styles.searchIcon} />
        <input
          ref={searchRef}
          className={styles.searchInput}
          placeholder="Поиск"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.list}>
        <div
          className={`${styles.optionRow} ${styles.optionRowAll} ${allSelected ? styles.optionRowChecked : ''}`}
        >
          <span className={styles.expandSpacer} />
          <button
            className={`${styles.checkbox} ${styles[`checkbox--${allSelected ? 'checked' : someSelected ? 'partial' : 'unchecked'}`]}`}
            onClick={toggleAll}
            type="button"
          >
            {allSelected && <LIcon name="check" size={12} strokeWidth={3} />}
            {someSelected && <span className={styles.checkboxDash} />}
          </button>
          <span className={styles.optionLabel} onClick={toggleAll}>{allLabel}</span>
        </div>

        {filtered.map(opt => renderOption(opt, 0))}

        {filtered.length === 0 && (
          <div className={styles.empty}>Ничего не найдено</div>
        )}
      </div>
    </div>
  )

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <label className={styles.label}>{label}</label>
      <button
        ref={triggerRef}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen(v => !v)}
        type="button"
      >
        <span className={styles.triggerText}>{displayText}</span>
        <LIcon name="chevron-down" size={14} strokeWidth={2} className={styles.triggerChevron} />
      </button>

      {open && typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </div>
  )
}

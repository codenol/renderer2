import type { ComputedDef, ComputedExprDef, ComputedFilterDef, ComputedMapDef, ComputedSectionGroupDef, ScreenComputed } from '../types'

// ─── Reference resolution ──────────────────────────────────────────────────

const REF_RE = /\$([a-zA-Z_]\w*\.\S+?)(?:\s|,|\)|$|"|'|`|\}|])/g
const ENTIRE_REF_RE = /^\$(state|computed|data)\.(.+)$/
const IF_EXPR_RE = /^%if\((.+?),(.+?),(.+?)\)$/
const INCLUDE_RE = /^%includes\((.+?),(.+?)\)$/

export type ResolverContext = {
  state: Record<string, unknown>
  data: Record<string, unknown>
  computed: Record<string, unknown>
}

/**
 * Resolve a single value: string $refs, %if() expressions, objects, arrays.
 */
export function resolveValue(
  value: unknown,
  ctx: ResolverContext,
  activeModalId: string | null = null,
): unknown {
  // Resolve modal actions — convert MODAL_OPEN/MODAL_CLOSE
  if (typeof value === 'string' && value === '$context.activeModalId') {
    return activeModalId
  }

  if (typeof value === 'string') {
    // Handle entire $ref: "$state.viewMode"
    const entireMatch = value.match(ENTIRE_REF_RE)
    if (entireMatch) {
      const [, scope, path] = entireMatch
      return deepGet(scopeMap(scope, ctx), path)
    }
    // Handle %if(condition, trueVal, falseVal)
    const ifMatch = value.match(IF_EXPR_RE)
    if (ifMatch) {
      const [, condition, trueVal, falseVal] = ifMatch
      const resolvedCond = resolveInlineRefs(condition.trim(), ctx)
      const condTruthy = safeEvalCondition(String(resolvedCond))
      const picked = condTruthy ? trueVal.trim() : falseVal.trim()
      return resolveValue(picked, ctx, activeModalId)
    }
    // Handle %includes(arrayRef, searchVal)
    const includeMatch = value.match(INCLUDE_RE)
    if (includeMatch) {
      const [, arrayRef, searchVal] = includeMatch
      const arr = resolveValue(arrayRef.trim(), ctx, activeModalId)
      const search = searchVal.trim().replace(/^['"]|['"]$/g, '')
      if (Array.isArray(arr)) return arr.includes(search)
      return false
    }
    // Handle inline $refs in a string: "Page $state.page of $computed.totalPages"
    return resolveInlineRefs(value, ctx)
  }

  if (Array.isArray(value)) {
    return value.map(v => resolveValue(v, ctx, activeModalId))
  }

  if (value !== null && typeof value === 'object') {
    const resolved: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>)) {
      resolved[key] = resolveValue((value as Record<string, unknown>)[key], ctx, activeModalId)
    }
    return resolved
  }

  return value
}

function scopeMap(scope: string, ctx: ResolverContext): Record<string, unknown> {
  if (scope === 'state') return ctx.state
  if (scope === 'computed') return ctx.computed
  if (scope === 'data') return ctx.data
  return {}
}

function resolveInlineRefs(str: string, ctx: ResolverContext): string {
  const parts = str
  let i = 0
  let result = ''
  while (i < str.length) {
    if (str[i] === '$' && i + 1 < str.length) {
      const rest = str.slice(i + 1)
      const m = rest.match(/^([a-zA-Z_]\w*\.\S+)/)
      if (m) {
        const fullRef = m[0]
        const dotIdx = fullRef.indexOf('.')
        if (dotIdx > 0) {
          const scope = fullRef.slice(0, dotIdx)
          const path = fullRef.slice(dotIdx + 1)
          const val = deepGet(scopeMap(scope, ctx), path)
          result += val !== undefined ? String(val) : `\$${fullRef}`
          i += 1 + fullRef.length
          continue
        }
      }
    }
    if (str[i] === '%' && str.slice(i, i + 4) === '%if(') {
      const end = str.indexOf(')', i)
      if (end > 0) {
        const expr = str.slice(i, end + 1)
        const resolved = resolveValue(expr, ctx, null)
        result += String(resolved ?? expr)
        i = end + 1
        continue
      }
    }
    result += str[i]
    i++
  }
  return result
}

function deepGet(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current === null || current === undefined) return undefined
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }
  return current
}

function safeEvalCondition(cond: string): boolean {
  // Simple condition evaluator: supports ===, !==, >, <, >=, <=, &&
  // Safe — only boolean expressions, no function calls
  try {
    const safe = cond
      .replace(/===/g, '==')
      .replace(/!==/g, '!=')
    // Very naive eval, but condition strings come from our own YAML
    return !!new Function(`"use strict"; return (${safe});`)()
  } catch {
    return false
  }
}

// ─── Computed resolver ─────────────────────────────────────────────────────

/**
 * Evaluate computed definitions against current state + data.
 * Returns a map of computedName → resolved value.
 */
export function computeComputed(
  defs: ScreenComputed | undefined,
  ctx: ResolverContext,
): Record<string, unknown> {
  if (!defs) return {}
  const result: Record<string, unknown> = {}

  // Multiple passes to resolve inter-computed dependencies
  for (let pass = 0; pass < 3; pass++) {
    for (const [name, def] of Object.entries(defs)) {
      if (result[name] !== undefined) continue
      const computedCtx = { ...ctx, computed: result }
      const val = computeOne(def as ComputedDef, computedCtx)
      if (val !== undefined) {
        result[name] = val
      }
    }
  }

  // Final pass — compute remaining with full context
  for (const [name, def] of Object.entries(defs)) {
    if (result[name] !== undefined) continue
    const computedCtx = { ...ctx, computed: result }
    result[name] = computeOne(def as ComputedDef, computedCtx)
  }

  return result
}

function computeOne(def: ComputedDef, ctx: ResolverContext): unknown {
  // Map def
  if ('map' in def && typeof def.map === 'object' && !Array.isArray(def.map)) {
    const mapDef = def as ComputedMapDef
    const source = resolveValue(mapDef.source, ctx)
    if (!Array.isArray(source)) return []
    const mapCfg = resolveValue(mapDef.map, ctx) as Record<string, Record<string, unknown>>
    return source
      .map((key: unknown) => {
        const k = String(key)
        return mapCfg[k] ?? undefined
      })
      .filter(Boolean)
  }

  // Filter def
  if ('filter' in def && Array.isArray(def.filter)) {
    const filterDef = def as ComputedFilterDef
    const source = resolveValue(filterDef.source, ctx)
    if (!Array.isArray(source)) return []
    return (source as Record<string, unknown>[]).filter((item: Record<string, unknown>) => {
      for (const f of filterDef.filter) {
        // Conditional filter: skip if condition is false
        if (f.if) {
          const cond = resolveValue(f.if, ctx)
          if (!cond) continue
        }
        // Simple key/value filter
        if (f.key && f.value) {
          const targetVal = resolveValue(f.value, ctx)
          // Skip if targetVal equals ifNot sentinel
          if (f.ifNot !== undefined && targetVal === resolveValue(f.ifNot, ctx)) continue
          // Array filter: skip if empty, otherwise check inclusion
          if (Array.isArray(targetVal)) {
            if (targetVal.length === 0) continue
            if (!targetVal.includes(String(item[f.key]))) return false
          } else {
            if (String(item[f.key]) !== String(targetVal)) return false
          }
        }
        // Where filter
        if (f.where) {
          for (const [wk, wv] of Object.entries(f.where)) {
            const resolvedWv = resolveValue(wv, ctx)
            if (String(item[wk]) !== String(resolvedWv)) return false
          }
        }
      }
      return true
    })
  }

  // GroupBy def — adds _groupSpan for rowspan rendering
  if ('groupBy' in def && Array.isArray((def as any).groupBy)) {
    const groupDef = def as any
    const source = resolveValue(groupDef.source, ctx)
    if (!Array.isArray(source)) return []
    const keys = groupDef.groupBy as string[]
    const rows = source as Record<string, unknown>[]
    if (rows.length === 0) return []

    // Compute group spans for each key
    const spans: Record<string, number>[] = rows.map(() => {
      const s: Record<string, number> = {}
      keys.forEach(k => s[k] = 1)
      return s
    })

    // Walk backwards to accumulate spans
    for (let i = rows.length - 2; i >= 0; i--) {
      for (const key of keys) {
        if (String(rows[i][key]) === String(rows[i + 1][key])) {
          spans[i][key] = spans[i + 1][key] + 1
        }
      }
    }

    // Mark covered rows with 0 (skip rendering)
    for (let i = 0; i < rows.length; i++) {
      for (const key of keys) {
        if (spans[i][key] > 1) {
          // Mark subsequent rows as covered
          for (let j = 1; j < spans[i][key]; j++) {
            if (i + j < rows.length) {
              spans[i + j][key] = 0
            }
          }
        }
      }
    }

    // Attach _groupSpan to each row
    return rows.map((row, i) => ({
      ...row,
      _groupSpan: spans[i],
    }))
  }

  // Section group def — hierarchical grouping with section headers
  if ('sectionGroup' in def && (def as ComputedSectionGroupDef).sectionGroup) {
    const sgDef = def as ComputedSectionGroupDef
    const source = resolveValue(sgDef.source, ctx)
    if (!Array.isArray(source)) return []
    const levels = resolveValue(sgDef.sectionGroup.levels, ctx) as string[]
    const rowNumbers = resolveValue(sgDef.sectionGroup.rowNumbers, ctx) as string

    const rows = source as Record<string, unknown>[]
    if (rows.length === 0) return []

    // Sort by config
    const sortBy = (ctx.state as any).reportConfig?.sortBy
    let sorted = [...rows]
    if (sortBy?.key) {
      sorted.sort((a, b) => {
        const av = String(a[sortBy.key] ?? '')
        const bv = String(b[sortBy.key] ?? '')
        const cmp = av.localeCompare(bv, 'ru')
        return sortBy.dir === 'desc' ? -cmp : cmp
      })
    }

    // Apply filters from config
    const filters = (ctx.state as any).reportConfig?.filters as Record<string, string[]> | undefined
    if (filters) {
      sorted = sorted.filter(row => {
        for (const [key, vals] of Object.entries(filters)) {
          if (vals.length > 0 && !vals.includes(String(row[key]))) return false
        }
        return true
      })
    }

    if (sorted.length === 0) return []

    // Build hierarchical result with section headers
    const result: Record<string, unknown>[] = []
    let globalNum = 0
    let groupNum = 0

    function buildGroup(rows: Record<string, unknown>[], level: number, parentKey: string) {
      if (level >= levels.length) {
        // Leaf level — output rows
        for (const row of rows) {
          if (rowNumbers === 'global') globalNum++
          else if (rowNumbers === 'perGroup') groupNum++
          result.push({
            ...row,
            _isSectionHeader: false,
            _rowNumber: rowNumbers === 'none' ? undefined : (rowNumbers === 'global' ? globalNum : groupNum),
            _groupSpan: {},
          })
        }
        return
      }

      const groupKey = levels[level]
      const groups = new Map<string, Record<string, unknown>[]>()
      for (const row of rows) {
        const val = String(row[groupKey] ?? '')
        if (!groups.has(val)) groups.set(val, [])
        groups.get(val)!.push(row)
      }

      for (const [val, groupRows] of groups) {
        // Section header
        result.push({
          _isSectionHeader: true,
          _sectionLevel: level,
          _sectionTitle: val,
          _sectionKey: groupKey,
          _colspan: 999,
        })

        const prevGlobal = globalNum
        const prevGroup = groupNum
        buildGroup(groupRows, level + 1, val)

        // Compute group spans for this level
        const headerIdx = result.length - groupRows.length - 1
        const spanCount = result.length - 1 - headerIdx
        // Mark group span on data rows
        for (let i = headerIdx + 1; i <= headerIdx + spanCount; i++) {
          const r = result[i] as Record<string, unknown>
          if (!r._groupSpan) r._groupSpan = {}
          ;(r._groupSpan as Record<string, number>)[groupKey] = i === headerIdx + 1 ? spanCount : 0
        }

        // Reset per-group counter for next sibling group
        if (rowNumbers === 'perGroup') {
          groupNum = prevGroup
        }
      }
    }

    buildGroup(sorted, 0, '')
    return result
  }

  // Expr def
  if ('expr' in def && typeof def.expr === 'string') {
    const exprDef = def as ComputedExprDef
    // Build evaluation context with $state, $computed, $data objects
    const exprSrc = exprDef.expr
      .replace(/\$state\b/g, '__ctx_state')
      .replace(/\$computed\b/g, '__ctx_computed')
      .replace(/\$data\b/g, '__ctx_data')
    try {
      return new Function(
        '__ctx_state', '__ctx_computed', '__ctx_data',
        `"use strict"; return (${exprSrc});`
      )(ctx.state, ctx.computed, ctx.data)
    } catch {
      return 0
    }
  }

  // If it's a plain value (array/object), resolve references in it
  return resolveValue(def, ctx)
}

// ─── State reducer ─────────────────────────────────────────────────────────

export function stateReducer(
  state: Record<string, unknown>,
  action: { type: string; target?: string; value?: unknown; min?: number; max?: number; text?: string },
  computed: Record<string, unknown>,
): Record<string, unknown> {
  switch (action.type) {
    case 'SET': {
      if (!action.target) return state
      return deepSet({ ...state }, action.target, action.value)
    }
    case 'TOGGLE': {
      if (!action.target) return state
      const cur = deepGet(state, action.target)
      return deepSet({ ...state }, action.target, !cur)
    }
    case 'TOGGLE_ARRAY': {
      if (!action.target) return state
      const arr = (deepGet(state, action.target) as unknown[]) ?? []
      const idx = arr.indexOf(action.value)
      const next = idx >= 0 ? arr.filter((_, i) => i !== idx) : [...arr, action.value]
      return deepSet({ ...state }, action.target, next)
    }
    case 'INCREMENT': {
      if (!action.target) return state
      const cur = Number(deepGet(state, action.target)) || 0
      const maxVal = action.max ?? 999
      return deepSet({ ...state }, action.target, Math.min(cur + 1, maxVal))
    }
    case 'DECREMENT': {
      if (!action.target) return state
      const cur = Number(deepGet(state, action.target)) || 0
      const minVal = action.min ?? 0
      return deepSet({ ...state }, action.target, Math.max(cur - 1, minVal))
    }
    default:
      return state
  }
}

function deepSet(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.')
  if (keys.length === 1) {
    obj[keys[0]] = value
    return obj
  }
  const [first, ...rest] = keys
  const nested = (obj[first] as Record<string, unknown>) ?? {}
  obj[first] = deepSet(
    typeof nested === 'object' && nested !== null ? { ...nested } : ({} as Record<string, unknown>),
    rest.join('.'),
    value,
  )
  return obj
}

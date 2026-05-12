import { createContext, useContext, useReducer, useMemo, useCallback, useState, type ReactNode } from 'react'
import type { ScreenAction, ScreenState, ScreenComputed } from '../types'
import { stateReducer, computeComputed, resolveValue, type ResolverContext } from './resolver'

// ─── Context shape ─────────────────────────────────────────────────────────

interface ScreenContextValue {
  state: ScreenState
  data: Record<string, unknown>
  computed: Record<string, unknown>
  dispatch: (action: ScreenAction) => void
  /** Resolve $state.* / $computed.* / $data.* / %if() references */
  resolve: (value: unknown) => unknown
  /** Open a modal by id */
  openModal: (id: string) => void
  /** Close current modal */
  closeModal: () => void
  /** Show a toast */
  toast: (message: string) => void
  /** Currently open modal id */
  activeModalId: string | null
  /** Toast message */
  toastMessage: string | null
}

const ScreenContext = createContext<ScreenContextValue | null>(null)

// ─── Provider props ────────────────────────────────────────────────────────

interface ScreenProviderProps {
  initialState: ScreenState
  data: Record<string, unknown>
  computedDefs: ScreenComputed | undefined
  children: ReactNode
  onNavigate?: (path: string) => void
  onExternalModal?: (id: string) => void
  onExternalToast?: (msg: string) => void
}

// ─── Provider ──────────────────────────────────────────────────────────────

export function ScreenProvider({
  initialState,
  data,
  computedDefs,
  children,
  onNavigate,
  onExternalModal,
  onExternalToast,
}: ScreenProviderProps) {
  const [state, rawDispatch] = useReducer(
    (prev: ScreenState, action: ScreenAction & { _computed?: Record<string, unknown> }) => {
      // Compute context BEFORE applying the action (for max/min refs)
      return stateReducer(prev, action, {})
    },
    initialState,
  )

  const [activeModalId, setActiveModalId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Build base resolver context
  const baseCtx = useMemo<ResolverContext>(() => ({
    state,
    data,
    computed: {}, // will be updated after computeComputed
  }), [state, data])

  // Compute computed values
  const computed = useMemo(() => {
    return computeComputed(computedDefs, baseCtx)
  }, [computedDefs, baseCtx])

  // Full context with computed
  const resolverCtx = useMemo<ResolverContext>(() => ({
    state,
    data,
    computed,
  }), [state, data, computed])

  // Dispatch with side-effect handling
  const dispatch = useCallback((action: ScreenAction) => {
    switch (action.type) {
      case 'NAVIGATE':
        onNavigate?.(action.target)
        return
      case 'MODAL_OPEN':
        onExternalModal?.(action.target)
        setActiveModalId(action.target)
        return
      case 'MODAL_CLOSE':
        setActiveModalId(null)
        return
      case 'TOAST': {
        const msg = action.text
        setToastMessage(msg)
        onExternalToast?.(msg)
        setTimeout(() => setToastMessage(null), 3000)
        return
      }
      case 'INCREMENT':
      case 'DECREMENT': {
        // Resolve max/min refs before dispatch
        let resolvedAction = { ...action }
        if (action.max !== undefined) {
          resolvedAction.max = Number(resolveValue(action.max, resolverCtx)) || 999
        }
        rawDispatch(resolvedAction)
        return
      }
      default:
        rawDispatch(action)
    }
  }, [onNavigate, onExternalModal, onExternalToast, resolverCtx])

  const openModal = useCallback((id: string) => {
    onExternalModal?.(id)
    setActiveModalId(id)
  }, [onExternalModal])

  const closeModal = useCallback(() => setActiveModalId(null), [])

  const toast = useCallback((msg: string) => {
    setToastMessage(msg)
    onExternalToast?.(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }, [onExternalToast])

  const resolve = useCallback((value: unknown) => {
    return resolveValue(value, resolverCtx, activeModalId)
  }, [resolverCtx, activeModalId])

  const ctxValue = useMemo<ScreenContextValue>(() => ({
    state,
    data,
    computed,
    dispatch,
    resolve,
    openModal,
    closeModal,
    toast,
    activeModalId,
    toastMessage,
  }), [state, data, computed, dispatch, resolve, openModal, closeModal, toast, activeModalId, toastMessage])

  return (
    <ScreenContext.Provider value={ctxValue}>
      {children}
    </ScreenContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useScreen(): ScreenContextValue {
  const ctx = useContext(ScreenContext)
  if (!ctx) throw new Error('useScreen must be used within <ScreenProvider>')
  return ctx
}

import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import type { ScreenJSON, ScreenModal, ReportConfig, Preset } from './types'
import { ScreenProvider, useScreen } from './context/ScreenContext'
import { NodeRenderer } from './NodeRenderer'
import { Modal } from './Modal'
import { Toast } from './Toast'
import styles from './Renderer.module.scss'

const LS_CONFIG_KEY = 'sandbox_reports_config'
const LS_PRESETS_KEY = 'sandbox_reports_presets'

function loadPersistedState(initialState: Record<string, unknown>): Record<string, unknown> {
  try {
    const savedConfig = localStorage.getItem(LS_CONFIG_KEY)
    const savedPresets = localStorage.getItem(LS_PRESETS_KEY)
    const merged = { ...initialState }
    if (savedConfig) {
      merged.reportConfig = JSON.parse(savedConfig) as ReportConfig
    }
    if (savedPresets) {
      merged.presets = JSON.parse(savedPresets) as Preset[]
    }
    return merged
  } catch {
    return initialState
  }
}

interface RendererProps {
  screen: ScreenJSON
  commentMode?: boolean
}

export function Renderer({ screen, commentMode }: RendererProps) {
  const params = useParams()
  const navigate = useNavigate()
  const rest = (params as Record<string, string | undefined>)['*'] ?? ''
  const pagePath = '/' + rest

  const currentPage =
    screen.pages.find(p => {
      const pp = p.path.startsWith('/') ? p.path : `/${p.path}`
      return pp === pagePath
    }) ??
    screen.pages.find(p => p.path === '/') ??
    screen.pages[0]

  if (!currentPage) return <div className={styles.error}>Страница не найдена</div>

  const initialState = loadPersistedState((screen.state ?? {}) as Record<string, unknown>)
  const screenData = (screen.data ?? {}) as Record<string, unknown>

  return (
    <ScreenProvider
      initialState={initialState}
      data={screenData}
      computedDefs={screen.computed}
      onNavigate={(path) => navigate(path)}
    >
      <div className={styles.renderer}>
        <PersistWatcher />
        <NodeRenderer
          node={currentPage.layout}
          modals={screen.modals ?? []}
          onOpenModal={() => {}}
          onToast={() => {}}
          commentMode={commentMode}
        />
        <ModalOverlay modals={screen.modals ?? []} />
        <ToastOverlay />
      </div>
    </ScreenProvider>
  )
}

function PersistWatcher() {
  const { state } = useScreen()
  const prevRef = useRef(state)

  useEffect(() => {
    const prev = prevRef.current
    if (prev === state) return
    prevRef.current = state
    try {
      if (state.reportConfig) {
        localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(state.reportConfig))
      }
      if (state.presets) {
        localStorage.setItem(LS_PRESETS_KEY, JSON.stringify(state.presets))
      }
    } catch {}
  }, [state])

  return null
}

function ModalOverlay({ modals }: { modals: ScreenModal[] }) {
  const { activeModalId, closeModal } = useScreen()
  const activeModal = activeModalId ? modals.find(m => m.id === activeModalId) : null
  if (!activeModal) return null
  return (
    <Modal modal={activeModal} onClose={closeModal}>
      {activeModal.children?.map(child => (
        <NodeRenderer
          key={child.id}
          node={child}
          modals={modals}
          onOpenModal={() => {}}
          onToast={() => {}}
        />
      ))}
    </Modal>
  )
}

function ToastOverlay() {
  const { toastMessage } = useScreen()
  if (!toastMessage) return null
  return <Toast message={toastMessage} />
}

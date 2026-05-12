import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface SidebarActions {
  commentMode: boolean
  onToggleComment: () => void
  onOpenShare: () => void
  onOpenYaml: () => void
}

interface SidebarActionsContextValue {
  actions: SidebarActions | null
  setActions: (a: SidebarActions | null) => void
}

const Ctx = createContext<SidebarActionsContextValue>({
  actions: null,
  setActions: () => {},
})

export function SidebarActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<SidebarActions | null>(null)
  return <Ctx.Provider value={{ actions, setActions }}>{children}</Ctx.Provider>
}

export function useSidebarActions() {
  return useContext(Ctx)
}

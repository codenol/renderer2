import { Outlet } from 'react-router-dom'
import { MiniSidebar } from './MiniSidebar'
import { useSidebarActions } from './SidebarActions'
import styles from './AppLayout.module.scss'

export function AppLayout() {
  const { actions } = useSidebarActions()

  return (
    <div className={styles.layout}>
      <MiniSidebar
        commentMode={actions?.commentMode || false}
        onToggleComment={actions?.onToggleComment}
        onOpenShare={actions?.onOpenShare}
        onOpenYaml={actions?.onOpenYaml}
        showActions={!!actions}
      />
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  )
}

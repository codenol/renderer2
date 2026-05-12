import styles from './StatusBadge.module.scss'

interface StatusBadgeProps {
  status: 'active' | 'warning' | 'critical'
  label?: string
}

const LABELS: Record<string, string> = {
  active: 'Работает',
  warning: 'Деградация',
  critical: 'Недоступен',
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[`badge--${status}`]}`}>
      <span className={styles.dot} />
      {label ?? LABELS[status] ?? status}
    </span>
  )
}

import styles from './Badge.module.scss'

interface BadgeProps {
  label: string
  variant?: 'gray-strong' | 'blue' | 'green' | 'red' | 'orange' | 'purple'
}

export function Badge({ label, variant = 'gray-strong' }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[`badge--${variant}`]}`}>
      {label}
    </span>
  )
}

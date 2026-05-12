import styles from './Progress.module.scss'

interface ProgressProps {
  value: number // 0–100
  label?: string
}

export function Progress({ value, label }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div className={styles.wrap}>
      {label && <div className={styles.label}>{label}</div>}
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${clamped}%` }} />
      </div>
      <div className={styles.value}>{clamped}%</div>
    </div>
  )
}

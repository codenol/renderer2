import styles from './Toast.module.scss'

export function Toast({ message }: { message: string }) {
  return (
    <div className={styles.toast}>
      <span className={styles.icon}>✓</span>
      {message}
    </div>
  )
}

import styles from './Message.module.scss'

interface MessageProps {
  type: 'info' | 'warning' | 'error' | 'success'
  text: string
  title?: string
}

const ICONS: Record<string, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
  success: '✅',
}

export function Message({ type, text, title }: MessageProps) {
  return (
    <div className={`${styles.msg} ${styles[`msg--${type}`]}`}>
      <span className={styles.icon}>{ICONS[type]}</span>
      <div>
        {title && <div className={styles.title}>{title}</div>}
        <div className={styles.text}>{text}</div>
      </div>
    </div>
  )
}

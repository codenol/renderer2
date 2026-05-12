import pkg from '../../package.json'
import styles from './BranchView.module.scss'

interface Props {
  open: boolean
  onClose: () => void
}

export function AboutModal({ open, onClose }: Props) {
  if (!open) return null

  return (
    <div className={styles.yamlOverlay} onClick={onClose}>
      <div className={styles.yamlModal} onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
        <div className={styles.yamlHeader}>
          <span className={styles.yamlTitle}>О программе</span>
          <button className={styles.yamlClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.yamlBody} style={{ padding: '20px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Skala^R SandBox</p>
          <p style={{ margin: '0 0 8px', fontSize: 13, opacity: 0.6 }}>Версия {pkg.version}</p>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.4 }}>
            Инструмент для визуальной сборки экранов из&nbsp;JSON&nbsp;/&nbsp;YAML. Разработано в&nbsp;Скала^Р.
          </p>
        </div>
      </div>
    </div>
  )
}

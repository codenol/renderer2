import { useState } from 'react'
import { LIcon } from '@/renderer/components/LIcon'
import styles from './DashboardView.module.scss'

const KEY = 'skala_agentation_enabled'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: Props) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(KEY) === 'true')

  function save() {
    localStorage.setItem(KEY, String(enabled))
    onClose()
    window.location.reload()
  }

  if (!open) return null

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Настройки</span>
          <button className={styles.modalClose} onClick={onClose}>
            <LIcon name="x" size={18} />
          </button>
        </div>
        <div className={styles.modalBody}>
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 0', cursor: 'pointer', userSelect: 'none',
          }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Agentation</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
          </label>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-modal-text-secondary, #6b7280)' }}>
            Инструменты разработчика. После включения страница перезагрузится.
          </p>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.modalCancel} onClick={onClose}>Отмена</button>
          <button className={styles.modalSubmit} onClick={save}>Сохранить</button>
        </div>
      </div>
    </div>
  )
}

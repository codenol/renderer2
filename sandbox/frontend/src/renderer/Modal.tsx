import type { ReactNode } from 'react'
import type { ScreenModal } from './types'
import styles from './Modal.module.scss'

interface ModalProps {
  modal: ScreenModal
  onClose: () => void
  children?: ReactNode
}

const SIZE_MAP = { sm: 480, md: 640, lg: 880 }

export function Modal({ modal, onClose, children }: ModalProps) {
  const width = SIZE_MAP[modal.size ?? 'md']

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        style={{ maxWidth: width }}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{modal.title}</h2>
          <button className={styles.close} onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        <div className={styles.body}>
          {children}
        </div>
      </div>
    </div>
  )
}

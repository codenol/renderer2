import { useRef, useEffect } from 'react'
import { LIcon } from '@/renderer/components/LIcon'
import styles from './BranchView.module.scss'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  yamlText: string
  onYamlChange: (text: string) => void
  yamlError: string
  onSubmit: () => void
  submitLabel: string
  submitting: boolean
  showCopyDownload?: boolean
  onCopy?: () => void
  copied?: boolean
  onDownload?: () => void
  onFileSelect: (text: string) => void
}

export function YamlEditorModal({
  open, onClose, title, yamlText, onYamlChange, yamlError,
  onSubmit, submitLabel, submitting,
  showCopyDownload, onCopy, copied, onDownload, onFileSelect,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && fileRef.current) {
      fileRef.current.value = ''
    }
  }, [open])

  if (!open) return null

  return (
    <div className={styles.yamlOverlay} onClick={onClose}>
      <div className={styles.yamlModal} onClick={e => e.stopPropagation()}>
        <div className={styles.yamlHeader}>
          <span className={styles.yamlTitle}>{title}</span>
          <button className={styles.yamlClose} onClick={onClose}>
            <LIcon name="x" size={18} />
          </button>
        </div>
        {yamlError && <div className={styles.yamlError}>{yamlError}</div>}
        <div className={styles.yamlBody}>
          <textarea
            className={styles.yamlTextarea}
            value={yamlText}
            onChange={e => onYamlChange(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className={styles.yamlFooter}>
          <div className={`${styles.yamlBtn} ${styles.yamlBtnUpload}`} style={{ position: 'relative', cursor: 'pointer' }} title="Загрузить YAML / JSON">
            Загрузить файл
            <input
              ref={fileRef}
              type="file"
              accept=".yaml,.yml"
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
              onChange={async e => {
                console.log('[YamlEditor] input onChange, files:', e.target.files?.length ?? 0)
                const file = e.target.files?.[0]
                if (!file) return
                e.target.value = ''
                const text = await file.text()
                console.log('[YamlEditor] file loaded:', file.name, text.length, 'chars')
                onFileSelect(text)
              }}
            />
          </div>
          <button
            className={`${styles.yamlBtn} ${styles.yamlBtnApply}`}
            onClick={onSubmit}
            disabled={!yamlText.trim() || submitting}
          >
            {submitting ? '...' : submitLabel}
          </button>
          <div style={{ flex: 1 }} />
          {showCopyDownload && (
            <>
              <button
                className={`${styles.yamlBtn} ${styles.yamlBtnCopy} ${copied ? styles.yamlBtnCopied : ''}`}
                onClick={onCopy}
              >
                {copied ? '✓ Скопировано' : 'Скопировать'}
              </button>
              <button
                className={`${styles.yamlBtn} ${styles.yamlBtnDownload}`}
                onClick={onDownload}
              >
                Скачать .yaml
              </button>
            </>
          )}
          <button
            className={`${styles.yamlBtn} ${styles.yamlBtnDownload}`}
            onClick={onClose}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}

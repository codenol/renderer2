import { LIcon } from '@/renderer/components/LIcon'
import styles from './Button.module.scss'

interface ButtonProps {
  label?: string
  icon?: string
  size?: 'sm' | 'lg'
  variant?: 'accent' | 'default' | 'ghost'
  onClick?: () => void
  disabled?: boolean
}

export function Button({ label, icon, size = 'lg', variant = 'accent', onClick, disabled }: ButtonProps) {
  const iconOnly = icon && !label
  return (
    <button
      className={`${styles.btn} ${styles[`btn--${variant}`]} ${styles[`btn--${size}`]} ${iconOnly ? styles['btn--icon-only'] : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={iconOnly ? undefined : undefined}
    >
      {icon && <LIcon name={icon} size={size === 'sm' ? 14 : 16} strokeWidth={1.8} />}
      {label && <span>{label}</span>}
    </button>
  )
}

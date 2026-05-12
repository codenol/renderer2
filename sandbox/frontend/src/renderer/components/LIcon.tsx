/**
 * LIcon — dynamic Lucide icon resolver.
 *
 * Accepts any lucide icon name in kebab-case, snake_case, camelCase or PascalCase
 * and renders the matching component from lucide-react.
 *
 * Examples:
 *   <LIcon name="activity" />           → Activity
 *   <LIcon name="bar-chart-2" />        → BarChart2
 *   <LIcon name="layout-dashboard" />   → LayoutDashboard
 *   <LIcon name="ArrowRight" />         → ArrowRight
 */
import type { CSSProperties } from 'react'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Convert any casing to PascalCase: "bar-chart-2" → "BarChart2"
function toPascal(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2') // camelCase → kebab
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
}

interface LIconProps {
  name: string
  size?: number
  strokeWidth?: number
  className?: string
  style?: CSSProperties
}

export function LIcon({ name, size = 16, strokeWidth = 1.6, className, style }: LIconProps) {
  const key = toPascal(name)
  const Comp = (LucideIcons as Record<string, LucideIcon | undefined>)[key]

  if (!Comp) {
    // Placeholder square when icon name is unknown
    return (
      <span
        style={{
          width: size,
          height: size,
          display: 'inline-block',
          background: 'currentColor',
          borderRadius: 3,
          opacity: 0.3,
          flexShrink: 0,
          ...style,
        }}
      />
    )
  }

  return <Comp size={size} strokeWidth={strokeWidth} className={className} style={style} />
}

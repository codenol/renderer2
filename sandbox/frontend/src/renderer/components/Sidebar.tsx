import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Moon, Sun, ChevronLeft, ChevronRight } from 'lucide-react'
import type { SidebarItem } from '../types'
import { LIcon } from './LIcon'
import styles from './Sidebar.module.scss'

// ─── Props ─────────────────────────────────────────────────────────────────────
interface SidebarProps {
  items: SidebarItem[]
  logo?: { mark?: string; text?: string }
  avatarLabel?: string
  collapsed?: boolean
  'data-node-id'?: string
}

// ─── Theme helpers ─────────────────────────────────────────────────────────────
function getInitialTheme(): boolean {
  try {
    const saved = localStorage.getItem('sandbox-theme')
    if (saved) return saved === 'dark'
  } catch { /* ignore */ }
  return document.documentElement.dataset.theme === 'dark'
}

function applyTheme(dark: boolean) {
  if (dark) { document.documentElement.dataset.theme = 'dark' }
  else { delete document.documentElement.dataset.theme }
  try { localStorage.setItem('sandbox-theme', dark ? 'dark' : 'light') } catch { /* ignore */ }
}

// ─── LogoContent ───────────────────────────────────────────────────────────────
// Full vector logo — 146×24px content, padding 12px 16px → total 48px height.
// SVG paths: геном (dark-blue #11244D) + ^ and 2.0 (teal #00BEC8)
// Falls back to styled text for non-standard logo props.
function LogoContent({ mark, text }: { mark: string; text: string }) {
  const isGenom = text.toLowerCase().includes('геном') || text.toLowerCase().includes('genom')

  if (isGenom) {
    return (
      <svg className={styles.logoSvg} width="146" height="24" viewBox="0 0 146 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label={`${mark}${text}`}>
        {/* г */}
        <path className={styles.logoDarkPath} d="M17.1476 23.1801V10.7037H24.4653V7.24116H13.5449V23.1801H17.1476Z" fill="#11244D"/>
        {/* е */}
        <path className={styles.logoDarkPath} fillRule="evenodd" clipRule="evenodd" d="M36.4656 22.9377C37.4227 22.54 38.1608 22.0526 38.689 21.4807C38.9887 21.1571 39.2489 20.8526 39.4701 20.5672L36.6095 18.9844C36.372 19.3267 36.0162 19.6454 35.5548 19.9436L35.5508 19.9462C34.9217 20.3302 34.1652 20.5173 33.2901 20.5173C32.1235 20.5173 31.1237 20.1507 30.3021 19.4139C29.4812 18.6777 28.9852 17.7084 28.8098 16.5178L28.778 16.3021H40.9228L40.963 16.0187C41.0266 15.4427 41.057 15.0702 41.057 14.8907C41.057 12.6347 40.3008 10.7533 38.7892 9.23345L38.7874 9.23163C37.2962 7.69052 35.4677 6.92125 33.2901 6.92125C30.9394 6.92125 29.0054 7.70363 27.4737 9.26455C25.9641 10.8033 25.2051 12.7799 25.2051 15.2106C25.2051 17.6409 25.9638 19.6284 27.4738 21.1887C29.0051 22.728 30.939 23.5 33.2901 23.5C34.457 23.5 35.5147 23.3116 36.4656 22.9377ZM28.7597 13.9592L28.8126 13.7287C29.0742 12.5887 29.5788 11.6677 30.3322 10.9769C31.1139 10.2583 32.105 9.90392 33.2901 9.90392C34.4141 9.90392 35.3439 10.2601 36.0622 10.9818C36.7933 11.6951 37.2547 12.6174 37.4514 13.7383L37.4902 13.9592H28.7597Z" fill="#11244D"/>
        {/* н */}
        <path className={styles.logoDarkPath} d="M47.434 23.1801V17.1018H54.3306V23.1801H57.9333V7.24116H54.3306V13.6393H47.434V7.24116H43.8313V23.1801H47.434Z" fill="#11244D"/>
        {/* о */}
        <path className={styles.logoDarkPath} fillRule="evenodd" clipRule="evenodd" d="M74.5817 9.26544L74.58 9.26364C73.0698 7.70358 71.147 6.92125 68.7963 6.92125C66.4455 6.92125 64.5116 7.70363 62.9799 9.26455C61.4702 10.8033 60.7113 12.7799 60.7113 15.2106C60.7113 17.6408 61.4699 19.6283 62.9799 21.1886C64.5112 22.728 66.4452 23.5 68.7963 23.5C71.1478 23.5 73.0709 22.7278 74.5808 21.1887C76.1122 19.6281 76.8813 17.6406 76.8813 15.2106C76.8813 12.7806 76.1123 10.8044 74.5817 9.26544ZM68.7963 20.1974C67.5349 20.1974 66.4672 19.7275 65.6048 18.7937C64.7406 17.8579 64.314 16.658 64.314 15.2106C64.314 13.7632 64.7406 12.5634 65.6048 11.6276C66.4672 10.6937 67.5349 10.2238 68.7963 10.2238C70.0577 10.2238 71.1254 10.6937 71.9878 11.6276C72.852 12.5634 73.2786 13.7632 73.2786 15.2106C73.2786 16.658 72.852 17.8579 71.9878 18.7937C71.1254 19.7275 70.0577 20.1974 68.7963 20.1974Z" fill="#11244D"/>
        {/* м */}
        <path className={styles.logoDarkPath} d="M93.2768 7.24116L89.777 17.7981H88.8709L85.3711 7.24116H79.6481V23.1801H83.2508V12.7831H84.2105L87.5512 23.1801H91.0967L94.4374 12.7831H95.3971V23.1801H98.9998V7.24116H93.2768Z" fill="#11244D"/>
        {/* ^ accent mark — teal */}
        <path d="M6.89914 4.5H3.33495L0 12.6717H2.86909L5.11705 7.16134L7.365 12.6717H10.2341L6.89914 4.5Z" fill="#00BEC8"/>
        {/* 2.0 — teal */}
        <path d="M138.108 5.0752C140.158 5.07523 141.868 5.87643 143.24 7.47949C144.612 9.06615 145.298 11.2399 145.298 14C145.298 16.7601 144.612 18.9417 143.24 20.5449C141.868 22.1316 140.158 22.9248 138.108 22.9248C136.059 22.9248 134.348 22.1316 132.977 20.5449C131.605 18.9417 130.919 16.7601 130.919 14C130.919 11.2399 131.605 9.06615 132.977 7.47949C134.348 5.87648 136.059 5.0752 138.108 5.0752ZM114.95 5.0752C116.719 5.0752 118.132 5.59557 119.189 6.63672C120.247 7.67797 120.776 9.01707 120.776 10.6533C120.776 10.9506 120.752 11.2397 120.702 11.5205C120.653 11.7849 120.594 12.0165 120.528 12.2148C120.479 12.4132 120.379 12.6447 120.23 12.9092C120.098 13.157 119.991 13.3473 119.908 13.4795C119.826 13.5952 119.677 13.7767 119.462 14.0244C119.247 14.2723 119.098 14.4379 119.016 14.5205C118.949 14.5867 118.785 14.7524 118.521 15.0166C118.256 15.281 118.098 15.4377 118.049 15.4873L113.959 19.4541V19.5781H121.024V22.6768H109.248V19.8262L116.313 13.0088C116.578 12.7444 116.768 12.5374 116.884 12.3887C117.016 12.2234 117.14 11.9918 117.256 11.6943C117.372 11.3969 117.43 11.0499 117.43 10.6533C117.43 9.95915 117.198 9.37188 116.735 8.89258C116.273 8.41335 115.677 8.17383 114.95 8.17383C114.19 8.17383 113.545 8.46352 113.017 9.04199C112.488 9.60392 112.223 10.3065 112.223 11.1494H109C109 9.36457 109.554 7.90998 110.661 6.78613C111.785 5.64572 113.215 5.0752 114.95 5.0752ZM127.65 22.6768H124.18V19.2061H127.65V22.6768ZM138.108 8.17383C136.985 8.17383 136.043 8.67833 135.282 9.68652C134.522 10.6782 134.142 12.1159 134.142 14C134.142 15.8842 134.522 17.3307 135.282 18.3389C136.042 19.3303 136.985 19.8262 138.108 19.8262C139.232 19.8261 140.174 19.3304 140.935 18.3389C141.695 17.3307 142.075 15.8842 142.075 14C142.075 12.116 141.695 10.6782 140.935 9.68652C140.174 8.67837 139.232 8.17387 138.108 8.17383Z" fill="#00BEC8"/>
      </svg>
    )
  }

  // Fallback: styled text for other logo variants
  const m = text.match(/^(.+?)\s+(\S[\S]*)$/)
  const product = m ? m[1] : text
  const version = m ? m[2] : null
  return (
    <>
      <span className={styles.logoMark}>{mark}</span>
      <span className={styles.logoProduct}>{product}</span>
      {version && <span className={styles.logoVersion}>{version}</span>}
    </>
  )
}

// ─── Component ─────────────────────────────────────────────────────────────────
export function Sidebar({
  items,
  logo,
  avatarLabel = 'AB',
  collapsed: initialCollapsed = false,
  'data-node-id': nodeId,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [isDark, setIsDark] = useState(getInitialTheme)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => { applyTheme(isDark) }, [])

  function toggleTheme() {
    const next = !isDark
    setIsDark(next)
    applyTheme(next)
  }

  // Navigate keeping the branch context: /branch/slug + relative path
  const navigateTo = (href: string) => {
    if (!href) return
    // Extract /branch/<slug> base from current path
    // e.g. /branch/abc/oformlenie → /branch/abc
    const branchBase = location.pathname.replace(/(\/branch\/[^/]+).*/, '$1')
    const path = href.startsWith('/') ? href : `/${href}`
    navigate(`${branchBase}${path}`)
  }

  const navItems = items.filter(i => (i.type ?? 'item') === 'item')
  const mark = logo?.mark ?? '^'
  const text = logo?.text ?? 'геном 2.0'

  return (
    <aside
      className={`${styles.root} ${collapsed ? styles.collapsed : ''}`}
      data-node-id={nodeId}
    >
      {/* ── Minibar — left strip, always 48px ─────────────────────────────── */}
      {/* Figma: "Minibar" frame (Default) / "Sidebar" frame (Collapsed)      */}
      {/* Structure: Buttons frame → [Top slot | Bottom slot]                 */}
      <div className={styles.minibar}>
        <div className={styles.minibarButtons}>

          {/* Top slot: status/lock, bell, layout-grid, bookmark */}
          <div className={styles.slot}>
            <button className={styles.mbIcon} title="Безопасность">
              <LIcon name="lock" size={20} />
            </button>
            <button className={styles.mbIcon} title="Уведомления">
              <LIcon name="bell" size={20} />
            </button>
            <button className={styles.mbIcon} title="Обзор">
              <LIcon name="layout-grid" size={20} />
            </button>
            <button className={styles.mbIcon} title="Закладки">
              <LIcon name="bookmark" size={20} />
            </button>
          </div>

          {/* Bottom slot: settings, theme, image, help-circle, avatar */}
          <div className={styles.slot}>
            <button className={styles.mbIcon} title="Настройки">
              <LIcon name="settings" size={20} />
            </button>
            <button
              className={`${styles.mbIcon} ${isDark ? styles.mbIconActive : ''}`}
              title={isDark ? 'Светлая тема' : 'Тёмная тема'}
              onClick={toggleTheme}
            >
              {isDark
                ? <Sun size={20} strokeWidth={1.6} />
                : <Moon size={20} strokeWidth={1.6} />}
            </button>
            <button className={styles.mbIcon} title="Галерея">
              <LIcon name="image" size={20} />
            </button>
            <button className={styles.mbIcon} title="Помощь">
              <LIcon name="help-circle" size={20} />
            </button>
            <button className={styles.mbAvatar} title={avatarLabel}>
              {avatarLabel}
            </button>
          </div>

        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────────────────── */}
      {collapsed ? (
        /* Collapsed: mini-menu with icon-only nav + expand chevron            */
        /* Figma: "Menu" frame (Collapsed) — 48px, logo mark + Top 2 slot + Bottom */
        <div className={styles.miniMenu}>

          {/* Logo mark — SVG ^ in teal, 18×18px per spec */}
          <div className={styles.miniMenuLogo}>
            <svg width="18" height="18" viewBox="14 10 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="^">
              <path d="M27.1344 11H20.8656L15 29H20.0462L24 16.8622L27.9538 29H33L27.1344 11Z" fill="#00BEC8"/>
            </svg>
          </div>
          <div className={styles.logoDivider} />

          <div className={styles.miniMenuSlot}>
            {navItems.map(item => (
              <button
                key={item.id}
                className={`${styles.mbIcon} ${item.state === 'active' ? styles.mbIconActive : ''}`}
                title={item.label}
                onClick={() => navigateTo(item.href ?? '')}
              >
                <LIcon name={item.icon} size={20} />
              </button>
            ))}
          </div>
          <div className={styles.miniMenuBottom}>
            <div className={styles.footerDivider} />
            <button
              className={styles.mbIcon}
              onClick={() => setCollapsed(false)}
              title="Развернуть"
            >
              <ChevronRight size={20} strokeWidth={1.6} />
            </button>
          </div>
        </div>
      ) : (
        /* Expanded: full menu with logo, nav items, footer                   */
        /* Figma: "Menu" frame (Default)                                       */
        <div className={styles.menu}>

          {/* Logo — height:48, padding:0 16px                                  */}
          {/* Figma: ^ (teal) + product-name (dark-blue) + version (teal)        */}
          <div className={styles.logoRow}>
            <LogoContent mark={mark} text={text} />
          </div>
          <div className={styles.logoDivider} />

          {/* Menu slot — padding:0 16px, scrollable */}
          <nav className={styles.menuSlot}>
            {items.map(item => {
              if (item.type === 'group') {
                return (
                  <div key={item.id} className={styles.groupHeader}>
                    <span className={styles.groupLabel}>{item.label}</span>
                    <div className={styles.groupLine} />
                  </div>
                )
              }
              return (
                <button
                  key={item.id}
                  className={`${styles.menuItem} ${item.state === 'active' ? styles.menuItemActive : ''}`}
                  onClick={() => navigateTo(item.href ?? '')}
                >
                  <span className={styles.itemIcon}>
                    <LIcon name={item.icon} size={20} />
                  </span>
                  <span className={styles.itemLabel}>{item.label}</span>
                </button>
              )
            })}
          </nav>

          {/* Bottom block — padding:0 16px 8px */}
          <div className={styles.menuBottom}>
            <div className={styles.footerDivider} />
            <button
              className={styles.collapseBtn}
              onClick={() => setCollapsed(true)}
            >
              <ChevronLeft size={14} strokeWidth={1.6} />
              <span>Свернуть</span>
            </button>
          </div>

        </div>
      )}
    </aside>
  )
}

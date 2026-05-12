import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './UploadView.module.scss'
import type { ScreenJSON } from '@/renderer/types'

// ─── Instructions data ────────────────────────────────────────────────────────
const INSTRUCTIONS = [
  {
    id: 'create',
    title: 'Как создавать страницы с помощью LLM',
    steps: [
      'Опишите экран: что должно отображаться, какие данные, какая структура',
      'Попросите LLM создать JSON: "Сгенерируй Screen JSON для [описание экрана]. Используй тип app-shell с пропами sidebar, breadcrumbs и content"',
      'Укажите нужные узлы: sidebar (с items), breadcrumbs (с items), content (vstack/grid/table и т.д.)',
      'ВАЖНО: у vstack/hstack/grid не указывай padding — только gap (макс. 16). Padding живёт только внутри card.',
      'Иконки в контенте: { type: "icon", props: { name: "activity", size: 20 } } — любое имя из lucide-react.',
      'Кнопка минибара: { type: "menu-button", props: { icon: "settings", active: false, title: "Настройки" } } — 40×40, 4 состояния (default/hover/active/active+hover).',
      'Таблица: { type: "table", props: { columns: [...], data: [...] } }. Колонка: { key, label, width?, type?, sortable?, sortDir?: "asc"|"desc", align?: "left"|"center"|"right" }. Типы ячеек: text (по умолч.), status-badge, badge, progress, button.',
      'Загрузите полученный JSON через форму выше — получите ссылку для просмотра',
    ],
    code: `{
  "meta": { "title": "Мой экран" },
  "pages": [{
    "id": "main", "path": "/",
    "layout": {
      "type": "app-shell", "id": "shell",
      "props": {
        "sidebar": {
          "type": "sidebar", "id": "sb",
          "props": {
            "logo": { "mark": "^", "text": "геном 2.0" },
            "items": [
              { "id": "1", "type": "item", "label": "Обзор", "icon": "overview", "state": "active" },
              { "id": "g1", "type": "group", "label": "Настройки" },
              { "id": "2", "type": "item", "label": "Метрики", "icon": "metrics" }
            ]
          }
        },
        "breadcrumbs": {
          "type": "breadcrumbs", "id": "bc",
          "props": { "items": [
            {
              "label": "ПАК",
              "options": [
                { "label": "ПАК Москва", "href": "/pak/msk", "active": true },
                { "label": "ПАК Санкт-Петербург", "href": "/pak/spb" }
              ]
            },
            { "label": "Обзор" }
          ]}
        },
        "content": { "type": "vstack", "id": "c", "props": { "gap": 16 },
          "children": [/* узлы контента */]
        }
      }
    }
  }]
}`,
  },
  {
    id: 'edit',
    title: 'Как редактировать страницы',
    steps: [
      'Откройте ветку с нужным экраном',
      'Нажмите кнопку версии (например "v1") в правом верхнем углу',
      'Выберите "Скачать текущую версию" — скачается JSON-файл',
      'Передайте файл LLM: "Измени [что нужно] в этом JSON" и загрузите результат обратно',
      'Каждая загрузка создаёт новую версию — старые не теряются',
    ],
  },
  {
    id: 'versions',
    title: 'Как работать с версиями',
    steps: [
      'Каждая загрузка JSON автоматически создаёт новую версию (v1 → v2 → v3...)',
      'Переключайтесь между версиями через меню кнопки версии (▾) в правом углу',
      'Комментарии привязаны к конкретным версиям и остаются видны при переключении',
      'Чтобы загрузить новую версию — используйте "Загрузить новую версию" в том же меню',
    ],
  },
]

const API = '/api'

async function safeJson(res: Response): Promise<unknown> {
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('application/json')) {
    const text = await res.text()
    throw new Error(
      res.status === 0 || !res.ok
        ? 'Бэкенд недоступен. Запустите сервер: cd sandbox/backend && npm run dev'
        : `Сервер вернул HTML вместо JSON (${res.status}): ${text.slice(0, 80)}`
    )
  }
  return res.json()
}

export function UploadView() {
  const navigate = useNavigate()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function upload(json: ScreenJSON, isYaml: boolean) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/branches`, {
        method: 'POST',
        headers: { 'Content-Type': isYaml ? 'text/yaml' : 'application/json' },
        body: isYaml ? (json as unknown as string) : JSON.stringify(json),
      })
      if (!res.ok) {
        const body = await safeJson(res)
        throw new Error((body as any)?.error ?? 'Upload failed')
      }
      const { slug } = await safeJson(res) as { slug: string }
      navigate(`/branch/${slug}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }

  function readFile(file: File) {
    const isYaml = file.name.endsWith('.yaml') || file.name.endsWith('.yml')
    const isJson = file.name.endsWith('.json')
    if (!isYaml && !isJson) {
      setError('Поддерживаются файлы .json, .yaml, .yml')
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      try {
        if (isYaml) {
          // Send raw YAML text — backend will parse it
          upload(e.target?.result as unknown as ScreenJSON, true)
        } else {
          const json = JSON.parse(e.target?.result as string)
          upload(json, false)
        }
      } catch {
        setError(isYaml ? 'Файл не является валидным YAML' : 'Файл не является валидным JSON')
      }
    }
    reader.readAsText(file)
  }

  const allowedExts = '.json,.yaml,.yml'
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      const name = file.name.toLowerCase()
      if (name.endsWith('.json') || name.endsWith('.yaml') || name.endsWith('.yml'))
        readFile(file)
      else setError(`Перетащите файл (${allowedExts})`)
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) readFile(file)
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.logo}>S^R SandBox</div>
          <p className={styles.subtitle}>Загрузите JSON/YAML экран и получите ссылку для совместного просмотра</p>
        </div>

        <div
          className={`${styles.dropzone} ${dragging ? styles['dropzone--active'] : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".json,.yaml,.yml"
            className={styles.fileInput}
            onChange={onFileChange}
          />
          {loading ? (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <span>Загружаем...</span>
            </div>
          ) : (
            <>
              <div className={styles.dropIcon}>📄</div>
              <div className={styles.dropTitle}>
                 {dragging ? 'Отпустите файл' : 'Перетащите JSON/YAML или нажмите'}
              </div>
              <div className={styles.dropHint}>Файл в формате Skala^R Screen (JSON или YAML)</div>
            </>
          )}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.hint}>
          <strong>Нет файла?</strong> Попросите LLM создать JSON по схеме <code>schema/screen-schema.json</code> или используйте <code>schema/example.json</code>.
        </div>

        <InstructionsPanel />

        <RecentBranches />
      </div>
    </div>
  )
}

// ─── Instructions panel ───────────────────────────────────────────────────────
function InstructionsPanel() {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className={styles.instructions}>
      <div className={styles.instructionsTitle}>Инструкции</div>
      {INSTRUCTIONS.map(item => {
        const isOpen = openId === item.id
        return (
          <div key={item.id} className={`${styles.instrItem} ${isOpen ? styles['instrItem--open'] : ''}`}>
            <button
              className={styles.instrHeader}
              onClick={() => setOpenId(isOpen ? null : item.id)}
            >
              <span className={styles.instrHeaderText}>{item.title}</span>
              <span className={`${styles.instrChevron} ${isOpen ? styles['instrChevron--open'] : ''}`}>›</span>
            </button>
            {isOpen && (
              <div className={styles.instrBody}>
                <ol className={styles.instrSteps}>
                  {item.steps.map((step, i) => (
                    <li key={i} className={styles.instrStep}>{step}</li>
                  ))}
                </ol>
                {'code' in item && item.code && (
                  <pre className={styles.instrCode}>{item.code}</pre>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function RecentBranches() {
  const navigate = useNavigate()
  const [branches, setBranches] = useState<Array<{ slug: string; title: string; createdAt: string }>>([])
  const [loaded, setLoaded] = useState(false)

  if (!loaded) {
    fetch('/api/branches')
      .then(r => safeJson(r))
      .then(data => { setBranches(data as any[]); setLoaded(true) })
      .catch(() => setLoaded(true))
    return null
  }

  if (branches.length === 0) return null

  return (
    <div>
      <div className={styles.recentTitle}>Последние загрузки</div>
      <div className={styles.recentList}>
        {branches.slice(0, 8).map(b => (
          <div key={b.slug} className={styles.recentItem} onClick={() => navigate(`/branch/${b.slug}`)}>
            <div className={styles.recentItemTitle}>{b.title}</div>
            <div className={styles.recentItemMeta}>
              <code>{b.slug}</code>
              <span>{new Date(b.createdAt).toLocaleDateString('ru-RU')}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

# Skala^R Renderer — SandBox

Дизайн-система Skala^R: рендеринг экранов из YAML/JSON.

## Быстрый старт

### Frontend (React + Vite)

```bash
cd sandbox/frontend
npm install
npm run dev     # http://localhost:5175
```

### Backend (Node.js + Express + SQLite)

```bash
cd sandbox/backend
npm install
npm run dev     # http://localhost:3001
```

## Структура

```
sandbox/
├── frontend/          # React-приложение (Vite, Sass)
│   ├── src/
│   │   ├── App.tsx                 # Роутер: / → Upload, /branch/:slug/* → BranchView
│   │   ├── main.tsx                # Точка входа
│   │   ├── sandbox/
│   │   │   ├── UploadView.tsx      # Загрузка YAML/JSON
│   │   │   ├── BranchView.tsx      # Просмотр экрана + комментарии
│   │   │   └── CommentLayer.tsx    # Слой комментариев
│   │   └── renderer/
│   │       ├── Renderer.tsx         # ScreenProvider wrapper
│   │       ├── NodeRenderer.tsx    # Рекурсивный рендерер (50+ типов)
│   │       ├── types.ts            # Все TypeScript-типы
│   │       ├── context/
│   │       │   ├── ScreenContext.tsx
│   │       │   └── resolver.ts      # $state / $computed / $data resolution
│   │       └── components/
│   │           ├── Sidebar.tsx
│   │           └── LIcon.tsx
│   └── index.html
├── backend/           # Express + SQLite (better-sqlite3)
│   ├── server.js      # REST API: branches, versions, comments
│   └── db.js          # Миграции и SQLite-слой
├── screens/           # Примеры YAML-экранов
├── scripts/
│   └── embed-screen.js  # Встраивание JSON в index.html (offline-режим)
└── schema/
    └── llm-prompt.md  # Промпт для генерации экранов из Figma
```

## Как работает

1. **YAML загружается** → парсится → сохраняется в SQLite как версия
2. **BranchView** рендерит через `Renderer(screen)` → `ScreenProvider` → `NodeRenderer`
3. **NodeRenderer** — рекурсивный движок: 50+ типов узлов (app-shell, vstack, table, button, ...)
4. **$references** разрешаются: `$state`, `$computed`, `$data` → live values
5. **Комментарии** — клик на элемент → popup → отправка → SQLite → broadcast через WebSocket

## Генерация экранов

```bash
node sandbox/scripts/embed-screen.js sandbox/screens/report-builder.yaml
# → index.html обновляется, экран доступен по http://localhost:5175/branch/<name>
```

## API

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/branches` | Загрузить YAML → создать branch + version 1 |
| GET | `/api/branches` | Список всех branches |
| GET | `/api/branches/:slug` | Branch + latest version JSON |
| POST | `/api/branches/:slug/versions` | Новая версия (загрузить YAML) |
| GET | `/api/branches/:slug/versions` | Список версий |
| GET | `/api/branches/:slug/versions/:id` | JSON конкретной версии |
| GET | `/api/branches/:slug/comments` | Все комментарии |
| POST | `/api/branches/:slug/comments` | Новый комментарий |
| PATCH | `/api/branches/:slug/comments/:id` | Изменить статус (open/resolved/rejected) |
| DELETE | `/api/branches/:slug/comments/:id` | Удалить |

## Роли пользователей

- `designer` — загружает версии, принимает/отклоняет комментарии
- `analyst`, `pm`, `frontend`, `backend`, `qa` — комментируют и просматривают

Все пользователи self-declared (имя + фамилия в localStorage). Анонимные комментарии запрещены.
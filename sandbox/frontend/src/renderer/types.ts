// ─── Sandbox v2 types ─────────────────────────────────────────────────────
// Supports YAML format with reactive state, $references, on: handlers

// ─── Action string ─────────────────────────────────────────────────────────
// "navigate:/path" | "modal:<id>" | "toast:<message>" | "none"
export type ActionStr = string

// ─── Node types ────────────────────────────────────────────────────────────
export type NodeType =
  | 'app-shell' | 'vstack' | 'hstack' | 'grid' | 'card' | 'text' | 'divider'
  | 'sidebar' | 'menuitem' | 'breadcrumbs' | 'tab' | 'tab-menu' | 'tab-panel'
  | 'button' | 'button-chip' | 'button-dropdown'
  | 'input' | 'textarea' | 'checkbox' | 'switch' | 'dropdown' | 'multi-select-dropdown'
  | 'table' | 'table-controls'
  | 'icon' | 'menu-button'
  | 'status-badge' | 'badge' | 'progress' | 'metric-card'
  | 'message' | 'toast' | 'tooltip' | 'modal-trigger'
  | 'reorder-list' | 'filter-group'
  | 'report-builder' | 'report-builder2' | 'report-builder3'

// ─── Reactive actions ──────────────────────────────────────────────────────
export type ScreenAction =
  | { type: 'SET'; target: string; value: unknown }
  | { type: 'TOGGLE'; target: string }
  | { type: 'TOGGLE_ARRAY'; target: string; value: unknown }
  | { type: 'INCREMENT'; target: string; min?: number; max?: number }
  | { type: 'DECREMENT'; target: string; min?: number; max?: number }
  | { type: 'NAVIGATE'; target: string }
  | { type: 'MODAL_OPEN'; target: string }
  | { type: 'MODAL_CLOSE' }
  | { type: 'TOAST'; text: string }

// ─── Event handlers on a node ──────────────────────────────────────────────
export interface NodeHandler {
  click?: ScreenAction
  change?: ScreenAction
  tabChange?: ScreenAction
  [event: string]: ScreenAction | undefined
}

// ─── Generic node ──────────────────────────────────────────────────────────
export interface ScreenNode {
  type: NodeType
  id: string
  props?: Record<string, unknown>
  children?: ScreenNode[]
  /** Reactive event handlers (v2) */
  on?: NodeHandler
}

// ─── Computed definitions ──────────────────────────────────────────────────
export interface ComputedMapDef {
  source: string
  map: Record<string, Record<string, unknown>>
}

export interface ComputedFilterDef {
  source: string
  filter: Array<{
    key?: string
    value?: string
    ifNot?: string
    if?: string
    where?: Record<string, string>
  }>
}

export interface ComputedExprDef {
  expr: string
}

export interface ComputedGroupByDef {
  source: string
  groupBy: string[]
}

export interface ComputedSectionGroupDef {
  source: string
  sectionGroup: {
    levels: string[]
    rowNumbers: 'none' | 'global' | 'perGroup'
  }
}

export type ComputedDef = ComputedMapDef | ComputedFilterDef | ComputedExprDef | ComputedGroupByDef | ComputedSectionGroupDef

export interface ScreenComputed {
  [name: string]: ComputedDef
}

// ─── Screen state / data ───────────────────────────────────────────────────
export interface ScreenState {
  [key: string]: unknown
}

// ─── Top-level screen ──────────────────────────────────────────────────────
export interface ScreenMeta {
  title: string
  version?: string
  description?: string
  author?: string
  figmaUrl?: string
}

export interface ScreenPage {
  id: string
  path: string
  title?: string
  layout: ScreenNode
}

export interface ScreenModal {
  id: string
  title: string
  size?: 'sm' | 'md' | 'lg'
  children?: ScreenNode[]
}

export interface ScreenJSON {
  meta: ScreenMeta
  /** Initial reactive state (v2) */
  state?: ScreenState
  /** Mock data (v2) */
  data?: Record<string, unknown>
  /** Computed values derived from state + data (v2) */
  computed?: ScreenComputed
  pages: ScreenPage[]
  modals?: ScreenModal[]
}

// ─── Component-specific props ──────────────────────────────────────────────
export interface SidebarItem {
  id: string
  label: string
  icon?: string
  href?: string
  state?: 'active' | 'default'
  type?: 'item' | 'group'
}

export interface BreadcrumbOption {
  label: string
  href: string
  active?: boolean
}

export interface BreadcrumbItem {
  label: string
  href?: string
  options?: BreadcrumbOption[]
}

export interface TableColumn {
  key: string
  label: string
  width?: string
  type?: 'text' | 'status-badge' | 'badge' | 'button' | 'progress'
  sortable?: boolean
  sortDir?: 'asc' | 'desc'
  align?: 'left' | 'center' | 'right'
  groupBy?: boolean
}

// ─── Report builder ──────────────────────────────────────────────────────────
export interface ReportConfig {
  dataSource: string
  columns: string[]
  groupBy: string[]
  sortBy: { key: string; dir: 'asc' | 'desc' }
  rowNumbers: 'none' | 'global' | 'perGroup'
  filters: Record<string, string[]>
}

export interface Preset {
  id: string
  name: string
  config: ReportConfig
}

// ─── Versioning ────────────────────────────────────────────────────────────
export interface BranchVersion {
  id: number
  branchSlug: string
  versionNumber: number
  createdAt: string
}

// ─── Auth ───────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: number
  email: string
  firstName: string
  lastName: string
  role: UserRole
  createdAt: string
}

// ─── API ───────────────────────────────────────────────────────────────────
export interface ApiClient {
  comments: Comment[]
  commentTree: CommentTree[]
  loading: boolean
  connected: boolean
  error: string | null
  branchTitle: string
  screenJson: ScreenJSON | null
  versions: BranchVersion[]
  currentVersionId: number
  setCurrentVersionId: (id: number) => void
  addComment: (data: AddCommentData) => Promise<void>
  updateComment: (id: number, status: 'resolved' | 'rejected', role: UserRole, rejectReason?: string) => Promise<void>
  deleteComment: (id: number) => Promise<void>
  createShare: (versionId: number) => Promise<{ token: string; url: string }>
  setScreenJson: (json: ScreenJSON) => void
}

export interface AddCommentData {
  versionId: number
  parentId?: number | null
  nodeId?: string
  x?: number
  y?: number
  text: string
  author: string
  role: UserRole
}

// ─── Comment ───────────────────────────────────────────────────────────────
export type UserRole = 'designer' | 'analyst' | 'pm' | 'frontend' | 'backend' | 'qa' | 'guest'
export type CommentStatus = 'open' | 'resolved' | 'rejected'

export interface Comment {
  id: number
  parentId?: number | null
  branchSlug?: string
  versionId: number
  versionNumber: number
  nodeId?: string
  x?: number
  y?: number
  text: string
  author: string
  role: UserRole
  status: CommentStatus
  rejectReason?: string | null
  createdAt: string
  updatedAt?: string | null
}

export interface CommentTree extends Comment {
  replies?: CommentTree[]
}

// ─── Share ──────────────────────────────────────────────────────────────────
export interface ShareInfo {
  token: string
  branchSlug: string
  versionId: number
  createdBy: string
  createdAt: string
  screen?: ScreenJSON
  title?: string
}

// ─── WebSocket ──────────────────────────────────────────────────────────────
export type WsEvent =
  | { type: 'comment.created'; payload: Comment }
  | { type: 'comment.updated'; payload: Comment }
  | { type: 'comment.deleted'; payload: { id: number } }
  | { type: 'version.created'; payload: unknown }
  | { type: 'subscribed'; branch: string }

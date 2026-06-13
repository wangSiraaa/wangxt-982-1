import { create } from 'zustand'

export type Role = 'admin' | 'employee' | 'frontdesk' | 'equipadmin'

export interface User {
  id: string
  name: string
  role: string
  department?: string
}

export interface Room {
  id: string
  name: string
  floor: string
  capacity: number
  open_start_time: string
  open_end_time: string
  cost_per_hour: number
  cost_center_id: string | null
  setup_buffer_minutes: number
  can_split: boolean
  split_from: string | null
  status: string
  equipment?: Equipment[]
}

export interface Booking {
  id: string
  room_id: string
  booker_id: string
  title: string
  start_time: string
  end_time: string
  setup_start_time?: string
  teardown_end_time?: string
  attendee_count: number
  attendee_list?: string
  meeting_level: string
  cost_center_id?: string | null
  has_visitors: boolean
  tea_break_needed: boolean
  tea_break_time?: string | null
  is_recurring: boolean
  recurring_parent_id?: string | null
  status: string
  front_desk_confirmed: boolean
  security_approved: boolean
  check_in_time?: string | null
  released_at?: string | null
  equipment_ids?: string[]
  visitors?: Visitor[]
  logs?: BookingLog[]
}

export interface BookingLog {
  id: string
  booking_id: string
  action: string
  operator_id: string
  timestamp: string
  detail: string
}

export interface Visitor {
  id: string
  booking_id: string
  name: string
  company?: string | null
  id_type?: string | null
  id_number?: string | null
  purpose?: string | null
  status: string
  photo_url?: string | null
}

export interface Equipment {
  id: string
  name: string
  type: string
  room_id?: string | null
  status: string
  maintenance_note?: string | null
  borrower_id?: string | null
  expected_return_date?: string | null
}

export interface CostCenter {
  id: string
  name: string
  budget: number
  used: number
  department?: string | null
  remaining?: number
}

export interface ApprovalRule {
  id: string
  meeting_level?: string | null
  has_visitor?: number | null
  cost_center_id?: string | null
  requires_approval: number
  requires_front_desk: number
  requires_security: number
  approver_id?: string | null
}

export interface Notification {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  timestamp: number
}

interface AppState {
  currentUser: User | null
  currentRole: Role
  rooms: Room[]
  bookings: Booking[]
  visitors: Visitor[]
  equipment: Equipment[]
  costCenters: CostCenter[]
  approvalRules: ApprovalRule[]
  notifications: Notification[]
  loading: Record<string, boolean>

  setCurrentUser: (user: User) => void
  setCurrentRole: (role: Role) => void

  fetchRooms: (params?: Record<string, string>) => Promise<void>
  fetchBookings: (params?: Record<string, string>) => Promise<void>
  fetchVisitors: (params?: Record<string, string>) => Promise<void>
  fetchEquipment: (params?: Record<string, string>) => Promise<void>
  fetchCostCenters: (params?: Record<string, string>) => Promise<void>
  fetchApprovalRules: () => Promise<void>

  addNotification: (message: string, type: Notification['type']) => void
  removeNotification: (id: string) => void
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const json = await res.json()
  if (!json.success) throw new Error(json.error || '请求失败')
  return json.data as T
}

async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || '操作失败')
  return json.data as T
}

async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || '操作失败')
  return json.data as T
}

async function apiDelete<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: 'DELETE' })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || '操作失败')
  return json.data as T
}

export { apiFetch, apiPost, apiPut, apiDelete }

function buildQueryString(params?: Record<string, string>): string {
  if (!params) return ''
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  return qs ? `?${qs}` : ''
}

export const useStore = create<AppState>((set, get) => ({
  currentUser: null,
  currentRole: 'employee',
  rooms: [],
  bookings: [],
  visitors: [],
  equipment: [],
  costCenters: [],
  approvalRules: [],
  notifications: [],
  loading: {},

  setCurrentUser: (user) => set({ currentUser: user }),
  setCurrentRole: (role) => set({ currentRole: role }),

  fetchRooms: async (params) => {
    set((s) => ({ loading: { ...s.loading, rooms: true } }))
    try {
      const qs = buildQueryString(params)
      const data = await apiFetch<Room[]>(`/api/rooms${qs}`)
      set({ rooms: data })
    } catch (err: any) {
      get().addNotification(err.message, 'error')
    } finally {
      set((s) => ({ loading: { ...s.loading, rooms: false } }))
    }
  },

  fetchBookings: async (params) => {
    set((s) => ({ loading: { ...s.loading, bookings: true } }))
    try {
      const qs = buildQueryString(params)
      const data = await apiFetch<Booking[]>(`/api/bookings${qs}`)
      set({ bookings: data })
    } catch (err: any) {
      get().addNotification(err.message, 'error')
    } finally {
      set((s) => ({ loading: { ...s.loading, bookings: false } }))
    }
  },

  fetchVisitors: async (params) => {
    set((s) => ({ loading: { ...s.loading, visitors: true } }))
    try {
      const qs = buildQueryString(params)
      const data = await apiFetch<Visitor[]>(`/api/visitors${qs}`)
      set({ visitors: data })
    } catch (err: any) {
      get().addNotification(err.message, 'error')
    } finally {
      set((s) => ({ loading: { ...s.loading, visitors: false } }))
    }
  },

  fetchEquipment: async (params) => {
    set((s) => ({ loading: { ...s.loading, equipment: true } }))
    try {
      const qs = buildQueryString(params)
      const data = await apiFetch<Equipment[]>(`/api/equipment${qs}`)
      set({ equipment: data })
    } catch (err: any) {
      get().addNotification(err.message, 'error')
    } finally {
      set((s) => ({ loading: { ...s.loading, equipment: false } }))
    }
  },

  fetchCostCenters: async (params) => {
    set((s) => ({ loading: { ...s.loading, costCenters: true } }))
    try {
      const qs = buildQueryString(params)
      const data = await apiFetch<CostCenter[]>(`/api/cost-centers${qs}`)
      set({ costCenters: data })
    } catch (err: any) {
      get().addNotification(err.message, 'error')
    } finally {
      set((s) => ({ loading: { ...s.loading, costCenters: false } }))
    }
  },

  fetchApprovalRules: async () => {
    set((s) => ({ loading: { ...s.loading, approvalRules: true } }))
    try {
      const data = await apiFetch<ApprovalRule[]>('/api/config/rules')
      set({ approvalRules: data })
    } catch (err: any) {
      get().addNotification(err.message, 'error')
    } finally {
      set((s) => ({ loading: { ...s.loading, approvalRules: false } }))
    }
  },

  addNotification: (message, type) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2)
    const notification: Notification = { id, message, type, timestamp: Date.now() }
    set((s) => ({ notifications: [...s.notifications, notification] }))
    setTimeout(() => {
      get().removeNotification(id)
    }, 5000)
  },

  removeNotification: (id) => {
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }))
  },
}))

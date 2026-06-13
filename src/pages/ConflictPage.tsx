import { useEffect, useState, useMemo } from 'react'
import { Check, X, ArrowRightLeft, Crown, AlertTriangle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useStore, apiPost, apiFetch, type Booking, type Room } from '@/store'

type TabKey = 'pending' | 'conflict' | 'vip' | 'swap'

const tabs: { key: TabKey; label: string }[] = [
  { key: 'pending', label: '待审批' },
  { key: 'conflict', label: '冲突解决' },
  { key: 'vip', label: 'VIP抢占' },
  { key: 'swap', label: '换房' },
]

function PendingTab() {
  const bookings = useStore((s) => s.bookings)
  const rooms = useStore((s) => s.rooms)
  const currentUser = useStore((s) => s.currentUser)
  const currentRole = useStore((s) => s.currentRole)
  const addNotification = useStore((s) => s.addNotification)
  const fetchBookings = useStore((s) => s.fetchBookings)

  const pending = bookings.filter((b) => b.status === 'pending')

  const roomMap = useMemo(() => {
    const m = new Map<string, Room>()
    rooms.forEach((r) => m.set(r.id, r))
    return m
  }, [rooms])

  async function handleApprove(booking: Booking, approved: boolean) {
    try {
      await apiPost(`/api/bookings/${booking.id}/approve`, {
        operatorId: currentUser?.id,
        approved,
        reason: approved ? '' : '审批拒绝',
      })
      addNotification(approved ? '审批通过' : '已拒绝', approved ? 'success' : 'warning')
      fetchBookings({ date: format(new Date(), 'yyyy-MM-dd') })
    } catch (err: any) {
      addNotification(err.message, 'error')
    }
  }

  return (
    <div className="space-y-3">
      {pending.length === 0 ? (
        <div className="text-center py-12 text-slate-400">暂无待审批预订</div>
      ) : (
        pending.map((b) => {
          const room = roomMap.get(b.room_id)
          return (
            <div key={b.id} className="bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-slate-800">{b.title}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] badge-${b.meeting_level}`}>
                    {b.meeting_level === 'vip' ? 'VIP' : b.meeting_level === 'important' ? '重要' : '普通'}
                  </span>
                  {b.has_visitors && <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700">有访客</span>}
                </div>
                <div className="text-sm text-slate-500">
                  {room?.name} · {format(parseISO(b.start_time), 'MM/dd HH:mm')} - {format(parseISO(b.end_time), 'HH:mm')} · {b.attendee_count}人
                </div>
                <div className="flex gap-2 mt-1">
                  {b.front_desk_confirmed && <span className="text-[10px] text-teal-600">✓ 前台已确认</span>}
                  {b.security_approved && <span className="text-[10px] text-teal-600">✓ 安保已审批</span>}
                </div>
              </div>
              {(currentRole === 'admin') && (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleApprove(b, true)} className="flex items-center gap-1 px-3 py-1.5 bg-teal-700 text-white rounded-lg text-sm hover:bg-teal-800">
                    <Check className="w-4 h-4" /> 通过
                  </button>
                  <button onClick={() => handleApprove(b, false)} className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-sm hover:bg-red-100">
                    <X className="w-4 h-4" /> 拒绝
                  </button>
                </div>
              )}
              {currentRole === 'frontdesk' && !b.front_desk_confirmed && (
                <button onClick={async () => {
                  try {
                    await apiPost(`/api/bookings/${b.id}/confirm`, { operatorId: currentUser?.id })
                    addNotification('前台确认成功', 'success')
                    fetchBookings({ date: format(new Date(), 'yyyy-MM-dd') })
                  } catch (err: any) { addNotification(err.message, 'error') }
                }} className="px-3 py-1.5 bg-teal-700 text-white rounded-lg text-sm hover:bg-teal-800 shrink-0">
                  前台确认
                </button>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

function ConflictTab() {
  const bookings = useStore((s) => s.bookings)
  const rooms = useStore((s) => s.rooms)

  const conflicts = useMemo(() => {
    const active = bookings.filter((b) => !['cancelled', 'rejected'].includes(b.status))
    const result: { a: Booking; b: Booking; roomId: string }[] = []
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        if (active[i].room_id === active[j].room_id) {
          const aStart = active[i].start_time
          const aEnd = active[i].end_time
          const bStart = active[j].start_time
          const bEnd = active[j].end_time
          if (aStart < bEnd && bStart < aEnd) {
            result.push({ a: active[i], b: active[j], roomId: active[i].room_id })
          }
        }
      }
    }
    return result
  }, [bookings])

  const roomMap = useMemo(() => {
    const m = new Map<string, Room>()
    rooms.forEach((r) => m.set(r.id, r))
    return m
  }, [rooms])

  return (
    <div className="space-y-3">
      {conflicts.length === 0 ? (
        <div className="text-center py-12 text-slate-400">暂无冲突</div>
      ) : (
        conflicts.map((c, i) => {
          const room = roomMap.get(c.roomId)
          return (
            <div key={i} className="bg-white rounded-lg border border-red-200 p-4">
              <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
                <AlertTriangle className="w-4 h-4" />
                冲突 - {room?.name}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-red-50 rounded">
                  <div className="font-medium text-sm">{c.a.title}</div>
                  <div className="text-xs text-slate-500">{format(parseISO(c.a.start_time), 'HH:mm')}-{format(parseISO(c.a.end_time), 'HH:mm')}</div>
                </div>
                <div className="p-3 bg-red-50 rounded">
                  <div className="font-medium text-sm">{c.b.title}</div>
                  <div className="text-xs text-slate-500">{format(parseISO(c.b.start_time), 'HH:mm')}-{format(parseISO(c.b.end_time), 'HH:mm')}</div>
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

function VipPreemptTab() {
  const bookings = useStore((s) => s.bookings)
  const rooms = useStore((s) => s.rooms)
  const currentUser = useStore((s) => s.currentUser)
  const currentRole = useStore((s) => s.currentRole)
  const addNotification = useStore((s) => s.addNotification)
  const fetchBookings = useStore((s) => s.fetchBookings)

  const nonVip = bookings.filter((b) => b.meeting_level !== 'vip' && !['cancelled', 'rejected'].includes(b.status))

  async function handlePreempt(booking: Booking) {
    if (!confirm(`确定要抢占「${booking.title}」的会议室吗？`)) return
    try {
      await apiPost(`/api/bookings/${booking.id}/vip-preempt`, {
        bookerId: currentUser?.id,
        title: 'VIP紧急会议',
        meetingLevel: 'vip',
      })
      addNotification('VIP抢占成功', 'success')
      fetchBookings({ date: format(new Date(), 'yyyy-MM-dd') })
    } catch (err: any) {
      addNotification(err.message, 'error')
    }
  }

  const roomMap = useMemo(() => {
    const m = new Map<string, Room>()
    rooms.forEach((r) => m.set(r.id, r))
    return m
  }, [rooms])

  if (currentRole !== 'admin' && currentRole !== 'frontdesk') {
    return <div className="text-center py-12 text-slate-400">仅管理员/前台可执行VIP抢占</div>
  }

  return (
    <div className="space-y-3">
      {nonVip.length === 0 ? (
        <div className="text-center py-12 text-slate-400">无可抢占的预订</div>
      ) : (
        nonVip.map((b) => {
          const room = roomMap.get(b.room_id)
          return (
            <div key={b.id} className="bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm text-slate-800">{b.title}</div>
                <div className="text-xs text-slate-500">{room?.name} · {format(parseISO(b.start_time), 'HH:mm')}-{format(parseISO(b.end_time), 'HH:mm')}</div>
              </div>
              <button onClick={() => handlePreempt(b)} className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
                <Crown className="w-4 h-4" /> VIP抢占
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}

function SwapTab() {
  const bookings = useStore((s) => s.bookings)
  const rooms = useStore((s) => s.rooms)
  const currentUser = useStore((s) => s.currentUser)
  const currentRole = useStore((s) => s.currentRole)
  const addNotification = useStore((s) => s.addNotification)
  const fetchBookings = useStore((s) => s.fetchBookings)

  const [selectedBookingId, setSelectedBookingId] = useState('')
  const [suggestions, setSuggestions] = useState<Room[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  const activeBookings = bookings.filter((b) => !['cancelled', 'rejected'].includes(b.status))

  async function handleSuggest() {
    if (!selectedBookingId) return
    setLoadingSuggestions(true)
    try {
      const data = await apiPost<Room[]>('/api/bookings/suggest-swap', { bookingId: selectedBookingId })
      setSuggestions(data)
    } catch (err: any) {
      addNotification(err.message, 'error')
    } finally {
      setLoadingSuggestions(false)
    }
  }

  async function handleSwap(targetRoomId: string) {
    try {
      await apiPost('/api/bookings/swap-room', {
        bookingId: selectedBookingId,
        targetRoomId,
        operatorId: currentUser?.id,
        reason: '手动换房',
      })
      addNotification('换房成功', 'success')
      setSelectedBookingId('')
      setSuggestions([])
      fetchBookings({ date: format(new Date(), 'yyyy-MM-dd') })
    } catch (err: any) {
      addNotification(err.message, 'error')
    }
  }

  if (currentRole !== 'admin') {
    return <div className="text-center py-12 text-slate-400">仅管理员可执行换房操作</div>
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm text-slate-600 mb-1">选择预订</label>
            <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={selectedBookingId} onChange={(e) => setSelectedBookingId(e.target.value)}>
              <option value="">请选择</option>
              {activeBookings.map((b) => (
                <option key={b.id} value={b.id}>{b.title} ({b.start_time})</option>
              ))}
            </select>
          </div>
          <button onClick={handleSuggest} disabled={!selectedBookingId || loadingSuggestions} className="px-4 py-2 bg-teal-700 text-white rounded-lg text-sm hover:bg-teal-800 disabled:opacity-50">
            查询可用房间
          </button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {suggestions.map((r) => (
            <div key={r.id} className="bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm text-slate-800">{r.name}</div>
                <div className="text-xs text-slate-500">{r.capacity}人 · {r.floor}层 · ¥{r.cost_per_hour}/时</div>
              </div>
              <button onClick={() => handleSwap(r.id)} className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700">
                <ArrowRightLeft className="w-4 h-4" /> 换到此处
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ConflictPage() {
  const fetchBookings = useStore((s) => s.fetchBookings)
  const fetchRooms = useStore((s) => s.fetchRooms)
  const [activeTab, setActiveTab] = useState<TabKey>('pending')

  useEffect(() => {
    fetchBookings({ date: format(new Date(), 'yyyy-MM-dd') })
    fetchRooms()
  }, [])

  return (
    <div className="animate-fadeIn">
      <div className="flex gap-1 bg-white rounded-lg border border-slate-200 p-1 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              activeTab === tab.key ? 'bg-teal-700 text-white font-medium' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'pending' && <PendingTab />}
      {activeTab === 'conflict' && <ConflictTab />}
      {activeTab === 'vip' && <VipPreemptTab />}
      {activeTab === 'swap' && <SwapTab />}
    </div>
  )
}

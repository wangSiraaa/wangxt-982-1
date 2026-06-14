import { useEffect, useState, useMemo } from 'react'
import { Check, X, ArrowRightLeft, Crown, AlertTriangle, Users, MapPin, DollarSign, Clock, Monitor, History, Lightbulb, ChevronDown, ChevronRight, ArrowRight, RefreshCw } from 'lucide-react'
import { format, parseISO, differenceInMinutes } from 'date-fns'
import { useStore, apiPost, apiFetch, type Booking, type Room, type ConflictDetail, type ResourceDiff } from '@/store'

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

function ResourceDiffView({ diff }: { diff: ResourceDiff }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">整体匹配度</span>
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${diff.overallMatchScore >= 80 ? 'bg-green-500' : diff.overallMatchScore >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${diff.overallMatchScore}%` }}
            />
          </div>
          <span className={`text-sm font-bold ${diff.overallMatchScore >= 80 ? 'text-green-600' : diff.overallMatchScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
            {diff.overallMatchScore}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="p-2 bg-slate-50 rounded">
          <div className="text-xs text-slate-500 mb-1">容量变化</div>
          <div className="font-medium text-slate-700">
            {diff.room.capacity.before} → {diff.room.capacity.after}
            {diff.room.capacity.changed && (
              <span className={`ml-1 text-xs ${diff.room.capacity.diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                ({diff.room.capacity.diff > 0 ? '+' : ''}{diff.room.capacity.diff})
              </span>
            )}
          </div>
        </div>
        <div className="p-2 bg-slate-50 rounded">
          <div className="text-xs text-slate-500 mb-1">楼层变化</div>
          <div className="font-medium text-slate-700">
            {diff.room.floor.before} → {diff.room.floor.after}层
          </div>
        </div>
        <div className="p-2 bg-slate-50 rounded">
          <div className="text-xs text-slate-500 mb-1">费用变化</div>
          <div className={`font-medium ${diff.cost.totalCost.diff > 0 ? 'text-red-600' : diff.cost.totalCost.diff < 0 ? 'text-green-600' : 'text-slate-700'}`}>
            ¥{diff.cost.totalCost.before} → ¥{diff.cost.totalCost.after}
            {diff.cost.totalCost.changed && (
              <span className="text-xs ml-1">
                ({diff.cost.totalCost.diff > 0 ? '+' : ''}¥{diff.cost.totalCost.diff})
              </span>
            )}
          </div>
        </div>
      </div>

      {diff.equipment.changed && (
        <div className="p-2 bg-slate-50 rounded">
          <div className="text-xs text-slate-500 mb-2">设备变化</div>
          <div className="flex flex-wrap gap-2 text-xs">
            {diff.equipment.added.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-green-600">新增:</span>
                {diff.equipment.added.map((e, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded">{e}</span>
                ))}
              </div>
            )}
            {diff.equipment.removed.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-red-600">减少:</span>
                {diff.equipment.removed.map((e, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded">{e}</span>
                ))}
              </div>
            )}
          </div>
        </div>
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
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [swapHistory, setSwapHistory] = useState<any[]>([])
  const [resourceSnapshots, setResourceSnapshots] = useState<any[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null)
  const [swapReason, setSwapReason] = useState('')
  const [showSwapResult, setShowSwapResult] = useState<{ resourceDiff: ResourceDiff; swapHistory: any[] } | null>(null)

  const activeBookings = bookings.filter((b) => !['cancelled', 'rejected'].includes(b.status))

  const selectedBooking = useMemo(() =>
    bookings.find(b => b.id === selectedBookingId),
    [bookings, selectedBookingId]
  )

  const selectedRoom = useMemo(() =>
    rooms.find(r => r.id === selectedBooking?.room_id),
    [rooms, selectedBooking]
  )

  const selectedSuggestionRoom = useMemo(() =>
    rooms.find(r => r.id === selectedSuggestion),
    [rooms, selectedSuggestion]
  )

  const loadSwapHistory = async (bookingId: string) => {
    try {
      const history = await apiFetch<any[]>(`/api/bookings/${bookingId}/swap-history`)
      setSwapHistory(history)
      const snapshots = await apiFetch<any[]>(`/api/bookings/${bookingId}/resource-snapshots`)
      setResourceSnapshots(snapshots)
    } catch (err: any) {
      console.error('加载迁移历史失败:', err)
    }
  }

  async function handleSuggest() {
    if (!selectedBookingId) return
    setLoadingSuggestions(true)
    try {
      const data = await apiPost<any[]>('/api/bookings/suggest-swap', { bookingId: selectedBookingId })
      setSuggestions(data)
      setSelectedSuggestion(null)
      loadSwapHistory(selectedBookingId)
    } catch (err: any) {
      addNotification(err.message, 'error')
    } finally {
      setLoadingSuggestions(false)
    }
  }

  async function handleSwap(targetRoomId: string) {
    const reason = swapReason || '手动换房'
    try {
      const result = await apiPost<any>('/api/bookings/swap-room', {
        bookingId: selectedBookingId,
        targetRoomId,
        operatorId: currentUser?.id,
        reason,
        triggerType: 'manual',
      })

      if (result.resourceDiff && result.swapHistory) {
        setShowSwapResult({ resourceDiff: result.resourceDiff, swapHistory: result.swapHistory })
        setSwapHistory(result.swapHistory)
        setResourceSnapshots(result.snapshots || [])
      }

      addNotification('换房成功', 'success')
      setSwapReason('')
      setSelectedSuggestion(null)
      handleSuggest()
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
      {showSwapResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6 animate-slideUp">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Check className="w-5 h-5 text-green-500" />
                换房成功
              </h3>
              <button
                onClick={() => setShowSwapResult(null)}
                className="text-slate-400 hover:text-slate-600 text-xl"
              >
                ×
              </button>
            </div>

            <div className="mb-4">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">资源差异对比</h4>
              <ResourceDiffView diff={showSwapResult.resourceDiff} />
            </div>

            <div className="mb-4">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">迁移历史</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {showSwapResult.swapHistory.slice(0, 3).map((h: any, i: number) => (
                  <div key={i} className="text-xs p-2 bg-slate-50 rounded">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">
                        {h.from_room_name} → {h.to_room_name}
                      </span>
                      <span className="text-slate-500">
                        {format(parseISO(h.timestamp), 'MM/dd HH:mm')}
                      </span>
                    </div>
                    {h.reason && <div className="text-slate-500 mt-0.5">{h.reason}</div>}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowSwapResult(null)}
              className="w-full py-2 bg-teal-700 text-white rounded-lg text-sm hover:bg-teal-800"
            >
              确认
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm text-slate-600 mb-1">选择预订</label>
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={selectedBookingId}
              onChange={(e) => {
                setSelectedBookingId(e.target.value)
                setSuggestions([])
                setSwapHistory([])
                setResourceSnapshots([])
                setSelectedSuggestion(null)
              }}
            >
              <option value="">请选择</option>
              {activeBookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} ({format(parseISO(b.start_time), 'MM/dd HH:mm')})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSuggest}
            disabled={!selectedBookingId || loadingSuggestions}
            className="px-4 py-2 bg-teal-700 text-white rounded-lg text-sm hover:bg-teal-800 disabled:opacity-50 flex items-center gap-1"
          >
            {loadingSuggestions ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
            智能推荐
          </button>
        </div>
      </div>

      {selectedBooking && selectedRoom && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-2">当前房间</div>
            <div className="font-medium text-slate-800 mb-2">{selectedRoom.name}</div>
            <div className="text-sm text-slate-600 space-y-1">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span>{selectedRoom.capacity}人</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>{selectedRoom.floor}层</span>
              </div>
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                <span>¥{selectedRoom.cost_per_hour}/时</span>
              </div>
            </div>
          </div>

          {selectedSuggestionRoom ? (
            <div className="bg-white rounded-lg border border-teal-300 bg-teal-50/30 p-4">
              <div className="text-xs text-teal-600 mb-2">目标房间</div>
              <div className="font-medium text-slate-800 mb-2">{selectedSuggestionRoom.name}</div>
              <div className="text-sm text-slate-600 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>{selectedSuggestionRoom.capacity}人</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>{selectedSuggestionRoom.floor}层</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                  <span>¥{selectedSuggestionRoom.cost_per_hour}/时</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 p-4 flex items-center justify-center">
              <span className="text-sm text-slate-400">选择下方推荐房间查看对比</span>
            </div>
          )}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            推荐替代房间
            <span className="text-xs font-normal text-slate-500">（共 {suggestions.length} 个）</span>
          </h3>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {suggestions.map((room) => (
              <div
                key={room.id}
                className={`rounded-lg border p-3 cursor-pointer transition-all ${
                  selectedSuggestion === room.id
                    ? 'border-teal-400 bg-teal-50 ring-2 ring-teal-100'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
                onClick={() => setSelectedSuggestion(selectedSuggestion === room.id ? null : room.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-slate-800">{room.name}</span>
                      {room.matchScore !== undefined && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          room.matchScore >= 80 ? 'bg-green-100 text-green-700' :
                          room.matchScore >= 60 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          匹配度 {room.matchScore}%
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {room.capacity}人 · {room.floor}层 · ¥{room.cost_per_hour}/时
                    </div>
                    {room.matchReasons && room.matchReasons.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {room.matchReasons.map((r: string, i: number) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSwap(room.id)
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs hover:bg-amber-700 shrink-0 ml-3"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    换到此处
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {swapHistory.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            迁移历史
            <span className="text-xs font-normal text-slate-500">（共 {swapHistory.length} 次）</span>
          </h3>

          <div className="space-y-2">
            {swapHistory.map((h, i) => (
              <div key={i} className="p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-700">{h.from_room_name}</span>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <span className="font-medium text-slate-700">{h.to_room_name}</span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {format(parseISO(h.timestamp), 'MM/dd HH:mm')}
                  </span>
                </div>
                {h.reason && (
                  <div className="text-xs text-slate-500 mt-1">原因: {h.reason}</div>
                )}
                {h.trigger_type && (
                  <div className="text-xs text-slate-400 mt-0.5">
                    触发: {h.trigger_type === 'equipment_fault' ? '设备故障' :
                           h.trigger_type === 'room_maintenance' ? '会议室维修' :
                           h.trigger_type === 'temp_requisition' ? '临时征用' :
                           h.trigger_type === 'no_show' ? '未签到释放' : '手动换房'}
                  </div>
                )}
              </div>
            ))}
          </div>
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

import { useEffect, useState, useMemo } from 'react'
import { Wrench, ArrowRight, ArrowLeft, AlertTriangle, Package, Lightbulb, ArrowRightLeft, ChevronDown, ChevronRight, RefreshCw, Check, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useStore, apiPost, apiFetch, type Equipment, type Booking, type Room } from '@/store'

const columns = [
  { key: 'normal', label: '正常', color: 'bg-green-50 border-green-200' },
  { key: 'maintenance', label: '维修中', color: 'bg-amber-50 border-amber-200' },
  { key: 'borrowed', label: '已借出', color: 'bg-blue-50 border-blue-200' },
  { key: 'faulty', label: '故障', color: 'bg-red-50 border-red-200' },
] as const

const typeLabels: Record<string, string> = {
  projector: '投影仪',
  screen: '幕布',
  video_conferencing: '视频会议',
  whiteboard: '电子白板',
  speaker: '音响',
  microphone: '麦克风',
  livestream: '直播推流',
  touchscreen: '触控一体机',
}

function EquipmentCard({
  eq,
  currentRole,
  onAction,
}: {
  eq: Equipment
  currentRole: string
  onAction: (action: string, eq: Equipment) => void
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 mb-3">
      <div className="flex items-start justify-between mb-1">
        <div className="font-medium text-sm text-slate-800">{eq.name}</div>
        <span className={`px-1.5 py-0.5 rounded text-[10px] badge-${eq.status}`}>
          {eq.status === 'normal' ? '正常' : eq.status === 'maintenance' ? '维修' : eq.status === 'borrowed' ? '借出' : '故障'}
        </span>
      </div>
      <div className="text-xs text-slate-500 mb-2">
        {typeLabels[eq.type] || eq.type}
        {eq.room_id && ' · 房间关联'}
      </div>
      {eq.maintenance_note && <div className="text-xs text-amber-600 mb-2">备注: {eq.maintenance_note}</div>}
      <div className="flex gap-1.5 flex-wrap">
        {currentRole === 'equipadmin' && eq.status === 'normal' && (
          <>
            <button onClick={() => onAction('maintenance', eq)} className="flex items-center gap-1 px-2 py-1 text-[11px] bg-amber-50 text-amber-700 rounded hover:bg-amber-100">
              <Wrench className="w-3 h-3" /> 维修
            </button>
            <button onClick={() => onAction('borrow', eq)} className="flex items-center gap-1 px-2 py-1 text-[11px] bg-blue-50 text-blue-700 rounded hover:bg-blue-100">
              <ArrowRight className="w-3 h-3" /> 借出
            </button>
          </>
        )}
        {currentRole === 'equipadmin' && eq.status === 'maintenance' && (
          <button onClick={() => onAction('return-normal', eq)} className="flex items-center gap-1 px-2 py-1 text-[11px] bg-green-50 text-green-700 rounded hover:bg-green-100">
            <ArrowLeft className="w-3 h-3" /> 恢复正常
          </button>
        )}
        {currentRole === 'equipadmin' && (eq.status === 'normal' || eq.status === 'maintenance') && (
          <button onClick={() => onAction('faulty', eq)} className="flex items-center gap-1 px-2 py-1 text-[11px] bg-red-50 text-red-700 rounded hover:bg-red-100">
            <AlertTriangle className="w-3 h-3" /> 故障
          </button>
        )}
        {currentRole === 'equipadmin' && eq.status === 'borrowed' && (
          <button onClick={() => onAction('return', eq)} className="flex items-center gap-1 px-2 py-1 text-[11px] bg-green-50 text-green-700 rounded hover:bg-green-100">
            <ArrowLeft className="w-3 h-3" /> 归还
          </button>
        )}
      </div>
    </div>
  )
}

function AffectedBookingsPanel({ equipmentId, onClose, triggerType }: { equipmentId: string; onClose: () => void; triggerType: 'faulty' | 'maintenance' }) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null)
  const [suggestionsMap, setSuggestionsMap] = useState<Record<string, any[]>>({})
  const [loadingSuggestion, setLoadingSuggestion] = useState<string | null>(null)
  const currentUser = useStore((s) => s.currentUser)
  const addNotification = useStore((s) => s.addNotification)
  const fetchBookings = useStore((s) => s.fetchBookings)

  useEffect(() => {
    apiFetch<Booking[]>(`/api/equipment/${equipmentId}/affected-bookings`)
      .then(setBookings)
      .catch(() => setBookings([]))
      .finally(() => setLoading(false))
  }, [equipmentId])

  const loadSuggestions = async (bookingId: string) => {
    if (suggestionsMap[bookingId]) {
      setExpandedBookingId(expandedBookingId === bookingId ? null : bookingId)
      return
    }
    setLoadingSuggestion(bookingId)
    try {
      const data = await apiPost<any[]>('/api/bookings/suggest-swap', {
        bookingId,
        excludeEquipmentId: equipmentId,
      })
      setSuggestionsMap(prev => ({ ...prev, [bookingId]: data }))
      setExpandedBookingId(bookingId)
    } catch (err: any) {
      addNotification(err.message, 'error')
    } finally {
      setLoadingSuggestion(null)
    }
  }

  const handleSwap = async (bookingId: string, targetRoomId: string) => {
    try {
      await apiPost('/api/bookings/swap-room', {
        bookingId,
        targetRoomId,
        operatorId: currentUser?.id,
        reason: triggerType === 'faulty' ? '设备故障迁移' : '设备维修迁移',
        triggerType: triggerType === 'faulty' ? 'equipment_fault' : 'equipment_maintenance',
      })
      addNotification('迁移成功', 'success')
      setSuggestionsMap(prev => ({ ...prev, [bookingId]: [] }))
      fetchBookings({ date: format(new Date(), 'yyyy-MM-dd') })
    } catch (err: any) {
      addNotification(err.message, 'error')
    }
  }

  return (
    <div className="bg-white rounded-lg border border-red-200 p-4 animate-slideUp max-h-[calc(100vh-200px)] overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          受影响的预订
        </h4>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">×</button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">加载中...</div>
      ) : bookings.length === 0 ? (
        <div className="text-sm text-slate-400 flex items-center gap-2">
          <Check className="w-4 h-4 text-green-500" />
          无受影响预订
        </div>
      ) : (
        <div className="space-y-2">
          {bookings.map((b) => (
            <div key={b.id} className="text-xs border border-red-100 rounded-lg overflow-hidden">
              <div
                className="p-2 bg-red-50 cursor-pointer hover:bg-red-100 transition-colors flex items-center justify-between"
                onClick={() => loadSuggestions(b.id)}
              >
                <div className="flex-1">
                  <div className="font-medium text-red-700">{b.title}</div>
                  <div className="text-red-500 text-[11px]">
                    {format(parseISO(b.start_time), 'MM/dd HH:mm')} - {format(parseISO(b.end_time), 'HH:mm')}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {loadingSuggestion === b.id ? (
                    <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                  ) : (
                    <>
                      <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                      {expandedBookingId === b.id ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </>
                  )}
                </div>
              </div>

              {expandedBookingId === b.id && suggestionsMap[b.id] && (
                <div className="p-2 border-t border-red-100 bg-white space-y-1.5">
                  <div className="text-[10px] text-slate-500 font-medium">推荐替代房间</div>
                  {suggestionsMap[b.id].length === 0 ? (
                    <div className="text-[11px] text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      暂无可用替代房间
                    </div>
                  ) : (
                    suggestionsMap[b.id].slice(0, 3).map((room: any) => (
                      <div key={room.id} className="flex items-center justify-between p-1.5 bg-slate-50 rounded">
                        <div>
                          <div className="text-[11px] font-medium text-slate-700">{room.name}</div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1">
                            <span>{room.capacity}人</span>
                            <span>·</span>
                            <span>{room.floor}层</span>
                            {room.matchScore !== undefined && (
                              <>
                                <span>·</span>
                                <span className={room.matchScore >= 80 ? 'text-green-600' : room.matchScore >= 60 ? 'text-amber-600' : 'text-red-600'}>
                                  匹配{room.matchScore}%
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleSwap(b.id, room.id)}
                          className="flex items-center gap-0.5 px-2 py-1 bg-amber-500 text-white rounded text-[10px] hover:bg-amber-600"
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          迁移
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {bookings.length > 0 && (
        <div className="mt-3 pt-3 border-t border-red-100">
          <div className="text-[11px] text-slate-500">
            共 <span className="font-medium text-red-600">{bookings.length}</span> 个预订受影响
          </div>
        </div>
      )}
    </div>
  )
}

export default function EquipmentPage() {
  const equipment = useStore((s) => s.equipment)
  const fetchEquipment = useStore((s) => s.fetchEquipment)
  const currentRole = useStore((s) => s.currentRole)
  const currentUser = useStore((s) => s.currentUser)
  const addNotification = useStore((s) => s.addNotification)
  const loading = useStore((s) => s.loading)

  const [affectedEqId, setAffectedEqId] = useState<string | null>(null)
  const [affectedTrigger, setAffectedTrigger] = useState<'faulty' | 'maintenance'>('faulty')

  useEffect(() => { fetchEquipment() }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, Equipment[]>()
    for (const col of columns) map.set(col.key, [])
    for (const eq of equipment) {
      const list = map.get(eq.status) || map.get('normal')!
      list.push(eq)
    }
    return map
  }, [equipment])

  async function handleAction(action: string, eq: Equipment) {
    try {
      if (action === 'maintenance') {
        await apiPost(`/api/equipment/${eq.id}/maintenance`, { operatorId: currentUser?.id, note: '设备维修中' })
        addNotification(`${eq.name} 已标记为维修`, 'warning')
        setAffectedEqId(eq.id)
        setAffectedTrigger('maintenance')
      } else if (action === 'borrow') {
        await apiPost(`/api/equipment/${eq.id}/borrow`, { operatorId: currentUser?.id, borrowerId: currentUser?.id })
        addNotification(`${eq.name} 已借出`, 'info')
      } else if (action === 'return') {
        await apiPost(`/api/equipment/${eq.id}/return`, { operatorId: currentUser?.id })
        addNotification(`${eq.name} 已归还`, 'success')
      } else if (action === 'return-normal') {
        await apiPost(`/api/equipment/${eq.id}/maintenance`, { operatorId: currentUser?.id, note: '维修完成', status: 'normal' })
        addNotification(`${eq.name} 已恢复正常`, 'success')
      } else if (action === 'faulty') {
        await apiPost(`/api/equipment/${eq.id}/maintenance`, { operatorId: currentUser?.id, note: '设备故障', status: 'faulty' })
        addNotification(`${eq.name} 已标记故障`, 'error')
        setAffectedEqId(eq.id)
        setAffectedTrigger('faulty')
      }
      fetchEquipment()
    } catch (err: any) {
      addNotification(err.message, 'error')
    }
  }

  if (loading.equipment) {
    return <div className="space-y-4"><div className="h-64 bg-slate-200 rounded animate-pulse-custom" /></div>
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex gap-4">
        <div className="flex-1">
          <div className="grid grid-cols-4 gap-4">
            {columns.map((col) => (
              <div key={col.key} className={`rounded-lg border-2 p-3 ${col.color}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">{col.label}</h3>
                  <span className="text-xs opacity-60">{grouped.get(col.key)?.length || 0}</span>
                </div>
                <div className="space-y-0 max-h-[calc(100vh-260px)] overflow-y-auto">
                  {grouped.get(col.key)?.map((eq) => (
                    <EquipmentCard key={eq.id} eq={eq} currentRole={currentRole} onAction={handleAction} />
                  ))}
                  {(grouped.get(col.key)?.length || 0) === 0 && (
                    <div className="text-center py-4 text-xs text-slate-400">暂无设备</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {affectedEqId && (
          <div className="w-80 shrink-0">
            <AffectedBookingsPanel equipmentId={affectedEqId} onClose={() => setAffectedEqId(null)} triggerType={affectedTrigger} />
          </div>
        )}
      </div>
    </div>
  )
}

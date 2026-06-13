import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, X, Clock, Users, Monitor, DollarSign, UserCheck, Shield, LayoutGrid, Info, ChevronDown, ChevronRight, Lightbulb, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import { useStore, apiPost, type Room, type Equipment, type CostCenter, type ConflictDetail } from '@/store'

interface BookingForm {
  title: string
  meetingLevel: string
  costCenterId: string
  date: string
  startTime: string
  endTime: string
  roomId: string
  attendeeCount: number
  attendeeList: string
  equipmentIds: string[]
  hasVisitors: boolean
  teaBreakNeeded: boolean
  teaBreakTime: string
  isRecurring: boolean
  recurringFrequency: string
  recurringEndDate: string
}

const CONFLICT_TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  time: { label: '时间冲突', icon: Clock, color: 'text-red-600' },
  capacity: { label: '容量不足', icon: Users, color: 'text-amber-600' },
  equipment: { label: '设备冲突', icon: Monitor, color: 'text-orange-600' },
  equipment_borrow: { label: '设备借出', icon: Monitor, color: 'text-orange-600' },
  equipment_maintenance: { label: '设备维保', icon: Monitor, color: 'text-yellow-600' },
  budget: { label: '预算问题', icon: DollarSign, color: 'text-rose-600' },
  visitor: { label: '访客问题', icon: UserCheck, color: 'text-purple-600' },
  security: { label: '安保审批', icon: Shield, color: 'text-indigo-600' },
  setup_buffer: { label: '布场缓冲', icon: LayoutGrid, color: 'text-teal-600' },
  room_status: { label: '会议室状态', icon: Info, color: 'text-slate-600' },
  approval: { label: '审批要求', icon: Info, color: 'text-blue-600' },
}

function ConflictCard({ conflict }: { conflict: ConflictDetail }) {
  const [expanded, setExpanded] = useState(false)
  const meta = CONFLICT_TYPE_META[conflict.type] || { label: conflict.type, icon: AlertTriangle, color: 'text-slate-600' }
  const Icon = meta.icon

  const severityStyles = {
    error: 'border-l-red-500 bg-red-50',
    warning: 'border-l-amber-500 bg-amber-50',
    info: 'border-l-blue-500 bg-blue-50',
  }

  return (
    <div
      className={`rounded-lg border border-slate-200 border-l-4 ${severityStyles[conflict.severity]} overflow-hidden`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-start gap-2 text-left"
      >
        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${meta.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-800">{conflict.title}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              conflict.severity === 'error' ? 'bg-red-100 text-red-700' :
              conflict.severity === 'warning' ? 'bg-amber-100 text-amber-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {conflict.severity === 'error' ? '阻断' : conflict.severity === 'warning' ? '警告' : '提示'}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 line-clamp-2">{conflict.description}</p>
        </div>
        {conflict.resolutionSuggestion && (
          expanded ?
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-1" /> :
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
        )}
      </button>
      {expanded && conflict.resolutionSuggestion && (
        <div className="px-3 pb-3 pt-0">
          <div className="bg-white/70 rounded p-2 flex items-start gap-2">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-medium text-slate-700">建议</div>
              <p className="text-xs text-slate-600 mt-0.5">{conflict.resolutionSuggestion}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ConflictPanel({ conflicts, loading }: { conflicts: ConflictDetail[]; loading: boolean }) {
  const grouped = useMemo(() => {
    const groups: Record<string, ConflictDetail[]> = {}
    for (const c of conflicts) {
      if (!groups[c.type]) groups[c.type] = []
      groups[c.type].push(c)
    }
    return groups
  }, [conflicts])

  const errorCount = conflicts.filter(c => c.severity === 'error').length
  const warningCount = conflicts.filter(c => c.severity === 'warning').length
  const infoCount = conflicts.filter(c => c.severity === 'info').length

  if (loading) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-slate-200 rounded w-3/4" />
          <div className="h-4 bg-slate-200 rounded w-1/2" />
          <div className="h-4 bg-slate-200 rounded w-2/3" />
        </div>
      </div>
    )
  }

  if (conflicts.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
        <Check className="w-8 h-8 text-green-500 mx-auto mb-2" />
        <div className="text-sm text-green-700 font-medium">无冲突，可以预订</div>
        <div className="text-xs text-green-600 mt-1">所有资源检测通过</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <div className="flex gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-slate-600">阻断 {errorCount}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-slate-600">警告 {warningCount}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-slate-600">提示 {infoCount}</span>
          </span>
        </div>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {Object.entries(grouped).map(([type, items]) => {
          const meta = CONFLICT_TYPE_META[type] || { label: type, icon: AlertTriangle, color: 'text-slate-600' }
          const TypeIcon = meta.icon
          return (
            <div key={type}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1.5">
                <TypeIcon className="w-3.5 h-3.5" />
                <span>{meta.label}</span>
                <span className="text-slate-400">({items.length})</span>
              </div>
              <div className="space-y-1.5">
                {items.map(c => <ConflictCard key={c.id} conflict={c} />)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function BookingPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const rooms = useStore((s) => s.rooms)
  const equipment = useStore((s) => s.equipment)
  const costCenters = useStore((s) => s.costCenters)
  const currentRole = useStore((s) => s.currentRole)
  const currentUser = useStore((s) => s.currentUser)
  const addNotification = useStore((s) => s.addNotification)
  const fetchRooms = useStore((s) => s.fetchRooms)
  const fetchEquipment = useStore((s) => s.fetchEquipment)
  const fetchCostCenters = useStore((s) => s.fetchCostCenters)
  const loading = useStore((s) => s.loading)

  const [form, setForm] = useState<BookingForm>({
    title: '',
    meetingLevel: 'normal',
    costCenterId: '',
    date: searchParams.get('date') || format(new Date(), 'yyyy-MM-dd'),
    startTime: searchParams.get('time') || '09:00',
    endTime: '10:00',
    roomId: searchParams.get('roomId') || '',
    attendeeCount: 1,
    attendeeList: '',
    equipmentIds: [],
    hasVisitors: false,
    teaBreakNeeded: false,
    teaBreakTime: '',
    isRecurring: false,
    recurringFrequency: 'weekly',
    recurringEndDate: '',
  })

  const [submitting, setSubmitting] = useState(false)
  const [apiConflicts, setApiConflicts] = useState<ConflictDetail[]>([])
  const [conflictLoading, setConflictLoading] = useState(false)
  const debounceTimer = useRef<number | null>(null)

  useEffect(() => {
    fetchRooms()
    fetchEquipment()
    fetchCostCenters()
  }, [])

  const selectedRoom = useMemo(() => rooms.find((r) => r.id === form.roomId), [rooms, form.roomId])

  const roomEquipment = useMemo(() => {
    if (!selectedRoom) return []
    return selectedRoom.equipment || []
  }, [selectedRoom])

  const fetchConflicts = useCallback(async () => {
    if (!form.roomId || !form.startTime || !form.endTime || !form.date) {
      setApiConflicts([])
      return
    }

    setConflictLoading(true)
    try {
      const startTime = `${form.date}T${form.startTime}:00`
      const endTime = `${form.date}T${form.endTime}:00`
      const result = await apiPost<any>('/api/bookings/check-conflicts', {
        roomId: form.roomId,
        startTime,
        endTime,
        attendeeCount: form.attendeeCount,
        meetingLevel: form.meetingLevel,
        costCenterId: form.costCenterId || undefined,
        hasVisitors: form.hasVisitors,
        equipmentIds: form.equipmentIds.length > 0 ? form.equipmentIds : undefined,
        teaBreakNeeded: form.teaBreakNeeded,
        teaBreakTime: form.teaBreakTime || undefined,
        isRecurring: form.isRecurring,
        recurringRule: form.isRecurring ? { frequency: form.recurringFrequency, endDate: form.recurringEndDate } : undefined,
      })
      setApiConflicts(result || [])
    } catch (err: any) {
      console.error('冲突检测失败:', err)
    } finally {
      setConflictLoading(false)
    }
  }, [form.roomId, form.date, form.startTime, form.endTime, form.attendeeCount, form.meetingLevel, form.costCenterId, form.hasVisitors, form.equipmentIds, form.teaBreakNeeded, form.teaBreakTime, form.isRecurring, form.recurringFrequency, form.recurringEndDate])

  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }
    debounceTimer.current = window.setTimeout(() => {
      fetchConflicts()
    }, 500)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [fetchConflicts])

  const localValidations = useMemo((): { valid: boolean; errors: string[] } => {
    const errors: string[] = []
    if (!form.title.trim()) errors.push('请输入会议标题')
    if (form.attendeeCount > 10 && !form.attendeeList.trim()) errors.push('参会人数超过10人必须填写人员名单')
    if (form.isRecurring && !form.recurringEndDate) errors.push('请设置周期会议结束日期')
    return { valid: errors.length === 0, errors }
  }, [form])

  const hasBlockingConflicts = apiConflicts.some(c => c.severity === 'error')
  const canSubmit = !hasBlockingConflicts && localValidations.valid && form.roomId

  async function handleSubmit() {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    try {
      const startTime = `${form.date}T${form.startTime}:00`
      const endTime = `${form.date}T${form.endTime}:00`
      await apiPost('/api/bookings', {
        roomId: form.roomId,
        bookerId: currentUser?.id || 'unknown',
        title: form.title,
        startTime,
        endTime,
        attendeeCount: form.attendeeCount,
        attendeeList: form.attendeeList ? form.attendeeList.split(',').map((s) => s.trim()) : null,
        meetingLevel: form.meetingLevel,
        costCenterId: form.costCenterId || null,
        hasVisitors: form.hasVisitors,
        teaBreakNeeded: form.teaBreakNeeded,
        teaBreakTime: form.teaBreakTime || null,
        isRecurring: form.isRecurring,
        recurringRule: form.isRecurring ? { frequency: form.recurringFrequency, endDate: form.recurringEndDate } : null,
        equipmentIds: form.equipmentIds.length > 0 ? form.equipmentIds : null,
      })
      addNotification('预订创建成功', 'success')
      navigate('/')
    } catch (err: any) {
      addNotification(err.message || '预订失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  function updateForm(partial: Partial<BookingForm>) {
    setForm((prev) => ({ ...prev, ...partial }))
  }

  if (loading.rooms) {
    return <div className="space-y-4"><div className="h-96 bg-slate-200 rounded animate-pulse-custom" /></div>
  }

  return (
    <div className="animate-fadeIn flex gap-6">
      <div className="flex-1 space-y-6">
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4">基本信息</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm text-slate-600 mb-1">会议标题 *</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.title} onChange={(e) => updateForm({ title: e.target.value })} placeholder="请输入会议标题" />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">会议级别</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.meetingLevel} onChange={(e) => updateForm({ meetingLevel: e.target.value })}>
                <option value="normal">普通</option>
                <option value="important">重要</option>
                {(currentRole === 'admin' || currentRole === 'frontdesk') && <option value="vip">VIP</option>}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">成本中心</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.costCenterId} onChange={(e) => updateForm({ costCenterId: e.target.value })}>
                <option value="">不选择</option>
                {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4">时间</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-slate-600 mb-1">日期</label>
              <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.date} onChange={(e) => updateForm({ date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">开始时间</label>
              <input type="time" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.startTime} onChange={(e) => updateForm({ startTime: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">结束时间</label>
              <input type="time" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.endTime} onChange={(e) => updateForm({ endTime: e.target.value })} />
            </div>
          </div>
          {selectedRoom && selectedRoom.setup_buffer_minutes > 0 && (
            <div className="mt-2 text-xs text-slate-400">会议室需要 {selectedRoom.setup_buffer_minutes} 分钟布场/撤场时间</div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4">会议室</h2>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3" value={form.roomId} onChange={(e) => updateForm({ roomId: e.target.value })}>
            <option value="">请选择会议室</option>
            {rooms.filter((r) => r.status === 'available').map((r) => (
              <option key={r.id} value={r.id}>{r.name} - {r.capacity}人 · {r.floor}层 · ¥{r.cost_per_hour}/时</option>
            ))}
          </select>
          {selectedRoom && (
            <div className="text-xs text-slate-500 space-y-1">
              <div>开放时间：{selectedRoom.open_start_time} - {selectedRoom.open_end_time}</div>
              <div>设备：{roomEquipment.map((e) => e.name).join(', ') || '无'}</div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4">参会人员</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-600 mb-1">参会人数</label>
              <input type="number" min={1} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.attendeeCount} onChange={(e) => updateForm({ attendeeCount: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">人员名单（逗号分隔）</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.attendeeList} onChange={(e) => updateForm({ attendeeList: e.target.value })} placeholder="张三,李四" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4">其他选项</h2>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="rounded border-slate-300 text-teal-700" checked={form.hasVisitors} onChange={(e) => updateForm({ hasVisitors: e.target.checked })} />
              有访客
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="rounded border-slate-300 text-teal-700" checked={form.teaBreakNeeded} onChange={(e) => updateForm({ teaBreakNeeded: e.target.checked })} />
              需要茶歇
            </label>
            {form.teaBreakNeeded && (
              <div className="ml-6">
                <label className="block text-sm text-slate-600 mb-1">茶歇时间</label>
                <input type="time" className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" value={form.teaBreakTime} onChange={(e) => updateForm({ teaBreakTime: e.target.value })} />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="rounded border-slate-300 text-teal-700" checked={form.isRecurring} onChange={(e) => updateForm({ isRecurring: e.target.checked })} />
              周期会议
            </label>
            {form.isRecurring && (
              <div className="ml-6 flex gap-3">
                <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" value={form.recurringFrequency} onChange={(e) => updateForm({ recurringFrequency: e.target.value })}>
                  <option value="weekly">每周</option>
                  <option value="biweekly">每两周</option>
                  <option value="monthly">每月</option>
                </select>
                <input type="date" className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" value={form.recurringEndDate} onChange={(e) => updateForm({ recurringEndDate: e.target.value })} placeholder="结束日期" />
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={handleSubmit} disabled={!canSubmit || submitting} className="px-6 py-2.5 bg-teal-700 text-white rounded-lg text-sm font-medium hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? '提交中...' : '提交预订'}
          </button>
          <button onClick={() => navigate('/')} className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200">
            取消
          </button>
        </div>
      </div>

      <div className="w-80 shrink-0 self-start sticky top-0 space-y-4">
        {selectedRoom && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">预订摘要</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">会议室</span>
                <span className="font-medium text-slate-700">{selectedRoom.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">容量</span>
                <span className="text-slate-700">{selectedRoom.capacity}人</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">楼层</span>
                <span className="text-slate-700">{selectedRoom.floor}层</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">费用</span>
                <span className="text-slate-700">¥{selectedRoom.cost_per_hour}/时</span>
              </div>
              {form.costCenterId && (
                <div className="flex justify-between">
                  <span className="text-slate-500">成本中心</span>
                  <span className="text-slate-700">
                    {costCenters.find(c => c.id === form.costCenterId)?.name || '-'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800">资源冲突检测</h3>
            {!conflictLoading && form.roomId && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                hasBlockingConflicts
                  ? 'bg-red-100 text-red-700'
                  : apiConflicts.length > 0
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-green-100 text-green-700'
              }`}>
                {hasBlockingConflicts ? '有阻断' : apiConflicts.length > 0 ? '有警告' : '全部通过'}
              </span>
            )}
          </div>
          {!form.roomId ? (
            <div className="text-center py-4 text-sm text-slate-400">
              请先选择会议室
            </div>
          ) : (
            <ConflictPanel conflicts={apiConflicts} loading={conflictLoading} />
          )}
        </div>

        {localValidations.errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-red-800 mb-2">请完善信息</h3>
            <ul className="text-xs text-red-600 space-y-1">
              {localValidations.errors.map((err, i) => (
                <li key={i}>• {err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

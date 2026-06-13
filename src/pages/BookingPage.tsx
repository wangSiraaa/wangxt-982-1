import { useEffect, useState, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, X } from 'lucide-react'
import { format } from 'date-fns'
import { useStore, apiPost, type Room, type Equipment, type CostCenter } from '@/store'

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

interface ConflictItem {
  type: string
  message: string
  severity: 'error' | 'warning' | 'info'
}

function ConflictPanel({ conflicts }: { conflicts: ConflictItem[] }) {
  if (conflicts.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
        <Check className="w-8 h-8 text-green-500 mx-auto mb-2" />
        <div className="text-sm text-green-700 font-medium">无冲突，可以预订</div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {conflicts.map((c, i) => (
        <div
          key={i}
          className={`rounded-lg p-3 flex items-start gap-2 text-sm ${
            c.severity === 'error' ? 'bg-red-50 border border-red-200 text-red-700' :
            c.severity === 'warning' ? 'bg-amber-50 border border-amber-200 text-amber-700' :
            'bg-blue-50 border border-blue-200 text-blue-700'
          }`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">{c.type}</div>
            <div className="text-xs opacity-80">{c.message}</div>
          </div>
        </div>
      ))}
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

  const conflicts = useMemo((): ConflictItem[] => {
    const items: ConflictItem[] = []
    if (!form.roomId) {
      items.push({ type: '未选择会议室', message: '请选择一个会议室', severity: 'error' })
      return items
    }
    if (selectedRoom && form.attendeeCount > selectedRoom.capacity) {
      items.push({ type: '容量不足', message: `参会人数(${form.attendeeCount})超过会议室容量(${selectedRoom.capacity})`, severity: 'error' })
    }
    if (selectedRoom && selectedRoom.status !== 'available') {
      items.push({ type: '会议室不可用', message: `会议室状态: ${selectedRoom.status}`, severity: 'error' })
    }
    if (!form.title.trim()) {
      items.push({ type: '缺少标题', message: '请输入会议标题', severity: 'error' })
    }
    if (form.hasVisitors) {
      items.push({ type: '访客提醒', message: '有访客的会议可能需要前台确认和安保审批', severity: 'warning' })
    }
    if (form.meetingLevel === 'vip') {
      items.push({ type: 'VIP会议', message: 'VIP会议需要审批通过后才生效', severity: 'warning' })
    }
    if (form.attendeeCount > 10 && !form.attendeeList.trim()) {
      items.push({ type: '参会人员', message: '超过10人的会议请填写参会人员名单', severity: 'warning' })
    }
    if (form.isRecurring && !form.recurringEndDate) {
      items.push({ type: '周期会议', message: '请设置周期结束日期', severity: 'error' })
    }
    return items
  }, [form, selectedRoom])

  const hasErrors = conflicts.some((c) => c.severity === 'error')

  async function handleSubmit() {
    if (hasErrors || submitting) return
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
          <button onClick={handleSubmit} disabled={hasErrors || submitting} className="px-6 py-2.5 bg-teal-700 text-white rounded-lg text-sm font-medium hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? '提交中...' : '提交预订'}
          </button>
          <button onClick={() => navigate('/')} className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200">
            取消
          </button>
        </div>
      </div>

      <div className="w-72 shrink-0 self-start sticky top-0">
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">冲突检测</h3>
          <ConflictPanel conflicts={conflicts} />
        </div>
      </div>
    </div>
  )
}

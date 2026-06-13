import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Filter } from 'lucide-react'
import { format, addDays, subDays, parseISO, differenceInMinutes } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useStore, type Room, type Booking } from '@/store'

type ViewMode = 'day' | 'week'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const SLOT_HEIGHT = 40

function BookingBlock({ booking, room, onClick }: { booking: Booking; room: Room; onClick: () => void }) {
  const start = parseISO(booking.start_time)
  const end = parseISO(booking.end_time)
  const startOffset = (start.getHours() * 60 + start.getMinutes()) / 30 * (SLOT_HEIGHT / 2)
  const duration = differenceInMinutes(end, start)
  const height = (duration / 30) * (SLOT_HEIGHT / 2)

  return (
    <div
      className={`booking-block booking-${booking.meeting_level}`}
      style={{ top: `${startOffset}px`, height: `${Math.max(height, 20)}px` }}
      onClick={onClick}
    >
      <div className="font-medium truncate">{booking.title}</div>
      {height > 30 && (
        <div className="text-[10px] opacity-75">
          {format(start, 'HH:mm')}-{format(end, 'HH:mm')} · {room.name}
        </div>
      )}
    </div>
  )
}

function FilterSidebar({
  floors,
  rooms,
  filters,
  onChange,
}: {
  floors: string[]
  rooms: Room[]
  filters: FilterState
  onChange: (f: FilterState) => void
}) {
  const costCenters = useStore((s) => s.costCenters)
  const equipmentTypes = useMemo(() => {
    const types = new Set<string>()
    rooms.forEach((r) => r.equipment?.forEach((e) => types.add(e.type)))
    return Array.from(types)
  }, [rooms])

  return (
    <div className="w-56 bg-white rounded-lg border border-slate-200 p-4 shrink-0 self-start">
      <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-slate-700">
        <Filter className="w-4 h-4" />
        筛选条件
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">楼层</label>
          <select
            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
            value={filters.floor}
            onChange={(e) => onChange({ ...filters, floor: e.target.value })}
          >
            <option value="">全部</option>
            {floors.map((f) => <option key={f} value={f}>{f}层</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">容量</label>
          <div className="flex gap-1">
            <input
              type="number"
              placeholder="最小"
              className="w-1/2 border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
              value={filters.capacityMin}
              onChange={(e) => onChange({ ...filters, capacityMin: e.target.value })}
            />
            <input
              type="number"
              placeholder="最大"
              className="w-1/2 border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
              value={filters.capacityMax}
              onChange={(e) => onChange({ ...filters, capacityMax: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">设备</label>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {equipmentTypes.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-teal-700 focus:ring-teal-500"
                  checked={filters.equipment.includes(t)}
                  onChange={(e) => {
                    const eq = e.target.checked
                      ? [...filters.equipment, t]
                      : filters.equipment.filter((x) => x !== t)
                    onChange({ ...filters, equipment: eq })
                  }}
                />
                {t}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">成本中心</label>
          <select
            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
            value={filters.costCenter}
            onChange={(e) => onChange({ ...filters, costCenter: e.target.value })}
          >
            <option value="">全部</option>
            {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}

interface FilterState {
  floor: string
  capacityMin: string
  capacityMax: string
  equipment: string[]
  costCenter: string
}

function BookingDetailPopup({ booking, room, onClose }: { booking: Booking; room: Room | undefined; onClose: () => void }) {
  const start = parseISO(booking.start_time)
  const end = parseISO(booking.end_time)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-96 p-5 animate-slideUp" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800">{booking.title}</h3>
          <span className={`px-2 py-0.5 rounded-full text-xs badge-${booking.meeting_level}`}>
            {booking.meeting_level === 'vip' ? 'VIP' : booking.meeting_level === 'important' ? '重要' : '普通'}
          </span>
        </div>
        <div className="space-y-2 text-sm text-slate-600">
          <div>会议室：{room?.name || '未知'}</div>
          <div>时间：{format(start, 'HH:mm')} - {format(end, 'HH:mm')}</div>
          <div>参会人数：{booking.attendee_count}</div>
          <div>状态：<span className={`badge-${booking.status} px-1.5 py-0.5 rounded text-xs`}>{booking.status}</span></div>
          {booking.has_visitors && <div className="text-amber-600">有访客</div>}
          {booking.tea_break_needed && <div className="text-amber-600">需要茶歇</div>}
        </div>
        <button onClick={onClose} className="mt-4 w-full py-2 bg-slate-100 rounded-lg text-sm text-slate-600 hover:bg-slate-200">
          关闭
        </button>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const rooms = useStore((s) => s.rooms)
  const bookings = useStore((s) => s.bookings)
  const fetchRooms = useStore((s) => s.fetchRooms)
  const fetchBookings = useStore((s) => s.fetchBookings)
  const fetchCostCenters = useStore((s) => s.fetchCostCenters)
  const loading = useStore((s) => s.loading)

  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [filters, setFilters] = useState<FilterState>({ floor: '', capacityMin: '', capacityMax: '', equipment: [], costCenter: '' })
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)

  const dateStr = format(currentDate, 'yyyy-MM-dd')

  useEffect(() => {
    fetchRooms()
    fetchCostCenters()
  }, [])

  useEffect(() => {
    fetchBookings({ date: dateStr })
  }, [dateStr])

  const floors = useMemo(() => [...new Set(rooms.map((r) => r.floor))].sort(), [rooms])

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (filters.floor && r.floor !== filters.floor) return false
      if (filters.capacityMin && r.capacity < Number(filters.capacityMin)) return false
      if (filters.capacityMax && r.capacity > Number(filters.capacityMax)) return false
      if (filters.equipment.length > 0) {
        const roomTypes = r.equipment?.map((e) => e.type) || []
        if (!filters.equipment.every((t) => roomTypes.includes(t))) return false
      }
      if (filters.costCenter && r.cost_center_id !== filters.costCenter) return false
      return true
    })
  }, [rooms, filters])

  const roomMap = useMemo(() => {
    const m = new Map<string, Room>()
    rooms.forEach((r) => m.set(r.id, r))
    return m
  }, [rooms])

  const weekDays = useMemo(() => {
    const startOfWeek = subDays(currentDate, currentDate.getDay() - 1)
    return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek, i))
  }, [currentDate])

  if (loading.rooms || loading.bookings) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-slate-200 rounded animate-pulse-custom" />
        <div className="h-96 bg-slate-200 rounded animate-pulse-custom" />
      </div>
    )
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrentDate(subDays(currentDate, viewMode === 'week' ? 7 : 1))} className="p-1.5 rounded-lg hover:bg-slate-200">
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <span className="text-lg font-semibold text-slate-800 min-w-[160px] text-center">
            {format(currentDate, 'yyyy年M月d日 EEEE', { locale: zhCN })}
          </span>
          <button onClick={() => setCurrentDate(addDays(currentDate, viewMode === 'week' ? 7 : 1))} className="p-1.5 rounded-lg hover:bg-slate-200">
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-sm bg-teal-700 text-white rounded-lg hover:bg-teal-800">
            今天
          </button>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('day')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${viewMode === 'day' ? 'bg-white shadow text-teal-700 font-medium' : 'text-slate-500'}`}
          >
            日视图
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${viewMode === 'week' ? 'bg-white shadow text-teal-700 font-medium' : 'text-slate-500'}`}
          >
            周视图
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        <FilterSidebar floors={floors} rooms={rooms} filters={filters} onChange={setFilters} />

        {viewMode === 'day' ? (
          <div className="flex-1 bg-white rounded-lg border border-slate-200 overflow-auto">
            <div className="flex sticky top-0 z-10 bg-white border-b border-slate-200">
              <div className="w-16 shrink-0 px-2 py-2 text-xs text-slate-400 border-r border-slate-200">时间</div>
              {filteredRooms.map((room) => (
                <div key={room.id} className="flex-1 min-w-[140px] px-2 py-2 text-xs font-medium text-slate-600 border-r border-slate-100 last:border-r-0 text-center">
                  {room.name}
                  <div className="text-[10px] text-slate-400">{room.capacity}人 · {room.floor}层</div>
                </div>
              ))}
            </div>
            <div className="flex relative">
              <div className="w-16 shrink-0">
                {HOURS.filter((h) => h >= 8 && h <= 19).map((hour) => (
                  <div key={hour} className="border-b border-r border-slate-200 text-xs text-slate-400 text-right pr-2" style={{ height: SLOT_HEIGHT }}>
                    {String(hour).padStart(2, '0')}:00
                  </div>
                ))}
              </div>
              {filteredRooms.map((room) => {
                const roomBookings = bookings.filter((b) => b.room_id === room.id)
                return (
                  <div key={room.id} className="flex-1 min-w-[140px] relative border-r border-slate-100 last:border-r-0">
                    {HOURS.filter((h) => h >= 8 && h <= 19).map((hour) => (
                      <div
                        key={hour}
                        className="calendar-slot"
                        style={{ height: SLOT_HEIGHT }}
                        onClick={() => navigate(`/booking?roomId=${room.id}&date=${dateStr}&time=${String(hour).padStart(2, '0')}:00`)}
                      />
                    ))}
                    {roomBookings.map((b) => (
                      <BookingBlock key={b.id} booking={b} room={room} onClick={() => setSelectedBooking(b)} />
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-white rounded-lg border border-slate-200 overflow-auto">
            <div className="flex sticky top-0 z-10 bg-white border-b border-slate-200">
              {weekDays.map((day) => (
                <div
                  key={day.toISOString()}
                  className={`flex-1 px-2 py-2 text-center text-sm border-r border-slate-100 last:border-r-0 ${
                    format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'text-teal-700 font-semibold' : 'text-slate-500'
                  }`}
                >
                  {format(day, 'M/d EEE', { locale: zhCN })}
                </div>
              ))}
            </div>
            <div className="flex">
              {weekDays.map((day) => {
                const dayStr = format(day, 'yyyy-MM-dd')
                const dayBookings = bookings.filter((b) => b.start_time.startsWith(dayStr))
                return (
                  <div key={day.toISOString()} className="flex-1 min-w-[120px] border-r border-slate-100 last:border-r-0">
                    {dayBookings.map((b) => {
                      const room = roomMap.get(b.room_id)
                      return (
                        <div
                          key={b.id}
                          className={`m-1 px-2 py-1.5 rounded text-xs cursor-pointer booking-${b.meeting_level}`}
                          onClick={() => setSelectedBooking(b)}
                        >
                          <div className="font-medium truncate">{b.title}</div>
                          <div className="opacity-75">{format(parseISO(b.start_time), 'HH:mm')} {room?.name}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {selectedBooking && (
        <BookingDetailPopup
          booking={selectedBooking}
          room={roomMap.get(selectedBooking.room_id)}
          onClose={() => setSelectedBooking(null)}
        />
      )}
    </div>
  )
}

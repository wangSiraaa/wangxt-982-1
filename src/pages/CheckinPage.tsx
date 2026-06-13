import { useEffect, useState, useMemo } from 'react'
import { Clock, Users, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { format, parseISO, differenceInMinutes } from 'date-fns'
import { useStore, apiPost, type Booking, type Room } from '@/store'

function MeetingCard({
  booking,
  room,
  onCheckin,
  onRelease,
  canCheckin,
}: {
  booking: Booking
  room: Room | undefined
  onCheckin: () => void
  onRelease: () => void
  canCheckin: boolean
}) {
  const start = parseISO(booking.start_time)
  const end = parseISO(booking.end_time)
  const now = new Date()
  const isPast = now > end
  const isOngoing = now >= start && now <= end
  const elapsed = isOngoing ? differenceInMinutes(now, start) : 0
  const isOverdue = isOngoing && elapsed > 15 && booking.status !== 'checking'

  const statusColor = booking.status === 'checking'
    ? 'border-green-400 bg-green-50'
    : isOverdue
    ? 'border-red-400 bg-red-50'
    : isPast
    ? 'border-slate-300 bg-slate-50'
    : 'border-amber-400 bg-amber-50'

  const statusLabel = booking.status === 'checking'
    ? '已签到'
    : booking.status === 'no_show'
    ? '已释放'
    : isOverdue
    ? '超时未签'
    : '待签到'

  return (
    <div className={`rounded-lg border-2 p-4 ${statusColor} animate-fadeIn`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-semibold text-slate-800">{booking.title}</div>
          <div className="text-sm text-slate-500">{room?.name || '未知会议室'}</div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs ${
          booking.status === 'checking' ? 'badge-checking' :
          booking.status === 'no_show' ? 'badge-no_show' :
          isOverdue ? 'badge-rejected' :
          'badge-pending'
        }`}>
          {statusLabel}
        </span>
      </div>
      <div className="flex items-center gap-4 text-sm text-slate-600 mb-3">
        <div className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {format(start, 'HH:mm')} - {format(end, 'HH:mm')}
        </div>
        <div className="flex items-center gap-1">
          <Users className="w-4 h-4" />
          {booking.attendee_count}人
        </div>
      </div>

      {isOverdue && booking.status !== 'checking' && (
        <div className="flex items-center gap-1 text-xs text-red-600 mb-2 animate-pulse-custom">
          <AlertTriangle className="w-3 h-3" />
          已超时 {elapsed - 15} 分钟
        </div>
      )}

      {booking.status === 'checking' && (
        <div className="flex items-center gap-1 text-xs text-green-600 mb-2">
          <CheckCircle className="w-3 h-3" />
          签到时间：{booking.check_in_time ? format(parseISO(booking.check_in_time), 'HH:mm') : '-'}
        </div>
      )}

      <div className="flex gap-2">
        {canCheckin && booking.status !== 'checking' && booking.status !== 'no_show' && isOngoing && (
          <button onClick={onCheckin} className="flex-1 py-2 bg-teal-700 text-white rounded-lg text-sm font-medium hover:bg-teal-800">
            签到
          </button>
        )}
        {canCheckin && isOverdue && booking.status !== 'checking' && booking.status !== 'no_show' && (
          <button onClick={onRelease} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
            释放会议室
          </button>
        )}
      </div>
    </div>
  )
}

export default function CheckinPage() {
  const bookings = useStore((s) => s.bookings)
  const rooms = useStore((s) => s.rooms)
  const currentRole = useStore((s) => s.currentRole)
  const currentUser = useStore((s) => s.currentUser)
  const fetchBookings = useStore((s) => s.fetchBookings)
  const addNotification = useStore((s) => s.addNotification)
  const loading = useStore((s) => s.loading)

  useEffect(() => {
    fetchBookings({ date: format(new Date(), 'yyyy-MM-dd') })
  }, [])

  const roomMap = useMemo(() => {
    const m = new Map<string, Room>()
    rooms.forEach((r) => m.set(r.id, r))
    return m
  }, [rooms])

  const canCheckin = currentRole === 'employee' || currentRole === 'frontdesk' || currentRole === 'admin'

  const stats = useMemo(() => {
    const total = bookings.filter((b) => !['cancelled', 'rejected'].includes(b.status)).length
    const checkedIn = bookings.filter((b) => b.status === 'checking').length
    const now = new Date()
    const pending = bookings.filter((b) => {
      if (['checking', 'cancelled', 'rejected', 'no_show', 'completed'].includes(b.status)) return false
      const start = parseISO(b.start_time)
      return now >= start
    }).length
    const released = bookings.filter((b) => b.status === 'no_show').length
    return { total, checkedIn, pending, released }
  }, [bookings])

  async function handleCheckin(booking: Booking) {
    try {
      await apiPost(`/api/bookings/${booking.id}/checkin`, {})
      addNotification('签到成功', 'success')
      fetchBookings({ date: format(new Date(), 'yyyy-MM-dd') })
    } catch (err: any) {
      addNotification(err.message, 'error')
    }
  }

  async function handleRelease(booking: Booking) {
    try {
      await apiPost(`/api/bookings/${booking.id}/release-noshow`, { timeoutMinutes: 15 })
      addNotification('会议室已释放', 'warning')
      fetchBookings({ date: format(new Date(), 'yyyy-MM-dd') })
    } catch (err: any) {
      addNotification(err.message, 'error')
    }
  }

  if (loading.bookings) {
    return <div className="space-y-4"><div className="h-20 bg-slate-200 rounded animate-pulse-custom" /><div className="h-96 bg-slate-200 rounded animate-pulse-custom" /></div>
  }

  const activeBookings = bookings.filter((b) => !['cancelled', 'rejected'].includes(b.status))

  return (
    <div className="animate-fadeIn">
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: '今日会议', value: stats.total, color: 'bg-slate-100 text-slate-700' },
          { label: '已签到', value: stats.checkedIn, color: 'bg-green-100 text-green-700' },
          { label: '待签到', value: stats.pending, color: 'bg-amber-100 text-amber-700' },
          { label: '已释放', value: stats.released, color: 'bg-red-100 text-red-700' },
        ].map((s) => (
          <div key={s.label} className={`rounded-lg p-4 ${s.color}`}>
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-sm opacity-75">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeBookings.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-slate-400">今日暂无会议</div>
        ) : (
          activeBookings.map((b) => (
            <MeetingCard
              key={b.id}
              booking={b}
              room={roomMap.get(b.room_id)}
              onCheckin={() => handleCheckin(b)}
              onRelease={() => handleRelease(b)}
              canCheckin={canCheckin}
            />
          ))
        )}
      </div>
    </div>
  )
}

import { Router, type Request, type Response } from 'express'
import { queryAll, queryOne, run } from '../database.js'
import { v4 as uuidv4 } from 'uuid'
import { differenceInMinutes, addMinutes, parseISO, format } from 'date-fns'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { date, roomId, status, bookerId, meetingLevel } = req.query
    let sql = `SELECT * FROM bookings WHERE 1=1`
    const params: any[] = []

    if (date) {
      const d = String(date)
      sql += ` AND start_time >= ? AND start_time < ?`
      params.push(`${d}T00:00:00`, `${d}T23:59:59`)
    }
    if (roomId) { sql += ` AND room_id = ?`; params.push(String(roomId)) }
    if (status) { sql += ` AND status = ?`; params.push(String(status)) }
    if (bookerId) { sql += ` AND booker_id = ?`; params.push(String(bookerId)) }
    if (meetingLevel) { sql += ` AND meeting_level = ?`; params.push(String(meetingLevel)) }

    sql += ` ORDER BY start_time`
    const bookings = queryAll(sql, params)

    for (const b of bookings) {
      b.has_visitors = Boolean(b.has_visitors)
      b.tea_break_needed = Boolean(b.tea_break_needed)
      b.is_recurring = Boolean(b.is_recurring)
      b.front_desk_confirmed = Boolean(b.front_desk_confirmed)
      b.security_approved = Boolean(b.security_approved)
      b.equipment_ids = queryAll(
        `SELECT equipment_id FROM booking_equipment WHERE booking_id = ?`, [b.id]
      ).map((r: any) => r.equipment_id)
      b.visitors = queryAll(`SELECT * FROM visitors WHERE booking_id = ?`, [b.id])
    }

    res.json({ success: true, data: bookings })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const booking = queryOne(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])
    if (!booking) { res.status(404).json({ success: false, error: '预订未找到' }); return }

    booking.has_visitors = Boolean(booking.has_visitors)
    booking.tea_break_needed = Boolean(booking.tea_break_needed)
    booking.is_recurring = Boolean(booking.is_recurring)
    booking.front_desk_confirmed = Boolean(booking.front_desk_confirmed)
    booking.security_approved = Boolean(booking.security_approved)
    booking.equipment_ids = queryAll(
      `SELECT equipment_id FROM booking_equipment WHERE booking_id = ?`, [booking.id]
    ).map((r: any) => r.equipment_id)
    booking.visitors = queryAll(`SELECT * FROM visitors WHERE booking_id = ?`, [booking.id])
    booking.logs = queryAll(`SELECT * FROM booking_logs WHERE booking_id = ? ORDER BY timestamp`, [booking.id])

    res.json({ success: true, data: booking })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      roomId, bookerId, title, startTime, endTime,
      attendeeCount, attendeeList, meetingLevel = 'normal',
      costCenterId, hasVisitors, teaBreakNeeded, teaBreakTime,
      isRecurring, recurringRule, equipmentIds
    } = req.body

    const room = queryOne(`SELECT * FROM rooms WHERE id = ?`, [roomId])
    if (!room) { res.status(400).json({ success: false, error: '会议室不存在' }); return }
    if (room.status !== 'available') { res.status(400).json({ success: false, error: '会议室当前不可用' }); return }

    if (attendeeCount > room.capacity) {
      res.status(400).json({ success: false, error: `参会人数(${attendeeCount})超过会议室容量(${room.capacity})` }); return
    }

    if (attendeeCount > 10 && (!attendeeList || !Array.isArray(attendeeList) || attendeeList.length === 0)) {
      res.status(400).json({ success: false, error: `参会人数(${attendeeCount})超过10人，必须提供参会人员名单` }); return
    }

    if (equipmentIds && Array.isArray(equipmentIds) && equipmentIds.length > 0) {
      const roomEqTypes = queryAll(
        `SELECT e.type FROM equipment e JOIN room_equipment re ON e.id = re.equipment_id WHERE re.room_id = ?`,
        [roomId]
      ).map((r: any) => r.type)
      const missing: string[] = []
      for (const eqId of equipmentIds) {
        const eq = queryOne(`SELECT * FROM equipment WHERE id = ?`, [eqId])
        if (eq && !roomEqTypes.includes(eq.type)) missing.push(eq.name)
      }
      if (missing.length > 0) {
        res.status(400).json({ success: false, error: `会议室缺少以下设备: ${missing.join(', ')}` }); return
      }
    }

    const bufferMinutes = room.setup_buffer_minutes || 0
    const setupStartTime = addMinutes(parseISO(startTime), -bufferMinutes).toISOString().replace('Z', '')
    const teardownEndTime = addMinutes(parseISO(endTime), bufferMinutes).toISOString().replace('Z', '')

    const conflicts = queryAll(
      `SELECT * FROM bookings WHERE room_id = ? AND status NOT IN ('cancelled', 'rejected') AND (
        (setup_start_time < ? AND teardown_end_time > ?) OR
        (setup_start_time < ? AND teardown_end_time > ?) OR
        (setup_start_time >= ? AND teardown_end_time <= ?)
      )`,
      [roomId, startTime, startTime, endTime, endTime, startTime, endTime]
    )
    if (conflicts.length > 0) {
      res.status(409).json({ success: false, error: '时间段冲突，会议室已被预订', data: conflicts }); return
    }

    if (costCenterId) {
      const costCenter = queryOne(`SELECT * FROM cost_centers WHERE id = ?`, [costCenterId])
      if (costCenter) {
        const durationHours = differenceInMinutes(parseISO(endTime), parseISO(startTime)) / 60
        const cost = durationHours * (room.cost_per_hour || 0)
        if (costCenter.used + cost > costCenter.budget) {
          res.status(400).json({ success: false, error: '成本中心预算不足' }); return
        }
      }
    }

    const hasVisitorFlag = hasVisitors ? 1 : 0
    const approvalRule = findApprovalRule(meetingLevel, hasVisitorFlag)
    let bookingStatus = 'pending'
    if (approvalRule) {
      if (!approvalRule.requires_approval && !approvalRule.requires_front_desk && !approvalRule.requires_security) {
        bookingStatus = 'confirmed'
      }
    } else {
      bookingStatus = 'confirmed'
    }

    const id = uuidv4()
    run(
      `INSERT INTO bookings (id, room_id, booker_id, title, start_time, end_time, setup_start_time, teardown_end_time, attendee_count, attendee_list, meeting_level, cost_center_id, has_visitors, tea_break_needed, tea_break_time, is_recurring, recurring_parent_id, status, front_desk_confirmed, security_approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, roomId, bookerId, title, startTime, endTime, setupStartTime, teardownEndTime,
        attendeeCount, attendeeList ? JSON.stringify(attendeeList) : null, meetingLevel, costCenterId,
        hasVisitorFlag, teaBreakNeeded ? 1 : 0, teaBreakTime || null,
        isRecurring ? 1 : 0, null, bookingStatus, 0, 0]
    )

    if (equipmentIds && Array.isArray(equipmentIds)) {
      for (const eqId of equipmentIds) {
        run(`INSERT INTO booking_equipment (booking_id, equipment_id) VALUES (?, ?)`, [id, eqId])
      }
    }

    if (costCenterId) {
      const durationHours = differenceInMinutes(parseISO(endTime), parseISO(startTime)) / 60
      const cost = durationHours * (room.cost_per_hour || 0)
      run(`UPDATE cost_centers SET used = used + ? WHERE id = ?`, [cost, costCenterId])
    }

    logBookingAction(id, 'created', bookerId, `创建预订: ${title}, 状态: ${bookingStatus}`)

    if (isRecurring && recurringRule) {
      const ruleId = uuidv4()
      run(
        `INSERT INTO recurring_rules (id, booking_id, frequency, day_of_week, day_of_month, end_date) VALUES (?, ?, ?, ?, ?, ?)`,
        [ruleId, id, recurringRule.frequency,
          recurringRule.dayOfWeek ? JSON.stringify(recurringRule.dayOfWeek) : null,
          recurringRule.dayOfMonth || null,
          recurringRule.endDate]
      )
      generateRecurringBookings(id, roomId, bookerId, title, startTime, endTime, attendeeCount, meetingLevel, costCenterId, hasVisitorFlag, teaBreakNeeded, recurringRule, bufferMinutes, equipmentIds)
    }

    const result = queryOne(`SELECT * FROM bookings WHERE id = ?`, [id])
    if (result) {
      result.has_visitors = Boolean(result.has_visitors)
      result.tea_break_needed = Boolean(result.tea_break_needed)
      result.is_recurring = Boolean(result.is_recurring)
      result.front_desk_confirmed = Boolean(result.front_desk_confirmed)
      result.security_approved = Boolean(result.security_approved)
    }
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = queryOne(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])
    if (!existing) { res.status(404).json({ success: false, error: '预订未找到' }); return }
    if (['cancelled', 'completed', 'no_show'].includes(existing.status)) {
      res.status(400).json({ success: false, error: `预订状态为${existing.status}，不可修改` }); return
    }

    const { title, startTime, endTime, attendeeCount, meetingLevel, costCenterId, hasVisitors, teaBreakNeeded, teaBreakTime, equipmentIds } = req.body

    if (startTime && endTime) {
      const room = queryOne(`SELECT * FROM rooms WHERE id = ?`, [existing.room_id])
      const bufferMinutes = room?.setup_buffer_minutes || 0
      const setupStartTime = addMinutes(parseISO(startTime), -bufferMinutes).toISOString().replace('Z', '')
      const teardownEndTime = addMinutes(parseISO(endTime), bufferMinutes).toISOString().replace('Z', '')

      const conflicts = queryAll(
        `SELECT * FROM bookings WHERE room_id = ? AND id != ? AND status NOT IN ('cancelled', 'rejected') AND (
          (setup_start_time < ? AND teardown_end_time > ?) OR
          (setup_start_time < ? AND teardown_end_time > ?) OR
          (setup_start_time >= ? AND teardown_end_time <= ?)
        )`,
        [existing.room_id, req.params.id, startTime, startTime, endTime, endTime, startTime, endTime]
      )
      if (conflicts.length > 0) {
        res.status(409).json({ success: false, error: '时间段冲突' }); return
      }

      run(`UPDATE bookings SET start_time=?, end_time=?, setup_start_time=?, teardown_end_time=?, updated_at=datetime('now') WHERE id=?`,
        [startTime, endTime, setupStartTime, teardownEndTime, req.params.id])
    }

    if (attendeeCount) {
      const room = queryOne(`SELECT * FROM rooms WHERE id = ?`, [existing.room_id])
      if (room && attendeeCount > room.capacity) {
        res.status(400).json({ success: false, error: `参会人数(${attendeeCount})超过会议室容量(${room.capacity})` }); return
      }
      if (attendeeCount > 10) {
        const currentList = existing.attendee_list ? JSON.parse(existing.attendee_list) : null
        const newAttendeeList = req.body.attendeeList !== undefined ? req.body.attendeeList : currentList
        if (!newAttendeeList || !Array.isArray(newAttendeeList) || newAttendeeList.length === 0) {
          res.status(400).json({ success: false, error: `参会人数(${attendeeCount})超过10人，必须提供参会人员名单` }); return
        }
        if (req.body.attendeeList !== undefined) {
          run(`UPDATE bookings SET attendee_list=?, updated_at=datetime('now') WHERE id=?`, [JSON.stringify(req.body.attendeeList), req.params.id])
        }
      }
      run(`UPDATE bookings SET attendee_count=?, updated_at=datetime('now') WHERE id=?`, [attendeeCount, req.params.id])
    }

    if (title) run(`UPDATE bookings SET title=?, updated_at=datetime('now') WHERE id=?`, [title, req.params.id])
    if (meetingLevel) run(`UPDATE bookings SET meeting_level=?, updated_at=datetime('now') WHERE id=?`, [meetingLevel, req.params.id])
    if (costCenterId) run(`UPDATE bookings SET cost_center_id=?, updated_at=datetime('now') WHERE id=?`, [costCenterId, req.params.id])
    if (hasVisitors !== undefined) run(`UPDATE bookings SET has_visitors=?, updated_at=datetime('now') WHERE id=?`, [hasVisitors ? 1 : 0, req.params.id])
    if (teaBreakNeeded !== undefined) run(`UPDATE bookings SET tea_break_needed=?, updated_at=datetime('now') WHERE id=?`, [teaBreakNeeded ? 1 : 0, req.params.id])
    if (teaBreakTime !== undefined) run(`UPDATE bookings SET tea_break_time=?, updated_at=datetime('now') WHERE id=?`, [teaBreakTime, req.params.id])

    if (equipmentIds && Array.isArray(equipmentIds)) {
      run(`DELETE FROM booking_equipment WHERE booking_id = ?`, [req.params.id])
      for (const eqId of equipmentIds) {
        run(`INSERT INTO booking_equipment (booking_id, equipment_id) VALUES (?, ?)`, [req.params.id, eqId])
      }
    }

    logBookingAction(req.params.id, 'updated', existing.booker_id, '更新预订信息')
    const result = queryOne(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const booking = queryOne(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])
    if (!booking) { res.status(404).json({ success: false, error: '预订未找到' }); return }

    run(`UPDATE bookings SET status='cancelled', updated_at=datetime('now') WHERE id=?`, [req.params.id])

    if (booking.cost_center_id && booking.start_time && booking.end_time) {
      const room = queryOne(`SELECT * FROM rooms WHERE id = ?`, [booking.room_id])
      if (room) {
        const durationHours = differenceInMinutes(parseISO(booking.end_time), parseISO(booking.start_time)) / 60
        const cost = durationHours * (room.cost_per_hour || 0)
        run(`UPDATE cost_centers SET used = MAX(0, used - ?) WHERE id = ?`, [cost, booking.cost_center_id])
      }
    }

    const recurringBookings = queryAll(`SELECT id FROM bookings WHERE recurring_parent_id = ? AND status NOT IN ('cancelled', 'rejected')`, [req.params.id])
    for (const rb of recurringBookings) {
      run(`UPDATE bookings SET status='cancelled', updated_at=datetime('now') WHERE id=?`, [rb.id])
    }

    logBookingAction(req.params.id, 'cancelled', booking.booker_id, '取消预订')
    res.json({ success: true, data: { id: req.params.id, status: 'cancelled' } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/:id/checkin', async (req: Request, res: Response): Promise<void> => {
  try {
    const booking = queryOne(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])
    if (!booking) { res.status(404).json({ success: false, error: '预订未找到' }); return }
    if (booking.status === 'cancelled') { res.status(400).json({ success: false, error: '预订已取消' }); return }

    const now = new Date().toISOString().replace('Z', '')
    run(`UPDATE bookings SET status='checking', check_in_time=?, updated_at=datetime('now') WHERE id=?`, [now, req.params.id])
    logBookingAction(req.params.id, 'checkin', booking.booker_id, '签到成功')
    res.json({ success: true, data: { id: req.params.id, checkInTime: now, status: 'checking' } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/:id/confirm', async (req: Request, res: Response): Promise<void> => {
  try {
    const { operatorId } = req.body
    const booking = queryOne(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])
    if (!booking) { res.status(404).json({ success: false, error: '预订未找到' }); return }

    run(`UPDATE bookings SET front_desk_confirmed=1, updated_at=datetime('now') WHERE id=?`, [req.params.id])

    const updated = queryOne(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])
    if (updated && updated.front_desk_confirmed && updated.security_approved && updated.status === 'pending') {
      run(`UPDATE bookings SET status='approved', updated_at=datetime('now') WHERE id=?`, [req.params.id])
    }

    logBookingAction(req.params.id, 'confirmed', operatorId, '前台确认')
    res.json({ success: true, data: { id: req.params.id, frontDeskConfirmed: true } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/:id/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const { operatorId, approved, reason } = req.body
    const booking = queryOne(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])
    if (!booking) { res.status(404).json({ success: false, error: '预订未找到' }); return }

    if (approved) {
      const approvalRule = findApprovalRule(booking.meeting_level, booking.has_visitors)
      if (approvalRule?.requires_front_desk && !booking.front_desk_confirmed) {
        res.status(400).json({ success: false, error: '需要前台先确认' }); return
      }
      if (approvalRule?.requires_security && !booking.security_approved) {
        res.status(400).json({ success: false, error: '需要安保先审批' }); return
      }
      run(`UPDATE bookings SET status='approved', updated_at=datetime('now') WHERE id=?`, [req.params.id])
      logBookingAction(req.params.id, 'approved', operatorId, '审批通过')
    } else {
      run(`UPDATE bookings SET status='rejected', updated_at=datetime('now') WHERE id=?`, [req.params.id])
      logBookingAction(req.params.id, 'rejected', operatorId, `审批拒绝: ${reason || '无理由'}`)
    }

    res.json({ success: true, data: { id: req.params.id, status: approved ? 'approved' : 'rejected' } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/:id/release-noshow', async (req: Request, res: Response): Promise<void> => {
  try {
    const { timeoutMinutes = 15 } = req.body
    const booking = queryOne(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])
    if (!booking) { res.status(404).json({ success: false, error: '预订未找到' }); return }

    if (booking.status !== 'confirmed' && booking.status !== 'approved') {
      res.status(400).json({ success: false, error: '当前状态不可释放' }); return
    }

    const now = new Date()
    const start = parseISO(booking.start_time)
    const elapsed = differenceInMinutes(now, start)
    if (elapsed < timeoutMinutes) {
      res.status(400).json({ success: false, error: `未超时(${elapsed}/${timeoutMinutes}分钟)` }); return
    }

    const releasedAt = now.toISOString().replace('Z', '')
    run(`UPDATE bookings SET status='no_show', released_at=?, updated_at=datetime('now') WHERE id=?`, [releasedAt, req.params.id])

    if (booking.booker_id) {
      run(`UPDATE users SET no_show_count = no_show_count + 1 WHERE id = ?`, [booking.booker_id])
    }

    logBookingAction(req.params.id, 'released', 'system', `超时未签到自动释放(${timeoutMinutes}分钟)`)
    res.json({ success: true, data: { id: req.params.id, status: 'no_show', releasedAt } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/:id/vip-preempt', async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookerId, title, meetingLevel = 'vip' } = req.body
    const booking = queryOne(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])
    if (!booking) { res.status(404).json({ success: false, error: '预订未找到' }); return }

    if (booking.meeting_level === 'vip') {
      res.status(400).json({ success: false, error: '无法抢占VIP会议' }); return
    }

    const currentRoom = queryOne(`SELECT * FROM rooms WHERE id = ?`, [booking.room_id])
    if (!currentRoom) { res.status(400).json({ success: false, error: '会议室不存在' }); return }

    const suggestedRoom = findAvailableRoom(
      currentRoom.capacity,
      booking.start_time,
      booking.end_time,
      currentRoom.id
    )

    const swapId = uuidv4()
    if (suggestedRoom) {
      run(`INSERT INTO swap_history (id, booking_id, from_room_id, to_room_id, reason, operator_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [swapId, booking.id, booking.room_id, suggestedRoom.id, 'VIP优先抢占', bookerId])
      run(`UPDATE bookings SET room_id=?, updated_at=datetime('now') WHERE id=?`, [suggestedRoom.id, booking.id])
      logBookingAction(booking.id, 'swapped', bookerId, `VIP抢占，原会议换至${suggestedRoom.name}`)
    } else {
      run(`UPDATE bookings SET status='cancelled', updated_at=datetime('now') WHERE id=?`, [booking.id])
      logBookingAction(booking.id, 'cancelled', bookerId, 'VIP抢占，无可用会议室，原预订取消')
    }

    const newBookingId = uuidv4()
    const room = queryOne(`SELECT * FROM rooms WHERE id = ?`, [booking.room_id])
    const bufferMinutes = room?.setup_buffer_minutes || 0
    const setupStartTime = addMinutes(parseISO(booking.start_time), -bufferMinutes).toISOString().replace('Z', '')
    const teardownEndTime = addMinutes(parseISO(booking.end_time), bufferMinutes).toISOString().replace('Z', '')

    run(
      `INSERT INTO bookings (id, room_id, booker_id, title, start_time, end_time, setup_start_time, teardown_end_time, attendee_count, meeting_level, cost_center_id, has_visitors, status, front_desk_confirmed, security_approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newBookingId, booking.room_id, bookerId, title, booking.start_time, booking.end_time,
        setupStartTime, teardownEndTime, 1, meetingLevel, null, 0, 'confirmed', 0, 0]
    )
    logBookingAction(newBookingId, 'created', bookerId, 'VIP抢占创建新预订')

    res.json({ success: true, data: { newBookingId, displacedBookingId: booking.id, swappedToRoom: suggestedRoom?.name || null } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/swap-room', async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId, targetRoomId, operatorId, reason } = req.body
    const booking = queryOne(`SELECT * FROM bookings WHERE id = ?`, [bookingId])
    if (!booking) { res.status(404).json({ success: false, error: '预订未找到' }); return }

    const targetRoom = queryOne(`SELECT * FROM rooms WHERE id = ?`, [targetRoomId])
    if (!targetRoom) { res.status(404).json({ success: false, error: '目标会议室不存在' }); return }
    if (targetRoom.status !== 'available') { res.status(400).json({ success: false, error: '目标会议室不可用' }); return }
    if (booking.attendee_count > targetRoom.capacity) {
      res.status(400).json({ success: false, error: `目标会议室容量不足(${targetRoom.capacity})` }); return
    }

    const conflicts = queryAll(
      `SELECT * FROM bookings WHERE room_id = ? AND id != ? AND status NOT IN ('cancelled', 'rejected') AND (
        (setup_start_time < ? AND teardown_end_time > ?) OR
        (setup_start_time < ? AND teardown_end_time > ?)
      )`,
      [targetRoomId, bookingId, booking.end_time, booking.start_time, booking.end_time, booking.start_time]
    )
    if (conflicts.length > 0) {
      res.status(409).json({ success: false, error: '目标会议室该时段已被占用', data: conflicts }); return
    }

    const fromRoomId = booking.room_id
    const bufferMinutes = targetRoom.setup_buffer_minutes || 0
    const setupStartTime = addMinutes(parseISO(booking.start_time), -bufferMinutes).toISOString().replace('Z', '')
    const teardownEndTime = addMinutes(parseISO(booking.end_time), bufferMinutes).toISOString().replace('Z', '')

    run(`UPDATE bookings SET room_id=?, setup_start_time=?, teardown_end_time=?, updated_at=datetime('now') WHERE id=?`,
      [targetRoomId, setupStartTime, teardownEndTime, bookingId])

    const swapId = uuidv4()
    run(`INSERT INTO swap_history (id, booking_id, from_room_id, to_room_id, reason, operator_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [swapId, bookingId, fromRoomId, targetRoomId, reason || '手动换房', operatorId])

    logBookingAction(bookingId, 'swapped', operatorId, `换房: 从会议室换至${targetRoom.name}`)
    res.json({ success: true, data: { bookingId, fromRoomId, toRoomId: targetRoomId, swapId } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/suggest-swap', async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId, minCapacity } = req.body
    const booking = queryOne(`SELECT * FROM bookings WHERE id = ?`, [bookingId])
    if (!booking) { res.status(404).json({ success: false, error: '预订未找到' }); return }

    const cap = minCapacity || booking.attendee_count
    const suggestions = findAvailableRooms(cap, booking.start_time, booking.end_time, booking.room_id)

    res.json({ success: true, data: suggestions })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

function findApprovalRule(meetingLevel: string, hasVisitors: number): any {
  const specific = queryOne(
    `SELECT * FROM approval_rules WHERE meeting_level = ? AND has_visitor = ?`,
    [meetingLevel, hasVisitors]
  )
  if (specific) return specific

  const levelOnly = queryOne(
    `SELECT * FROM approval_rules WHERE meeting_level = ? AND has_visitor IS NULL`,
    [meetingLevel]
  )
  if (levelOnly) return levelOnly

  const visitorOnly = queryOne(
    `SELECT * FROM approval_rules WHERE meeting_level IS NULL AND has_visitor = ?`,
    [hasVisitors]
  )
  return visitorOnly
}

function findAvailableRoom(minCapacity: number, startTime: string, endTime: string, excludeRoomId?: string): any {
  const rooms = queryAll(
    `SELECT * FROM rooms WHERE capacity >= ? AND status = 'available' AND id != ? ORDER BY capacity ASC`,
    [minCapacity, excludeRoomId || '']
  )
  for (const room of rooms) {
    const conflicts = queryAll(
      `SELECT id FROM bookings WHERE room_id = ? AND status NOT IN ('cancelled', 'rejected') AND (
        (setup_start_time < ? AND teardown_end_time > ?) OR
        (setup_start_time < ? AND teardown_end_time > ?)
      ) LIMIT 1`,
      [room.id, endTime, startTime, endTime, startTime]
    )
    if (conflicts.length === 0) return room
  }
  return null
}

function findAvailableRooms(minCapacity: number, startTime: string, endTime: string, excludeRoomId?: string): any[] {
  const rooms = queryAll(
    `SELECT * FROM rooms WHERE capacity >= ? AND status = 'available' AND id != ? ORDER BY capacity ASC`,
    [minCapacity, excludeRoomId || '']
  )
  return rooms.filter(room => {
    const conflicts = queryAll(
      `SELECT id FROM bookings WHERE room_id = ? AND status NOT IN ('cancelled', 'rejected') AND (
        (setup_start_time < ? AND teardown_end_time > ?) OR
        (setup_start_time < ? AND teardown_end_time > ?)
      ) LIMIT 1`,
      [room.id, endTime, startTime, endTime, startTime]
    )
    return conflicts.length === 0
  })
}

function generateRecurringBookings(
  parentId: string, roomId: string, bookerId: string, title: string,
  startTime: string, endTime: string, attendeeCount: number, meetingLevel: string,
  costCenterId: string, hasVisitors: number, teaBreakNeeded: number,
  rule: { frequency: string; dayOfWeek?: number[]; dayOfMonth?: number; endDate: string },
  bufferMinutes: number, equipmentIds?: string[]
): void {
  const start = parseISO(startTime)
  const end = parseISO(endTime)
  const durationMinutes = differenceInMinutes(end, start)
  const endDate = parseISO(rule.endDate)

  let current = addMinutes(start, getFrequencyMinutes(rule.frequency))
  let count = 0
  const maxOccurrences = 52

  while (current <= endDate && count < maxOccurrences) {
    if (rule.frequency === 'weekly' && rule.dayOfWeek?.length) {
      while (current <= endDate && !rule.dayOfWeek.includes(current.getDay())) {
        current = addMinutes(current, 24 * 60)
      }
      if (current > endDate) break
    }

    if (rule.frequency === 'monthly' && rule.dayOfMonth) {
      current = new Date(current.getFullYear(), current.getMonth(), rule.dayOfMonth, start.getHours(), start.getMinutes())
    }

    const newStart = current.toISOString().replace('Z', '')
    const newEnd = addMinutes(current, durationMinutes).toISOString().replace('Z', '')
    const setupStart = addMinutes(current, -bufferMinutes).toISOString().replace('Z', '')
    const teardownEnd = addMinutes(current, durationMinutes + bufferMinutes).toISOString().replace('Z', '')

    const conflicts = queryAll(
      `SELECT id FROM bookings WHERE room_id = ? AND status NOT IN ('cancelled', 'rejected') AND (
        (setup_start_time < ? AND teardown_end_time > ?) OR
        (setup_start_time < ? AND teardown_end_time > ?)
      ) LIMIT 1`,
      [roomId, newEnd, newStart, newEnd, newStart]
    )

    if (conflicts.length === 0) {
      const id = uuidv4()
      run(
        `INSERT INTO bookings (id, room_id, booker_id, title, start_time, end_time, setup_start_time, teardown_end_time, attendee_count, meeting_level, cost_center_id, has_visitors, tea_break_needed, is_recurring, recurring_parent_id, status, front_desk_confirmed, security_approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, roomId, bookerId, title, newStart, newEnd, setupStart, teardownEnd,
          attendeeCount, meetingLevel, costCenterId, hasVisitors, teaBreakNeeded, 1, parentId, 'confirmed', 0, 0]
      )

      if (equipmentIds && Array.isArray(equipmentIds)) {
        for (const eqId of equipmentIds) {
          run(`INSERT INTO booking_equipment (booking_id, equipment_id) VALUES (?, ?)`, [id, eqId])
        }
      }
    }

    current = addMinutes(current, getFrequencyMinutes(rule.frequency))
    count++
  }
}

function getFrequencyMinutes(frequency: string): number {
  switch (frequency) {
    case 'weekly': return 7 * 24 * 60
    case 'biweekly': return 14 * 24 * 60
    case 'monthly': return 30 * 24 * 60
    default: return 7 * 24 * 60
  }
}

function logBookingAction(bookingId: string, action: string, operatorId: string, detail: string): void {
  const id = uuidv4()
  run(
    `INSERT INTO booking_logs (id, booking_id, action, operator_id, detail) VALUES (?, ?, ?, ?, ?)`,
    [id, bookingId, action, operatorId, detail]
  )
}

export default router

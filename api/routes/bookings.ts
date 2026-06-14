import { Router, type Request, type Response } from 'express'
import { queryAll, queryOne, run, beginTransaction, commitTransaction, rollbackTransaction, runInTransaction } from '../database.js'
import { v4 as uuidv4 } from 'uuid'
import { differenceInMinutes, addMinutes, parseISO, format, isBefore, isAfter } from 'date-fns'

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

    const conflicts = detectAllConflicts({
      roomId, startTime, endTime, attendeeCount,
      meetingLevel, costCenterId, hasVisitors,
      equipmentIds, teaBreakNeeded, teaBreakTime,
      isRecurring, recurringRule
    })

    const blockingConflicts = conflicts.filter(c => c.severity === 'error')
    if (blockingConflicts.length > 0) {
      res.status(409).json({
        success: false,
        error: `存在${blockingConflicts.length}个阻断性冲突`,
        data: { conflicts, blockingCount: blockingConflicts.length }
      }); return
    }

    const room = queryOne(`SELECT * FROM rooms WHERE id = ?`, [roomId])
    if (!room) { res.status(400).json({ success: false, error: '会议室不存在' }); return }

    if (attendeeCount > 10 && (!attendeeList || !Array.isArray(attendeeList) || attendeeList.length === 0)) {
      res.status(400).json({ success: false, error: `参会人数(${attendeeCount})超过10人，必须提供参会人员名单` }); return
    }

    const bufferMinutes = room.setup_buffer_minutes || 0
    const setupStartTime = addMinutes(parseISO(startTime), -bufferMinutes).toISOString().replace('Z', '')
    const teardownEndTime = addMinutes(parseISO(endTime), bufferMinutes).toISOString().replace('Z', '')

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
      generateRecurringBookings(id, roomId, bookerId, title, startTime, endTime, attendeeCount, meetingLevel, costCenterId, hasVisitorFlag, teaBreakNeeded ? 1 : 0, recurringRule, bufferMinutes, equipmentIds)
    }

    const result = queryOne(`SELECT * FROM bookings WHERE id = ?`, [id])
    if (result) {
      result.has_visitors = Boolean(result.has_visitors)
      result.tea_break_needed = Boolean(result.tea_break_needed)
      result.is_recurring = Boolean(result.is_recurring)
      result.front_desk_confirmed = Boolean(result.front_desk_confirmed)
      result.security_approved = Boolean(result.security_approved)
    }
    res.json({ success: true, data: result, warnings: conflicts.filter(c => c.severity === 'warning') })
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

router.post('/:id/validate-effective', async (req: Request, res: Response): Promise<void> => {
  try {
    const booking = queryOne(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])
    if (!booking) { res.status(404).json({ success: false, error: '预订未找到' }); return }

    const equipmentIds = queryAll(
      `SELECT equipment_id FROM booking_equipment WHERE booking_id = ?`,
      [req.params.id]
    ).map((r: any) => r.equipment_id)

    const conflicts = detectAllConflicts({
      roomId: booking.room_id,
      startTime: booking.start_time,
      endTime: booking.end_time,
      attendeeCount: booking.attendee_count,
      meetingLevel: booking.meeting_level,
      costCenterId: booking.cost_center_id,
      hasVisitors: Boolean(booking.has_visitors),
      equipmentIds,
      bookingId: req.params.id
    })

    const blockingConflicts = conflicts.filter(c => c.severity === 'error')
    const canBeEffective = blockingConflicts.length === 0 &&
      (booking.status === 'approved' || booking.status === 'confirmed')

    res.json({
      success: true,
      data: {
        canBeEffective,
        blockingCount: blockingConflicts.length,
        warningCount: conflicts.filter(c => c.severity === 'warning').length,
        conflicts,
        blockers: {
          visitorNotConfirmed: blockingConflicts.some(c => c.type === 'visitor'),
          budgetInsufficient: blockingConflicts.some(c => c.type === 'budget'),
          setupBufferInsufficient: blockingConflicts.some(c => c.type === 'setup_buffer'),
          equipmentBorrowed: blockingConflicts.some(c => c.type === 'equipment' && c.title.includes('借出')),
          roomConflict: blockingConflicts.some(c => c.type === 'time'),
          securityNotApproved: blockingConflicts.some(c => c.type === 'security')
        }
      }
    })
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

      const equipmentIds = queryAll(
        `SELECT equipment_id FROM booking_equipment WHERE booking_id = ?`,
        [req.params.id]
      ).map((r: any) => r.equipment_id)

      const conflicts = detectAllConflicts({
        roomId: booking.room_id,
        startTime: booking.start_time,
        endTime: booking.end_time,
        attendeeCount: booking.attendee_count,
        meetingLevel: booking.meeting_level,
        costCenterId: booking.cost_center_id,
        hasVisitors: Boolean(booking.has_visitors),
        equipmentIds,
        bookingId: req.params.id
      })

      const blockingConflicts = conflicts.filter(c => c.severity === 'error')
      if (blockingConflicts.length > 0) {
        res.status(409).json({
          success: false,
          error: `存在${blockingConflicts.length}个阻断性问题，无法审批通过`,
          data: { conflicts: blockingConflicts }
        }); return
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

    const validBookerId = bookerId || booking.booker_id
    if (!validBookerId) {
      res.status(400).json({ success: false, error: '操作人不能为空，请先登录' }); return
    }

    const currentRoom = queryOne(`SELECT * FROM rooms WHERE id = ?`, [booking.room_id])
    if (!currentRoom) { res.status(400).json({ success: false, error: '会议室不存在' }); return }

    const suggestedRoom = findAvailableRoom(
      currentRoom.capacity,
      booking.start_time,
      booking.end_time,
      currentRoom.id
    )

    const result = runInTransaction(() => {
      let swappedToRoomName: string | null = null

      const swapId = uuidv4()
      if (suggestedRoom) {
        run(`INSERT INTO swap_history (id, booking_id, from_room_id, to_room_id, reason, operator_id, trigger_type) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [swapId, booking.id, booking.room_id, suggestedRoom.id, 'VIP优先抢占', validBookerId, 'vip_preempt'])
        run(`UPDATE bookings SET room_id=?, updated_at=datetime('now') WHERE id=?`, [suggestedRoom.id, booking.id])
        logBookingAction(booking.id, 'swapped', validBookerId, `VIP抢占，原会议换至${suggestedRoom.name}`)
        swappedToRoomName = suggestedRoom.name
      } else {
        run(`UPDATE bookings SET status='cancelled', updated_at=datetime('now') WHERE id=?`, [booking.id])
        logBookingAction(booking.id, 'cancelled', validBookerId, 'VIP抢占，无可用会议室，原预订取消')
      }

      const newBookingId = uuidv4()
      const room = queryOne(`SELECT * FROM rooms WHERE id = ?`, [booking.room_id])
      const bufferMinutes = room?.setup_buffer_minutes || 0
      const setupStartTime = addMinutes(parseISO(booking.start_time), -bufferMinutes).toISOString().replace('Z', '')
      const teardownEndTime = addMinutes(parseISO(booking.end_time), bufferMinutes).toISOString().replace('Z', '')

      run(
        `INSERT INTO bookings (id, room_id, booker_id, title, start_time, end_time, setup_start_time, teardown_end_time, attendee_count, meeting_level, cost_center_id, has_visitors, status, front_desk_confirmed, security_approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newBookingId, booking.room_id, validBookerId, title, booking.start_time, booking.end_time,
          setupStartTime, teardownEndTime, 1, meetingLevel, null, 0, 'confirmed', 0, 0]
      )
      logBookingAction(newBookingId, 'created', validBookerId, 'VIP抢占创建新预订')

      return { newBookingId, displacedBookingId: booking.id, swappedToRoomName }
    })

    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/swap-room', async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId, targetRoomId, operatorId, reason, triggerType = 'manual' } = req.body
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

    const validOperatorId = operatorId || booking.booker_id
    if (!validOperatorId) {
      res.status(400).json({ success: false, error: '操作人不能为空，请先登录' }); return
    }

    const fromRoomId = booking.room_id
    const fromRoom = queryOne(`SELECT * FROM rooms WHERE id = ?`, [fromRoomId])
    const bufferMinutes = targetRoom.setup_buffer_minutes || 0
    const setupStartTime = addMinutes(parseISO(booking.start_time), -bufferMinutes).toISOString().replace('Z', '')
    const teardownEndTime = addMinutes(parseISO(booking.end_time), bufferMinutes).toISOString().replace('Z', '')

    const result = runInTransaction(() => {
      const fromSnapshotId = createResourceSnapshot(bookingId, fromRoom, booking, 'before_swap')
      const toSnapshotId = createResourceSnapshot(bookingId, targetRoom, booking, 'after_swap')

      const resourceDiff = calculateResourceDiff(fromRoom, targetRoom, booking, booking)

      run(`UPDATE bookings SET room_id=?, setup_start_time=?, teardown_end_time=?, updated_at=datetime('now') WHERE id=?`,
        [targetRoomId, setupStartTime, teardownEndTime, bookingId])

      const swapId = uuidv4()
      run(
        `INSERT INTO swap_history (id, booking_id, from_room_id, to_room_id, reason, operator_id, trigger_type, resource_diff, from_snapshot_id, to_snapshot_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [swapId, bookingId, fromRoomId, targetRoomId, reason || '手动换房', validOperatorId, triggerType, JSON.stringify(resourceDiff), fromSnapshotId, toSnapshotId]
      )

      if (booking.cost_center_id && fromRoom && targetRoom) {
        const durationHours = differenceInMinutes(parseISO(booking.end_time), parseISO(booking.start_time)) / 60
        const oldCost = durationHours * (fromRoom.cost_per_hour || 0)
        const newCost = durationHours * (targetRoom.cost_per_hour || 0)
        const costDiff = newCost - oldCost
        if (costDiff !== 0) {
          run(`UPDATE cost_centers SET used = used + ? WHERE id = ?`, [costDiff, booking.cost_center_id])
        }
      }

      logBookingAction(bookingId, 'swapped', validOperatorId, `换房: 从${fromRoom?.name || fromRoomId}换至${targetRoom.name}`)

      const updatedBooking = queryOne(`SELECT * FROM bookings WHERE id = ?`, [bookingId])
      return { booking: updatedBooking, swapId, resourceDiff, fromSnapshotId, toSnapshotId }
    })

    const swapHistory = queryAll(
      `SELECT sh.*, r1.name as from_room_name, r2.name as to_room_name
       FROM swap_history sh
       LEFT JOIN rooms r1 ON sh.from_room_id = r1.id
       LEFT JOIN rooms r2 ON sh.to_room_id = r2.id
       WHERE sh.booking_id = ? ORDER BY sh.timestamp DESC`,
      [bookingId]
    )
    for (const h of swapHistory) {
      if (h.resource_diff) {
        try { h.resource_diff = JSON.parse(h.resource_diff) } catch (e) {}
      }
    }

    const snapshots = queryAll(
      `SELECT * FROM resource_snapshots WHERE booking_id = ? ORDER BY created_at DESC`,
      [bookingId]
    )

    res.json({ success: true, data: { ...result, swapHistory, snapshots } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/suggest-swap', async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId, minCapacity, equipmentIds = [], preferredFloor, maxCostPerHour } = req.body
    const booking = queryOne(`SELECT * FROM bookings WHERE id = ?`, [bookingId])
    if (!booking) { res.status(404).json({ success: false, error: '预订未找到' }); return }

    const cap = minCapacity || booking.attendee_count
    const suggestions = findAvailableRoomsSmart(
      cap,
      booking.start_time,
      booking.end_time,
      booking.room_id,
      { equipmentIds, preferredFloor, maxCostPerHour, booking }
    )

    res.json({ success: true, data: suggestions })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/:id/swap-history', async (req: Request, res: Response): Promise<void> => {
  try {
    const history = queryAll(
      `SELECT sh.*, r1.name as from_room_name, r2.name as to_room_name
       FROM swap_history sh
       LEFT JOIN rooms r1 ON sh.from_room_id = r1.id
       LEFT JOIN rooms r2 ON sh.to_room_id = r2.id
       WHERE sh.booking_id = ? ORDER BY sh.timestamp DESC`,
      [req.params.id]
    )

    for (const h of history) {
      if (h.resource_diff) {
        try { h.resource_diff = JSON.parse(h.resource_diff) } catch (e) {}
      }
    }

    res.json({ success: true, data: history })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/:id/resource-snapshots', async (req: Request, res: Response): Promise<void> => {
  try {
    const snapshots = queryAll(
      `SELECT * FROM resource_snapshots WHERE booking_id = ? ORDER BY created_at DESC`,
      [req.params.id]
    )

    for (const s of snapshots) {
      if (s.equipment_ids) {
        try { s.equipment_ids = JSON.parse(s.equipment_ids) } catch (e) {}
      }
      if (s.equipment_names) {
        try { s.equipment_names = JSON.parse(s.equipment_names) } catch (e) {}
      }
      s.has_visitors = Boolean(s.has_visitors)
      s.tea_break_needed = Boolean(s.tea_break_needed)
    }

    res.json({ success: true, data: snapshots })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/check-conflicts', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      roomId, startTime, endTime, attendeeCount = 1,
      meetingLevel = 'normal', costCenterId, hasVisitors = false,
      equipmentIds = [], teaBreakNeeded = false, teaBreakTime,
      isRecurring = false, recurringRule, bookingId
    } = req.body

    if (!roomId || !startTime || !endTime) {
      res.status(400).json({ success: false, error: '缺少必要参数' }); return
    }

    const conflicts = detectAllConflicts({
      roomId, startTime, endTime, attendeeCount,
      meetingLevel, costCenterId, hasVisitors,
      equipmentIds, teaBreakNeeded, teaBreakTime,
      isRecurring, recurringRule, excludeBookingId: bookingId
    })

    res.json({ success: true, data: conflicts })
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

interface ConflictCheckParams {
  roomId: string
  startTime: string
  endTime: string
  attendeeCount?: number
  meetingLevel?: string
  costCenterId?: string
  hasVisitors?: boolean
  equipmentIds?: string[]
  teaBreakNeeded?: boolean
  teaBreakTime?: string
  isRecurring?: boolean
  recurringRule?: any
  excludeBookingId?: string
  bookingId?: string
}

interface ConflictDetail {
  id: string
  type: 'time' | 'capacity' | 'equipment' | 'budget' | 'visitor' | 'security' | 'setup_buffer' | 'room_status' | 'approval'
  severity: 'error' | 'warning' | 'info'
  title: string
  description: string
  relatedBookingId?: string
  relatedResourceId?: string
  relatedResourceType?: string
  overlapStart?: string
  overlapEnd?: string
  resolutionSuggestion?: string
}

function detectAllConflicts(params: ConflictCheckParams): ConflictDetail[] {
  const conflicts: ConflictDetail[] = []

  const roomConflicts = checkRoomAvailability(params)
  conflicts.push(...roomConflicts)

  const capacityConflicts = checkCapacity(params)
  conflicts.push(...capacityConflicts)

  const equipmentConflicts = checkEquipmentAvailability(params)
  conflicts.push(...equipmentConflicts)

  const budgetConflicts = checkBudget(params)
  conflicts.push(...budgetConflicts)

  const bufferConflicts = checkSetupBuffer(params)
  conflicts.push(...bufferConflicts)

  const visitorConflicts = checkVisitorFrontDesk(params)
  conflicts.push(...visitorConflicts)

  const approvalConflicts = checkApprovalRequirements(params)
  conflicts.push(...approvalConflicts)

  return conflicts
}

function checkRoomAvailability(params: ConflictCheckParams): ConflictDetail[] {
  const conflicts: ConflictDetail[] = []
  const { roomId, startTime, endTime, excludeBookingId } = params

  const room = queryOne(`SELECT * FROM rooms WHERE id = ?`, [roomId])
  if (!room) {
    conflicts.push({
      id: uuidv4(),
      type: 'room_status',
      severity: 'error',
      title: '会议室不存在',
      description: '选择的会议室不存在',
      relatedResourceId: roomId,
      relatedResourceType: 'room',
      resolutionSuggestion: '请重新选择会议室'
    })
    return conflicts
  }

  if (room.status !== 'available') {
    conflicts.push({
      id: uuidv4(),
      type: 'room_status',
      severity: 'error',
      title: '会议室不可用',
      description: `会议室当前状态为${room.status}，无法预订`,
      relatedResourceId: roomId,
      relatedResourceType: 'room',
      resolutionSuggestion: '请选择其他会议室或等待会议室恢复可用'
    })
  }

  const bufferMinutes = room.setup_buffer_minutes || 0
  const setupStartTime = addMinutes(parseISO(startTime), -bufferMinutes).toISOString().replace('Z', '')
  const teardownEndTime = addMinutes(parseISO(endTime), bufferMinutes).toISOString().replace('Z', '')

  let sql = `SELECT * FROM bookings WHERE room_id = ? AND status NOT IN ('cancelled', 'rejected') AND (
    (setup_start_time < ? AND teardown_end_time > ?) OR
    (setup_start_time < ? AND teardown_end_time > ?) OR
    (setup_start_time >= ? AND teardown_end_time <= ?)
  )`
  const sqlParams: any[] = [roomId, endTime, startTime, endTime, startTime, setupStartTime, teardownEndTime]

  if (excludeBookingId) {
    sql += ` AND id != ?`
    sqlParams.push(excludeBookingId)
  }

  const overlappingBookings = queryAll(sql, sqlParams)

  for (const booking of overlappingBookings) {
    const overlapStart = isAfter(parseISO(booking.setup_start_time), parseISO(setupStartTime))
      ? booking.setup_start_time
      : setupStartTime
    const overlapEnd = isBefore(parseISO(booking.teardown_end_time), parseISO(teardownEndTime))
      ? booking.teardown_end_time
      : teardownEndTime

    conflicts.push({
      id: uuidv4(),
      type: 'time',
      severity: 'error',
      title: '时间冲突',
      description: `与「${booking.title}」的时间重叠（含布场/撤场时间）`,
      relatedBookingId: booking.id,
      relatedResourceId: roomId,
      relatedResourceType: 'room',
      overlapStart,
      overlapEnd,
      resolutionSuggestion: `建议换时段或换会议室。冲突会议：${booking.title}（${format(parseISO(booking.start_time), 'HH:mm')}-${format(parseISO(booking.end_time), 'HH:mm')}）`
    })
  }

  return conflicts
}

function checkCapacity(params: ConflictCheckParams): ConflictDetail[] {
  const conflicts: ConflictDetail[] = []
  const { roomId, attendeeCount = 1 } = params

  const room = queryOne(`SELECT * FROM rooms WHERE id = ?`, [roomId])
  if (!room) return conflicts

  if (attendeeCount > room.capacity) {
    conflicts.push({
      id: uuidv4(),
      type: 'capacity',
      severity: 'error',
      title: '容量不足',
      description: `参会人数(${attendeeCount}人)超过会议室容量(${room.capacity}人)`,
      relatedResourceId: roomId,
      relatedResourceType: 'room',
      resolutionSuggestion: '建议选择更大的会议室或减少参会人数'
    })
  }

  return conflicts
}

function checkEquipmentAvailability(params: ConflictCheckParams): ConflictDetail[] {
  const conflicts: ConflictDetail[] = []
  const { roomId, equipmentIds = [], startTime, endTime } = params

  if (equipmentIds.length === 0) return conflicts

  const roomEquipment = queryAll(
    `SELECT e.* FROM equipment e JOIN room_equipment re ON e.id = re.equipment_id WHERE re.room_id = ?`,
    [roomId]
  )
  const roomEqTypes = new Set(roomEquipment.map((e: any) => e.type))

  for (const eqId of equipmentIds) {
    const eq = queryOne(`SELECT * FROM equipment WHERE id = ?`, [eqId])
    if (!eq) continue

    if (eq.status === 'maintenance') {
      conflicts.push({
        id: uuidv4(),
        type: 'equipment',
        severity: 'error',
        title: '设备维修中',
        description: `设备「${eq.name}」正在维修，无法使用`,
        relatedResourceId: eqId,
        relatedResourceType: 'equipment',
        resolutionSuggestion: '请选择其他可用设备或更换会议室'
      })
    } else if (eq.status === 'faulty') {
      conflicts.push({
        id: uuidv4(),
        type: 'equipment',
        severity: 'error',
        title: '设备故障',
        description: `设备「${eq.name}」出现故障，无法使用`,
        relatedResourceId: eqId,
        relatedResourceType: 'equipment',
        resolutionSuggestion: '请选择其他设备或更换会议室'
      })
    } else if (eq.status === 'borrowed') {
      conflicts.push({
        id: uuidv4(),
        type: 'equipment',
        severity: 'error',
        title: '设备已借出',
        description: `设备「${eq.name}」已被借出，未归还`,
        relatedResourceId: eqId,
        relatedResourceType: 'equipment',
        resolutionSuggestion: '请等待设备归还后再预订，或选择其他设备'
      })
    }

    if (!roomEqTypes.has(eq.type)) {
      conflicts.push({
        id: uuidv4(),
          type: 'equipment',
          severity: 'warning',
          title: '会议室缺设备',
          description: `该会议室没有「${eq.name}」类型的设备，需要额外申请`,
          relatedResourceId: eqId,
          relatedResourceType: 'equipment',
          resolutionSuggestion: '可从设备库申请调配，或更换有此设备的会议室'
      })
    }
  }

  return conflicts
}

function checkBudget(params: ConflictCheckParams): ConflictDetail[] {
  const conflicts: ConflictDetail[] = []
  const { roomId, startTime, endTime, costCenterId } = params

  if (!costCenterId) return conflicts

  const room = queryOne(`SELECT * FROM rooms WHERE id = ?`, [roomId])
  const costCenter = queryOne(`SELECT * FROM cost_centers WHERE id = ?`, [costCenterId])

  if (!room || !costCenter) return conflicts

  const durationHours = differenceInMinutes(parseISO(endTime), parseISO(startTime)) / 60
  const cost = durationHours * (room.cost_per_hour || 0)

  if (costCenter.used + cost > costCenter.budget) {
    const shortfall = (costCenter.used + cost - costCenter.budget).toFixed(2)
    conflicts.push({
      id: uuidv4(),
      type: 'budget',
      severity: 'error',
      title: '预算不足',
      description: `本次会议费用¥${cost.toFixed(2)}，超出预算¥${shortfall}。当前已用¥${costCenter.used.toFixed(2)}/¥${costCenter.budget.toFixed(2)}`,
      relatedResourceId: costCenterId,
      relatedResourceType: 'cost_center',
      resolutionSuggestion: '建议选择更便宜的会议室、缩短会议时长，或申请增加预算'
    })
  } else if (costCenter.used + cost > costCenter.budget * 0.9) {
    conflicts.push({
      id: uuidv4(),
      type: 'budget',
      severity: 'warning',
      title: '预算预警',
      description: `本次会议后预算使用率将达${((costCenter.used + cost) / costCenter.budget * 100).toFixed(1)}%`,
      relatedResourceId: costCenterId,
      relatedResourceType: 'cost_center',
      resolutionSuggestion: '请注意控制成本，接近预算上限'
    })
  }

  return conflicts
}

function checkSetupBuffer(params: ConflictCheckParams): ConflictDetail[] {
  const conflicts: ConflictDetail[] = []
  const { roomId, startTime, endTime } = params

  const room = queryOne(`SELECT * FROM rooms WHERE id = ?`, [roomId])
  if (!room) return conflicts

  const bufferMinutes = room.setup_buffer_minutes || 0
  if (bufferMinutes === 0) return conflicts

  const dayStart = `${format(parseISO(startTime), 'yyyy-MM-dd')}T${room.open_start_time}:00`
  const dayEnd = `${format(parseISO(endTime), 'yyyy-MM-dd')}T${room.open_end_time}:00`

  const setupStart = addMinutes(parseISO(startTime), -bufferMinutes)
  const teardownEnd = addMinutes(parseISO(endTime), bufferMinutes)

  if (isBefore(setupStart, parseISO(dayStart))) {
    conflicts.push({
      id: uuidv4(),
      type: 'setup_buffer',
      severity: 'error',
      title: '布场时间不足',
      description: `开始时间需要预留${bufferMinutes}分钟布场，早于会议室开放时间${room.open_start_time}`,
      relatedResourceId: roomId,
      relatedResourceType: 'room',
      resolutionSuggestion: `建议将会议开始时间推迟到${format(addMinutes(parseISO(dayStart), bufferMinutes), 'HH:mm')}之后`
    })
  }

  if (isAfter(teardownEnd, parseISO(dayEnd))) {
    conflicts.push({
      id: uuidv4(),
      type: 'setup_buffer',
      severity: 'error',
      title: '撤场时间不足',
      description: `结束时间需要预留${bufferMinutes}分钟撤场，晚于会议室关闭时间${room.open_end_time}`,
      relatedResourceId: roomId,
      relatedResourceType: 'room',
      resolutionSuggestion: `建议将会议结束时间提前到${format(addMinutes(parseISO(dayEnd), -bufferMinutes), 'HH:mm')}之前`
    })
  }

  return conflicts
}

function checkVisitorFrontDesk(params: ConflictCheckParams): ConflictDetail[] {
  const conflicts: ConflictDetail[] = []
  const { hasVisitors = false, startTime, endTime, meetingLevel = 'normal', bookingId } = params

  if (!hasVisitors) return conflicts

  if (bookingId) {
    const booking = queryOne(`SELECT front_desk_confirmed FROM bookings WHERE id = ?`, [bookingId])
    if (booking && !booking.front_desk_confirmed) {
      conflicts.push({
        id: uuidv4(),
        type: 'visitor',
        severity: 'error',
        title: '访客未确认',
        description: '外部访客信息尚未经前台确认，会议无法生效',
        relatedResourceType: 'front_desk',
        resolutionSuggestion: '请联系前台确认访客信息'
      })
    }

    const visitors = queryAll(`SELECT status FROM visitors WHERE booking_id = ?`, [bookingId])
    const unconfirmedVisitors = visitors.filter((v: any) => v.status !== 'confirmed')
    if (unconfirmedVisitors.length > 0) {
      conflicts.push({
        id: uuidv4(),
        type: 'visitor',
        severity: 'error',
        title: `${unconfirmedVisitors.length}位访客未确认`,
        description: `有${unconfirmedVisitors.length}位访客尚未完成身份确认`,
        relatedResourceType: 'front_desk',
        resolutionSuggestion: '请通知访客携带有效证件到前台办理确认手续'
      })
    }
  } else {
    conflicts.push({
      id: uuidv4(),
      type: 'visitor',
      severity: 'warning',
      title: '需要前台确认',
      description: '有外部访客的会议需要前台确认访客信息后方可生效',
      relatedResourceType: 'front_desk',
      resolutionSuggestion: '请提前提交访客信息，等待前台审核确认'
    })
  }

  if (meetingLevel === 'vip') {
    const severity = bookingId ? 'error' : 'warning'
    conflicts.push({
      id: uuidv4(),
      type: 'security',
      severity: severity as 'error' | 'warning',
      title: '需要安保审批',
      description: 'VIP等级会议且有外部访客，需要安保审批通过',
      relatedResourceType: 'security',
      resolutionSuggestion: '请提交访客安保审批，审批通过后会议生效'
    })
  }

  const concurrentVisitorMeetings = queryAll(
    `SELECT COUNT(*) as count FROM bookings WHERE has_visitors = 1 AND status NOT IN ('cancelled', 'rejected')
     AND start_time < ? AND end_time > ?`,
    [endTime, startTime]
  )

  if (concurrentVisitorMeetings[0]?.count >= 3) {
    conflicts.push({
      id: uuidv4(),
      type: 'visitor',
      severity: 'warning',
      title: '前台接待压力大',
      description: `该时段已有${concurrentVisitorMeetings[0].count}场访客会议同时进行`,
      relatedResourceType: 'front_desk',
      resolutionSuggestion: '建议错峰安排，或提前与前台沟通协调接待资源'
    })
  }

  return conflicts
}

function checkApprovalRequirements(params: ConflictCheckParams): ConflictDetail[] {
  const conflicts: ConflictDetail[] = []
  const { meetingLevel = 'normal', hasVisitors = false, costCenterId } = params

  const hasVisitorFlag = hasVisitors ? 1 : 0
  const approvalRule = findApprovalRule(meetingLevel, hasVisitorFlag)

  if (approvalRule) {
    if (approvalRule.requires_approval) {
      conflicts.push({
        id: uuidv4(),
        type: 'approval',
        severity: 'info',
        title: '需要审批',
        description: `${meetingLevel === 'vip' ? 'VIP' : meetingLevel === 'important' ? '重要' : '普通'}会议需要审批通过后生效`,
        relatedResourceType: 'approval',
        resolutionSuggestion: '提交后等待审批人审批'
      })
    }
    if (approvalRule.requires_front_desk && hasVisitors) {
      conflicts.push({
        id: uuidv4(),
          type: 'approval',
          severity: 'info',
          title: '需前台确认',
          description: '此会议需要前台确认访客信息',
          relatedResourceType: 'approval',
          resolutionSuggestion: '提交后前台会审核访客信息'
      })
    }
    if (approvalRule.requires_security && hasVisitors) {
      conflicts.push({
        id: uuidv4(),
        type: 'approval',
        severity: 'info',
        title: '需安保审批',
        description: '此会议需要安保审批通过',
        relatedResourceType: 'approval',
        resolutionSuggestion: '提交后等待安保审批'
      })
    }
  }

  return conflicts
}

function createResourceSnapshot(bookingId: string, room: any, booking: any, snapshotType: string): string {
  const id = uuidv4()

  const equipmentList = queryAll(
    `SELECT e.* FROM equipment e JOIN booking_equipment be ON e.id = be.equipment_id WHERE be.booking_id = ?`,
    [bookingId]
  )
  const equipmentIds = equipmentList.map((e: any) => e.id)
  const equipmentNames = equipmentList.map((e: any) => e.name)

  let costCenterName = ''
  if (booking.cost_center_id) {
    const cc = queryOne(`SELECT name FROM cost_centers WHERE id = ?`, [booking.cost_center_id])
    if (cc) costCenterName = cc.name
  }

  const visitorCount = queryOne(
    `SELECT COUNT(*) as count FROM visitors WHERE booking_id = ?`,
    [bookingId]
  )?.count || 0

  run(
    `INSERT INTO resource_snapshots (
      id, booking_id, room_id, room_name, room_capacity, room_floor,
      room_cost_per_hour, setup_buffer_minutes, equipment_ids, equipment_names,
      cost_center_id, cost_center_name, has_visitors, visitor_count,
      tea_break_needed, meeting_level, attendee_count, snapshot_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, bookingId, room.id, room.name, room.capacity, room.floor,
      room.cost_per_hour, room.setup_buffer_minutes,
      JSON.stringify(equipmentIds), JSON.stringify(equipmentNames),
      booking.cost_center_id || null, costCenterName,
      booking.has_visitors ? 1 : 0, visitorCount,
      booking.tea_break_needed ? 1 : 0, booking.meeting_level,
      booking.attendee_count, snapshotType
    ]
  )

  return id
}

interface ResourceDiff {
  room: {
    name: { before: string; after: string; changed: boolean }
    capacity: { before: number; after: number; changed: boolean; diff: number }
    floor: { before: string; after: string; changed: boolean }
    costPerHour: { before: number; after: number; changed: boolean; diff: number }
    setupBuffer: { before: number; after: number; changed: boolean; diff: number }
  }
  cost: {
    totalCost: { before: number; after: number; changed: boolean; diff: number }
  }
  equipment: {
    beforeCount: number
    afterCount: number
    added: string[]
    removed: string[]
    same: string[]
    changed: boolean
  }
  overallMatchScore: number
}

function calculateResourceDiff(fromRoom: any, toRoom: any, fromBooking: any, toBooking: any): ResourceDiff {
  const durationHours = differenceInMinutes(parseISO(toBooking.end_time || fromBooking.end_time), parseISO(toBooking.start_time || fromBooking.start_time)) / 60

  const fromEq = queryAll(
    `SELECT e.* FROM equipment e JOIN room_equipment re ON e.id = re.equipment_id WHERE re.room_id = ?`,
    [fromRoom.id]
  ).map((e: any) => e.name)
  const toEq = queryAll(
    `SELECT e.* FROM equipment e JOIN room_equipment re ON e.id = re.equipment_id WHERE re.room_id = ?`,
    [toRoom.id]
  ).map((e: any) => e.name)

  const fromSet = new Set(fromEq)
  const toSet = new Set(toEq)
  const added = toEq.filter(n => !fromSet.has(n))
  const removed = fromEq.filter(n => !toSet.has(n))
  const same = fromEq.filter(n => toSet.has(n))

  const beforeCost = durationHours * (fromRoom.cost_per_hour || 0)
  const afterCost = durationHours * (toRoom.cost_per_hour || 0)

  let matchScore = 100

  const capacityDiff = Math.abs((toRoom.capacity || 0) - (fromRoom.capacity || 0))
  if (capacityDiff > 0) matchScore -= Math.min(15, capacityDiff * 2)

  const costDiff = Math.abs(afterCost - beforeCost)
  if (costDiff > 0) matchScore -= Math.min(20, costDiff / 10)

  if (fromRoom.floor !== toRoom.floor) matchScore -= 10

  if (removed.length > 0) matchScore -= removed.length * 15

  matchScore = Math.max(0, Math.round(matchScore))

  return {
    room: {
      name: { before: fromRoom.name, after: toRoom.name, changed: fromRoom.name !== toRoom.name },
      capacity: { before: fromRoom.capacity, after: toRoom.capacity, changed: fromRoom.capacity !== toRoom.capacity, diff: toRoom.capacity - fromRoom.capacity },
      floor: { before: fromRoom.floor, after: toRoom.floor, changed: fromRoom.floor !== toRoom.floor },
      costPerHour: { before: fromRoom.cost_per_hour, after: toRoom.cost_per_hour, changed: fromRoom.cost_per_hour !== toRoom.cost_per_hour, diff: toRoom.cost_per_hour - fromRoom.cost_per_hour },
      setupBuffer: { before: fromRoom.setup_buffer_minutes, after: toRoom.setup_buffer_minutes, changed: fromRoom.setup_buffer_minutes !== toRoom.setup_buffer_minutes, diff: toRoom.setup_buffer_minutes - fromRoom.setup_buffer_minutes }
    },
    cost: {
      totalCost: { before: Number(beforeCost.toFixed(2)), after: Number(afterCost.toFixed(2)), changed: beforeCost !== afterCost, diff: Number((afterCost - beforeCost).toFixed(2)) }
    },
    equipment: {
      beforeCount: fromEq.length,
      afterCount: toEq.length,
      added,
      removed,
      same,
      changed: added.length > 0 || removed.length > 0
    },
    overallMatchScore: matchScore
  }
}

interface SmartSearchOptions {
  equipmentIds?: string[]
  preferredFloor?: string
  maxCostPerHour?: number
  booking?: any
}

function findAvailableRoomsSmart(
  minCapacity: number,
  startTime: string,
  endTime: string,
  excludeRoomId?: string,
  options?: SmartSearchOptions
): any[] {
  let sql = `SELECT * FROM rooms WHERE capacity >= ? AND status = 'available'`
  const params: any[] = [minCapacity]

  if (excludeRoomId) {
    sql += ` AND id != ?`
    params.push(excludeRoomId)
  }

  if (options?.maxCostPerHour) {
    sql += ` AND cost_per_hour <= ?`
    params.push(options.maxCostPerHour)
  }

  sql += ` ORDER BY capacity ASC`

  const rooms = queryAll(sql, params)

  const availableRooms = rooms.filter(room => {
    const conflicts = queryAll(
      `SELECT id FROM bookings WHERE room_id = ? AND status NOT IN ('cancelled', 'rejected') AND (
        (setup_start_time < ? AND teardown_end_time > ?) OR
        (setup_start_time < ? AND teardown_end_time > ?)
      ) LIMIT 1`,
      [room.id, endTime, startTime, endTime, startTime]
    )
    return conflicts.length === 0
  })

  const scoredRooms = availableRooms.map(room => {
    let score = 0
    const reasons: string[] = []

    if (options?.preferredFloor && room.floor === options.preferredFloor) {
      score += 20
      reasons.push('同楼层')
    }

    const capacityFit = room.capacity - minCapacity
    if (capacityFit <= 5) {
      score += 25
      reasons.push('容量刚好合适')
    } else if (capacityFit <= 10) {
      score += 15
      reasons.push('容量略有富余')
    } else {
      score += 5
    }

    if (options?.equipmentIds && options.equipmentIds.length > 0) {
      const roomEqTypes = queryAll(
        `SELECT e.type FROM equipment e JOIN room_equipment re ON e.id = re.equipment_id WHERE re.room_id = ?`,
        [room.id]
      ).map((r: any) => r.type)

      let matchCount = 0
      for (const eqId of options.equipmentIds) {
        const eq = queryOne(`SELECT type FROM equipment WHERE id = ?`, [eqId])
        if (eq && roomEqTypes.includes(eq.type)) {
          matchCount++
        }
      }
      const matchRatio = matchCount / options.equipmentIds.length
      score += Math.round(matchRatio * 30)
      if (matchRatio === 1) reasons.push('设备完全匹配')
      else if (matchRatio > 0.5) reasons.push('设备部分匹配')
    }

    if (room.setup_buffer_minutes <= 10) {
      score += 10
      reasons.push('布场时间短')
    }

    const costPerHour = room.cost_per_hour || 0
    if (costPerHour === 0) {
      score += 15
      reasons.push('免费')
    } else if (costPerHour <= 50) {
      score += 10
      reasons.push('成本低')
    }

    return { ...room, matchScore: score, matchReasons: reasons }
  })

  scoredRooms.sort((a, b) => b.matchScore - a.matchScore)

  return scoredRooms
}

export default router

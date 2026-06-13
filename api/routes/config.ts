import { Router, type Request, type Response } from 'express'
import { queryAll, queryOne, run } from '../database.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

router.get('/rules', async (req: Request, res: Response): Promise<void> => {
  try {
    const rules = queryAll(`SELECT * FROM approval_rules ORDER BY meeting_level, has_visitor`)
    res.json({ success: true, data: rules })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/rules', async (req: Request, res: Response): Promise<void> => {
  try {
    const { meetingLevel, hasVisitor, costCenterId, requiresApproval, requiresFrontDesk, requiresSecurity, approverId } = req.body
    const id = uuidv4()
    run(
      `INSERT INTO approval_rules (id, meeting_level, has_visitor, cost_center_id, requires_approval, requires_front_desk, requires_security, approver_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, meetingLevel || null, hasVisitor !== undefined ? (hasVisitor ? 1 : 0) : null,
        costCenterId || null, requiresApproval ? 1 : 0, requiresFrontDesk ? 1 : 0,
        requiresSecurity ? 1 : 0, approverId || null]
    )
    const result = queryOne(`SELECT * FROM approval_rules WHERE id = ?`, [id])
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.put('/rules/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = queryOne(`SELECT * FROM approval_rules WHERE id = ?`, [req.params.id])
    if (!existing) { res.status(404).json({ success: false, error: '审批规则未找到' }); return }

    const { meetingLevel, hasVisitor, costCenterId, requiresApproval, requiresFrontDesk, requiresSecurity, approverId } = req.body
    run(
      `UPDATE approval_rules SET meeting_level=?, has_visitor=?, cost_center_id=?, requires_approval=?, requires_front_desk=?, requires_security=?, approver_id=? WHERE id=?`,
      [
        meetingLevel !== undefined ? meetingLevel : existing.meeting_level,
        hasVisitor !== undefined ? (hasVisitor ? 1 : 0) : existing.has_visitor,
        costCenterId !== undefined ? costCenterId : existing.cost_center_id,
        requiresApproval !== undefined ? (requiresApproval ? 1 : 0) : existing.requires_approval,
        requiresFrontDesk !== undefined ? (requiresFrontDesk ? 1 : 0) : existing.requires_front_desk,
        requiresSecurity !== undefined ? (requiresSecurity ? 1 : 0) : existing.requires_security,
        approverId !== undefined ? approverId : existing.approver_id,
        req.params.id
      ]
    )
    const result = queryOne(`SELECT * FROM approval_rules WHERE id = ?`, [req.params.id])
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.delete('/rules/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = queryOne(`SELECT * FROM approval_rules WHERE id = ?`, [req.params.id])
    if (!existing) { res.status(404).json({ success: false, error: '审批规则未找到' }); return }

    run(`DELETE FROM approval_rules WHERE id = ?`, [req.params.id])
    res.json({ success: true, data: { id: req.params.id } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/rooms-split', async (req: Request, res: Response): Promise<void> => {
  try {
    const splitableRooms = queryAll(
      `SELECT r.*, (SELECT COUNT(*) FROM rooms sr WHERE sr.split_from = r.id) AS sub_room_count FROM rooms r WHERE r.can_split = 1`
    )
    for (const room of splitableRooms) {
      room.can_split = Boolean(room.can_split)
      room.sub_rooms = queryAll(`SELECT * FROM rooms WHERE split_from = ?`, [room.id])
      for (const sub of room.sub_rooms) {
        sub.can_split = Boolean(sub.can_split)
      }
    }
    res.json({ success: true, data: splitableRooms })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/rooms-split/:roomId/split', async (req: Request, res: Response): Promise<void> => {
  try {
    const { subRoomName, subCapacity, operatorId } = req.body
    const room = queryOne(`SELECT * FROM rooms WHERE id = ?`, [req.params.roomId])
    if (!room) { res.status(404).json({ success: false, error: '会议室未找到' }); return }
    if (!room.can_split) { res.status(400).json({ success: false, error: '该会议室不支持拆分' }); return }

    const id = uuidv4()
    run(
      `INSERT INTO rooms (id, name, floor, capacity, open_start_time, open_end_time, cost_per_hour, cost_center_id, setup_buffer_minutes, can_split, split_from, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, subRoomName, room.floor, subCapacity, room.open_start_time, room.open_end_time,
        Math.round(room.cost_per_hour * (subCapacity / room.capacity) * 100) / 100,
        room.cost_center_id, room.setup_buffer_minutes, 0, req.params.roomId, 'available']
    )

    run(
      `INSERT INTO booking_logs (id, booking_id, action, operator_id, detail) VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), 'system', 'created', operatorId || 'system', `会议室${room.name}拆分出子会议室${subRoomName}`]
    )

    const result = queryOne(`SELECT * FROM rooms WHERE id = ?`, [id])
    result.can_split = Boolean(result.can_split)
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router

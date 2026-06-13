import { Router, type Request, type Response } from 'express'
import { queryAll, queryOne, run } from '../database.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { floor, capacity_min, capacity_max, status, equipment_type } = req.query
    let sql = `SELECT r.* FROM rooms r WHERE 1=1`
    const params: any[] = []

    if (floor) { sql += ` AND r.floor = ?`; params.push(floor) }
    if (capacity_min) { sql += ` AND r.capacity >= ?`; params.push(Number(capacity_min)) }
    if (capacity_max) { sql += ` AND r.capacity <= ?`; params.push(Number(capacity_max)) }
    if (status) { sql += ` AND r.status = ?`; params.push(status) }

    if (equipment_type) {
      const types = String(equipment_type).split(',')
      sql += ` AND r.id IN (SELECT re.room_id FROM room_equipment re JOIN equipment e ON re.equipment_id = e.id WHERE e.type IN (${types.map(() => '?').join(',')}))`
      params.push(...types)
    }

    sql += ` ORDER BY r.floor, r.name`
    const rooms = queryAll(sql, params)

    for (const room of rooms) {
      room.can_split = Boolean(room.can_split)
      const eqRows = queryAll(
        `SELECT e.* FROM equipment e JOIN room_equipment re ON e.id = re.equipment_id WHERE re.room_id = ?`,
        [room.id]
      )
      room.equipment = eqRows
    }

    res.json({ success: true, data: rooms })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const room = queryOne(`SELECT * FROM rooms WHERE id = ?`, [req.params.id])
    if (!room) { res.status(404).json({ success: false, error: '会议室未找到' }); return }
    room.can_split = Boolean(room.can_split)
    const equipment = queryAll(
      `SELECT e.* FROM equipment e JOIN room_equipment re ON e.id = re.equipment_id WHERE re.room_id = ?`,
      [room.id]
    )
    room.equipment = equipment
    res.json({ success: true, data: room })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, floor, capacity, openStartTime, openEndTime, costPerHour, costCenterId, setupBufferMinutes, canSplit, splitFrom, status } = req.body
    const id = uuidv4()
    run(
      `INSERT INTO rooms (id, name, floor, capacity, open_start_time, open_end_time, cost_per_hour, cost_center_id, setup_buffer_minutes, can_split, split_from, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, floor, capacity, openStartTime, openEndTime, costPerHour || 0, costCenterId, setupBufferMinutes || 15, canSplit ? 1 : 0, splitFrom || null, status || 'available']
    )
    if (req.body.equipmentIds && Array.isArray(req.body.equipmentIds)) {
      for (const eqId of req.body.equipmentIds) {
        run(`INSERT INTO room_equipment (room_id, equipment_id) VALUES (?, ?)`, [id, eqId])
      }
    }
    res.json({ success: true, data: { id } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = queryOne(`SELECT * FROM rooms WHERE id = ?`, [req.params.id])
    if (!existing) { res.status(404).json({ success: false, error: '会议室未找到' }); return }

    const { name, floor, capacity, openStartTime, openEndTime, costPerHour, costCenterId, setupBufferMinutes, canSplit, splitFrom, status } = req.body
    run(
      `UPDATE rooms SET name=?, floor=?, capacity=?, open_start_time=?, open_end_time=?, cost_per_hour=?, cost_center_id=?, setup_buffer_minutes=?, can_split=?, split_from=?, status=?, updated_at=datetime('now') WHERE id=?`,
      [name ?? existing.name, floor ?? existing.floor, capacity ?? existing.capacity,
        openStartTime ?? existing.open_start_time, openEndTime ?? existing.open_end_time,
        costPerHour ?? existing.cost_per_hour, costCenterId ?? existing.cost_center_id,
        setupBufferMinutes ?? existing.setup_buffer_minutes,
        canSplit !== undefined ? (canSplit ? 1 : 0) : existing.can_split,
        splitFrom ?? existing.split_from, status ?? existing.status, req.params.id]
    )

    if (req.body.equipmentIds && Array.isArray(req.body.equipmentIds)) {
      run(`DELETE FROM room_equipment WHERE room_id = ?`, [req.params.id])
      for (const eqId of req.body.equipmentIds) {
        run(`INSERT INTO room_equipment (room_id, equipment_id) VALUES (?, ?)`, [req.params.id, eqId])
      }
    }
    res.json({ success: true, data: { id: req.params.id } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/:id/availability', async (req: Request, res: Response): Promise<void> => {
  try {
    const { date } = req.query
    const room = queryOne(`SELECT * FROM rooms WHERE id = ?`, [req.params.id])
    if (!room) { res.status(404).json({ success: false, error: '会议室未找到' }); return }

    const targetDate = date ? String(date) : new Date().toISOString().slice(0, 10)
    const dayStart = `${targetDate}T${room.open_start_time}:00`
    const dayEnd = `${targetDate}T${room.open_end_time}:00`

    const bookings = queryAll(
      `SELECT start_time, end_time, setup_start_time, teardown_end_time, title, status FROM bookings WHERE room_id = ? AND status NOT IN ('cancelled', 'rejected') AND start_time >= ? AND start_time < ? ORDER BY start_time`,
      [req.params.id, dayStart, dayEnd]
    )

    const slots: { start: string; end: string; available: boolean; bookingTitle?: string }[] = []
    const openMinutes = timeToMinutes(room.open_end_time)
    const closeMinutes = timeToMinutes(room.open_start_time)
    const totalMinutes = openMinutes - closeMinutes

    for (let m = 0; m < totalMinutes; m += 30) {
      const slotStart = minutesToTime(closeMinutes + m)
      const slotEnd = minutesToTime(closeMinutes + m + 30)
      const slotStartFull = `${targetDate}T${slotStart}:00`
      const slotEndFull = `${targetDate}T${slotEnd}:00`

      const conflicting = bookings.find(b => {
        const bStart = b.teardown_end_time || b.end_time
        const bEnd = b.setup_start_time || b.start_time
        return slotStartFull < bStart && slotEndFull > bEnd
      })

      slots.push({
        start: slotStart,
        end: slotEnd,
        available: !conflicting,
        bookingTitle: conflicting?.title,
      })
    }

    res.json({ success: true, data: { date: targetDate, roomOpen: room.open_start_time + '-' + room.open_end_time, slots } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export default router

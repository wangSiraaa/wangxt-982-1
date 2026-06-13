import { Router, type Request, type Response } from 'express'
import { queryAll, queryOne, run } from '../database.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, status, roomId } = req.query
    let sql = `SELECT e.* FROM equipment e WHERE 1=1`
    const params: any[] = []

    if (type) { sql += ` AND e.type = ?`; params.push(String(type)) }
    if (status) { sql += ` AND e.status = ?`; params.push(String(status)) }
    if (roomId) { sql += ` AND e.room_id = ?`; params.push(String(roomId)) }

    sql += ` ORDER BY e.name`
    const equipment = queryAll(sql, params)
    res.json({ success: true, data: equipment })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, type, roomId, status } = req.body
    const id = uuidv4()
    run(
      `INSERT INTO equipment (id, name, type, room_id, status) VALUES (?, ?, ?, ?, ?)`,
      [id, name, type, roomId || null, status || 'normal']
    )
    if (roomId) {
      run(`INSERT OR IGNORE INTO room_equipment (room_id, equipment_id) VALUES (?, ?)`, [roomId, id])
    }
    const result = queryOne(`SELECT * FROM equipment WHERE id = ?`, [id])
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = queryOne(`SELECT * FROM equipment WHERE id = ?`, [req.params.id])
    if (!existing) { res.status(404).json({ success: false, error: '设备未找到' }); return }

    const { name, type, roomId, status, maintenanceNote } = req.body
    run(
      `UPDATE equipment SET name=?, type=?, room_id=?, status=?, maintenance_note=?, updated_at=datetime('now') WHERE id=?`,
      [
        name ?? existing.name,
        type ?? existing.type,
        roomId !== undefined ? roomId : existing.room_id,
        status ?? existing.status,
        maintenanceNote !== undefined ? maintenanceNote : existing.maintenance_note,
        req.params.id
      ]
    )

    if (roomId !== undefined && roomId !== existing.room_id) {
      run(`DELETE FROM room_equipment WHERE equipment_id = ? AND room_id = ?`, [req.params.id, existing.room_id])
      if (roomId) {
        run(`INSERT OR IGNORE INTO room_equipment (room_id, equipment_id) VALUES (?, ?)`, [roomId, req.params.id])
      }
    }

    const result = queryOne(`SELECT * FROM equipment WHERE id = ?`, [req.params.id])
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/:id/maintenance', async (req: Request, res: Response): Promise<void> => {
  try {
    const { operatorId, note, status } = req.body
    const equipment = queryOne(`SELECT * FROM equipment WHERE id = ?`, [req.params.id])
    if (!equipment) { res.status(404).json({ success: false, error: '设备未找到' }); return }

    const newStatus = status || 'maintenance'
    run(
      `UPDATE equipment SET status=?, maintenance_note=?, updated_at=datetime('now') WHERE id=?`,
      [newStatus, note || '设备维修中', req.params.id]
    )

    run(
      `INSERT INTO equipment_logs (id, equipment_id, action, operator_id, detail) VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), req.params.id, 'maintenance', operatorId, `设备维修: ${note || '无备注'}`]
    )

    if (equipment.room_id) {
      const affectedBookings = queryAll(
        `SELECT b.* FROM bookings b JOIN booking_equipment be ON b.id = be.booking_id WHERE be.equipment_id = ? AND b.status NOT IN ('cancelled', 'rejected', 'completed', 'no_show')`,
        [req.params.id]
      )
      for (const b of affectedBookings) {
        run(
          `INSERT INTO booking_logs (id, booking_id, action, operator_id, detail) VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), b.id, 'updated', operatorId, `设备${equipment.name}进入维修状态，预订可能受影响`]
        )
      }
    }

    const result = queryOne(`SELECT * FROM equipment WHERE id = ?`, [req.params.id])
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/:id/borrow', async (req: Request, res: Response): Promise<void> => {
  try {
    const { operatorId, borrowerId, expectedReturnDate, note } = req.body
    const equipment = queryOne(`SELECT * FROM equipment WHERE id = ?`, [req.params.id])
    if (!equipment) { res.status(404).json({ success: false, error: '设备未找到' }); return }
    if (equipment.status !== 'normal') {
      res.status(400).json({ success: false, error: `设备当前状态为${equipment.status}，不可借用` }); return
    }

    run(
      `UPDATE equipment SET status='borrowed', borrower_id=?, expected_return_date=?, updated_at=datetime('now') WHERE id=?`,
      [borrowerId, expectedReturnDate || null, req.params.id]
    )

    if (equipment.room_id) {
      run(`DELETE FROM room_equipment WHERE equipment_id = ? AND room_id = ?`, [req.params.id, equipment.room_id])
    }

    run(
      `INSERT INTO equipment_logs (id, equipment_id, action, operator_id, detail) VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), req.params.id, 'borrow', operatorId, `设备借出给${borrowerId}，预计归还${expectedReturnDate || '未定'}: ${note || ''}`]
    )

    const result = queryOne(`SELECT * FROM equipment WHERE id = ?`, [req.params.id])
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/:id/return', async (req: Request, res: Response): Promise<void> => {
  try {
    const { operatorId, note, roomId } = req.body
    const equipment = queryOne(`SELECT * FROM equipment WHERE id = ?`, [req.params.id])
    if (!equipment) { res.status(404).json({ success: false, error: '设备未找到' }); return }
    if (equipment.status !== 'borrowed') {
      res.status(400).json({ success: false, error: `设备当前状态为${equipment.status}，不可归还` }); return
    }

    const targetRoomId = roomId || equipment.room_id
    run(
      `UPDATE equipment SET status='normal', borrower_id=NULL, expected_return_date=NULL, room_id=?, updated_at=datetime('now') WHERE id=?`,
      [targetRoomId, req.params.id]
    )

    if (targetRoomId) {
      run(`INSERT OR IGNORE INTO room_equipment (room_id, equipment_id) VALUES (?, ?)`, [targetRoomId, req.params.id])
    }

    run(
      `INSERT INTO equipment_logs (id, equipment_id, action, operator_id, detail) VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), req.params.id, 'return', operatorId, `设备归还: ${note || '无备注'}`]
    )

    const result = queryOne(`SELECT * FROM equipment WHERE id = ?`, [req.params.id])
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/:id/affected-bookings', async (req: Request, res: Response): Promise<void> => {
  try {
    const equipment = queryOne(`SELECT * FROM equipment WHERE id = ?`, [req.params.id])
    if (!equipment) { res.status(404).json({ success: false, error: '设备未找到' }); return }

    const bookings = queryAll(
      `SELECT b.* FROM bookings b JOIN booking_equipment be ON b.id = be.booking_id WHERE be.equipment_id = ? AND b.status NOT IN ('cancelled', 'rejected', 'completed', 'no_show')`,
      [req.params.id]
    )

    if (equipment.room_id) {
      const roomBookings = queryAll(
        `SELECT * FROM bookings WHERE room_id = ? AND status NOT IN ('cancelled', 'rejected', 'completed', 'no_show')`,
        [equipment.room_id]
      )
      for (const rb of roomBookings) {
        if (!bookings.find(b => b.id === rb.id)) {
          bookings.push(rb)
        }
      }
    }

    res.json({ success: true, data: bookings })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router

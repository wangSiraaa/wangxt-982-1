import { Router, type Request, type Response } from 'express'
import { queryAll, queryOne, run } from '../database.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId, status, name } = req.query
    let sql = `SELECT * FROM visitors WHERE 1=1`
    const params: any[] = []

    if (bookingId) { sql += ` AND booking_id = ?`; params.push(String(bookingId)) }
    if (status) { sql += ` AND status = ?`; params.push(String(status)) }
    if (name) { sql += ` AND name LIKE ?`; params.push(`%${name}%`) }

    sql += ` ORDER BY created_at DESC`
    const visitors = queryAll(sql, params)
    res.json({ success: true, data: visitors })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId, name, company, idType, idNumber, purpose, photoUrl } = req.body

    const booking = queryOne(`SELECT * FROM bookings WHERE id = ?`, [bookingId])
    if (!booking) { res.status(400).json({ success: false, error: '关联预订不存在' }); return }

    const id = uuidv4()
    run(
      `INSERT INTO visitors (id, booking_id, name, company, id_type, id_number, purpose, status, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, bookingId, name, company || null, idType || null, idNumber || null, purpose || null, 'registered', photoUrl || null]
    )

    if (!booking.has_visitors) {
      run(`UPDATE bookings SET has_visitors=1, updated_at=datetime('now') WHERE id=?`, [bookingId])
    }

    const result = queryOne(`SELECT * FROM visitors WHERE id = ?`, [id])
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = queryOne(`SELECT * FROM visitors WHERE id = ?`, [req.params.id])
    if (!existing) { res.status(404).json({ success: false, error: '访客未找到' }); return }

    const { name, company, idType, idNumber, purpose, photoUrl, status } = req.body
    run(
      `UPDATE visitors SET name=?, company=?, id_type=?, id_number=?, purpose=?, photo_url=?, status=? WHERE id=?`,
      [
        name ?? existing.name,
        company ?? existing.company,
        idType ?? existing.id_type,
        idNumber ?? existing.id_number,
        purpose ?? existing.purpose,
        photoUrl ?? existing.photo_url,
        status ?? existing.status,
        req.params.id
      ]
    )

    const result = queryOne(`SELECT * FROM visitors WHERE id = ?`, [req.params.id])
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/:id/verify-id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { operatorId, verified, reason } = req.body
    const visitor = queryOne(`SELECT * FROM visitors WHERE id = ?`, [req.params.id])
    if (!visitor) { res.status(404).json({ success: false, error: '访客未找到' }); return }

    if (visitor.status !== 'registered') {
      res.status(400).json({ success: false, error: `访客当前状态为${visitor.status}，不可进行证件审核` }); return
    }

    if (verified) {
      run(`UPDATE visitors SET status='id_verified' WHERE id=?`, [req.params.id])
    } else {
      run(`UPDATE visitors SET status='registered' WHERE id=?`, [req.params.id])
    }

    const booking = queryOne(`SELECT * FROM bookings WHERE id = ?`, [visitor.booking_id])
    if (booking) {
      run(
        `INSERT INTO booking_logs (id, booking_id, action, operator_id, detail) VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), visitor.booking_id, 'id_verified', operatorId,
          verified ? `访客${visitor.name}证件审核通过` : `访客${visitor.name}证件审核未通过: ${reason || '未知'}`]
      )
    }

    const result = queryOne(`SELECT * FROM visitors WHERE id = ?`, [req.params.id])
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/:id/security-approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const { operatorId, approved, reason } = req.body
    const visitor = queryOne(`SELECT * FROM visitors WHERE id = ?`, [req.params.id])
    if (!visitor) { res.status(404).json({ success: false, error: '访客未找到' }); return }

    if (visitor.status !== 'id_verified') {
      res.status(400).json({ success: false, error: `访客当前状态为${visitor.status}，需先通过证件审核` }); return
    }

    if (approved) {
      run(`UPDATE visitors SET status='security_approved' WHERE id=?`, [req.params.id])

      const booking = queryOne(`SELECT * FROM bookings WHERE id = ?`, [visitor.booking_id])
      if (booking && !booking.security_approved) {
        run(`UPDATE bookings SET security_approved=1, updated_at=datetime('now') WHERE id=?`, [visitor.booking_id])

        const updated = queryOne(`SELECT * FROM bookings WHERE id = ?`, [visitor.booking_id])
        if (updated && updated.front_desk_confirmed && updated.security_approved && updated.status === 'pending') {
          run(`UPDATE bookings SET status='approved', updated_at=datetime('now') WHERE id=?`, [visitor.booking_id])
        }
      }
    } else {
      run(`UPDATE visitors SET status='registered' WHERE id=?`, [req.params.id])
    }

    const booking = queryOne(`SELECT * FROM bookings WHERE id = ?`, [visitor.booking_id])
    if (booking) {
      run(
        `INSERT INTO booking_logs (id, booking_id, action, operator_id, detail) VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), visitor.booking_id, 'security_approved', operatorId,
          approved ? `访客${visitor.name}安保审批通过` : `访客${visitor.name}安保审批未通过: ${reason || '未知'}`]
      )
    }

    const result = queryOne(`SELECT * FROM visitors WHERE id = ?`, [req.params.id])
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router

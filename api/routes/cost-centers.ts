import { Router, type Request, type Response } from 'express'
import { queryAll, queryOne, run } from '../database.js'
import { v4 as uuidv4 } from 'uuid'
import { differenceInMinutes, parseISO } from 'date-fns'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { department } = req.query
    let sql = `SELECT cc.*, (cc.budget - cc.used) AS remaining FROM cost_centers cc WHERE 1=1`
    const params: any[] = []

    if (department) { sql += ` AND cc.department = ?`; params.push(String(department)) }

    const costCenters = queryAll(sql, params)
    res.json({ success: true, data: costCenters })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, budget, used, department } = req.body
    const id = uuidv4()
    run(
      `INSERT INTO cost_centers (id, name, budget, used, department) VALUES (?, ?, ?, ?, ?)`,
      [id, name, budget || 0, used || 0, department || null]
    )
    const result = queryOne(`SELECT *, (budget - used) AS remaining FROM cost_centers WHERE id = ?`, [id])
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = queryOne(`SELECT * FROM cost_centers WHERE id = ?`, [req.params.id])
    if (!existing) { res.status(404).json({ success: false, error: '成本中心未找到' }); return }

    const { name, budget, used, department } = req.body
    run(
      `UPDATE cost_centers SET name=?, budget=?, used=?, department=? WHERE id=?`,
      [
        name ?? existing.name,
        budget ?? existing.budget,
        used ?? existing.used,
        department ?? existing.department,
        req.params.id
      ]
    )

    const result = queryOne(`SELECT *, (budget - used) AS remaining FROM cost_centers WHERE id = ?`, [req.params.id])
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/:id/budget', async (req: Request, res: Response): Promise<void> => {
  try {
    const costCenter = queryOne(`SELECT *, (budget - used) AS remaining FROM cost_centers WHERE id = ?`, [req.params.id])
    if (!costCenter) { res.status(404).json({ success: false, error: '成本中心未找到' }); return }

    const bookings = queryAll(
      `SELECT b.*, r.name AS room_name, r.cost_per_hour FROM bookings b LEFT JOIN rooms r ON b.room_id = r.id WHERE b.cost_center_id = ? AND b.status NOT IN ('cancelled', 'rejected') ORDER BY b.start_time DESC`,
      [req.params.id]
    )

    let totalSpent = 0
    const breakdown = bookings.map((b: any) => {
      const durationHours = differenceInMinutes(parseISO(b.end_time), parseISO(b.start_time)) / 60
      const cost = durationHours * (b.cost_per_hour || 0)
      totalSpent += cost
      return {
        bookingId: b.id,
        title: b.title,
        roomName: b.room_name,
        startTime: b.start_time,
        endTime: b.end_time,
        durationHours: Math.round(durationHours * 100) / 100,
        cost: Math.round(cost * 100) / 100,
        status: b.status,
      }
    })

    res.json({
      success: true,
      data: {
        id: costCenter.id,
        name: costCenter.name,
        budget: costCenter.budget,
        used: costCenter.used,
        remaining: costCenter.remaining,
        calculatedSpent: Math.round(totalSpent * 100) / 100,
        utilizationRate: costCenter.budget > 0 ? Math.round((costCenter.used / costCenter.budget) * 10000) / 100 : 0,
        bookings: breakdown,
      }
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router

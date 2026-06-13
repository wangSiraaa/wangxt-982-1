import { Router, type Request, type Response } from 'express'
import { queryAll } from '../database.js'

const router = Router()

router.get('/users', async (req: Request, res: Response): Promise<void> => {
  try {
    const users = queryAll(`SELECT * FROM users ORDER BY name`)
    res.json({ success: true, data: users })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body
    if (!userId) {
      res.status(400).json({ success: false, error: '请选择用户' })
      return
    }
    const user = queryAll(`SELECT * FROM users WHERE id = ?`, [userId])[0]
    if (!user) {
      res.status(404).json({ success: false, error: '用户不存在' })
      return
    }
    res.json({ success: true, data: user })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: { message: '登出成功' } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router

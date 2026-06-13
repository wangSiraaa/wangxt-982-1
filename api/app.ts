import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { initDatabase } from './database.js'
import authRoutes from './routes/auth.js'
import roomRoutes from './routes/rooms.js'
import bookingRoutes from './routes/bookings.js'
import visitorRoutes from './routes/visitors.js'
import equipmentRoutes from './routes/equipment.js'
import costCenterRoutes from './routes/cost-centers.js'
import configRoutes from './routes/config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use('/api/auth', authRoutes)
app.use('/api/rooms', roomRoutes)
app.use('/api/bookings', bookingRoutes)
app.use('/api/visitors', visitorRoutes)
app.use('/api/equipment', equipmentRoutes)
app.use('/api/cost-centers', costCenterRoutes)
app.use('/api/config', configRoutes)

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export { initDatabase }
export default app

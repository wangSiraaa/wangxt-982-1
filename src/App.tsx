import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import CalendarPage from '@/pages/CalendarPage'
import BookingPage from '@/pages/BookingPage'
import VisitorsPage from '@/pages/VisitorsPage'
import CheckinPage from '@/pages/CheckinPage'
import EquipmentPage from '@/pages/EquipmentPage'
import ConflictPage from '@/pages/ConflictPage'
import CostPage from '@/pages/CostPage'

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/booking" element={<BookingPage />} />
          <Route path="/visitors" element={<VisitorsPage />} />
          <Route path="/checkin" element={<CheckinPage />} />
          <Route path="/equipment" element={<EquipmentPage />} />
          <Route path="/conflict" element={<ConflictPage />} />
          <Route path="/cost" element={<CostPage />} />
        </Route>
      </Routes>
    </Router>
  )
}

import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Calendar,
  CalendarPlus,
  Users,
  ClipboardCheck,
  Monitor,
  Shield,
  DollarSign,
  Bell,
  ChevronDown,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useStore, type Role } from '@/store'

const navItems = [
  { path: '/', label: '日历总览', icon: Calendar },
  { path: '/booking', label: '会议室预订', icon: CalendarPlus },
  { path: '/visitors', label: '访客管理', icon: Users },
  { path: '/checkin', label: '签到看板', icon: ClipboardCheck },
  { path: '/equipment', label: '设备管理', icon: Monitor },
  { path: '/conflict', label: '审批与冲突', icon: Shield },
  { path: '/cost', label: '成本中心', icon: DollarSign },
]

const roleLabels: Record<Role, string> = {
  admin: '管理员',
  employee: '员工',
  frontdesk: '前台',
  equipadmin: '设备管理员',
}

const pageTitles: Record<string, string> = {
  '/': '日历总览',
  '/booking': '会议室预订',
  '/visitors': '访客管理',
  '/checkin': '签到看板',
  '/equipment': '设备管理',
  '/conflict': '审批与冲突',
  '/cost': '成本中心',
}

function NotificationPopup() {
  const notifications = useStore((s) => s.notifications)
  const removeNotification = useStore((s) => s.removeNotification)

  if (notifications.length === 0) return null

  return (
    <div className="absolute right-0 top-10 w-80 bg-white rounded-lg shadow-lg border border-slate-200 z-50 animate-slideUp">
      <div className="p-3 border-b border-slate-100 font-medium text-sm text-slate-700">通知</div>
      <div className="max-h-64 overflow-y-auto">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`px-3 py-2 text-sm border-b border-slate-50 flex items-start gap-2 ${
              n.type === 'error' ? 'text-red-700 bg-red-50' :
              n.type === 'success' ? 'text-green-700 bg-green-50' :
              n.type === 'warning' ? 'text-amber-700 bg-amber-50' :
              'text-blue-700 bg-blue-50'
            }`}
          >
            <span className="flex-1">{n.message}</span>
            <button onClick={() => removeNotification(n.id)} className="text-slate-400 hover:text-slate-600 shrink-0">×</button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Layout() {
  const location = useLocation()
  const currentRole = useStore((s) => s.currentRole)
  const setCurrentRole = useStore((s) => s.setCurrentRole)
  const currentUser = useStore((s) => s.currentUser)
  const notifications = useStore((s) => s.notifications)
  const [roleOpen, setRoleOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const roleRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (roleRef.current && !roleRef.current.contains(e.target as Node)) setRoleOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const title = pageTitles[location.pathname] || '会议室预订系统'

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-slate-200">
          <Calendar className="w-6 h-6 text-teal-700 mr-2" />
          <span className="font-bold text-lg text-slate-800">会议室系统</span>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-200">
          <div className="text-xs text-slate-400">当前用户</div>
          <div className="text-sm font-medium text-slate-700 truncate">{currentUser?.name || '未登录'}</div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
          <div className="flex items-center gap-4">
            <div ref={roleRef} className="relative">
              <button
                onClick={() => setRoleOpen(!roleOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-teal-500" />
                {roleLabels[currentRole]}
                <ChevronDown className="w-4 h-4" />
              </button>
              {roleOpen && (
                <div className="absolute right-0 top-10 w-40 bg-white rounded-lg shadow-lg border border-slate-200 z-50 animate-slideUp">
                  {(Object.entries(roleLabels) as [Role, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => { setCurrentRole(key); setRoleOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${
                        currentRole === key ? 'text-teal-700 font-medium bg-teal-50' : 'text-slate-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div ref={notifRef} className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <Bell className="w-5 h-5 text-slate-500" />
                {notifications.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                    {notifications.length}
                  </span>
                )}
              </button>
              {notifOpen && <NotificationPopup />}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

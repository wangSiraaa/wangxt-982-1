import { useEffect, useState } from 'react'
import {
  Calendar, Users, Shield, Wrench, UserCheck,
  Bell, AlertTriangle, Clock, DollarSign,
  Award, CheckCircle2, XCircle, Info, ChevronRight,
  Building2, Package, Coffee, Video, Star
} from 'lucide-react'
import { useStore, apiFetch, apiPost, type User, type Booking, type Room } from '@/store'
import { Link } from 'react-router-dom'

interface DemoScenario {
  id: string
  title: string
  description: string
  icon: any
  path: string
  role: string
  color: string
}

interface SystemStats {
  totalRooms: number
  todayBookings: number
  pendingApprovals: number
  activeEquipment: number
  pendingVisitors: number
  budgetUsage: number
}

const demoScenarios: DemoScenario[] = [
  {
    id: 'recurring',
    title: '周期会议冲突',
    description: '预订每周一的例会，自动检测与现有周期会议的时间冲突',
    icon: Calendar,
    path: '/booking',
    role: 'employee',
    color: 'bg-teal-50 text-teal-700 border-teal-200'
  },
  {
    id: 'vip',
    title: 'VIP会议抢占',
    description: '演示VIP优先级机制，高等级会议可占用已预订资源并通知原预订人',
    icon: Award,
    path: '/conflict?vip=1',
    role: 'admin',
    color: 'bg-red-50 text-red-700 border-red-200'
  },
  {
    id: 'equipment',
    title: '设备故障迁移',
    description: '设备故障后，自动检测受影响会议并推荐替代会议室',
    icon: Wrench,
    path: '/equipment',
    role: 'equipadmin',
    color: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  {
    id: 'noshow',
    title: '未签到自动释放',
    description: '会议开始15分钟未签到，系统自动释放会议室资源',
    icon: Clock,
    path: '/checkin',
    role: 'frontdesk',
    color: 'bg-slate-50 text-slate-700 border-slate-200'
  },
  {
    id: 'visitor',
    title: '访客未确认拦截',
    description: '包含外部访客的会议，需前台确认后才能生效',
    icon: Shield,
    path: '/visitors',
    role: 'frontdesk',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200'
  },
  {
    id: 'budget',
    title: '成本中心预算控制',
    description: '超出成本中心预算的预订将被拦截或需要特殊审批',
    icon: DollarSign,
    path: '/cost',
    role: 'admin',
    color: 'bg-green-50 text-green-700 border-green-200'
  }
]

const roleCards = [
  { role: 'admin', name: '行政管理员', icon: Shield, desc: '维护会议室、审批规则、成本中心', color: 'from-teal-500 to-teal-600' },
  { role: 'employee', name: '员工', icon: Users, desc: '发起预订、邀请访客、申请设备', color: 'from-blue-500 to-blue-600' },
  { role: 'frontdesk', name: '前台', icon: UserCheck, desc: '访客接待、签到管理、安保审批', color: 'from-amber-500 to-amber-600' },
  { role: 'equipadmin', name: '设备管理员', icon: Wrench, desc: '设备维修、借用管理、故障处理', color: 'from-slate-500 to-slate-600' }
]

function RoleCard({ role, onSelect }: { role: User['role']; onSelect: (role: User['role']) => void }) {
  const card = roleCards.find(r => r.role === role)!
  const Icon = card.icon
  return (
    <button
      onClick={() => onSelect(role)}
      className="group relative overflow-hidden rounded-xl p-6 text-left transition-all hover:shadow-lg hover:-translate-y-1"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-10 group-hover:opacity-20 transition-opacity`} />
      <div className="relative">
        <div className={`inline-flex p-3 rounded-lg bg-gradient-to-br ${card.color} text-white mb-4`}>
          <Icon className="w-6 h-6" />
        </div>
        <h3 className="font-semibold text-slate-800 mb-1">{card.name}</h3>
        <p className="text-sm text-slate-500">{card.desc}</p>
        <div className="mt-4 flex items-center text-sm text-teal-600 font-medium">
          切换身份 <ChevronRight className="w-4 h-4 ml-1" />
        </div>
      </div>
    </button>
  )
}

function DemoCard({ scenario }: { scenario: DemoScenario }) {
  const Icon = scenario.icon
  return (
    <Link
      to={scenario.path}
      className={`group relative overflow-hidden rounded-xl p-5 text-left border transition-all hover:shadow-lg hover:-translate-y-0.5 ${scenario.color}`}
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="p-2.5 rounded-lg bg-white shadow-sm">
            <Icon className="w-5 h-5" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold">{scenario.title}</h4>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/80 font-medium">
              {roleCards.find(r => r.role === scenario.role)?.name}
            </span>
          </div>
          <p className="text-xs opacity-80">{scenario.description}</p>
        </div>
        <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  )
}

function StatsCard({ icon: Icon, label, value, trend, color }: any) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        {trend && (
          <span className={`text-xs font-medium ${trend > 0 ? 'text-red-500' : 'text-green-500'}`}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}

function QuickAction({ icon: Icon, label, path, color }: any) {
  return (
    <Link
      to={path}
      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 hover:border-teal-300 hover:bg-teal-50/50 transition-all group"
    >
      <div className={`p-2.5 rounded-lg ${color} group-hover:scale-110 transition-transform`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <span className="text-xs font-medium text-slate-600">{label}</span>
    </Link>
  )
}

export default function Home() {
  const currentUser = useStore((s) => s.currentUser)
  const setCurrentUser = useStore((s) => s.setCurrentUser)
  const fetchRooms = useStore((s) => s.fetchRooms)
  const fetchBookings = useStore((s) => s.fetchBookings)
  const rooms = useStore((s) => s.rooms)
  const bookings = useStore((s) => s.bookings)

  const [stats, setStats] = useState<SystemStats>({
    totalRooms: 0,
    todayBookings: 0,
    pendingApprovals: 0,
    activeEquipment: 0,
    pendingVisitors: 0,
    budgetUsage: 0
  })
  const [users, setUsers] = useState<User[]>([])
  const [showLogin, setShowLogin] = useState(!currentUser)

  useEffect(() => {
    fetchRooms()
    fetchBookings()
    apiFetch<{ data: User[] }>('/api/auth/users').then(r => setUsers(r.data))
  }, [])

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    const todayBookings = bookings.filter(b => b.start_time.startsWith(today))
    const pending = bookings.filter(b => b.status === 'pending' || b.status === 'checking')

    setStats({
      totalRooms: rooms.length,
      todayBookings: todayBookings.length,
      pendingApprovals: pending.length,
      activeEquipment: 12,
      pendingVisitors: 2,
      budgetUsage: 68
    })
  }, [rooms, bookings])

  const handleRoleSelect = async (role: User['role']) => {
    const roleUser = users.find(u => u.role === role)
    if (roleUser) {
      const result = await apiPost<User>('/api/auth/login', { userId: roleUser.id })
      setCurrentUser(result)
      setShowLogin(false)
    }
  }

  const filteredScenarios = currentUser
    ? demoScenarios.filter(s => s.role === currentUser.role || s.role === 'admin')
    : demoScenarios

  if (showLogin || !currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-slate-50">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-3 px-4 py-2 bg-white rounded-full shadow-sm border border-slate-200 mb-6">
              <Building2 className="w-5 h-5 text-teal-600" />
              <span className="text-sm font-medium text-slate-600">园区会议室资源协同系统</span>
            </div>
            <h1 className="text-4xl font-bold text-slate-800 mb-4">
              智能会议室管理平台
            </h1>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              集成会议室预订、访客管理、设备维护、签到核销于一体的智能协同系统，
              支持VIP优先级、周期会议、成本分摊、冲突智能处理等高级功能
            </p>
          </div>

          <div className="mb-10">
            <h2 className="text-xl font-semibold text-slate-700 text-center mb-6">请选择您的身份进入系统</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(['admin', 'employee', 'frontdesk', 'equipadmin'] as const).map(role => (
                <RoleCard key={role} role={role} onSelect={handleRoleSelect} />
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-700 mb-6 flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" />
              核心演示场景
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {demoScenarios.map(scenario => (
                <DemoCard key={scenario.id} scenario={scenario} />
              ))}
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-teal-100">
                <Calendar className="w-6 h-6 text-teal-600" />
              </div>
              <div>
                <div className="font-semibold text-slate-800">8 间会议室</div>
                <div className="text-xs text-slate-500">支持拆分合并</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-amber-100">
                <Package className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <div className="font-semibold text-slate-800">12 类设备</div>
                <div className="text-xs text-slate-500">投影/视频/白板</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-100">
                <Coffee className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <div className="font-semibold text-slate-800">茶歇服务</div>
                <div className="text-xs text-slate-500">预订时可选</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-indigo-100">
                <Video className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <div className="font-semibold text-slate-800">混合会议</div>
                <div className="text-xs text-slate-500">线下+线上</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fadeIn space-y-6">
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute right-20 bottom-0 w-32 h-32 bg-white/10 rounded-full translate-y-1/2" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Bell className="w-5 h-5" />
            </div>
            <span className="text-teal-100">欢迎回来，{currentUser.name}</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">
            {currentUser.role === 'admin' && '行政管理控制台'}
            {currentUser.role === 'employee' && '我的会议预订'}
            {currentUser.role === 'frontdesk' && '前台接待中心'}
            {currentUser.role === 'equipadmin' && '设备管理中心'}
          </h2>
          <p className="text-teal-100 text-sm">
            {currentUser.role === 'admin' && '管理会议室资源、审批规则和成本中心预算'}
            {currentUser.role === 'employee' && '发起新预订、查看我的会议和历史记录'}
            {currentUser.role === 'frontdesk' && '处理访客接待、签到管理和安保审批'}
            {currentUser.role === 'equipadmin' && '监控设备状态、处理维修和借用申请'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatsCard icon={Building2} label="会议室总数" value={stats.totalRooms} color="bg-teal-500" />
        <StatsCard icon={Calendar} label="今日会议" value={stats.todayBookings} trend={12} color="bg-blue-500" />
        <StatsCard icon={Clock} label="待审批" value={stats.pendingApprovals} trend={-5} color="bg-amber-500" />
        <StatsCard icon={Package} label="设备在线" value={stats.activeEquipment} color="bg-slate-500" />
        <StatsCard icon={Users} label="待接待访客" value={stats.pendingVisitors} color="bg-indigo-500" />
        <StatsCard icon={DollarSign} label="预算使用率" value={`${stats.budgetUsage}%`} color="bg-green-500" />
      </div>

      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        <QuickAction icon={Calendar} label="新建预订" path="/booking" color="bg-teal-500" />
        <QuickAction icon={Users} label="访客管理" path="/visitors" color="bg-indigo-500" />
        <QuickAction icon={UserCheck} label="签到看板" path="/checkin" color="bg-blue-500" />
        <QuickAction icon={Wrench} label="设备状态" path="/equipment" color="bg-slate-500" />
        <QuickAction icon={Shield} label="审批中心" path="/conflict" color="bg-amber-500" />
        <QuickAction icon={DollarSign} label="成本中心" path="/cost" color="bg-green-500" />
        <QuickAction icon={AlertTriangle} label="冲突处理" path="/conflict?tab=conflict" color="bg-red-500" />
        <QuickAction icon={Bell} label="通知中心" path="/" color="bg-pink-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Info className="w-4 h-4 text-teal-600" />
            今日会议概览
          </h3>
          <div className="space-y-3">
            {bookings.slice(0, 5).map(booking => {
              const room = rooms.find(r => r.id === booking.room_id)
              return (
                <div key={booking.id} className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className={`w-2 h-12 rounded-full ${
                    booking.meeting_level === 'vip' ? 'bg-red-500' :
                    booking.meeting_level === 'important' ? 'bg-amber-500' : 'bg-teal-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 truncate">{booking.title}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <span>{room?.name}</span>
                      <span>·</span>
                      <span>{booking.start_time.split('T')[1].slice(0, 5)} - {booking.end_time.split('T')[1].slice(0, 5)}</span>
                      <span>·</span>
                      <span>{booking.attendee_count}人</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    booking.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                    booking.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                    booking.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {booking.status === 'confirmed' ? '已确认' :
                     booking.status === 'pending' ? '待审批' :
                     booking.status === 'cancelled' ? '已取消' : booking.status}
                  </span>
                </div>
              )
            })}
            {bookings.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>暂无会议</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              可用功能
            </h3>
            <div className="space-y-2">
              {[
                { icon: Calendar, label: '周期会议预订', status: true },
                { icon: Users, label: '访客证件审核', status: true },
                { icon: Wrench, label: '设备故障迁移', status: true },
                { icon: Shield, label: '安保审批流程', status: true },
                { icon: DollarSign, label: '成本中心分摊', status: true },
                { icon: AlertTriangle, label: 'VIP优先级抢占', status: true }
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <item.icon className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-600 flex-1">{item.label}</span>
                  {item.status ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-slate-300" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500" />
              推荐演示
            </h3>
            <div className="space-y-2">
              {filteredScenarios.slice(0, 3).map(scenario => (
                <Link
                  key={scenario.id}
                  to={scenario.path}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 hover:bg-teal-50 transition-colors"
                >
                  <scenario.icon className="w-4 h-4 text-teal-600" />
                  <span className="text-sm text-slate-700 flex-1">{scenario.title}</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-4">所有演示场景</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredScenarios.map(scenario => (
            <DemoCard key={scenario.id} scenario={scenario} />
          ))}
        </div>
      </div>
    </div>
  )
}

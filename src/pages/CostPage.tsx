import { useEffect, useState, useMemo } from 'react'
import { DollarSign, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useStore, apiFetch, type CostCenter } from '@/store'

interface BudgetDetail {
  id: string
  name: string
  budget: number
  used: number
  remaining: number
  calculatedSpent: number
  utilizationRate: number
  bookings: {
    bookingId: string
    title: string
    roomName: string
    startTime: string
    endTime: string
    durationHours: number
    cost: number
    status: string
  }[]
}

function CostCenterCard({ cc, onSelect }: { cc: CostCenter; onSelect: (id: string) => void }) {
  const budget = cc.budget || 0
  const used = cc.used || 0
  const remaining = budget - used
  const percent = budget > 0 ? Math.round((used / budget) * 100) : 0

  return (
    <div
      className="bg-white rounded-lg border border-slate-200 p-5 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onSelect(cc.id)}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800">{cc.name}</h3>
        <span className={`px-2 py-0.5 rounded-full text-xs ${
          percent > 80 ? 'bg-red-50 text-red-700' : percent > 50 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
        }`}>
          {percent}% 已用
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center mb-3">
        <div>
          <div className="text-lg font-bold text-slate-800">¥{budget.toLocaleString()}</div>
          <div className="text-xs text-slate-400">预算</div>
        </div>
        <div>
          <div className="text-lg font-bold text-amber-600">¥{used.toLocaleString()}</div>
          <div className="text-xs text-slate-400">已用</div>
        </div>
        <div>
          <div className={`text-lg font-bold ${remaining >= 0 ? 'text-teal-700' : 'text-red-600'}`}>¥{remaining.toLocaleString()}</div>
          <div className="text-xs text-slate-400">剩余</div>
        </div>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${
            percent > 80 ? 'bg-red-500' : percent > 50 ? 'bg-amber-500' : 'bg-teal-600'
          }`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  )
}

function BudgetDetailPanel({ costCenterId, onClose }: { costCenterId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<BudgetDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    apiFetch<BudgetDetail>(`/api/cost-centers/${costCenterId}/budget`)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [costCenterId])

  if (loading) {
    return <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-400">加载中...</div>
  }

  if (!detail) {
    return <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-400">加载失败</div>
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 animate-slideUp">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-teal-700" />
          {detail.name} - 预算明细
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-slate-800">¥{detail.budget.toLocaleString()}</div>
          <div className="text-xs text-slate-400">总预算</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-amber-600">¥{detail.used.toLocaleString()}</div>
          <div className="text-xs text-slate-400">已使用</div>
        </div>
        <div className="bg-teal-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-teal-700">¥{detail.remaining.toLocaleString()}</div>
          <div className="text-xs text-slate-400">剩余</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-slate-800">{detail.utilizationRate}%</div>
          <div className="text-xs text-slate-400">使用率</div>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-2 font-medium text-slate-600">会议</th>
            <th className="text-left py-2 font-medium text-slate-600">会议室</th>
            <th className="text-left py-2 font-medium text-slate-600">时长</th>
            <th className="text-right py-2 font-medium text-slate-600">费用</th>
            <th className="text-left py-2 font-medium text-slate-600">状态</th>
          </tr>
        </thead>
        <tbody>
          {detail.bookings.length === 0 ? (
            <tr><td colSpan={5} className="text-center py-4 text-slate-400">暂无预订记录</td></tr>
          ) : (
            detail.bookings.map((b) => (
              <tr key={b.bookingId} className="border-b border-slate-100">
                <td className="py-2 text-slate-800">{b.title}</td>
                <td className="py-2 text-slate-600">{b.roomName}</td>
                <td className="py-2 text-slate-600">{b.durationHours}h</td>
                <td className="py-2 text-right text-slate-800">¥{b.cost}</td>
                <td className="py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] badge-${b.status}`}>{b.status}</span></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function CostPage() {
  const costCenters = useStore((s) => s.costCenters)
  const fetchCostCenters = useStore((s) => s.fetchCostCenters)
  const loading = useStore((s) => s.loading)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => { fetchCostCenters() }, [])

  const chartData = useMemo(() => {
    return costCenters.map((cc) => ({
      name: cc.name,
      预算: cc.budget,
      已用: cc.used,
      剩余: Math.max(cc.budget - cc.used, 0),
    }))
  }, [costCenters])

  if (loading.costCenters) {
    return <div className="space-y-4"><div className="h-40 bg-slate-200 rounded animate-pulse-custom" /></div>
  }

  return (
    <div className="animate-fadeIn space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {costCenters.map((cc) => (
          <CostCenterCard key={cc.id} cc={cc} onSelect={setSelectedId} />
        ))}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-teal-700" />
          预算使用概览
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
              <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                formatter={(value: number) => `¥${value.toLocaleString()}`}
              />
              <Bar dataKey="已用" fill="#D97706" radius={[4, 4, 0, 0]} />
              <Bar dataKey="剩余" fill="#0F766E" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {selectedId && (
        <BudgetDetailPanel costCenterId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}

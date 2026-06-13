import { useEffect, useState } from 'react'
import { UserPlus, Search, Shield, CheckCircle } from 'lucide-react'
import { useStore, apiPost, type Visitor } from '@/store'

const statusLabels: Record<string, string> = {
  registered: '已登记',
  id_verified: '证件已审',
  security_approved: '安保通过',
}

interface VisitorForm {
  bookingId: string
  name: string
  company: string
  idType: string
  idNumber: string
  purpose: string
}

const emptyForm: VisitorForm = { bookingId: '', name: '', company: '', idType: '身份证', idNumber: '', purpose: '' }

function AddVisitorModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (form: VisitorForm) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<VisitorForm>(emptyForm)
  const bookings = useStore((s) => s.bookings)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[480px] p-6 animate-slideUp" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-800 mb-4">添加访客</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-slate-600 mb-1">关联预订 *</label>
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={form.bookingId}
              onChange={(e) => setForm({ ...form, bookingId: e.target.value })}
            >
              <option value="">请选择</option>
              {bookings.filter((b) => b.has_visitors).map((b) => (
                <option key={b.id} value={b.id}>{b.title} ({b.start_time})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-600 mb-1">姓名 *</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">公司</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-600 mb-1">证件类型</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.idType} onChange={(e) => setForm({ ...form, idType: e.target.value })}>
                <option value="身份证">身份证</option>
                <option value="护照">护照</option>
                <option value="驾照">驾照</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">证件号码</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">来访目的</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={() => onSubmit(form)} disabled={!form.bookingId || !form.name} className="flex-1 py-2 bg-teal-700 text-white rounded-lg text-sm font-medium hover:bg-teal-800 disabled:opacity-50">确认添加</button>
          <button onClick={onClose} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200">取消</button>
        </div>
      </div>
    </div>
  )
}

export default function VisitorsPage() {
  const visitors = useStore((s) => s.visitors)
  const fetchVisitors = useStore((s) => s.fetchVisitors)
  const fetchBookings = useStore((s) => s.fetchBookings)
  const currentRole = useStore((s) => s.currentRole)
  const currentUser = useStore((s) => s.currentUser)
  const addNotification = useStore((s) => s.addNotification)
  const loading = useStore((s) => s.loading)

  const [showModal, setShowModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [searchName, setSearchName] = useState('')

  useEffect(() => {
    fetchVisitors()
    fetchBookings({ date: new Date().toISOString().slice(0, 10) })
  }, [])

  async function handleAddVisitor(form: VisitorForm) {
    try {
      await apiPost('/api/visitors', form)
      addNotification('访客添加成功', 'success')
      setShowModal(false)
      fetchVisitors()
    } catch (err: any) {
      addNotification(err.message, 'error')
    }
  }

  async function handleVerifyId(visitor: Visitor, verified: boolean) {
    try {
      await apiPost(`/api/visitors/${visitor.id}/verify-id`, { operatorId: currentUser?.id, verified, reason: verified ? '' : '证件不符' })
      addNotification(verified ? '证件审核通过' : '证件审核未通过', verified ? 'success' : 'warning')
      fetchVisitors()
    } catch (err: any) {
      addNotification(err.message, 'error')
    }
  }

  async function handleSecurityApprove(visitor: Visitor, approved: boolean) {
    try {
      await apiPost(`/api/visitors/${visitor.id}/security-approve`, { operatorId: currentUser?.id, approved, reason: approved ? '' : '不予通行' })
      addNotification(approved ? '安保审批通过' : '安保审批未通过', approved ? 'success' : 'warning')
      fetchVisitors()
    } catch (err: any) {
      addNotification(err.message, 'error')
    }
  }

  const filteredVisitors = visitors.filter((v) => {
    if (filterStatus && v.status !== filterStatus) return false
    if (searchName && !v.name.includes(searchName)) return false
    return true
  })

  if (loading.visitors) {
    return <div className="space-y-4"><div className="h-10 bg-slate-200 rounded animate-pulse-custom" /><div className="h-64 bg-slate-200 rounded animate-pulse-custom" /></div>
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm w-52"
              placeholder="搜索访客姓名"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
            />
          </div>
          <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">全部状态</option>
            <option value="registered">已登记</option>
            <option value="id_verified">证件已审</option>
            <option value="security_approved">安保通过</option>
          </select>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-700 text-white rounded-lg text-sm hover:bg-teal-800">
          <UserPlus className="w-4 h-4" />
          添加访客
        </button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-medium text-slate-600">姓名</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">公司</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">证件类型</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">来访目的</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredVisitors.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-slate-400">暂无访客记录</td></tr>
            ) : (
              filteredVisitors.map((v) => (
                <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{v.name}</td>
                  <td className="px-4 py-3 text-slate-600">{v.company || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{v.id_type || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{v.purpose || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs badge-${v.status}`}>
                      {statusLabels[v.status] || v.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {currentRole === 'frontdesk' && v.status === 'registered' && (
                        <button onClick={() => handleVerifyId(v, true)} className="flex items-center gap-1 px-2 py-1 text-xs bg-teal-50 text-teal-700 rounded hover:bg-teal-100">
                          <CheckCircle className="w-3 h-3" /> 证件审核
                        </button>
                      )}
                      {currentRole === 'frontdesk' && v.status === 'id_verified' && (
                        <button onClick={() => handleSecurityApprove(v, true)} className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-50 text-amber-700 rounded hover:bg-amber-100">
                          <Shield className="w-3 h-3" /> 安保审批
                        </button>
                      )}
                      {currentRole === 'admin' && v.status === 'registered' && (
                        <button onClick={() => handleVerifyId(v, true)} className="flex items-center gap-1 px-2 py-1 text-xs bg-teal-50 text-teal-700 rounded hover:bg-teal-100">
                          <CheckCircle className="w-3 h-3" /> 证件审核
                        </button>
                      )}
                      {currentRole === 'admin' && v.status === 'id_verified' && (
                        <button onClick={() => handleSecurityApprove(v, true)} className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-50 text-amber-700 rounded hover:bg-amber-100">
                          <Shield className="w-3 h-3" /> 安保审批
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && <AddVisitorModal onSubmit={handleAddVisitor} onClose={() => setShowModal(false)} />}
    </div>
  )
}

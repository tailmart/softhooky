import React, { useState, useEffect } from 'react'
import { Loader2, Users, DollarSign, CheckCircle, XCircle, Upload, Clock } from 'lucide-react'

interface Agent {
  id: number
  email: string
  credits: number
  commission_balance: number
  is_agent: number
  is_enabled: number
  created_at: string
  customer_count: number
  total_commission: number
}

interface WithdrawRequest {
  id: number
  agent_id: number
  agent_email: string
  amount: number
  status: string
  remark: string | null
  created_at: string
  processed_at: string | null
  account_type: string | null
  account_id: string | null
  proof_image_url: string | null
}

interface AgentManagePageProps {
  token: string
}

export default function AgentManagePage({ token }: AgentManagePageProps) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [withdraws, setWithdraws] = useState<WithdrawRequest[]>([])
  const [applications, setApplications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'agents' | 'withdraws' | 'applications'>('agents')
  const [pendingCount, setPendingCount] = useState(0)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [pendingProofs, setPendingProofs] = useState<Record<number, string>>({})

  useEffect(() => {
    loadAgents()
    loadWithdraws()
    loadApplications()
  }, [])

  const fetchApi = async (url: string) => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    return res.json()
  }

  const postApi = async (url: string, body: any) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    })
    return res.json()
  }

  const loadAgents = async () => {
    try {
      const data = await fetchApi('/api/admin/agents')
      if (data.success) setAgents(data.agents || [])
    } catch (err) {
      console.error('Failed to load agents:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadWithdraws = async () => {
    try {
      const data = await fetchApi('/api/admin/withdraws')
      if (data.success) {
        setWithdraws(data.requests || [])
        setPendingCount(data.pendingCount || 0)
      }
    } catch (err) {
      console.error('Failed to load withdraws:', err)
    }
  }

  const loadApplications = async () => {
    try {
      const data = await fetchApi('/api/admin/agent-applications')
      if (data.success) setApplications(data.data || [])
    } catch {}
  }

  const approveApplication = async (id: number) => {
    const data = await postApi(`/api/admin/agents/${id}/toggle`, { isAgent: true })
    if (data.success) {
      loadApplications()
      loadAgents()
    } else {
      alert(data.message || '操作失败')
    }
  }

  const rejectApplication = async (id: number) => {
    await postApi(`/api/admin/users/${id}/toggle`, { isEnabled: false })
    loadApplications()
  }

  const toggleAgent = async (id: number, isAgent: boolean) => {
    const data = await postApi(`/api/admin/agents/${id}/toggle`, { isAgent })
    if (data.success) {
      loadAgents()
    } else {
      alert(data.message || '操作失败')
    }
  }

  const processWithdraw = async (id: number, status: string) => {
    if (status === 'done' && pendingProofs[id]) {
      const ok = await doUploadProof(id, pendingProofs[id])
      if (!ok) { alert('凭证上传失败'); return }
    }
    const remark = status === 'rejected' ? prompt('请输入拒绝原因（可选）:') : ''
    if (status === 'rejected' && remark === null) return
    const data = await postApi(`/api/admin/withdraws/${id}/process`, { status, remark: remark || undefined })
    if (data.success) {
      loadWithdraws()
      loadAgents()
    } else {
      alert(data.message || '处理失败')
    }
  }

  const deleteProof = async (id: number) => {
    if (!confirm('确定删除凭证？')) return
    const data = await postApi(`/api/admin/withdraws/${id}/delete-proof`, {})
    if (data.success) loadWithdraws()
  }

  const selectProof = (id: number) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (event) => {
        const base64 = event.target?.result as string
        setPendingProofs(prev => ({ ...prev, [id]: base64 }))
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const doUploadProof = async (id: number, base64: string): Promise<boolean> => {
    const data = await postApi(`/api/admin/withdraws/${id}/upload-proof`, { imageBase64: base64 })
    if (data.success) {
      setPendingProofs(prev => { const n = { ...prev }; delete n[id]; return n })
      return true
    }
    return false
  }

  const formatCurrency = (n: number) => `¥${Number(n).toFixed(2)}`

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-[#6366F1]" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#1A1D21]">代理管理</h1>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('agents')}
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'agents' ? 'bg-[#6366F1] text-white shadow-lg shadow-[#6366F1]/25' : 'bg-white text-[#5E6268] hover:bg-gray-50 border border-[#E8ECF0]'
          }`}
        >
          <Users size={16} />
          代理列表
        </button>
        <button
          onClick={() => setActiveTab('withdraws')}
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'withdraws' ? 'bg-[#6366F1] text-white shadow-lg shadow-[#6366F1]/25' : 'bg-white text-[#5E6268] hover:bg-gray-50 border border-[#E8ECF0]'
          }`}
        >
          <DollarSign size={16} />
          提现审核
          {pendingCount > 0 && (
            <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingCount}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('applications')}
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'applications' ? 'bg-[#6366F1] text-white shadow-lg shadow-[#6366F1]/25' : 'bg-white text-[#5E6268] hover:bg-gray-50 border border-[#E8ECF0]'
          }`}
        >
          <Clock size={16} />
          待审核
          {applications.length > 0 && (
            <span className="bg-yellow-500 text-white text-xs px-1.5 py-0.5 rounded-full">{applications.length}</span>
          )}
        </button>
      </div>

      {/* Agent List */}
      {activeTab === 'agents' && (
        <div className="bg-white rounded-2xl border border-[#E8ECF0] overflow-hidden">
          {agents.length === 0 ? (
            <div className="p-12 text-center text-[#5E6268]">暂无代理</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E8ECF0] bg-[#F8F9FA]">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#5E6268] uppercase tracking-wider">代理</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#5E6268] uppercase tracking-wider">客户数</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#5E6268] uppercase tracking-wider">累计佣金</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#5E6268] uppercase tracking-wider">可提现佣金</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#5E6268] uppercase tracking-wider">状态</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-[#5E6268] uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8ECF0]">
                {agents.map(agent => (
                  <tr key={agent.id} className="hover:bg-[#F8F9FA] transition-colors">
                    <td className="px-5 py-4">
                      <div>
                        <p className="text-sm font-medium text-[#1A1D21]">{agent.email}</p>
                        <p className="text-xs text-[#5E6268] mt-0.5">ID: {agent.id} · 注册于 {new Date(agent.created_at).toLocaleDateString('zh-CN')}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-[#1A1D21]">{agent.customer_count}</td>
                    <td className="px-5 py-4 text-sm text-[#1A1D21]">{formatCurrency(agent.total_commission)}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-green-600">{formatCurrency(agent.commission_balance)}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        agent.is_agent ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {agent.is_agent ? '代理' : '关闭'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => toggleAgent(agent.id, !agent.is_agent)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          agent.is_agent
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        }`}
                      >
                        {agent.is_agent ? '关闭代理' : '开启代理'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Pending Applications */}
      {activeTab === 'applications' && (
        <div className="bg-white rounded-2xl border border-[#E8ECF0] overflow-hidden">
          {applications.length === 0 ? (
            <div className="p-12 text-center text-[#5E6268]">暂无待审核申请</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E8ECF0] bg-[#F8F9FA]">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#5E6268] uppercase">用户</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#5E6268] uppercase">注册时间</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-[#5E6268] uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8ECF0]">
                {applications.map((a: any) => (
                  <tr key={a.id} className="hover:bg-[#F8F9FA] transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center text-sm">⏳</span>
                        <div>
                          <p className="text-sm font-medium text-[#1A1D21]">{a.email}</p>
                          <p className="text-xs text-[#9CA3AF]">ID: {a.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-[#5E6268]">{new Date(a.created_at).toLocaleString('zh-CN')}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => approveApplication(a.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all flex items-center gap-1">
                          <CheckCircle size={14} /> 批准
                        </button>
                        <button onClick={() => rejectApplication(a.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-all flex items-center gap-1">
                          <XCircle size={14} /> 拒绝
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Withdraw Management */}
      {activeTab === 'withdraws' && (
        <div className="bg-white rounded-2xl border border-[#E8ECF0] overflow-hidden">
          {withdraws.length === 0 ? (
            <div className="p-12 text-center text-[#5E6268]">暂无提现申请</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E8ECF0] bg-[#F8F9FA]">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#5E6268] uppercase tracking-wider">代理</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#5E6268] uppercase tracking-wider">金额</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#5E6268] uppercase tracking-wider">账号</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#5E6268] uppercase tracking-wider">状态</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#5E6268] uppercase tracking-wider">凭证</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#5E6268] uppercase tracking-wider">申请时间</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-[#5E6268] uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8ECF0]">
                {withdraws.map(w => (
                  <tr key={w.id} className="hover:bg-[#F8F9FA] transition-colors">
                    <td className="px-5 py-4 text-sm text-[#1A1D21]">{w.agent_email}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-[#1A1D21]">{formatCurrency(w.amount)}</td>
                    <td className="px-5 py-4 text-xs text-[#5E6268] max-w-[120px] truncate">
                      {w.account_id ? <span title={`${w.account_type === 'wechat' ? '微信' : '支付宝'}: ${w.account_id}`}>
                        <img src={w.account_type === 'wechat' ? '/wx.png' : '/zfb.png'} className="w-4 h-4 inline-block align-text-bottom" alt="" /> {w.account_id}
                      </span> : '-'}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        w.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        w.status === 'done' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {w.status === 'pending' ? '待处理' : w.status === 'done' ? '已完成' : '已拒绝'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-2">
                        {pendingProofs[w.id] ? (
                          <>
                            <div className="w-14 h-14 rounded-lg overflow-hidden border border-dashed border-indigo-400 flex-shrink-0 relative">
                              <img src={pendingProofs[w.id]} alt="待上传凭证" className="w-full h-full object-cover opacity-70" />
                              <div className="absolute inset-0 flex items-center justify-center bg-indigo-500/10 text-[10px] text-indigo-600 font-medium">待上传</div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <button onClick={() => selectProof(w.id)}
                                className="text-[10px] text-indigo-500 hover:text-indigo-700">重选</button>
                              <button onClick={() => setPendingProofs(prev => { const n = { ...prev }; delete n[w.id]; return n })}
                                className="text-[10px] text-red-400 hover:text-red-600">取消</button>
                            </div>
                          </>
                        ) : w.proof_image_url ? (
                          <>
                            <button onClick={() => setPreviewImg(w.proof_image_url)}
                              className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 hover:border-indigo-400 hover:shadow-md transition-all flex-shrink-0">
                              <img src={w.proof_image_url} alt="凭证" className="w-full h-full object-cover" />
                            </button>
                            <div className="flex flex-col gap-1">
                              <button onClick={() => selectProof(w.id)}
                                className="text-[10px] text-indigo-500 hover:text-indigo-700">重新上传</button>
                              {w.status === 'pending' && (
                                <button onClick={() => deleteProof(w.id)}
                                  className="text-[10px] text-red-400 hover:text-red-600">删除</button>
                              )}
                            </div>
                          </>
                        ) : w.status === 'pending' ? (
                          <button onClick={() => selectProof(w.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all">
                            <Upload size={12} /> 上传
                          </button>
                        ) : <span className="text-xs text-[#ccc]">-</span>}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-[#5E6268]">{new Date(w.created_at).toLocaleString('zh-CN')}</td>
                    <td className="px-5 py-4 text-right">
                      {w.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => processWithdraw(w.id, 'done')}
                            disabled={!w.proof_image_url}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                              w.proof_image_url
                                ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                            title={!w.proof_image_url ? '请先上传转账凭证' : '确认完成'}
                          >
                            <CheckCircle size={14} /> 完成
                          </button>
                          <button
                            onClick={() => processWithdraw(w.id, 'rejected')}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-all flex items-center gap-1"
                          >
                            <XCircle size={14} /> 拒绝
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-[#5E6268]">{w.remark || '-'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 凭证预览弹窗 */}
      {previewImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setPreviewImg(null)}>
          <div className="bg-white rounded-2xl max-w-lg mx-4 overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">转账凭证</h3>
              <button onClick={() => setPreviewImg(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
            </div>
            <div className="p-4">
              <img src={previewImg} alt="转账凭证" className="max-h-[60vh] w-auto mx-auto rounded-xl border border-gray-200" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

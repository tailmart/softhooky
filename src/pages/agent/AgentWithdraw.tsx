import React, { useState, useEffect } from 'react'
import api from '../../services/api'
import { Loader2, Wallet, DollarSign, X, ExternalLink } from 'lucide-react'

function getAuthHeaders() {
  const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const accountTypeLabel = (t: string) => t === 'wechat' ? '微信' : t === 'alipay' ? '支付宝' : t

export default function AgentWithdraw() {
  const [balance, setBalance] = useState(0)
  const [logs, setLogs] = useState<any[]>([])
  const [amount, setAmount] = useState('')
  const [accountType, setAccountType] = useState<'wechat' | 'alipay'>('wechat')
  const [accountId, setAccountId] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null)
  const [detailModal, setDetailModal] = useState<any | null>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      const [res1, res2] = await Promise.all([
        api.get('/api/agent/commission?page=1', { headers: getAuthHeaders() }),
        api.get('/api/agent/withdraw-logs', { headers: getAuthHeaders() })
      ])
      if (res1.data.success) setBalance(parseFloat(res1.data.balance) || 0)
      if (res2.data.success) setLogs(res2.data.data || [])
    } catch {}
    setLoading(false)
  }

  const handleWithdraw = async () => {
    const val = parseFloat(amount)
    if (!val || val <= 0) { setMessage({ type: 'error', text: '请输入有效金额' }); return }
    if (val > balance) { setMessage({ type: 'error', text: '余额不足' }); return }
    if (!accountId.trim()) { setMessage({ type: 'error', text: '请输入收款账号' }); return }
    setWithdrawing(true)
    setMessage(null)
    try {
      const res = await api.post('/api/agent/withdraw',
        { amount: val, accountType, accountId: accountId.trim() },
        { headers: getAuthHeaders() }
      )
      if (res.data.success) {
        setMessage({ type: 'success', text: res.data.message || '提现申请已提交' })
        setAmount(''); load()
      } else {
        setMessage({ type: 'error', text: res.data.message || '提现失败' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || '提现失败' })
    }
    setWithdrawing(false)
    setTimeout(() => setMessage(null), 4000)
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = { pending: 'bg-yellow-50 text-yellow-700', done: 'bg-green-50 text-green-700', rejected: 'bg-red-50 text-red-700' }
    const labels: Record<string, string> = { pending: '待处理', done: '已完成', rejected: '已拒绝' }
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] || 'bg-gray-100 text-gray-500'}`}>{labels[status] || status}</span>
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">提现</h1>

      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 text-white shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <span className="text-indigo-100 text-xs font-medium">可用佣金</span>
          <Wallet size={16} className="text-indigo-200" />
        </div>
        <p className="text-2xl font-bold">¥{balance.toFixed(2)}</p>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl text-sm ${
          message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-600'
        }`}>{message.text}</div>
      )}

      <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">提现金额</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="输入金额" max={balance} step="0.01"
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">收款方式</label>
          <div className="flex gap-3">
            <button type="button" onClick={() => setAccountType('wechat')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                accountType === 'wechat'
                  ? 'border-green-300 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}>
              <img src="/wx.png" className="w-5 h-5" alt="微信" /> 微信
            </button>
            <button type="button" onClick={() => setAccountType('alipay')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                accountType === 'alipay'
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}>
              <img src="/zfb.png" className="w-5 h-5" alt="支付宝" /> 支付宝
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">收款账号</label>
          <input type="text" value={accountId} onChange={e => setAccountId(e.target.value)}
            placeholder={accountType === 'wechat' ? '请输入微信号' : '请输入支付宝账号'}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300" />
          <p className="text-xs text-gray-400 mt-1.5">ℹ️ 站长将通过此账号进行转账，请仔细核对</p>
        </div>

        <button onClick={handleWithdraw} disabled={withdrawing || !amount}
          className="w-full py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
          {withdrawing ? <Loader2 size={16} className="animate-spin" /> : <DollarSign size={16} />}
          提交提现申请
        </button>
      </div>

      {logs.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">提现记录</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {logs.map(w => (
              <div key={w.id} className="px-5 py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">¥{Number(w.amount).toFixed(2)}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {w.account_type && accountTypeLabel(w.account_type)} · {w.account_id || ''} · {new Date(w.created_at).toLocaleString('zh-CN')}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {w.status === 'done' && w.proof_image_url && (
                    <button onClick={() => setDetailModal(w)}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                      <ExternalLink size={12} /> 详情
                    </button>
                  )}
                  {statusBadge(w.status)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 提现详情弹窗 */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetailModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm mx-4 overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">提现详情</h3>
              <button onClick={() => setDetailModal(null)} className="p-1 hover:bg-gray-100 rounded-lg transition-all">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">金额</span>
                <span className="font-semibold text-gray-900">¥{Number(detailModal.amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">状态</span>
                <span className="text-green-600 font-medium">已完成</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">收款方式</span>
                <span className="text-gray-900">{detailModal.account_type ? accountTypeLabel(detailModal.account_type) : '-'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">收款账号</span>
                <span className="text-gray-900">{detailModal.account_id || '-'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">申请时间</span>
                <span className="text-gray-900">{new Date(detailModal.created_at).toLocaleString('zh-CN')}</span>
              </div>
              {detailModal.processed_at && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">处理时间</span>
                  <span className="text-gray-900">{new Date(detailModal.processed_at).toLocaleString('zh-CN')}</span>
                </div>
              )}
              {detailModal.proof_image_url && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-2">站长转账凭证</p>
                  <img src={detailModal.proof_image_url} alt="转账凭证"
                    className="w-full max-h-64 object-contain rounded-xl border border-gray-200 bg-gray-50"
                    onClick={() => window.open(detailModal.proof_image_url, '_blank')}
                    style={{ cursor: 'pointer' }} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

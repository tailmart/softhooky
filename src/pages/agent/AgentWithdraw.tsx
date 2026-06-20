import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Loader2, Wallet, DollarSign, X, ExternalLink, CheckCircle, AlertCircle, Clock, Info } from 'lucide-react'

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
        axios.get('/api/agent/commission?page=1', { headers: getAuthHeaders() }),
        axios.get('/api/agent/withdraw-logs', { headers: getAuthHeaders() })
      ])
      if (res1.data.success) setBalance(parseFloat(res1.data.balance) || 0)
      if (res2.data.success) setLogs(res2.data.data || [])
    } catch {}
    setLoading(false)
  }

  const handleWithdraw = async () => {
    const val = parseFloat(amount)
    if (!val || val <= 0) { setMessage({ type: 'error', text: '请输入有效金额' }); return }
    if (val < 5) { setMessage({ type: 'error', text: '提现金额需满5元起' }); return }
    if (val > balance) { setMessage({ type: 'error', text: '余额不足' }); return }
    if (!accountId.trim()) { setMessage({ type: 'error', text: '请输入收款账号' }); return }
    setWithdrawing(true)
    setMessage(null)
    try {
      const res = await axios.post('/api/agent/withdraw',
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
    const map: Record<string, { class: string; icon: any }> = { 
      pending: { class: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Clock }, 
      done: { class: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle }, 
      rejected: { class: 'bg-red-50 text-red-700 border-red-200', icon: AlertCircle } 
    }
    const labels: Record<string, string> = { pending: '待处理', done: '已完成', rejected: '已拒绝' }
    const config = map[status] || { class: 'bg-gray-100 text-gray-500 border-gray-200', icon: Clock }
    const Icon = config.icon
    return (
      <span className={`text-xs px-2.5 py-1 rounded-full font-medium border flex items-center gap-1 ${config.class}`}>
        <Icon size={12} />
        {labels[status] || status}
      </span>
    )
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">申请提现</h1>
        <p className="text-sm text-gray-500 mt-1">将佣金余额提现至微信或支付宝</p>
      </div>

      {/* 余额卡片 */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-xl shadow-indigo-500/20">
        <div className="flex items-center justify-between mb-3">
          <span className="text-indigo-100 text-sm font-medium">可用佣金</span>
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <Wallet size={20} className="text-white" />
          </div>
        </div>
        <p className="text-3xl font-bold">¥{balance.toFixed(2)}</p>
        <p className="text-indigo-200 text-xs mt-2">满5元即可申请提现</p>
      </div>

      {/* 提示消息 */}
      {message && (
        <div className={`px-5 py-4 rounded-xl text-sm flex items-center gap-3 ${
          message.type === 'success' 
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' 
            : 'bg-red-50 border border-red-200 text-red-600'
        }`}>
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          {message.text}
        </div>
      )}

      {/* 提现表单 */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-5">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
            <DollarSign size={16} className="text-indigo-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">提现信息</h3>
        </div>

        {/* 提现规则 */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Info size={16} className="text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-800">提现规则</p>
              <p className="text-sm text-amber-600 mt-0.5">佣金余额满 <span className="font-bold">5元</span> 起可申请提现，站长将在24小时内处理</p>
            </div>
          </div>
        </div>

        {/* 提现金额 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">提现金额</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">¥</span>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00" max={balance} min="5" step="0.01"
              className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 shadow-sm" />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">最低提现金额：¥5.00</p>
        </div>

        {/* 收款方式 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">收款方式</label>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setAccountType('wechat')}
              className={`flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl border-2 text-sm font-medium transition-all ${
                accountType === 'wechat'
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700 shadow-sm'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}>
              <img src="/wx.png" className="w-5 h-5" alt="微信" /> 微信
            </button>
            <button type="button" onClick={() => setAccountType('alipay')}
              className={`flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl border-2 text-sm font-medium transition-all ${
                accountType === 'alipay'
                  ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-sm'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}>
              <img src="/zfb.png" className="w-5 h-5" alt="支付宝" /> 支付宝
            </button>
          </div>
        </div>

        {/* 收款账号 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">收款账号</label>
          <input type="text" value={accountId} onChange={e => setAccountId(e.target.value)}
            placeholder={accountType === 'wechat' ? '请输入微信号' : '请输入支付宝账号'}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 shadow-sm" />
          <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
            <Info size={12} />
            站长将通过此账号进行转账，请仔细核对
          </p>
        </div>

        {/* 提交按钮 */}
        <button onClick={handleWithdraw} disabled={withdrawing || !amount || parseFloat(amount) < 5}
          className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25">
          {withdrawing ? <Loader2 size={16} className="animate-spin" /> : <DollarSign size={16} />}
          提交提现申请
        </button>
      </div>

      {/* 提现记录 */}
      {logs.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700">提现记录</h3>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {logs.map(w => (
              <div key={w.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-gray-900">¥{Number(w.amount).toFixed(2)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {w.account_type && accountTypeLabel(w.account_type)} · {w.account_id || ''} · {new Date(w.created_at).toLocaleString('zh-CN')}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  {w.status === 'done' && w.proof_image_url && (
                    <button onClick={() => setDetailModal(w)}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 px-2.5 py-1 bg-indigo-50 rounded-lg">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDetailModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm mx-4 overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">提现详情</h3>
              <button onClick={() => setDetailModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-all">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">金额</span>
                <span className="font-bold text-gray-900">¥{Number(detailModal.amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">状态</span>
                <span className="text-emerald-600 font-medium">已完成</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">收款方式</span>
                <span className="text-gray-900">{detailModal.account_type ? accountTypeLabel(detailModal.account_type) : '-'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">收款账号</span>
                <span className="text-gray-900">{detailModal.account_id || '-'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">申请时间</span>
                <span className="text-gray-900">{new Date(detailModal.created_at).toLocaleString('zh-CN')}</span>
              </div>
              {detailModal.processed_at && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">处理时间</span>
                  <span className="text-gray-900">{new Date(detailModal.processed_at).toLocaleString('zh-CN')}</span>
                </div>
              )}
              {detailModal.proof_image_url && (
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2">站长转账凭证</p>
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

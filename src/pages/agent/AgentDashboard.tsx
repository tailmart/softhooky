import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Loader2, Wallet, TrendingUp, Users, Copy, Check, RefreshCw, Shield } from 'lucide-react'

function getAuthHeaders() {
  const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AgentDashboard() {
  const [balance, setBalance] = useState(0)
  const [totalCommission, setTotalCommission] = useState(0)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [customerCount, setCustomerCount] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isAgent, setIsAgent] = useState<boolean | null>(null)
  const [appliedAgent, setAppliedAgent] = useState(false)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    checkAgent().then(() => loadAll())
  }, [])

  const checkAgent = async () => {
    try {
      const res = await axios.get('/api/auth/me', { headers: getAuthHeaders() })
      if (res.data.success) {
        setIsAgent(!!res.data.user.is_agent)
        setAppliedAgent(!!res.data.user.applied_agent)
        sessionStorage.setItem('user', JSON.stringify(res.data.user))
      }
    } catch { setIsAgent(false) }
  }

  const handleApply = async () => {
    setApplying(true)
    try {
      const res = await axios.post('/api/agent/apply', {}, { headers: getAuthHeaders() })
      if (res.data.success) {
        setAppliedAgent(true)
      } else {
        alert(res.data.message || '申请失败')
      }
    } catch (err: any) {
      alert(err.response?.data?.message || '申请失败')
    }
    setApplying(false)
  }

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([loadCommission(), loadInviteCodes(), loadCustomers()])
    setLoading(false)
  }

  const loadCommission = async () => {
    try {
      const res = await axios.get('/api/agent/commission?page=1', { headers: getAuthHeaders() })
      if (res.data.success) {
        setBalance(parseFloat(res.data.balance) || 0)
        setTotalCommission(parseFloat(res.data.totalCommission) || 0)
      }
    } catch {}
  }

  const loadInviteCodes = async () => {
    try {
      const res = await axios.get('/api/agent/invite-codes', { headers: getAuthHeaders() })
      if (res.data.success && res.data.data?.length > 0) {
        const unused = res.data.data.find((c: any) => !c.used_at)
        if (unused) setInviteCode(unused.code)
      }
    } catch {}
  }

  const loadCustomers = async () => {
    try {
      const res = await axios.get('/api/agent/customers?page=1', { headers: getAuthHeaders() })
      if (res.data.success) setCustomerCount(res.data.total || 0)
    } catch {}
  }

  const generateInviteCode = async () => {
    setGenerating(true)
    try {
      const res = await axios.post('/api/agent/invite-code', {}, { headers: getAuthHeaders() })
      if (res.data.success) setInviteCode(res.data.code)
    } catch {}
    setGenerating(false)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getInviteLink = () => `${window.location.origin}/?code=${inviteCode}`

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
  }

  if (isAgent === false) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-gray-900">概览</h1>
        <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield size={28} className="text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">您还不是代理</h2>
          <p className="text-sm text-gray-400 mb-6">
            {appliedAgent ? '您的申请已提交，请等待管理员审核' : '申请成为代理后即可邀请客户赚取佣金'}
          </p>
          {appliedAgent ? (
            <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-yellow-50 text-yellow-700 rounded-xl text-sm font-medium border border-yellow-200">
              ⏳ 审核中
            </div>
          ) : (
            <button onClick={handleApply} disabled={applying}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-600 transition-all disabled:opacity-50">
              {applying ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
              申请成为代理
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">概览</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 text-white shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-indigo-100 text-xs font-medium">可用佣金</span>
            <Wallet size={16} className="text-indigo-200" />
          </div>
          <p className="text-2xl font-bold">¥{balance.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-xs font-medium">累计佣金</span>
            <TrendingUp size={16} className="text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">¥{totalCommission.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-xs font-medium">客户数</span>
            <Users size={16} className="text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{customerCount}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">推广邀请</h3>
        {inviteCode ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                <code className="text-base font-bold text-indigo-600 tracking-wider">{inviteCode}</code>
              </div>
              <button onClick={() => copyToClipboard(inviteCode)}
                className="p-3 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all">
                {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} className="text-gray-400" />}
              </button>
              <button onClick={generateInviteCode} disabled={generating}
                className="p-3 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all">
                <RefreshCw size={18} className={`text-gray-400 ${generating ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <button onClick={() => copyToClipboard(getInviteLink())}
              className="text-sm text-indigo-600 hover:text-indigo-700">
              复制推广链接 →
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-400">暂无邀请码，请点击右上角刷新重新生成</p>
        )}
      </div>
    </div>
  )
}

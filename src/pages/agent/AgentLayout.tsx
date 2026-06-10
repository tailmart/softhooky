import React, { useState, useEffect } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Shield, DollarSign, Users, History, Wallet, LogOut, ArrowLeft, Loader2 } from 'lucide-react'
import axios from 'axios'

function getAuthHeaders() {
  const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AgentLayout({ onLogout }: { onLogout?: () => void }) {
  const location = useLocation()
  const [isAgent, setIsAgent] = useState<boolean | null>(null)
  const [appliedAgent, setAppliedAgent] = useState(false)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    axios.get('/api/auth/me', { headers: getAuthHeaders() })
      .then(res => {
        setIsAgent(!!res.data.user?.is_agent)
        setAppliedAgent(!!res.data.user?.applied_agent)
      })
      .catch(() => { setIsAgent(false) })
  }, [])

  const handleApply = async () => {
    setApplying(true)
    try {
      const res = await axios.post('/api/agent/apply', {}, { headers: getAuthHeaders() })
      if (res.data.success) setAppliedAgent(true)
      else alert(res.data.message || '申请失败')
    } catch (err: any) {
      alert(err.response?.data?.message || '申请失败')
    }
    setApplying(false)
  }

  const NavLink = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => {
    const isActive = location.pathname === to
    return (
      <Link
        to={to}
        className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
          isActive
            ? 'bg-indigo-50 text-indigo-700 font-semibold'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        <Icon size={18} />
        <span className="text-sm">{label}</span>
      </Link>
    )
  }

  const goToApp = () => { window.location.href = '/' }

  // 非代理用户禁止访问所有页面
  if (isAgent === false) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm">
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
            <div className="flex items-center justify-center gap-3">
              <button onClick={handleApply} disabled={applying}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-600 transition-all disabled:opacity-50">
                {applying ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
                申请成为代理
              </button>
              <a href="/"
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                返回
              </a>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (isAgent === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-indigo-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 侧边栏 */}
      <aside className="fixed left-0 top-0 w-56 h-screen bg-white border-r border-gray-200 flex flex-col z-50">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-sm">
              <Shield size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900">代理中心</h1>
              <p className="text-[10px] text-gray-400">Agent Dashboard</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <NavLink to="/agent" icon={LayoutDashboard} label="概览" />
          <NavLink to="/agent/pricing" icon={DollarSign} label="定价管理" />
          <NavLink to="/agent/invite-codes" icon={Shield} label="邀请码" />
          <NavLink to="/agent/customers" icon={Users} label="我的客户" />
          <NavLink to="/agent/commission" icon={History} label="佣金明细" />
          <NavLink to="/agent/withdraw" icon={Wallet} label="提现" />
        </nav>

        <div className="p-3 border-t border-gray-100 space-y-1">
          <button onClick={goToApp}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-all">
            <ArrowLeft size={16} />
            返回主应用
          </button>
          {onLogout && (
            <button onClick={onLogout}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
              <LogOut size={16} />
              退出
            </button>
          )}
        </div>
      </aside>

      {/* 主内容 */}
      <main className="ml-56 flex-1">
        <div className="max-w-5xl mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Loader2, Users, Search, ChevronLeft, ChevronRight } from 'lucide-react'

function getAuthHeaders() {
  const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const PAGE_SIZE = 20

export default function AgentCustomers() {
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => { loadCustomers() }, [page])

  const loadCustomers = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`/api/agent/customers?page=${page}&pageSize=${PAGE_SIZE}`, { headers: getAuthHeaders() })
      if (res.data.success) {
        setCustomers(res.data.customers || [])
        setTotal(res.data.total || 0)
      }
    } catch {}
    setLoading(false)
  }

  const filtered = searchQuery
    ? customers.filter(c => c.email.toLowerCase().includes(searchQuery.toLowerCase()))
    : customers

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">我的客户</h1>
        <p className="text-sm text-gray-500 mt-1">管理您的邀请客户</p>
      </div>

      {/* 搜索框 */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="搜索客户邮箱..." value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 shadow-sm" />
      </div>

      {/* 客户列表 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users size={32} className="text-gray-300" />
            </div>
            <p className="text-gray-500 font-medium">暂无客户</p>
            <p className="text-gray-400 text-sm mt-1">分享您的邀请码邀请客户注册</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(c => (
              <div key={c.id} className="px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl flex items-center justify-center">
                    <span className="text-sm font-bold text-indigo-600">{c.email?.[0]?.toUpperCase() || 'U'}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{c.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(c.created_at).toLocaleDateString('zh-CN')} 注册</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-base font-semibold text-emerald-600">¥{Number(c.total_consumption || 0).toFixed(2)}</p>
                  <p className="text-xs text-gray-400">累计消费</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 分页 */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">共 {total} 位客户</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${p === page ? 'bg-indigo-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Loader2, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react'

function getAuthHeaders() {
  const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AgentCommission() {
  const [logs, setLogs] = useState<any[]>([])
  const [totalCommission, setTotalCommission] = useState(0)
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const pageSize = 20

  useEffect(() => { load(1) }, [])

  const load = async (p: number) => {
    setLoading(true)
    try {
      const res = await axios.get(`/api/agent/commission?page=${p}&pageSize=${pageSize}`, { headers: getAuthHeaders() })
      if (res.data.success) {
        setLogs(res.data.logs || [])
        setTotalCommission(parseFloat(res.data.totalCommission) || 0)
        setBalance(parseFloat(res.data.balance) || 0)
        setTotalPages(Math.ceil((res.data.total || 0) / pageSize))
        setPage(p)
      }
    } catch {}
    setLoading(false)
  }

  const sourceLabel = (s: string) => {
    const map: Record<string, string> = { consume: '消费佣金', recharge: '充值佣金', gift: '赠送' }
    return map[s] || s
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">佣金明细</h1>
        <p className="text-sm text-gray-500 mt-1">查看您的佣金收益记录</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
              <TrendingUp size={24} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">累计佣金</p>
              <p className="text-2xl font-bold text-gray-900">¥{totalCommission.toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
              <TrendingUp size={24} className="text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">可提现余额</p>
              <p className="text-2xl font-bold text-gray-900">¥{balance.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 佣金明细表格 */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        {logs.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">暂无记录</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-5 py-3 font-medium text-gray-500">类型</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500">用户</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-500">金额</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-500">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {sourceLabel(log.source)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-700">{log.user_email || '-'}</td>
                      <td className={`px-5 py-4 text-right font-semibold ${log.amount > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {log.amount > 0 ? '+' : ''}¥{Number(log.amount).toFixed(2)}
                      </td>
                      <td className="px-5 py-4 text-right text-gray-400 text-xs whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('zh-CN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                <span className="text-xs text-gray-400">共 {totalPages} 页</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => load(page - 1)}
                    disabled={page <= 1}
                    className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (page <= 3) {
                      pageNum = i + 1
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = page - 2 + i
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => load(pageNum)}
                        className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                          pageNum === page
                            ? 'bg-indigo-500 text-white'
                            : 'text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => load(page + 1)}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

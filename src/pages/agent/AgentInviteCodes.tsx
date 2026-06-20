import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Loader2, Copy, Check, RefreshCw, Shield, Link2, Clock } from 'lucide-react'

function getAuthHeaders() {
  const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AgentInviteCodes() {
  const [codes, setCodes] = useState<any[]>([])
  const [currentCode, setCurrentCode] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadCodes() }, [])

  const loadCodes = async () => {
    try {
      const res = await axios.get('/api/agent/invite-codes', { headers: getAuthHeaders() })
      if (res.data.success) {
        setCodes(res.data.data || [])
        const latest = res.data.data[0]
        if (latest) setCurrentCode(latest.code)
      }
    } catch {}
    setLoading(false)
  }

  const generate = async () => {
    setGenerating(true)
    try {
      const res = await axios.post('/api/agent/invite-code', {}, { headers: getAuthHeaders() })
      if (res.data.success) { setCurrentCode(res.data.code); loadCodes() }
    } catch {}
    setGenerating(false)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getInviteLink = () => `${window.location.origin}/?code=${currentCode}`

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">邀请码管理</h1>
        <p className="text-sm text-gray-500 mt-1">生成和管理您的邀请码</p>
      </div>

      {/* 当前邀请码卡片 */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
            <Shield size={16} className="text-indigo-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">当前邀请码</h3>
        </div>
        {currentCode ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl px-5 py-4 border border-indigo-100">
                <p className="text-xs text-indigo-500 mb-1">邀请码</p>
                <code className="text-xl font-bold text-indigo-700 tracking-widest">{currentCode}</code>
              </div>
              <button onClick={() => copyToClipboard(currentCode)}
                className="p-3.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-all shadow-md shadow-indigo-500/25">
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
              <button onClick={generate} disabled={generating}
                className="p-3.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all">
                <RefreshCw size={18} className={`text-gray-500 ${generating ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-200">
                <code className="text-xs text-gray-500 truncate block">{getInviteLink()}</code>
              </div>
              <button onClick={() => copyToClipboard(getInviteLink())}
                className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm">
                复制链接
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Shield size={32} className="text-indigo-300" />
            </div>
            <p className="text-gray-500 mb-4">暂无邀请码</p>
            <button onClick={generate} disabled={generating}
              className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-all shadow-md shadow-indigo-500/25">
              {generating ? '生成中...' : '生成邀请码'}
            </button>
          </div>
        )}
      </div>

      {/* 历史记录 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">历史记录</h3>
          </div>
        </div>
        {codes.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-sm">暂无记录</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {codes.map((c, i) => (
              <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Link2 size={14} className="text-gray-500" />
                  </div>
                  <code className="text-sm font-mono text-gray-700">{c.code}</code>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 font-medium">
                    已使用 {c.used_count || 0} 次
                  </span>
                  <span className="text-xs text-gray-400">{new Date(c.expires_at).toLocaleDateString('zh-CN')} 过期</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

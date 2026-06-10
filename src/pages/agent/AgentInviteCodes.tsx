import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Loader2, Copy, Check, RefreshCw } from 'lucide-react'

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
        const unused = res.data.data.find((c: any) => !c.used_at)
        if (unused) setCurrentCode(unused.code)
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
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">邀请码</h1>

      <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">当前邀请码</h3>
        {currentCode ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                <code className="text-base font-bold text-indigo-600 tracking-wider">{currentCode}</code>
              </div>
              <button onClick={() => copyToClipboard(currentCode)}
                className="p-3 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all">
                {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} className="text-gray-400" />}
              </button>
              <button onClick={generate} disabled={generating}
                className="p-3 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all">
                <RefreshCw size={18} className={`text-gray-400 ${generating ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-xs text-gray-400">邀请链接：</p>
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
              <code className="flex-1 text-xs text-gray-500 truncate">{getInviteLink()}</code>
              <button onClick={() => copyToClipboard(getInviteLink())}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium whitespace-nowrap">复制</button>
            </div>
          </div>
        ) : (
          <button onClick={generate} disabled={generating}
            className="px-5 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-600 transition-all disabled:opacity-50">
            {generating ? '生成中...' : '生成邀请码'}
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">历史记录</h3>
        </div>
        {codes.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">暂无记录</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {codes.map((c, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between">
                <code className="text-sm font-mono text-gray-700">{c.code}</code>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    c.used_at ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-600'
                  }`}>{c.used_at ? '已使用' : '未使用'}</span>
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

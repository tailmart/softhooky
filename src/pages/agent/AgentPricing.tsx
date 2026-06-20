import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Loader2, Save, DollarSign, Info, CheckCircle, AlertCircle } from 'lucide-react'

function getAuthHeaders() {
  const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AgentPricing() {
  const [pricing, setPricing] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      const [defaultRes, agentRes] = await Promise.all([
        axios.get('/api/pricing'),
        axios.get('/api/agent/pricing', { headers: getAuthHeaders() })
      ])
      const defaultPricing = defaultRes.data.success ? defaultRes.data.data : {}
      const customPricing = agentRes.data.success ? agentRes.data.data : {}
      // 名称映射表
      const nameMap: Record<string, string> = {}
      if (agentRes.data?.config) {
        for (const c of agentRes.data.config) {
          nameMap[c.key] = c.name
        }
      }
      const list = Object.entries(defaultPricing).map(([key, price]) => ({
        key,
        name: nameMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        price: customPricing[key] || price as number,
        defaultPrice: price as number,
      }))
      setPricing(list)
    } catch {}
    setLoading(false)
  }

  const updatePrice = (key: string, price: number) => {
    setPricing(prev => prev.map(item => item.key === key ? { ...item, price } : item))
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const map: Record<string, number> = {}
      pricing.forEach(item => { map[item.key] = item.price })
      const res = await axios.put('/api/agent/pricing', { pricing: map }, { headers: getAuthHeaders() })
      setMessage({ type: res.data.success ? 'success' : 'error', text: res.data.success ? '定价保存成功' : res.data.message || '保存失败' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || '保存失败' })
    }
    setSaving(false)
    setTimeout(() => setMessage(null), 3000)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">定价管理</h1>
          <p className="text-sm text-gray-500 mt-1">设置您的自定义售价</p>
        </div>
        <button onClick={save} disabled={saving}
          className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2 shadow-md shadow-indigo-500/25">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          保存定价
        </button>
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

      {/* 说明卡片 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
            <Info size={16} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-blue-800">定价说明</p>
            <p className="text-sm text-blue-600 mt-1">
              设置您的自定义售价。您的客户将看到您设置的价格，未设置的项目使用平台默认价格。
              <span className="font-medium"> 设置高于官方价的差额将作为您的佣金收入。</span>
            </p>
          </div>
        </div>
      </div>

      {/* 定价列表 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">服务项目</span>
            <span className="text-sm font-semibold text-gray-700">价格设置</span>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {pricing.map(item => (
            <div key={item.key} className="px-6 py-5 flex items-center justify-between gap-6 hover:bg-gray-50 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{item.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-400">官方价</span>
                  <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">¥{item.defaultPrice}</span>
                  {item.price > item.defaultPrice && (
                    <>
                      <span className="text-xs text-gray-400">→</span>
                      <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        +¥{(item.price - item.defaultPrice).toFixed(2)} 佣金
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base font-medium text-gray-400">¥</span>
                <input type="number" value={item.price}
                  onChange={e => updatePrice(item.key, Math.max(item.defaultPrice, parseFloat(e.target.value) || 0))}
                  step="0.01" min={item.defaultPrice}
                  className="w-28 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 text-right font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 shadow-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

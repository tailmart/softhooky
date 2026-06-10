import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Loader2, Save, DollarSign } from 'lucide-react'

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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">定价管理</h1>
        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-600 transition-all disabled:opacity-50 flex items-center gap-2">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          保存
        </button>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl text-sm ${
          message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-600'
        }`}>{message.text}</div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-700">
        设置你的自定义售价。你的客户将看到你设置的价格，未设置的项目使用平台默认价格。
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="divide-y divide-gray-100">
          {pricing.map(item => (
            <div key={item.key} className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  官方价 <span className="font-mono text-indigo-500">¥{item.defaultPrice}</span>
                  {item.price > item.defaultPrice && (
                    <span className="ml-2 text-emerald-500">+¥{(item.price - item.defaultPrice).toFixed(2)}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">¥</span>
                <input type="number" value={item.price}
                  onChange={e => updatePrice(item.key, Math.max(item.defaultPrice, parseFloat(e.target.value) || 0))}
                  step="0.01" min={item.defaultPrice}
                  className="w-24 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

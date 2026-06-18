import React, { useState, useEffect } from 'react'
import { Loader2, Save, DollarSign } from 'lucide-react'

interface PricingItem {
  id: number
  key: string
  name: string
  price: number
  enabled: number
}

interface PricingPageProps {
  token: string
}

export default function PricingPage({ token }: PricingPageProps) {
  const [pricing, setPricing] = useState<PricingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchPricing()
  }, [])

  const fetchPricing = async () => {
    try {
      const response = await fetch('/api/admin/pricing', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.success) {
        const list = data.data || [];
        setPricing(list);
      }
    } catch (error) {
      console.error('Failed to fetch pricing:', error)
    } finally {
      setLoading(false)
    }
  }

  const updatePrice = (key: string, newPrice: number) => {
    setPricing(prev => prev.map(item => (item.key === key ? { ...item, price: newPrice } : item)))
  }

  const updateEnabled = (key: string, enabled: boolean) => {
    setPricing(prev => prev.map(item => (item.key === key ? { ...item, enabled: enabled ? 1 : 0 } : item)))
  }

  const saveAll = async () => {
    setSaving(true)
    let hasError = false
    for (const item of pricing) {
      try {
        const res = await fetch(`/api/admin/pricing/${item.key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ price: item.price, enabled: item.enabled })
        })
        const data = await res.json()
        if (!data.success) hasError = true
      } catch { hasError = true }
    }
    setMessage({ type: hasError ? 'error' : 'success', text: hasError ? '部分保存失败' : '全部保存成功' })
    setTimeout(() => setMessage(null), 3000)
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-2 border-[#E8ECF0] border-t-[#6366F1] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1A1D21]">价格配置</h1>
        <p className="text-sm text-[#9CA3AF] mt-1">配置各功能的积分价格，统一保存后生效</p>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-2xl border ${
          message.type === 'success'
            ? 'bg-[#D1FAE5] text-[#047857] border-[#A7F3D0]'
            : 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]'
        }`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-3xl border border-[#E8ECF0] overflow-hidden shadow-sm">
        <table className="w-full">
          <thead className="bg-[#F8F9FA] border-b border-[#E8ECF0]">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">功能名称</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">配置键</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">价格（积分）</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8ECF0]">
            {pricing.map(item => (
              <tr key={item.key} className="hover:bg-[#F8F9FA] transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="font-semibold text-[#1A1D21]">{item.name}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <code className="text-sm bg-[#F8F9FA] px-3 py-1.5 rounded-xl text-[#5E6268] font-mono">{item.key}</code>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={item.price}
                      onChange={e => updatePrice(item.key, parseFloat(e.target.value) || 0)}
                      className="w-24 px-3 py-2 border border-[#E8ECF0] rounded-2xl focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] transition-all text-[#1A1D21] text-sm"
                    />
                    <span className="text-[#9CA3AF] text-sm">积分/次</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div
                    onClick={() => updateEnabled(item.key, item.enabled !== 1)}
                    className={`w-12 h-7 rounded-full cursor-pointer transition-all duration-300 flex items-center ${
                      item.enabled === 1 ? 'bg-gradient-to-r from-[#10B981] to-[#34D399]' : 'bg-[#E8ECF0]'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300 ${
                      item.enabled === 1 ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 底部保存栏 */}
      <div className="sticky bottom-0 mt-6 bg-white border border-[#E8ECF0] rounded-3xl p-5 flex items-center justify-between shadow-md">
        <span className="text-sm text-[#9CA3AF]">修改后点击保存全部生效</span>
        <button
          onClick={saveAll}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white rounded-2xl font-medium hover:shadow-lg hover:shadow-[#6366F1]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          全部保存
        </button>
      </div>

      <div className="mt-6 text-sm text-[#9CA3AF] space-y-1">
        <p>• 点击"全部保存"后统一生效</p>
        <p>• 禁用某功能后，该功能将无法使用</p>
        <p>• 积分扣除失败时，功能也将不可用</p>
      </div>
    </div>
  )
}

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ArrowLeft, Loader2, Save, DollarSign } from 'lucide-react';

const api = axios.create({ timeout: 60000 });

function getAuthHeaders() {
  const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface PricingItem {
  key: string;
  name: string;
  price: number;
  enabled: number;
}

export const AgentPricingPage: React.FC = () => {
  const [pricing, setPricing] = useState<PricingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [agentPricing, setAgentPricing] = useState<Record<string, number>>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load platform default pricing first
      const defaultRes = await api.get('/api/pricing');
      if (defaultRes.data.success) {
        const defaultPricing = defaultRes.data.data;
        // Load agent's current custom pricing
        const agentRes = await api.get('/api/agent/pricing', { headers: getAuthHeaders() });
        const customPricing: Record<string, number> = agentRes.data.success ? agentRes.data.data : {};
        setAgentPricing(customPricing);

        // Build the pricing list
        const list: PricingItem[] = Object.entries(defaultPricing).map(([key, price]) => ({
          key,
          name: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          price: customPricing[key] || (price as number),
          enabled: 1,
        }));
        setPricing(list);
      }
    } catch (err) {
      console.error('Failed to load pricing:', err);
    } finally {
      setLoading(false);
    }
  };

  const updatePrice = (key: string, newPrice: number) => {
    setPricing(prev => prev.map(item => (item.key === key ? { ...item, price: newPrice } : item)));
  };

  const savePricing = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const pricingMap: Record<string, number> = {};
      pricing.forEach(item => { pricingMap[item.key] = item.price; });
      const res = await api.put('/api/agent/pricing', { pricing: pricingMap }, { headers: getAuthHeaders() });
      if (res.data.success) {
        setMessage({ type: 'success', text: '定价保存成功！你的客户将看到更新后的价格。' });
        setAgentPricing(pricingMap);
      } else {
        setMessage({ type: 'error', text: res.data.message || '保存失败' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || '保存失败' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const goBack = () => { window.location.href = '/agent'; };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center h-14 gap-3">
            <button onClick={goBack} className="p-2 hover:bg-gray-100 rounded-xl transition-all">
              <ArrowLeft size={20} className="text-gray-600" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">定价管理</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Info Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-3xl p-4 text-sm text-blue-700">
          <p className="font-medium mb-1">设置你的自定义售价</p>
          <p className="text-blue-500">你的客户将在购买/使用时看到你设置的价格。未设置的项目将使用平台默认价格。</p>
        </div>

        {message && (
          <div className={`px-4 py-3 rounded-2xl text-sm ${
            message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-600'
          }`}>
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {pricing.map(item => (
              <div key={item.key} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{item.name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{item.key}</p>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign size={14} className="text-gray-400" />
                  <input
                    type="number"
                    value={item.price}
                    onChange={e => updatePrice(item.key, parseFloat(e.target.value) || 0)}
                    step="0.01"
                    min="0"
                    className="w-24 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={savePricing}
            disabled={saving}
            className="px-8 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-2xl font-semibold hover:shadow-lg hover:shadow-indigo-500/25 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            保存定价
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentPricingPage;

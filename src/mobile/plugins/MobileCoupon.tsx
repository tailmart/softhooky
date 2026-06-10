import React, { useState, useCallback } from 'react';
import { X, Loader2, Gift, Check, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { getAuthToken } from '../../services/authService';

interface MobileCouponProps { onBack: () => void; }

export const MobileCoupon: React.FC<MobileCouponProps> = ({ onBack }) => {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; credits?: number } | null>(null);

  const handleRedeem = useCallback(async () => {
    if (!code.trim()) return;
    setIsLoading(true); setResult(null);
    try {
      const token = getAuthToken();
      const res = await axios.post('/api/coupons/claim', { code: code.trim() }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.data.success) {
        setResult({ success: true, message: `兑换成功！获得 ${res.data.credits} 积分`, credits: res.data.credits });
        window.dispatchEvent(new Event('credits-updated'));
        setCode('');
      } else {
        setResult({ success: false, message: res.data.message || '兑换失败' });
      }
    } catch (err: any) {
      setResult({ success: false, message: err.response?.data?.message || '兑换失败，请检查券码' });
    } finally { setIsLoading(false); }
  }, [code]);

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#f0f0f0] bg-white flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f5f5f5] mobile-tap"><X size={16} className="text-[#737373]" /></button>
        <h1 className="text-base font-bold text-[#171717]">优惠券</h1>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-8 pb-8 space-y-6">
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-rose-100 to-rose-50 flex items-center justify-center mb-4">
              <Gift size={36} className="text-rose-500" />
            </div>
            <h2 className="text-lg font-bold text-[#171717]">兑换优惠券</h2>
            <p className="text-sm text-[#a3a3a3] mt-1">输入优惠券码兑换积分</p>
          </div>

          <div className="bg-white rounded-2xl border border-[#f0f0f0] p-2 flex items-center gap-2">
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="请输入优惠券码" maxLength={20}
              className="flex-1 px-3 py-3 text-sm text-[#171717] placeholder-[#bdbdbd] outline-none bg-transparent" />
            <button onClick={handleRedeem} disabled={!code.trim() || isLoading}
              className="px-5 py-2.5 bg-[#171717] text-white rounded-xl text-sm font-medium disabled:opacity-40 mobile-tap whitespace-nowrap">
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : '兑换'}
            </button>
          </div>

          {result && (
            <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${result.success ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
              {result.success ? <Check size={18} className="text-green-600" /> : <AlertTriangle size={18} className="text-red-500" />}
              <p className={`text-sm ${result.success ? 'text-green-700' : 'text-red-600'}`}>{result.message}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

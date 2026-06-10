import React, { useState, useEffect } from 'react';
import { Tag, X, Loader2, CheckCircle, Gift, Clock } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

interface CouponClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CouponClaimModal: React.FC<CouponClaimModalProps> = ({ isOpen, onClose }) => {
  const { refreshUser } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [claims, setClaims] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; expireDays?: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCode('');
      setResult(null);
      setShowHistory(false);
      fetchClaims();
    }
  }, [isOpen]);

  const fetchClaims = async () => {
    try {
      const token = sessionStorage.getItem('authToken');
      if (!token) return;
      const res = await axios.get('/api/coupons/claims', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClaims(res.data.data || []);
    } catch {}
  };

  const handleClaim = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const token = sessionStorage.getItem('authToken');
      if (!token) {
        setResult({ success: false, message: '请先登录' });
        return;
      }
      const res = await axios.post('/api/coupons/claim', { code: code.trim() }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setResult({
          success: true,
          message: res.data.message,
          expireDays: res.data.expire_days
        });
        refreshUser();
        window.dispatchEvent(new Event('credits-updated'));
        fetchClaims();
      }
    } catch (err: any) {
      setResult({
        success: false,
        message: err.response?.data?.message || '领取失败'
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-[420px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-7 pt-7 pb-5 bg-gradient-to-b from-[#FAFAFA] to-white border-b border-[#E5E5E5]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#171717] flex items-center justify-center shadow-sm">
                <Gift size={24} className="text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#171717]">领取优惠券</h2>
                <p className="text-sm text-[#737373]">输入优惠券码兑换积分</p>
              </div>
            </div>
            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-[#F5F5F5] transition-colors">
              <X size={20} className="text-[#A3A3A3]" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* 输入框 */}
          <div className="flex gap-3 mb-5">
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="输入优惠券码"
              maxLength={50}
              className="flex-1 px-5 py-3.5 bg-[#FAFAFA] border border-[#E5E5E5] rounded-xl text-base font-medium tracking-wider text-center uppercase focus:outline-none focus:ring-2 focus:ring-[#171717]/10 focus:border-[#A3A3A3] transition-all"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleClaim()}
            />
            <button
              onClick={handleClaim}
              disabled={loading || !code.trim()}
              className="px-6 py-3.5 bg-[#171717] text-white rounded-xl font-medium text-base hover:bg-[#27272A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[90px]"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : '领取'}
            </button>
          </div>

          {/* 结果提示 */}
          {result && (
            <div className={`mb-5 px-5 py-4 rounded-xl border text-sm ${
              result.success
                ? 'bg-[#FAFAFA] border-[#E5E5E5] text-[#171717]'
                : 'bg-red-50 border-red-200 text-red-600'
            }`}>
              <div className="flex items-start gap-3">
                {result.success ? <CheckCircle size={18} className="text-[#171717] mt-0.5 flex-shrink-0" /> : <X size={18} className="text-red-500 mt-0.5 flex-shrink-0" />}
                <div>
                  <p className="font-medium text-base">{result.message}</p>
                  {result.success && result.expireDays && (
                    <p className="text-sm mt-1 opacity-70 flex items-center gap-1.5">
                      <Clock size={14} />请在 <strong>{result.expireDays} 天</strong> 内用完，过期积分将自动失效
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 历史记录 */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-sm text-[#A3A3A3] hover:text-[#737373] transition-colors mb-4"
          >
            <Tag size={14} />
            已领取的记录 ({claims.length})
          </button>

          {showHistory && (
            <div className="space-y-2.5 max-h-[240px] overflow-y-auto">
              {claims.length === 0 ? (
                <p className="text-sm text-[#A3A3A3] text-center py-6">暂无领取记录</p>
              ) : (
                claims.map((c: any) => {
                  const isExpired = c.expired === 1;
                  const isActive = !isExpired && new Date(c.expires_at) > new Date();
                  return (
                    <div key={c.id} className="flex items-center justify-between px-4 py-3.5 bg-[#FAFAFA] rounded-xl">
                      <div>
                        <p className="text-sm font-semibold text-[#171717]">{c.code}</p>
                        <p className="text-xs text-[#A3A3A3] mt-0.5">
                          {new Date(c.claimed_at).toLocaleDateString()} · {c.expire_days}天有效
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-[#171717]">+{c.credits}</p>
                        <span className={`text-xs ${
                          isExpired ? 'text-red-400' : isActive ? 'text-[#171717]' : 'text-[#A3A3A3]'
                        }`}>
                          {isExpired ? '已过期' : isActive ? '有效中' : '待生效'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

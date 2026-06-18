import React, { useState, useEffect } from 'react';
import { X, Loader2, Coins, Check, Sparkles, Video, Film, Zap, Shield, Mail, FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getPricing } from '../../services/pricingService';

const PLANS = [
  { id: 'basic',    amount: 19.9,  credits: 20,  label: '基础版', tag: '入门首选', color: 'bg-gray-800' },
  { id: 'standard', amount: 39.9,  credits: 50,  label: '标准版', tag: '最受欢迎', color: 'bg-blue-600' },
  { id: 'premium',  amount: 69.9,  credits: 100, label: '高级版', tag: '性价比王', color: 'bg-purple-600' },
  { id: 'ultimate', amount: 99.9,  credits: 200, label: '旗舰版', tag: '量大管饱', color: 'bg-amber-600' },
];

interface MobileRechargeProps { onBack: () => void; }

export const MobileRecharge: React.FC<MobileRechargeProps> = ({ onBack }) => {
  const { user, refreshUser } = useAuth();
  const [credits, setCredits] = useState(user?.credits || 0);
  const [selectedPlan, setSelectedPlan] = useState('standard');
  const [customAmount, setCustomAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'wechat' | 'alipay'>('wechat');
  const [isLoading, setIsLoading] = useState(false);
  const [pricing, setPricing] = useState<Record<string, number>>({});

  // Load pricing
  useEffect(() => {
    getPricing().then(p => setPricing(p));
  }, []);

  // Sync credits from URL params (payment success return)
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    if (params.get('sync') === '1') {
      const syncCredits = async () => {
        try {
          const token = sessionStorage.getItem('authToken');
          if (!token) return;
          await fetch('/api/payment/sync-credits', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
          refreshUser();
          const r = await fetch('/api/auth/credits', { headers: { Authorization: `Bearer ${token}` } });
          const d = await r.json();
          if (d.success) {
            const u = JSON.parse(sessionStorage.getItem('user') || '{}');
            u.credits = d.credits;
            sessionStorage.setItem('user', JSON.stringify(u));
            setCredits(d.credits);
          }
        } catch {}
        window.location.hash = '';
      };
      syncCredits();
    }
  }, [refreshUser]);

  // Poll payment status
  useEffect(() => {
    const paymentAmount = sessionStorage.getItem('paymentAmount');
    const paymentOrderId = sessionStorage.getItem('paymentOrderId');
    if (!paymentAmount || !paymentOrderId) return;
    const token = sessionStorage.getItem('authToken');
    if (!token) return;
    const check = async () => {
      try {
        const r = await fetch(`/api/payment/order/${paymentOrderId}`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        if (d.success && d.order?.status === 'completed') {
          sessionStorage.removeItem('paymentAmount');
          sessionStorage.removeItem('paymentOrderId');
          refreshUser();
          window.dispatchEvent(new Event('credits-updated'));
        }
      } catch {}
    };
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, [refreshUser]);

  const gptPrice = pricing.gpt_image2_generation || 0.3;
  const nanoPrice = pricing.nanobann2_generation || 0.3;

  const isCustom = customAmount !== '';
  const activePlan = PLANS.find(p => p.id === selectedPlan);
  const finalAmount = isCustom ? parseFloat(customAmount) || 0 : activePlan?.amount || 0;
  const finalCredits = finalAmount;

  const handleRecharge = async () => {
    if (finalAmount <= 0) return;
    setIsLoading(true);
    try {
      const token = sessionStorage.getItem('authToken');
      if (!token) { alert('请重新登录'); setIsLoading(false); return; }
      const r = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: finalAmount, paymentMethod }),
      });
      const d = await r.json();
      if (d.success && d.paymentUrl) {
        sessionStorage.setItem('paymentAmount', finalAmount.toString());
        sessionStorage.setItem('paymentOrderId', d.orderId);
        setTimeout(() => { window.location.href = d.paymentUrl; }, 500);
      } else {
        alert(d.message || '支付请求失败');
        setIsLoading(false);
      }
    } catch { alert('支付请求失败'); setIsLoading(false); }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-[#0a0a0a] flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] mobile-tap"><X size={16} className="text-white/40" /></button>
        <h1 className="text-base font-bold text-white">充值</h1>
        <div className="ml-auto flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-full">
          <Coins size={12} className="text-amber-500" />
          <span className="text-xs font-semibold text-amber-500">{Number(credits).toFixed(1)}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-8 space-y-5">
          {/* 消耗单价参考 */}
          <div className="bg-white/[0.04] rounded-2xl border border-white/[0.06] p-4">
            <p className="text-xs font-semibold text-white/40 mb-3">消耗单价参考</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Sparkles, label: 'GPT图像', price: gptPrice, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                { icon: Zap, label: 'Nano生图', price: nanoPrice, color: 'text-purple-400', bg: 'bg-purple-500/10' },
              ].map(item => (
                <div key={item.label} className={`${item.bg} rounded-xl px-3 py-2.5 flex items-center gap-2.5`}>
                  <item.icon size={16} className={item.color} />
                  <div>
                    <p className="text-[10px] text-white/40">{item.label}</p>
                    <p className="text-xs font-semibold text-white/70">{item.price}积分/次</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 套餐选择 */}
          <div>
            <h2 className="text-sm font-bold text-white mb-3">选择套餐</h2>
            <div className="space-y-2.5">
              {PLANS.map(plan => {
                const sel = selectedPlan === plan.id && !isCustom;
                const genCount = Math.floor(plan.credits / (nanoPrice || 0.3));
                return (
                  <button key={plan.id} onClick={() => { setSelectedPlan(plan.id); setCustomAmount(''); }}
                    className={`w-full relative bg-white/[0.04] rounded-2xl p-4 border-2 transition-all text-left ${
                      sel ? 'border-blue-500 shadow-lg shadow-blue-500/25' : 'border-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{plan.label}</span>
                          <span className={`text-[10px] font-medium text-white px-2 py-0.5 rounded-full ${plan.color}`}>{plan.tag}</span>
                        </div>
                        <p className="text-xs text-white/30 mt-0.5">¥{plan.amount} / {plan.credits}积分</p>
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${sel ? 'bg-blue-500 border-blue-500' : 'border-white/20'}`}>
                        {sel && <Check size={14} className="text-white" />}
                      </div>
                    </div>
                    <div className="mt-2 bg-white/[0.06] rounded-xl px-3 py-2 flex items-center justify-between">
                      <span className="text-xs text-white/40">约 <span className="font-semibold text-white">{genCount}</span> 次Nano生图</span>
                      <span className="text-xs text-white/30">{plan.credits}积分</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 自定义金额 */}
          <div className="bg-white/[0.04] rounded-2xl border border-white/[0.06] p-4">
            <label className="text-xs font-semibold text-white/40 mb-2 block">自定义金额</label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">¥</span>
              <input type="number" value={customAmount} onChange={e => setCustomAmount(e.target.value)} placeholder="输入金额"
                className="flex-1 px-3 py-2.5 bg-white/[0.06] rounded-xl text-sm text-white placeholder-white/20 outline-none" min="1" step="0.1" />
            </div>
            {customAmount && <p className="text-xs text-white/30 mt-1.5">可获得约 <span className="font-semibold text-white">{Math.floor(Number(customAmount) / (nanoPrice || 0.3))}</span> 次Nano生图</p>}
          </div>

          {/* 支付方式 */}
          <div>
            <label className="text-xs font-semibold text-white/40 mb-2 block">支付方式</label>
            <div className="flex gap-2">
              <button onClick={() => setPaymentMethod('wechat')}
                className={`mobile-tap flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 text-sm font-medium transition-all ${
                  paymentMethod === 'wechat' ? 'border-blue-500 bg-blue-500/10' : 'border-white/[0.06] bg-white/[0.04]'
                }`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#07C160"><path d="M8.5 13.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5S10 15.83 10 15s-.67-1.5-1.5-1.5zm7 0c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5z"/><path d="M21 5.5c0-2.48-4.03-4.5-9-4.5S3 3.02 3 5.5c0 1.88 2.08 3.46 5.02 4.17-.12.36-.19.74-.19 1.14 0 2.1 2.08 3.8 4.62 3.8.25 0 .5-.02.74-.05.64.64 1.48 1.09 2.42 1.34.14.04.29.08.43.11l-.11-.44c.67-.38 1.07-.88 1.07-1.42 0-.16-.03-.32-.09-.47C19.83 12.7 21 10.99 21 9.5c0-.56-.14-1.1-.39-1.6.25-.46.39-.96.39-1.49V5.5z"/></svg>
                微信支付
              </button>
              <button onClick={() => setPaymentMethod('alipay')}
                className={`mobile-tap flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 text-sm font-medium transition-all ${
                  paymentMethod === 'alipay' ? 'border-blue-500 bg-blue-500/10' : 'border-white/[0.06] bg-white/[0.04]'
                }`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#1677FF"><path d="M21.422 15.358c-3.22-1.386-6.847-2.408-10.096-3.35 1.488-3.145 2.845-6.039 2.845-6.039H8.758s-.278 1.153-.797 2.574c-3.114-.66-6.285-1.326-6.81-1.405-.598-.09-.775.324-.775.324s-.312.635.184.867c2.152 1.015 10.317 3.706 10.317 3.706-.865 2.32-2.497 5.668-4.465 7.708-1.644-1.632-3.288-4.111-3.997-6.548-.627-2.15-.494-2.791-.494-2.791s.2-.266-.285-.374c-.483-.108-.716.117-.716.117s-.667.448-.958 1.54c-.346 1.298.206 3.382 1.212 4.848 1.323 1.927 3.667 4.421 5.676 5.766.608.407 1.072.502 1.588.371 1.157-.294 2.88-2.405 3.865-3.71 0 0 .038.012.096.028.966.26 5.912 1.644 6.72 2.066.808.421.918-.256.918-.256s.412-.513-.2-.676z"/></svg>
                支付宝
              </button>
            </div>
          </div>

          {/* 支付按钮 */}
          <button onClick={handleRecharge} disabled={isLoading || finalAmount <= 0}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white active:from-blue-600 active:to-blue-700 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-40">
            {isLoading ? <><Loader2 size={16} className="animate-spin" /> 处理中...</>
            : <><Coins size={16} /> 支付 ¥{finalAmount.toFixed(1)}</>}
          </button>

          {/* 底部链接 */}
          <div className="flex items-center justify-center gap-4 pt-2">
            <button className="text-[11px] text-white/30 flex items-center gap-1"><Shield size={11} /> 隐私</button>
            <button className="text-[11px] text-white/30 flex items-center gap-1"><FileText size={11} /> 条款</button>
            <a href="mailto:softhooky@163.com" className="text-[11px] text-white/30 flex items-center gap-1"><Mail size={11} /> 联系</a>
          </div>
        </div>
      </div>
    </div>
  );
};

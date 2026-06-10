import React, { useState, useEffect } from 'react';
import { Check, X, Loader2, History, ChevronLeft, ChevronRight, Zap, Sparkles, Video, Film, Shield, Mail, FileText, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { getPricing } from '../services/pricingService';
import { TermsModal } from '../components/TermsModal';
import { PrivacyModal } from '../components/PrivacyModal';

// 订阅套餐：4个档位
const SUBSCRIPTION_PLANS = [
  { id: 'basic',    amount: 19.9,  label: '基础版', tag: '入门首选', tagColor: 'bg-gray-800', highlight: false },
  { id: 'standard', amount: 39.9,  label: '标准版', tag: '最受欢迎', tagColor: 'bg-blue-600',  highlight: true },
  { id: 'premium',  amount: 69.9,  label: '高级版', tag: '性价比王', tagColor: 'bg-purple-600', highlight: false },
  { id: 'ultimate', amount: 99.9,  label: '旗舰版', tag: '量大管饱', tagColor: 'bg-amber-600', highlight: false },
];

interface RechargeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RechargeModal: React.FC<RechargeModalProps> = ({ isOpen, onClose }) => {
  const { user, refreshUser } = useAuth();
  const [credits, setCredits] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState<string>('standard');
  const [customAmount, setCustomAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'wechat' | 'alipay'>('wechat');
  const [isLoading, setIsLoading] = useState(false);
  const [pricing, setPricing] = useState<Record<string, number>>({});
  const [pricingLoaded, setPricingLoaded] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // 每个功能消耗积分（从后台获取）
  const gptImage2Price = pricing.gpt_image2_generation || 0.3;
  const nanobann2Price = pricing.nanobann2_generation || 0.3;
  const veo31Price = pricing.veo31_video || 1;
  const veo31FastPrice = pricing.veo31_video_fast || 2;

  useEffect(() => {
    const loadPricing = async () => {
      const priceData = await getPricing();
      setPricing(priceData);
      setPricingLoaded(true);
    };
    if (isOpen) {
      loadPricing();
    }
  }, [isOpen]);

  useEffect(() => {
    if (user?.credits !== undefined) {
      setCredits(user.credits);
    }
  }, [user]);

  // 检测URL参数，如果是支付成功返回则同步积分
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    if (params.get('sync') === '1') {
      let synced = false;
      const syncCredits = async () => {
        try {
          const token = sessionStorage.getItem('authToken');
          if (!token) return;

          const response = await fetch('/api/payment/sync-credits', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await response.json();

          if (data.success && data.synced > 0) {
            synced = true;
            alert(`同步成功：已补录 ${data.totalAmount} 积分`);
          }

          refreshUser();
          window.dispatchEvent(new Event('credits-updated'));

          try {
            const creditsRes = await fetch('/api/auth/credits', {
              headers: { Authorization: `Bearer ${token}` }
            });
            const creditsData = await creditsRes.json();
            if (creditsData.success) {
              const userStr = sessionStorage.getItem('user');
              if (userStr) {
                const user = JSON.parse(userStr);
                user.credits = creditsData.credits;
                sessionStorage.setItem('user', JSON.stringify(user));
                setCredits(creditsData.credits);
              }
            }
          } catch (e) {
            console.error('刷新积分失败', e);
          }

          if (synced) {
            setTimeout(() => {
              refreshUser();
              window.dispatchEvent(new Event('credits-updated'));
            }, 1000);
          }
        } catch (e) {
          console.error('同步积分失败', e);
        }
        window.location.hash = '';
      };
      syncCredits();
    }
  }, [refreshUser]);

  // 检测支付完成状态
  useEffect(() => {
    const checkPaymentStatus = async () => {
      const paymentAmount = sessionStorage.getItem('paymentAmount');
      const paymentOrderId = sessionStorage.getItem('paymentOrderId');

      if (!paymentAmount || !paymentOrderId) return;

      try {
        const token = sessionStorage.getItem('authToken');
        if (!token) return;

        const response = await fetch('/api/payment/order/' + paymentOrderId, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        });

        const data = await response.json();

        if (data.success && data.order && data.order.status === 'completed') {
          sessionStorage.removeItem('paymentAmount');
          sessionStorage.removeItem('paymentOrderId');

          try {
            const token = sessionStorage.getItem('authToken');
            if (token) {
              const creditsRes = await fetch('/api/auth/credits', {
                headers: { Authorization: `Bearer ${token}` }
              });
              const creditsData = await creditsRes.json();
              if (creditsData.success) {
                const userStr = sessionStorage.getItem('user');
                if (userStr) {
                  const user = JSON.parse(userStr);
                  user.credits = creditsData.credits;
                  sessionStorage.setItem('user', JSON.stringify(user));
                  setCredits(creditsData.credits);
                }
              }
            }
          } catch (e) {
            console.error('刷新积分失败', e);
          }

          refreshUser();
          window.dispatchEvent(new Event('credits-updated'));

          onClose();
          alert('支付成功！积分已到账');
        }
      } catch (error) {
        console.error('检查支付状态失败:', error);
      }
    };

    const interval = setInterval(checkPaymentStatus, 3000);
    return () => clearInterval(interval);
  }, [refreshUser, onClose]);

  const selectedPlanData = SUBSCRIPTION_PLANS.find(p => p.id === selectedPlan);
  const isCustomAmount = customAmount !== '';
  const finalAmount = isCustomAmount ? parseFloat(customAmount) : (selectedPlanData?.amount || 0);
  const finalCredits = isCustomAmount ? parseFloat(customAmount) : (selectedPlanData?.amount || 0);

  // 计算各种生成数量
  const calcGenerations = (creditAmount: number) => ({
    gptImage2: Math.floor(creditAmount / gptImage2Price),
    nanobann2: Math.floor(creditAmount / nanobann2Price),
    veo31: Math.floor(creditAmount / veo31Price),
    veo31Fast: Math.floor(creditAmount / veo31FastPrice),
  });

  const currentGens = calcGenerations(Number(credits) || 0);
  const planGens = calcGenerations(finalCredits);

  const handleRecharge = async () => {
    if (finalAmount <= 0) return;
    setIsLoading(true);
    try {
      const token = sessionStorage.getItem('authToken');
      if (!token) {
        alert('未找到认证令牌，请重新登录');
        setIsLoading(false);
        return;
      }
      const response = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ amount: finalAmount, paymentMethod }),
      });
      const data = await response.json();
      if (data.success && data.paymentUrl) {
        sessionStorage.setItem('paymentAmount', finalAmount.toString());
        sessionStorage.setItem('paymentOrderId', data.orderId);
        setTimeout(() => { window.location.href = data.paymentUrl; }, 1000);
      } else {
        alert(data.message || '支付请求失败');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('支付请求失败:', error);
      alert('支付请求失败，请稍后重试');
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-start justify-center p-4 pt-6 md:p-8 bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden animate-fade-in-up" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '95vh' }}>
        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-500 to-blue-600 px-8 py-7">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">订阅计划</h2>
              <p className="text-blue-100 text-sm mt-1">选择适合您的方案，解锁全部创作能力</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-white/20 backdrop-blur rounded-xl px-5 py-2.5 border border-white/20">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs text-blue-100">当前余额</span>
                  <span className="text-xl font-bold text-white">{Number(credits).toFixed(1)}</span>
                  <span className="text-xs text-blue-100">积分</span>
                </div>
              </div>
              <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 transition-colors border border-white/20">
                <X size={18} className="text-white/80" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-6 overflow-y-auto" style={{ maxHeight: 'calc(95vh - 100px)' }}>
          {/* 消耗单价参考 */}
          <div className="grid grid-cols-4 gap-3 mb-7">
            {[
              { icon: Zap, label: 'GPT-Image2 生图', price: gptImage2Price, color: 'text-blue-500', bg: 'bg-blue-50' },
              { icon: Sparkles, label: 'Nanobanan2 生图', price: nanobann2Price, color: 'text-purple-500', bg: 'bg-purple-50' },
              { icon: Video, label: 'Veo3.1 视频 (1080p)', price: veo31Price, color: 'text-emerald-500', bg: 'bg-emerald-50' },
              { icon: Film, label: 'Veo3.1 Fast (1080p)', price: veo31FastPrice, color: 'text-rose-500', bg: 'bg-rose-50' },
            ].map((item) => (
              <div key={item.label} className={`${item.bg} rounded-xl px-4 py-3 border border-white/50`}>
                <div className="flex items-center gap-2">
                  <item.icon size={16} className={item.color} />
                  <span className="text-xs text-gray-500 truncate">{item.label}</span>
                </div>
                <p className="text-sm font-bold text-gray-800 mt-1">{item.price} <span className="text-xs font-normal text-gray-400">积分/次</span></p>
              </div>
            ))}
          </div>

          {/* 订阅方案 */}
          <div className="mb-6">
            <p className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              选择充值方案
              {!isCustomAmount && selectedPlanData && (
                <span className="text-xs font-normal text-gray-400">
                  — 可获得 <span className="font-bold text-gray-700">{(selectedPlanData.amount).toFixed(1)}</span> 积分
                </span>
              )}
            </p>
            <div className="grid grid-cols-4 gap-4">
              {SUBSCRIPTION_PLANS.map((plan) => {
                const isSelected = selectedPlan === plan.id && !isCustomAmount;
                const gens = calcGenerations(plan.amount);
                return (
                  <button
                    key={plan.id}
                    onClick={() => { setSelectedPlan(plan.id); setCustomAmount(''); }}
                    className={`relative flex flex-col text-left rounded-2xl border-2 transition-all duration-200 ${
                      isSelected
                        ? 'border-gray-900 ring-2 ring-gray-900/10 shadow-lg scale-[1.02]'
                        : 'border-gray-100 hover:border-gray-300 hover:shadow-md bg-white'
                    }`}
                  >
                    {/* 标签 */}
                    <div className={`absolute -top-3 left-4 px-3 py-0.5 rounded-full text-[11px] font-bold text-white ${plan.tagColor} shadow-sm`}>
                      {plan.tag}
                    </div>

                    {/* 选中标记 */}
                    {isSelected && (
                      <div className="absolute top-3 right-3 w-6 h-6 bg-gray-900 rounded-full flex items-center justify-center">
                        <Check size={13} className="text-white" />
                      </div>
                    )}

                    <div className="pt-5 px-4 pb-3">
                      {/* 金额 */}
                      <div className="flex items-baseline gap-0.5 mb-3">
                        <span className="text-lg font-bold text-gray-400">¥</span>
                        <span className="text-4xl font-black text-gray-900 tracking-tight">{plan.amount}</span>
                      </div>

                      {/* 积分 */}
                      <div className="flex items-baseline gap-1 mb-3 pb-3 border-b border-gray-100">
                        <span className="text-lg font-bold text-gray-900">{plan.amount.toFixed(1)}</span>
                        <span className="text-xs text-gray-400">积分</span>
                      </div>

                      {/* 生成能力 */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-gray-400 flex items-center gap-1">
                            <Zap size={11} className="text-blue-400" /> GPT-Image2
                          </span>
                          <span className="font-semibold text-gray-700">{gens.gptImage2} 张</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-gray-400 flex items-center gap-1">
                            <Sparkles size={11} className="text-purple-400" /> Nanobanan2
                          </span>
                          <span className="font-semibold text-gray-700">{gens.nanobann2} 张</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-gray-400 flex items-center gap-1">
                            <Video size={11} className="text-emerald-400" /> Veo3.1 视频
                          </span>
                          <span className="font-semibold text-gray-700">{gens.veo31} 个</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-gray-400 flex items-center gap-1">
                            <Film size={11} className="text-rose-400" /> Veo3.1 Fast
                          </span>
                          <span className="font-semibold text-gray-700">{gens.veo31Fast} 个</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 自定义金额 */}
          <div className="mb-6">
            <p className="text-xs font-medium text-gray-400 mb-2.5">或自定义充值金额</p>
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-gray-900/20 transition-all">
              <span className="text-lg font-bold text-gray-300 select-none">¥</span>
              <input
                id="customAmountInput"
                type="tel"
                autoComplete="off"
                value={customAmount}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  const num = parseFloat(val);
                  if (val.split('.').length > 2) return;
                  if (num > 1000) return;
                  setCustomAmount(val);
                  setSelectedPlan('');
                }}
                maxLength={5}
                placeholder="自定义金额 1~1000"
                className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-gray-800 placeholder:text-gray-300"
              />
              {isCustomAmount && parseFloat(customAmount) > 0 && (
                <span className="text-xs text-gray-400 flex-shrink-0">
                  可获得 <span className="font-bold text-gray-700">{parseFloat(customAmount).toFixed(1)}</span> 积分
                </span>
              )}
            </div>
          </div>

          {/* 支付方式 */}
          <div className="mb-6">
            <p className="text-xs font-medium text-gray-400 mb-2.5">支付方式</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPaymentMethod('wechat')}
                className={`flex items-center gap-3 px-5 py-3.5 rounded-xl border-2 transition-all ${
                  paymentMethod === 'wechat'
                    ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500/20'
                    : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                }`}
              >
                <img src="/wx.png" alt="微信" className="w-8 h-8 rounded-lg object-cover" />
                <span className="flex-1 text-left text-sm font-medium text-gray-800">微信支付</span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  paymentMethod === 'wechat' ? 'border-emerald-500 bg-emerald-500' : 'border-gray-200'
                }`}>
                  {paymentMethod === 'wechat' && <Check size={11} className="text-white" />}
                </div>
              </button>
              <button
                onClick={() => setPaymentMethod('alipay')}
                className={`flex items-center gap-3 px-5 py-3.5 rounded-xl border-2 transition-all ${
                  paymentMethod === 'alipay'
                    ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/20'
                    : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                }`}
              >
                <img src="/zfb.png" alt="支付宝" className="w-8 h-8 rounded-lg object-cover" />
                <span className="flex-1 text-left text-sm font-medium text-gray-800">支付宝</span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  paymentMethod === 'alipay' ? 'border-blue-500 bg-blue-500' : 'border-gray-200'
                }`}>
                  {paymentMethod === 'alipay' && <Check size={11} className="text-white" />}
                </div>
              </button>
            </div>
          </div>

          {/* 底部操作区 */}
          <div className="rounded-2xl bg-gradient-to-b from-gray-50 to-white border border-gray-100 p-5">
            {finalAmount > 0 ? (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm text-gray-400">合计付款</span>
                    <span className="text-3xl font-black text-gray-900">¥{finalAmount.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs text-gray-400">
                      获得 <span className="font-bold text-gray-700">{finalCredits.toFixed(1)}</span> 积分
                    </span>
                    <span className="text-gray-200">|</span>
                    <span className="text-xs text-gray-400">
                      GPT-Image2 <span className="font-bold text-blue-500">{planGens.gptImage2}</span> 张
                    </span>
                    <span className="text-gray-200">|</span>
                    <span className="text-xs text-gray-400">
                      Nanobanan2 <span className="font-bold text-purple-500">{planGens.nanobann2}</span> 张
                    </span>
                    <span className="text-gray-200">|</span>
                    <span className="text-xs text-gray-400">
                      Veo3.1 <span className="font-bold text-emerald-500">{planGens.veo31}</span> 个
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleRecharge}
                  disabled={isLoading}
                  className="px-8 py-3.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-bold text-sm transition-all disabled:bg-gray-100 disabled:text-gray-300 flex items-center justify-center gap-2 min-h-[48px] shadow-lg shadow-gray-900/20 active:scale-[0.98] flex-shrink-0"
                >
                  {isLoading ? (
                    <><Loader2 size={18} className="animate-spin" />跳转支付中...</>
                  ) : (
                    `立即支付 ¥${finalAmount.toFixed(1)}`
                  )}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-gray-400">合计付款</span>
                  <p className="text-xs text-gray-300 mt-0.5">请选择一个方案或输入自定义金额</p>
                </div>
                <button disabled className="px-8 py-3.5 bg-gray-50 text-gray-300 rounded-xl font-bold text-sm min-h-[48px] cursor-not-allowed">
                  选择方案
                </button>
              </div>
            )}
            {/* 退款政策与信任安全 */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="grid grid-cols-3 gap-4">
                {/* 退款政策 */}
                <div className="bg-amber-50 rounded-xl px-4 py-3 border border-amber-200">
                  <div className="flex items-center gap-2 mb-1.5">
                    <AlertTriangle size={14} className="text-amber-600" />
                    <span className="text-xs font-bold text-amber-800">充值说明</span>
                  </div>
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    虚拟充值积分不支持退款，请根据实际需求合理选择充值方案。
                  </p>
                </div>

                {/* 隐私安全 */}
                <div className="bg-green-50 rounded-xl px-4 py-3 border border-green-200">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Shield size={14} className="text-green-600" />
                    <span className="text-xs font-bold text-green-800">隐私保障</span>
                  </div>
                  <p className="text-[11px] text-green-700 leading-relaxed">
                    您的图片3天后自动删除，我们不会收集或使用您的图片进行AI训练。
                  </p>
                </div>

                {/* 联系我们 */}
                <div className="bg-blue-50 rounded-xl px-4 py-3 border border-blue-200">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Mail size={14} className="text-blue-600" />
                    <span className="text-xs font-bold text-blue-800">联系我们</span>
                  </div>
                  <p className="text-[11px] text-blue-700 leading-relaxed">
                    如有任何问题，请发送邮件至 softhooky@163.com，24小时内回复。
                  </p>
                </div>
              </div>

              {/* 底部链接 */}
              <div className="flex items-center justify-center gap-4 mt-3">
                <button onClick={() => setShowTerms(true)} className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1">
                  <FileText size={12} />
                  使用条款
                </button>
                <span className="text-gray-200">|</span>
                <button onClick={() => setShowPrivacy(true)} className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1">
                  <Shield size={12} />
                  隐私政策
                </button>
                <span className="text-gray-200">|</span>
                <a href="mailto:softhooky@163.com" className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1">
                  <Mail size={12} />
                  softhooky@163.com
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Terms & Privacy Modals */}
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
    </div>
  );
};

// 消费记录条目
interface ConsumptionRecord {
  id: number;
  amount: number;
  type: string;
  description: string;
  created_at: string;
  beforeCredits: number;
  afterCredits: number;
  sub_user_name?: string;
}

// 充值记录条目
interface PaymentRecord {
  id: number;
  order_id: string;
  amount: number;
  status: string;
  created_at: string;
}

interface PaymentRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PaymentRecordsModal: React.FC<PaymentRecordsModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'recharge' | 'consumption'>('consumption');
  const [rechargeRecords, setRechargeRecords] = useState<PaymentRecord[]>([]);
  const [consumptionRecords, setConsumptionRecords] = useState<ConsumptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 30;

  useEffect(() => {
    if (isOpen) { setPage(1); setLoading(true); }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'recharge') fetchRechargeRecords(page);
      else fetchConsumptionRecords(page);
    }
  }, [page, activeTab, isOpen]);

  const fetchRechargeRecords = async (pageNum: number) => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('authToken');
      const response = await fetch(`/api/payment/records?page=${pageNum}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setRechargeRecords(data.orders || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.total || 0);
      }
    } catch (error) {
      console.error('获取充值记录失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchConsumptionRecords = async (pageNum: number) => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('authToken');
      const response = await fetch(`/api/payment/consumption?page=${pageNum}&pageSize=${pageSize}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setConsumptionRecords(data.consumptions || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.totalConsumptions || 0);
      }
    } catch (error) {
      console.error('获取消费记录失败:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <History size={18} className="text-gray-400" />
            <h2 className="text-lg font-bold text-gray-800">历史记录</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6">
          <button
            onClick={() => { setActiveTab('consumption'); setPage(1); }}
            className={`py-3 text-sm font-medium border-b-2 transition-colors mr-6 ${
              activeTab === 'consumption' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            消费记录
          </button>
          {!user?.isSubUser && !user?.recharge_disabled && (
          <button
            onClick={() => { setActiveTab('recharge'); setPage(1); }}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'recharge' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            充值记录
          </button>
          )}
        </div>

        <div className="overflow-y-auto p-6" style={{ maxHeight: 'calc(80vh - 120px)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-gray-300" />
            </div>
          ) : activeTab === 'recharge' ? (
            rechargeRecords.length > 0 ? (
              <div className="space-y-2">
                {rechargeRecords.map((record) => (
                  <div key={record.id} className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-gray-800">¥{record.amount}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(record.created_at).toLocaleString()}</p>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      record.status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                      record.status === 'pending' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-500'
                    }`}>
                      {record.status === 'completed' ? '已完成' : record.status === 'pending' ? '处理中' : '失败'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="text-sm text-gray-300">暂无充值记录</p>
              </div>
            )
          ) : (
            consumptionRecords.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-3 px-4 font-medium text-gray-400 text-xs">类型</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-400 text-xs">时间</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-400 text-xs">金额</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-400 text-xs">余额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {consumptionRecords.map((record) => (
                      <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 text-gray-800">{record.description || record.type}</td>
                        <td className="py-3 px-4 text-gray-400 text-xs">{new Date(record.created_at).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right">
                          <span className="font-medium text-rose-500">-{record.amount.toFixed(1)}</span>
                        </td>
                        <td className="py-3 px-4 text-right text-gray-500 text-xs">{record.afterCredits?.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="text-sm text-gray-300">暂无消费记录</p>
              </div>
            )
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={18} className="text-gray-500" />
              </button>
              <span className="text-sm text-gray-400">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={18} className="text-gray-500" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

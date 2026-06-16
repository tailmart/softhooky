import React, { useState, useEffect } from 'react';
import {
  User, Coins, CreditCard, History, Image as ImageIcon,
  Gift, Bell, Mail, FileText, Shield, ChevronRight,
  LogOut, Sparkles
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getPricing } from '../../services/pricingService';
import { CouponCreditNotice } from '../../components/CouponCreditNotice';

interface ProfilePageProps {
  onNavigateToPlugin: (pluginId: string) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ onNavigateToPlugin }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const [pricing, setPricing] = useState<Record<string, number>>({});
  const [notifications, setNotifications] = useState<Array<{ id: number; title: string; content: string }>>([]);

  useEffect(() => {
    getPricing().then(setPricing);
    const fetchNotifs = async () => {
      try {
        const res = await fetch('/api/notifications');
        const data = await res.json();
        if (data.success) setNotifications(data.data || []);
      } catch {}
    };
    fetchNotifs();
  }, []);

  const getInitial = (email: string) => email?.charAt(0).toUpperCase() || '?';

  const menuItems = [
    { id: 'recharge', icon: CreditCard, label: '充值', desc: '购买积分，解锁创作能力', color: 'bg-blue-500/10 text-blue-400' },
    { id: 'records', icon: History, label: '记录', desc: '查看充值与消费明细', color: 'bg-violet-500/10 text-violet-400' },
    { id: 'image-library', icon: ImageIcon, label: '图库', desc: '查看和管理生成的图片', color: 'bg-amber-500/10 text-amber-400' },
    { id: 'coupon', icon: Gift, label: '领券', desc: '输入优惠券码兑换积分', color: 'bg-rose-500/10 text-rose-400' },
  ];

  if (!isAuthenticated || !user) {
    return (
      <div className="px-4 pt-6 pb-6 animate-mobile-fade-in">
        <div className="flex flex-col items-center py-16 mb-6">
          <div className="w-20 h-20 rounded-3xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
            <User size={36} className="text-white/15" />
          </div>
          <h2 className="text-lg font-bold text-white mb-1">未登录</h2>
          <p className="text-sm text-white/30 mb-6">登录后可查看积分和使用记录</p>
          <button
            onClick={() => window.dispatchEvent(new Event('mobile-auth-required'))}
            className="px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full text-sm font-semibold shadow-lg shadow-blue-500/20"
          >
            登录 / 注册
          </button>
        </div>

        <div className="flex items-center justify-center gap-4 pt-4 border-t border-white/[0.04]">
          <button className="text-xs text-white/20 flex items-center gap-1">
            <FileText size={12} /> 条款
          </button>
          <button className="text-xs text-white/20 flex items-center gap-1">
            <Shield size={12} /> 隐私
          </button>
          <a href="mailto:softhooky@163.com" className="text-xs text-white/20 flex items-center gap-1">
            <Mail size={12} /> 联系
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] animate-mobile-fade-in">
      {/* 用户信息卡片 */}
      <div className="mx-4 mt-4 mb-3 rounded-2xl p-5 bg-gradient-to-br from-blue-600/20 to-blue-800/10 border border-blue-500/10">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/15 flex items-center justify-center">
            <span className="text-xl font-bold text-blue-400">{getInitial(user.email)}</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white truncate max-w-[220px]">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Coins size={14} className="text-blue-400" />
              <span className="text-base font-bold text-blue-400">{Number(user.credits || 0).toFixed(1)}</span>
              <span className="text-xs text-white/30">积分</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onNavigateToPlugin('recharge')}
            className="mobile-tap flex-1 bg-white/[0.05] rounded-xl py-3 flex flex-col items-center gap-1 border border-white/[0.04]"
          >
            <CreditCard size={18} className="text-blue-400" />
            <span className="text-[11px] font-medium text-white/50">充值</span>
          </button>
          <button
            onClick={() => onNavigateToPlugin('image-library')}
            className="mobile-tap flex-1 bg-white/[0.05] rounded-xl py-3 flex flex-col items-center gap-1 border border-white/[0.04]"
          >
            <ImageIcon size={18} className="text-blue-400" />
            <span className="text-[11px] font-medium text-white/50">图库</span>
          </button>
          <button
            onClick={() => onNavigateToPlugin('records')}
            className="mobile-tap flex-1 bg-white/[0.05] rounded-xl py-3 flex flex-col items-center gap-1 border border-white/[0.04]"
          >
            <History size={18} className="text-blue-400" />
            <span className="text-[11px] font-medium text-white/50">记录</span>
          </button>
        </div>
      </div>

      {/* 优惠券积分提示 */}
      <div className="mx-4 mb-3">
        <CouponCreditNotice />
      </div>

      {/* 功能菜单 */}
      <div className="mx-4 mb-6">
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.04] overflow-hidden">
          {menuItems.map((item, idx) => {
            const Icon = item.icon;
            const isLast = idx === menuItems.length - 1;
            return (
              <button
                key={item.id}
                onClick={() => onNavigateToPlugin(item.id)}
                className={`mobile-tap w-full flex items-center gap-3.5 px-4 py-3.5 ${!isLast ? 'border-b border-white/[0.03]' : ''}`}
              >
                <div className={`w-9 h-9 rounded-xl ${item.color} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-white">{item.label}</p>
                  <p className="text-[11px] text-white/30">{item.desc}</p>
                </div>
                <ChevronRight size={16} className="text-white/10" />
              </button>
            );
          })}
        </div>
      </div>

      {/* 通知 */}
      {notifications.length > 0 && (
        <div className="mx-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={14} className="text-white/30" />
            <h2 className="text-xs font-semibold text-white/30 uppercase tracking-wider">通知</h2>
          </div>
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.04] divide-y divide-white/[0.03]">
            {notifications.slice(0, 3).map(n => (
              <div key={n.id} className="px-4 py-3">
                <p className="text-sm font-medium text-white">{n.title}</p>
                <p className="text-xs text-white/30 mt-0.5 line-clamp-1">{n.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 底部操作 */}
      <div className="mx-4 mb-8">
        <button
          onClick={logout}
          className="mobile-tap w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-red-500/10 text-sm font-medium text-red-400 bg-red-500/5"
        >
          <LogOut size={16} />
          退出登录
        </button>

        <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-white/[0.04]">
          <button className="text-xs text-white/20 flex items-center gap-1">
            <FileText size={12} /> 条款
          </button>
          <button className="text-xs text-white/20 flex items-center gap-1">
            <Shield size={12} /> 隐私
          </button>
          <a href="mailto:softhooky@163.com" className="text-xs text-white/20 flex items-center gap-1">
            <Mail size={12} /> 联系
          </a>
        </div>
      </div>
    </div>
  );
};

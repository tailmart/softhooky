import React, { useState, useEffect } from 'react';
import {
  User, Coins, CreditCard, History, Image as ImageIcon,
  Gift, Users, Bell, Mail, FileText, Shield, ChevronRight,
  LogOut, Crown, Sparkles
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getPricing } from '../../services/pricingService';
import axios from 'axios';
import { CouponCreditNotice } from '../../components/CouponCreditNotice';

interface ProfilePageProps {
  onNavigateToPlugin: (pluginId: string) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ onNavigateToPlugin }) => {
  const { user, isAuthenticated, logout, refreshUser } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
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
    { id: 'recharge', icon: CreditCard, label: '充值', desc: '购买积分，解锁更多创作能力', color: 'bg-blue-50 text-blue-600' },
    { id: 'records', icon: History, label: '消费记录', desc: '查看充值与消费明细', color: 'bg-purple-50 text-purple-600' },
    { id: 'image-library', icon: ImageIcon, label: '图片图库', desc: '查看和管理生成的图片', color: 'bg-amber-50 text-amber-600' },
    { id: 'coupon', icon: Gift, label: '优惠券', desc: '输入优惠券码兑换积分', color: 'bg-rose-50 text-rose-600' },
  ];

  if (!isAuthenticated || !user) {
    return (
      <div className="px-4 pt-6 pb-6 animate-mobile-fade-in">
        {/* 未登录提示 */}
        <div className="flex flex-col items-center py-12 mb-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-4">
            <User size={36} className="text-gray-400" />
          </div>
          <h2 className="text-lg font-bold text-[#171717] mb-1">未登录</h2>
          <p className="text-sm text-[#a3a3a3] mb-6">登录后可查看积分和使用记录</p>
          <button
            onClick={() => window.dispatchEvent(new Event('mobile-auth-required'))}
            className="px-8 py-3 bg-[#171717] text-white rounded-full text-sm font-semibold"
          >
            登录 / 注册
          </button>
        </div>

        {/* 底部链接 */}
        <div className="flex items-center justify-center gap-4 pt-4 border-t border-[#f0f0f0]">
          <button className="text-xs text-[#a3a3a3] flex items-center gap-1">
            <FileText size={12} /> 条款
          </button>
          <button className="text-xs text-[#a3a3a3] flex items-center gap-1">
            <Shield size={12} /> 隐私
          </button>
          <a href="mailto:softhooky@163.com" className="text-xs text-[#a3a3a3] flex items-center gap-1">
            <Mail size={12} /> 联系
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-mobile-fade-in">
      {/* 用户信息卡片 */}
      <div className="mx-4 mt-4 mb-2 bg-gradient-to-br from-[#171717] to-[#333] rounded-3xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shadow-inner">
            <span className="text-xl font-bold">{getInitial(user.email)}</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold truncate max-w-[220px]">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Coins size={14} className="text-amber-400" />
              <span className="text-base font-bold text-amber-400">{Number(user.credits || 0).toFixed(1)}</span>
              <span className="text-xs text-white/60">积分</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onNavigateToPlugin('recharge')}
            className="mobile-tap flex-1 bg-white/15 rounded-2xl py-3 flex flex-col items-center gap-1"
          >
            <CreditCard size={18} className="text-white" />
            <span className="text-[11px] font-medium">充值</span>
          </button>
          <button
            onClick={() => onNavigateToPlugin('image-library')}
            className="mobile-tap flex-1 bg-white/15 rounded-2xl py-3 flex flex-col items-center gap-1"
          >
            <ImageIcon size={18} className="text-white" />
            <span className="text-[11px] font-medium">图库</span>
          </button>
          <button
            onClick={() => onNavigateToPlugin('records')}
            className="mobile-tap flex-1 bg-white/15 rounded-2xl py-3 flex flex-col items-center gap-1"
          >
            <History size={18} className="text-white" />
            <span className="text-[11px] font-medium">记录</span>
          </button>
        </div>
      </div>

      {/* 优惠券积分提示 */}
      <div className="mx-4 mb-3">
        <CouponCreditNotice />
      </div>

      {/* 功能菜单 */}
      <div className="mx-4 mb-6">
        <div className="bg-white rounded-2xl border border-[#f0f0f0] overflow-hidden">
          {menuItems.map((item, idx) => {
            const Icon = item.icon;
            const isLast = idx === menuItems.length - 1;
            return (
              <button
                key={item.id}
                onClick={() => onNavigateToPlugin(item.id)}
                className={`mobile-tap w-full flex items-center gap-3.5 px-4 py-3.5 ${!isLast ? 'border-b border-[#f5f5f5]' : ''}`}
              >
                <div className={`w-9 h-9 rounded-xl ${item.color} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-[#171717]">{item.label}</p>
                  <p className="text-[11px] text-[#a3a3a3]">{item.desc}</p>
                </div>
                <ChevronRight size={16} className="text-[#d4d4d4]" />
              </button>
            );
          })}
        </div>
      </div>

      {/* 通知 */}
      {notifications.length > 0 && (
        <div className="mx-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={14} className="text-[#a3a3a3]" />
            <h2 className="text-xs font-semibold text-[#a3a3a3] uppercase tracking-wider">通知</h2>
          </div>
          <div className="bg-white rounded-2xl border border-[#f0f0f0] divide-y divide-[#f5f5f5]">
            {notifications.slice(0, 3).map(n => (
              <div key={n.id} className="px-4 py-3">
                <p className="text-sm font-medium text-[#171717]">{n.title}</p>
                <p className="text-xs text-[#a3a3a3] mt-0.5 line-clamp-1">{n.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 底部操作 */}
      <div className="mx-4 mb-8">
        <button
          onClick={logout}
          className="mobile-tap w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-red-100 text-sm font-medium text-red-500"
        >
          <LogOut size={16} />
          退出登录
        </button>

        <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-[#f0f0f0]">
          <button className="text-xs text-[#a3a3a3] flex items-center gap-1">
            <FileText size={12} /> 条款
          </button>
          <button className="text-xs text-[#a3a3a3] flex items-center gap-1">
            <Shield size={12} /> 隐私
          </button>
          <a href="mailto:softhooky@163.com" className="text-xs text-[#a3a3a3] flex items-center gap-1">
            <Mail size={12} /> 联系
          </a>
        </div>
      </div>
    </div>
  );
};

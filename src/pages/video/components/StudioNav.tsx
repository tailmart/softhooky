import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useSiteConfig } from '../../../contexts/SiteConfigContext';
import { logout as authLogout } from '../../../services/authService';
import { Coins, Bell, LogIn, User, ChevronDown, Film, CreditCard, History, Gift, LogOut, FileImage, Share2, Layers } from 'lucide-react';
import { RechargeModal, PaymentRecordsModal } from '../../RechargePage';
import { CouponClaimModal } from '../../../components/CouponClaimModal';
import { VideoMediaLibrary } from './VideoMediaLibrary';

interface StudioNavProps {
  activeTab: 'script' | 'social' | 'video';
  onTabChange: (tab: 'script' | 'social' | 'video') => void;
  onShowAuth: () => void;
  activeTaskCount: number;
  onToggleTaskCenter: () => void;
}

const tabs = [
  { key: 'script' as const, label: '脚本分镜', icon: FileImage },
  { key: 'social' as const, label: '社媒图片', icon: Share2 },
  { key: 'video' as const, label: 'AI视频', icon: Film },
];

export function StudioNav({ activeTab, onTabChange, onShowAuth, activeTaskCount, onToggleTaskCenter }: StudioNavProps) {
  const { user, isAuthenticated, setUser } = useAuth();
  const { config } = useSiteConfig();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 弹窗状态
  const [showRecharge, setShowRecharge] = useState(false);
  const [showRecords, setShowRecords] = useState(false);
  const [showCoupon, setShowCoupon] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuClick = (action: string) => {
    setDropdownOpen(false);
    switch (action) {
      case 'recharge': setShowRecharge(true); break;
      case 'records': setShowRecords(true); break;
      case 'coupon': setShowCoupon(true); break;
      case 'media': setShowMediaLibrary(true); break;
      case 'logout': authLogout(); setUser(null); break;
    }
  };

  return (
    <>
      <nav className="h-12 flex items-center justify-between px-4 bg-white border-b border-slate-200 relative z-50">
        {/* Left: Logo */}
        <div className="flex items-center gap-2 min-w-[160px] cursor-pointer" onClick={() => navigate('/')}>
          <img src={config.logo_url} alt="logo" className="h-7 w-7 rounded-lg object-cover" />
          <span className="text-slate-900 text-sm font-semibold tracking-wide">Video Studio</span>
        </div>

        {/* Center: Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-full p-0.5">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white shadow-lg shadow-blue-500/20'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-3 min-w-[160px] justify-end">
          {isAuthenticated && (
            <>
              {/* Credits */}
              <div className="flex items-center gap-1.5 text-slate-900 text-xs">
                <Coins size={14} className="text-blue-500" />
                <span>{user?.credits ?? 0}</span>
              </div>

              {/* Task Center */}
              <button
                onClick={onToggleTaskCenter}
                className="relative p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              >
                <Bell size={16} />
                {activeTaskCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-[10px] text-white px-1">
                    {activeTaskCount}
                  </span>
                )}
              </button>

              {/* Avatar + Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-1 p-0.5 rounded-full hover:bg-slate-100 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#2563EB] to-[#3B82F6] flex items-center justify-center">
                    <User size={14} className="text-white" />
                  </div>
                  <ChevronDown size={12} className={`text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-40 bg-white border border-slate-200 rounded-xl shadow-xl shadow-black/10 overflow-hidden py-1">
                    {[
                      { label: '媒体库', icon: Layers, action: 'media' },
                      { label: '充值', icon: CreditCard, action: 'recharge' },
                      { label: '记录', icon: History, action: 'records' },
                      { label: '领券', icon: Gift, action: 'coupon' },
                    ].map(item => (
                      <button
                        key={item.label}
                        onClick={() => handleMenuClick(item.action)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <item.icon size={14} className="text-slate-400" />
                        {item.label}
                      </button>
                    ))}
                    <div className="border-t border-slate-200 my-1" />
                    <button
                      onClick={() => handleMenuClick('logout')}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-slate-50 transition-colors"
                    >
                      <LogOut size={14} />
                      退出
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {!isAuthenticated && (
            <button
              onClick={onShowAuth}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white text-xs font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-shadow"
            >
              <LogIn size={14} />
              登录
            </button>
          )}
        </div>
      </nav>

      {/* Modals */}
      <RechargeModal isOpen={showRecharge} onClose={() => setShowRecharge(false)} />
      <PaymentRecordsModal isOpen={showRecords} onClose={() => setShowRecords(false)} />
      <CouponClaimModal isOpen={showCoupon} onClose={() => setShowCoupon(false)} />
      <VideoMediaLibrary isOpen={showMediaLibrary} onClose={() => setShowMediaLibrary(false)} />
    </>
  );
}

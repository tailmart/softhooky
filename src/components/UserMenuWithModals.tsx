import React, { useState, useEffect, useRef } from 'react';
import { Coins, ChevronDown, Crown, History, X, Users, ImageIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { SubAccountManager } from './SubAccountManager';
import { ImageLibraryModal } from './canvas/ImageLibraryModal';
import { getPricing } from '../services/pricingService';
import { CouponCreditNotice } from './CouponCreditNotice';

interface UserMenuWithModalsProps {
  className?: string;
  mobileTrigger?: boolean;
  onOpenRecharge?: () => void;
  onOpenRecords?: () => void;
}

export const UserMenuWithModals: React.FC<UserMenuWithModalsProps> = ({ className = '', mobileTrigger = false, onOpenRecharge, onOpenRecords }) => {
  const { user, logout, refreshUser } = useAuth();
  const [credits, setCredits] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSubAccountModalOpen, setIsSubAccountModalOpen] = useState(false);
  const [isImageLibraryOpen, setIsImageLibraryOpen] = useState(false);
  const [generatePrice, setGeneratePrice] = useState(0.3);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user?.credits !== undefined) {
      setCredits(user.credits);
    }
  }, [user]);

  useEffect(() => {
    const loadPricing = async () => {
      const price = await getPricing();
      const cost = price.nanobann2_generation || price.gpt_image2_generation || 0.3;
      setGeneratePrice(cost);
    };
    loadPricing();
    // 每30秒刷新一次价格
    const interval = setInterval(loadPricing, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleCreditsUpdate = () => {
      try {
        const userStr = sessionStorage.getItem('user');
        if (userStr) {
          setCredits(JSON.parse(userStr).credits || 0);
        }
      } catch {}
    };
    window.addEventListener('credits-updated', handleCreditsUpdate);
    return () => window.removeEventListener('credits-updated', handleCreditsUpdate);
  }, []);

  useEffect(() => {
    (window as any).toggleMobileUserMenu = () => {
      setMenuOpen(prev => !prev);
    };
    (window as any).openMobileImageLibrary = () => {
      setMenuOpen(false);
      setIsImageLibraryOpen(true);
    };
    return () => {
      delete (window as any).toggleMobileUserMenu;
      delete (window as any).openMobileImageLibrary;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // 打开菜单时刷新用户状态（同步 recharge_disabled 等）
      refreshUser();
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const getInitial = (email: string) => {
    return email.charAt(0).toUpperCase();
  };

  const imagesCanGenerate = Math.floor(Number(credits) / generatePrice);

  if (!user?.email) return null;

  return (
    <>
      <div className={`relative ${className}`} ref={menuRef}>
        {mobileTrigger ? (
          <button
            onClick={() => setMenuOpen(true)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
          >
<div className="flex items-center gap-1 bg-[#f7f7f7] px-2 py-1 rounded-lg">
              <Coins size={14} className="text-amber-500" />
              <span className="text-sm font-semibold text-[#171717]">{Number(credits).toFixed(0)}</span>
            </div>
          </button>
        ) : (
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all md:border md:border-gray-200 md:shadow-sm ${
              menuOpen ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'
            }`}
          >
            <div className="w-7 h-7 bg-gradient-to-br from-[#171717] to-[#404040] rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-semibold">
                {getInitial(user.email)}
              </span>
            </div>
            <div className="hidden md:flex flex-col items-start">
              <span className="text-xs font-medium text-[#171717] truncate max-w-[100px]">
                {user.email}
              </span>
              <div className="flex items-center gap-1">
                {isHovered ? (
                  <span className="text-xs text-gray-500">可生成 {imagesCanGenerate} 张</span>
                ) : (
                  <>
                    <Coins size={10} className="text-amber-500" />
                    <span className="text-xs font-semibold text-amber-600">{Number(credits).toFixed(1)}</span>
                  </>
                )}
              </div>
            </div>
            <div className="md:hidden">
              <span className="text-sm font-medium text-[#171717]">{credits > 0 ? `${Number(credits).toFixed(1)}积分` : ''}</span>
            </div>
            <ChevronDown size={12} className={`transition-transform ml-1 ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
        )}

        {menuOpen && (
          <>
            {/* 桌面端 - 居中卡片弹窗 */}
            <div className="hidden md:flex fixed inset-0 z-50 items-center justify-center p-4" onClick={() => setMenuOpen(false)}>
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
              <div
                className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[420px] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                {/* 关闭按钮 */}
                <button
                  onClick={() => setMenuOpen(false)}
                  className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors z-10"
                >
                  <X size={18} className="text-gray-400" />
                </button>

                {/* 顶部用户卡片 */}
                <div className="relative px-8 pt-8 pb-6">
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-white" />
                  <div className="relative flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-[#171717] to-[#404040] rounded-3xl flex items-center justify-center shadow-lg mb-4">
                      <span className="text-white text-2xl font-bold">{getInitial(user.email)}</span>
                    </div>
                    <h3 className="text-xl font-bold text-[#171717]">{user.email}</h3>
                    {user?.isSubUser ? (
                      <span className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 text-xs font-medium bg-amber-50 text-amber-600 rounded-full border border-amber-200">
                        <Crown size={12} />
                        子账号
                      </span>
                    ) : (
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-2xl border border-amber-200">
                          <Coins size={16} className="text-amber-500" />
                          <span className="text-lg font-bold text-amber-700">{Number(credits).toFixed(1)}</span>
                          <span className="text-sm text-amber-600">积分</span>
                        </div>
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-sm text-gray-400">可生成 {imagesCanGenerate} 张</span>
                          <CouponCreditNotice />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 分割线 */}
                <div className="h-px bg-gray-100 mx-6" />

                {/* 功能菜单 */}
                <div className="px-4 py-4 space-y-1">
                  {!user?.isSubUser && !user?.recharge_disabled && (
                    <button
                      onClick={() => { onOpenRecharge?.(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-gray-50 active:bg-gray-100 transition-all group"
                    >
                      <div className="w-11 h-11 bg-gradient-to-br from-amber-400 to-amber-500 rounded-2xl flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                        <Coins size={20} className="text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-[#171717]">充值积分</p>
                        <p className="text-xs text-gray-400">为账户充值积分</p>
                      </div>
                    </button>
                  )}
                  {!user?.recharge_disabled && (
                    <button
                      onClick={() => { onOpenRecords?.(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-gray-50 active:bg-gray-100 transition-all group"
                    >
                      <div className="w-11 h-11 bg-gray-100 rounded-2xl flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                        <History size={20} className="text-gray-500" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-[#171717]">充值记录</p>
                        <p className="text-xs text-gray-400">查看充值和消费明细</p>
                      </div>
                    </button>
                  )}
                  {!user?.isSubUser && (
                    <button
                      onClick={() => { setIsSubAccountModalOpen(true); setMenuOpen(false); }}
                      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-gray-50 active:bg-gray-100 transition-all group"
                    >
                      <div className="w-11 h-11 bg-gray-100 rounded-2xl flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                        <Users size={20} className="text-gray-500" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-[#171717]">子账号管理</p>
                        <p className="text-xs text-gray-400">管理子账号权限与配额</p>
                      </div>
                    </button>
                  )}
                </div>

                {/* 分割线 */}
                <div className="h-px bg-gray-100 mx-6" />

                {/* 退出登录 */}
                <div className="px-4 py-4">
                  <button
                    onClick={() => { logout(); setMenuOpen(false); }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    退出登录
                  </button>
                </div>
              </div>
            </div>

            <div className="md:hidden fixed inset-0 z-50" onClick={() => setMenuOpen(false)}>
              <div className="absolute inset-0 bg-black/50" />
              <div
                className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-4 pb-8"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-[#171717]">我的账户</h3>
                  <button
                    onClick={() => setMenuOpen(false)}
                    className="p-2 rounded-xl hover:bg-gray-100 active:bg-gray-200 touch-manipulation"
                  >
                    <X size={20} className="text-gray-500" />
                  </button>
                </div>

                <div className="flex items-center gap-3 mb-6 p-4 bg-gray-50 rounded-2xl">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#171717] to-[#404040] rounded-xl flex items-center justify-center">
                    <span className="text-white text-lg font-bold">{getInitial(user.email)}</span>
                  </div>
                  <div>
                    <p className="font-medium text-[#171717]">{user.email}</p>
                    <div className="flex items-center gap-1 mt-0.5">
<Coins size={14} className="text-[#171717]" />
                      <span className="font-semibold text-amber-600">{Number(credits).toFixed(1)} 积分</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">可生成 {imagesCanGenerate} 张图片</p>
                    <CouponCreditNotice />
                  </div>
                </div>

                {user?.isSubUser && (
                  <div className="mb-4 px-3 py-2 bg-gray-100 rounded-xl flex items-center gap-2">
                    <Crown size={14} className="text-[#525252]" />
                    <span className="text-sm text-gray-600">子账号</span>
                  </div>
                )}

                {!user?.isSubUser && !user?.recharge_disabled && (
                  <button
                    onClick={() => { onOpenRecharge?.(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-[#171717] text-white mb-3 active:bg-[#27272A] touch-manipulation"
                  >
                    <Coins size={20} className="text-amber-400" />
                    <span className="font-semibold">充值积分</span>
                  </button>
                )}

                {!user?.recharge_disabled && (
                <button
                  onClick={() => { onOpenRecords?.(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl hover:bg-gray-50 active:bg-gray-100 touch-manipulation mb-3"
                >
                  <History size={20} className="text-[#525252]" />
                  <span className="font-medium text-gray-700">充值记录</span>
                </button>
                )}

                {!user?.isSubUser && (
                  <button
                    onClick={() => { setIsImageLibraryOpen(true); setMenuOpen(false); }}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl hover:bg-gray-50 active:bg-gray-100 touch-manipulation mb-3"
                  >
                    <ImageIcon size={20} className="text-[#525252]" />
                    <span className="font-medium text-gray-700">图片库</span>
                  </button>
                )}

                {!user?.isSubUser && (
                  <button
                    onClick={() => { setIsSubAccountModalOpen(true); setMenuOpen(false); }}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl hover:bg-gray-50 active:bg-gray-100 touch-manipulation mb-3"
                  >
                    <Users size={20} className="text-[#525252]" />
                    <span className="font-medium text-gray-700">子账号管理</span>
                  </button>
                )}

                <button
                  onClick={() => { logout(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl bg-red-600 text-white hover:bg-red-700 active:bg-red-800 touch-manipulation"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span className="font-medium">退出登录</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {isSubAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setIsSubAccountModalOpen(false)}>
          <div className="bg-white rounded-none md:rounded-3xl w-full h-full md:h-auto md:max-w-2xl md:max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <button onClick={() => setIsSubAccountModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                  <X size={20} className="text-gray-600" />
                </button>
                <h2 className="text-lg md:text-xl font-bold text-[#171717]">子账号管理</h2>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <SubAccountManager token={sessionStorage.getItem('authToken') || ''} />
            </div>
          </div>
        </div>
      )}

      <ImageLibraryModal
        isOpen={isImageLibraryOpen}
        onClose={() => setIsImageLibraryOpen(false)}
      />
    </>
  );
};
import React, { useState, useEffect, useRef } from 'react';
import { Coins, CreditCard, History, Users, Image as ImageIcon, FileImage, Video, Share2, ShoppingCart, Layout, User, Wand2, Hand, ChevronDown, ChevronRight, Copy, Layers, MessageCircle, Film, Bell, Mail, FileText, Shield, X, Gift, Clapperboard, ChevronsLeft, ChevronsRight, TrendingUp, Sparkles, ShoppingBag, Megaphone, Boxes, Languages } from 'lucide-react';
import api, { API_URL } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

import { SubAccountManager } from './SubAccountManager';
import { TermsModal } from './TermsModal';
import { PrivacyModal } from './PrivacyModal';
import { CouponClaimModal } from './CouponClaimModal';

import { getPricing } from '../services/pricingService';
import { getAvailableNavItems } from '../services/navService';
import { useSiteConfig } from '../contexts/SiteConfigContext';

const ICON_MAP: Record<string, React.ElementType> = {
  'chat-gen': MessageCircle,
  xiaohongshu: FileImage,
  social: Share2,
  detailClone: Copy,
  banner: Layout,
  'amazon-image-gen': ShoppingCart,
  detail2: FileImage,
  handheld: Hand,
  productFusion: Layers,
  productTryon: User,
  'product-9grid': Layout,
  storyboard: Film,
  'tk-video': Clapperboard,
  'three-view': Layout,
  workflow: Boxes,
  'image-edit-region': Wand2,
  'image-translate': Languages,
};

const CATEGORIES = [
  { key: '素材工作台', label: '创作', icon: Sparkles, color: 'text-blue-500' },
  { key: '店铺上架素材', label: '电商', icon: ShoppingBag, color: 'text-emerald-500' },
];

interface LeftSidebarProps {
  onOpenAuth: () => void;
  onOpenRecharge: () => void;
  onOpenRecords: () => void;
  onNewConversation: () => void;
  activeConversationId: string;
  conversations: Array<{ id: string; title: string; messages: any[] }>;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onSelectNav?: (id: string) => void;
  activeNav?: string;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  onOpenAuth, onOpenRecharge, onOpenRecords, onNewConversation,
  activeConversationId, conversations, onSelectConversation, onDeleteConversation,
  onSelectNav, activeNav = 'chat-gen'
}) => {
  const { user, logout, refreshUser } = useAuth();
  const { config } = useSiteConfig();
  const [credits, setCredits] = useState(0);
  const [isSubAccountModalOpen, setIsSubAccountModalOpen] = useState(false);
  const [generatePrice, setGeneratePrice] = useState(0.3);
  const [navItems, setNavItems] = useState<{ id: string; icon: React.ElementType; label: string; category: string }[]>([]);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(
    new Set(['社媒图文引流', '短视频带货引流'])
  );
  const [showMenu, setShowMenu] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: number; title: string; content: string; created_at: string }>>([]);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [couponInfo, setCouponInfo] = useState<{ total: number; expiresAt: string | null }>({ total: 0, expiresAt: null });
  const [notifDismissed, setNotifDismissed] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('notif_dismissed') || '[]')); } catch { return new Set(); }
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
  });
  const [hoveredNav, setHoveredNav] = useState<{ label: string; top: number } | null>(null);

  useEffect(() => {
    localStorage.setItem('notif_dismissed', JSON.stringify(Array.from(notifDismissed)));
  }, [notifDismissed]);

  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const res = await fetch(`${API_URL}/api/notifications`);
        const data = await res.json();
        if (data.success) setNotifications(data.data || []);
      } catch {}
    };
    fetchNotifs();
  }, []);

  useEffect(() => {
    if (user?.credits !== undefined) setCredits(user.credits);
  }, [user]);

  useEffect(() => {
    if (!showMenu || user?.isSubUser) { setCouponInfo({ total: 0, expiresAt: null }); return; }
    refreshUser();
    const fetchCouponInfo = async () => {
      try {
        const token = sessionStorage.getItem('authToken');
        if (!token) return;
        const res = await api.get('/api/coupons/claims', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const claims = (res.data.data || []) as any[];
        const activeClaims = claims.filter((c: any) => c.expired === 0 && new Date(c.expires_at) > new Date());
        const totalCouponCredits = activeClaims.reduce((sum: number, c: any) => sum + Number(c.credits || 0), 0);
        const earliestExpiry = activeClaims.length > 0
          ? activeClaims.reduce((earliest: any, c: any) => new Date(c.expires_at) < new Date(earliest.expires_at) ? c : earliest)
          : null;
        setCouponInfo({
          total: totalCouponCredits,
          expiresAt: earliestExpiry ? earliestExpiry.expires_at : null
        });
      } catch {}
    };
    fetchCouponInfo();
  }, [showMenu, user?.isSubUser]);

  useEffect(() => {
    const loadPricing = async () => {
      const price = await getPricing();
      setGeneratePrice(price.nanobann2_generation || price.gpt_image2_generation || 0.3);
    };
    loadPricing();
    const interval = setInterval(loadPricing, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const CATEGORY_MAP: Record<string, string> = {
      '营销工具': '社媒图文引流',
      '电商': '店铺上架素材',
      '创意': '店铺上架素材',
      '视频工具': '短视频带货引流',
    };
    const NAV_CATEGORY_OVERRIDE: Record<string, string> = {
      'chat-gen': '素材工作台',
      'workflow': '素材工作台',
      'three-view': '素材工作台',
      'productFusion': '素材工作台',
      'productRefine': '素材工作台',
      'product-9grid': '素材工作台',
    };
    getAvailableNavItems().then(items => {
      const filtered = items.filter(n => n.enabled !== false).filter(n => !['styleCopy', 'tryon', 'carousel', 'amazon-carousel', 'workflow', 'deepseek-chat'].includes(n.nav_id)).map(n => ({
        id: n.nav_id,
        icon: ICON_MAP[n.nav_id] || ImageIcon,
        label: ({ xiaohongshu: '小红书种草图文', social: '社媒POV出图', 'chat-gen': '创意生图', workflow: '工作流生图', productFusion: '场景融合', productTryon: '产品穿搭', productRefine: '产品精修', 'product-9grid': '产品展示图', detailClone: '智能设计克隆', 'amazon-image-gen': '亚马逊生图', 'image-edit-region': '区域编辑', 'image-translate': '图片转译' })[n.nav_id] || n.label,
        category: NAV_CATEGORY_OVERRIDE[n.nav_id] || CATEGORY_MAP[n.category] || n.category
      }));
      // 确保亚马逊生图始终存在（后端可能未同步）
      if (!filtered.some(n => n.id === 'amazon-image-gen')) {
        filtered.push({
          id: 'amazon-image-gen', icon: ShoppingCart, label: '亚马逊生图', category: '店铺上架素材'
        });
      }
      // 确保区域编辑始终存在（后端可能未同步）
      if (!filtered.some(n => n.id === 'image-edit-region')) {
        filtered.push({
          id: 'image-edit-region', icon: Wand2, label: '区域编辑', category: '素材工作台'
        });
      }
      // 确保图片转译始终存在（后端可能未同步）
      if (!filtered.some(n => n.id === 'image-translate')) {
        filtered.push({
          id: 'image-translate', icon: Languages, label: '图片转译', category: '店铺上架素材'
        });
      }
      setNavItems(filtered);
    });
  }, []);

  useEffect(() => {
    const handleCreditsUpdate = () => {
      try {
        const userStr = sessionStorage.getItem('user');
        if (userStr) setCredits(JSON.parse(userStr).credits || 0);
      } catch {}
    };
    window.addEventListener('credits-updated', handleCreditsUpdate);
    return () => window.removeEventListener('credits-updated', handleCreditsUpdate);
  }, []);

  const toggleCat = (cat: string) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  const getInitial = (email: string) => email?.charAt(0).toUpperCase() || '?';
  const isLoggedIn = !!user?.email;

  const visibleItems = navItems.length > 0 ? navItems : [];
  const itemsByCategory = CATEGORIES.map(cat => ({
    ...cat,
    items: visibleItems.filter(item => item.category === cat.key),
  }));

  const unreadCount = notifications.filter(n => !notifDismissed.has(n.id)).length;

  return (
    <>
      <div
        className={`h-screen bg-white flex flex-col flex-shrink-0 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] border-r border-gray-200/60
          ${sidebarCollapsed ? 'w-[68px]' : 'w-[220px]'}
        `}
      >
        {/* Header */}
        <div className={`flex items-center h-14 flex-shrink-0 border-b border-gray-100 ${sidebarCollapsed ? 'justify-center' : 'justify-between px-4'}`}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5">
              <img src={config.logo_url} alt="" className="w-5 h-5" />
              <span style={{ fontFamily: "'Fredoka', sans-serif", fontWeight: 600, fontSize: '1rem' }} className="text-[#1a1a1a]">Softhooky</span>
            </div>
          )}

          <div className="flex items-center gap-0.5">
            {isLoggedIn && unreadCount > 0 && !sidebarCollapsed && (
              <button
                onClick={() => setShowNotifModal(true)}
                className="relative w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-all flex-shrink-0"
              >
                <Bell size={14} className="text-[#999]" strokeWidth={1.5} />
                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-500 rounded-full" />
              </button>
            )}
            <button
              onClick={toggleSidebar}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-all flex-shrink-0"
              title={sidebarCollapsed ? '展开' : '收起'}
            >
              {sidebarCollapsed ? <ChevronsRight size={14} className="text-[#bbb]" strokeWidth={1.5} /> : <ChevronsLeft size={14} className="text-[#bbb]" strokeWidth={1.5} />}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-2.5 py-1 scrollbar-none">
          {itemsByCategory.map(cat => {
            const isCollapsed = collapsedCats.has(cat.key);
            return (
              <div key={cat.key} className="mb-0.5">
                {!sidebarCollapsed && (
                  <div className="flex items-center gap-2 px-2 pt-3.5 pb-1.5 group">
                    <cat.icon size={11} className={`${cat.color} flex-shrink-0`} strokeWidth={2} />
                    <span className="text-[11px] font-semibold tracking-wide text-[#666]">{cat.label}</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent" />
                    <button
                      onClick={() => toggleCat(cat.key)}
                      className="w-4 h-4 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors opacity-60 group-hover:opacity-100"
                    >
                      <ChevronDown size={10} className={`text-[#999] transition-transform duration-300 ${isCollapsed ? '-rotate-90' : ''}`} />
                    </button>
                  </div>
                )}

                <div className={sidebarCollapsed ? 'space-y-0.5 pt-2' : ''}>
                  {cat.items.map(item => {
                    const isActive = activeNav === item.id;

                    if (sidebarCollapsed) {
                      return (
                        <div key={item.id} className="flex justify-center">
                          <button
                            onClick={() => onSelectNav?.(item.id)}
                            onMouseEnter={(e) => setHoveredNav({ label: item.label, top: e.currentTarget.getBoundingClientRect().top + e.currentTarget.offsetHeight / 2 })}
                            onMouseLeave={() => setHoveredNav(null)}
                            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 relative ${
                              isActive
                                ? 'text-blue-500 bg-blue-50 shadow-sm shadow-blue-100/50'
                                : 'text-[#555] hover:text-[#1a1a1a] hover:bg-gray-50'
                            }`}
                          >
                            {isActive && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-blue-500 rounded-r-full" />
                            )}
                            <item.icon size={17} strokeWidth={isActive ? 2 : 1.5} />
                          </button>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={item.id}
                        onClick={() => onSelectNav?.(item.id)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all duration-200 group relative ${
                          isActive
                            ? 'text-[#1a1a1a] bg-blue-50/80 shadow-sm shadow-blue-100/50'
                            : 'text-[#444] hover:text-[#1a1a1a] hover:bg-gray-50/80'
                        }`}
                      >
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-blue-500 rounded-r-full" />
                        )}
                        <div className={`w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 transition-all duration-200 ${
                          isActive
                            ? 'bg-blue-500 text-white shadow-sm shadow-blue-200'
                            : 'text-[#555] bg-gray-100/50 group-hover:bg-gray-100'
                        }`}>
                          <item.icon size={13} strokeWidth={isActive ? 2 : 1.5} />
                        </div>
                        <span className={`text-[13px] truncate ${isActive ? 'font-medium' : ''}`}>{item.label}</span>
                      </button>                    
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Video Studio 按钮 */}
          <div className="mt-2">
            {sidebarCollapsed ? (
              <div className="flex justify-center">
                <button
                  onClick={() => { window.location.href = '/video'; }}
                  onMouseEnter={(e) => setHoveredNav({ label: 'Video Studio', top: e.currentTarget.getBoundingClientRect().top + e.currentTarget.offsetHeight / 2 })}
                  onMouseLeave={() => setHoveredNav(null)}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-all duration-200 shadow-sm shadow-blue-200/50"
                >
                  <Clapperboard size={17} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { window.location.href = '/video'; }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-all duration-200 shadow-sm shadow-blue-200/50"
              >
                <div className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 bg-white/20">
                  <Clapperboard size={13} strokeWidth={2} />
                </div>
                <span className="text-[13px] font-medium truncate">Video Studio</span>
              </button>
            )}
          </div>
        </div>

        {/* Tooltip for collapsed sidebar */}
        {sidebarCollapsed && hoveredNav && (
          <div className="fixed px-3 py-2 bg-[#1a1a1a]/95 backdrop-blur-sm text-white text-xs font-medium rounded-lg shadow-lg z-[9999] whitespace-nowrap pointer-events-none"
            style={{ left: '78px', top: hoveredNav.top, transform: 'translateY(-50%)' }}>
            {hoveredNav.label}
            <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-0 h-0 border-y-[4px] border-y-transparent border-r-[4px] border-r-[#1a1a1a]/95" />
          </div>
        )}

        {/* Bottom Section */}
        <div className={`border-t border-gray-100 ${sidebarCollapsed ? 'px-2.5 py-3' : 'px-2.5 py-2.5'}`}>
          {isLoggedIn ? (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className={`w-full flex items-center rounded-xl transition-all duration-200 group hover:bg-gray-50/80
                  ${sidebarCollapsed ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'}`}
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-blue-200/50">
                  <span className="text-white text-[11px] font-bold">{getInitial(user.email)}</span>
                </div>
                {!sidebarCollapsed && (
                  <>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[11px] text-[#666] truncate leading-tight">{user.email}</p>
                    </div>
                    <ChevronDown size={11} className={`text-[#ccc] transition-transform ${showMenu ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>

              {showMenu && (
                <div className="fixed inset-0 z-[999] flex items-start justify-center pt-[8vh]" onClick={() => setShowMenu(false)}>
                  <div className="absolute inset-0 bg-black/20 backdrop-blur-[6px]" />
                  <div
                    className="relative w-[380px] bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.18)] overflow-hidden animate-slide-up"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header */}
                    <div className="relative px-5 pt-5 pb-4">
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center flex-shrink-0 ring-2 ring-white shadow-md">
                          <span className="text-white text-lg font-semibold">{getInitial(user.email)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Coins size={13} className="text-amber-500" />
                            <span className="text-[13px] font-semibold text-amber-600">{Number(credits).toFixed(1)}</span>
                            <span className="text-[11px] text-gray-400">积分</span>
                          </div>
                        </div>
                        <button onClick={() => setShowMenu(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors flex-shrink-0">
                          <X size={13} className="text-gray-400" />
                        </button>
                      </div>
                      {couponInfo.total > 0 && (
                        <div className="mt-3 flex items-center gap-2 bg-amber-50 rounded-xl px-3 py-2">
                          <Sparkles size={12} className="text-amber-500 flex-shrink-0" />
                          <span className="text-[11px] text-amber-700 leading-snug">
                            {couponInfo.total.toFixed(1)} 积分通过优惠券获得
                            {couponInfo.expiresAt && `，请在 ${Math.ceil((new Date(couponInfo.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} 天内用完`}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="h-px bg-gray-100 mx-5" />

                    {/* Menu Items */}
                    <div className="p-2">
                      {!user?.isSubUser && !user?.recharge_disabled && (
                        <button onClick={() => { onOpenRecharge(); setShowMenu(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors"><CreditCard size={16} className="text-blue-500" /></div>
                          <div className="flex-1 text-left">
                            <p className="text-[13px] font-medium text-gray-800">充值</p>
                          </div>
                          <ChevronRight size={14} className="text-gray-300" />
                        </button>
                      )}
                      <button onClick={() => { onOpenRecords(); setShowMenu(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
                        <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-100 transition-colors"><History size={16} className="text-purple-500" /></div>
                        <div className="flex-1 text-left">
                          <p className="text-[13px] font-medium text-gray-800">记录</p>
                        </div>
                        <ChevronRight size={14} className="text-gray-300" />
                      </button>
                      {!user?.isSubUser && (
                        <button onClick={() => { setIsSubAccountModalOpen(true); setShowMenu(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 transition-colors"><Users size={16} className="text-emerald-500" /></div>
                          <div className="flex-1 text-left">
                            <p className="text-[13px] font-medium text-gray-800">子账号</p>
                          </div>
                          <ChevronRight size={14} className="text-gray-300" />
                        </button>
                      )}
                      <button onClick={() => { onSelectNav?.('image-library'); setShowMenu(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-100 transition-colors"><ImageIcon size={16} className="text-amber-500" /></div>
                        <div className="flex-1 text-left">
                          <p className="text-[13px] font-medium text-gray-800">图库</p>
                        </div>
                        <ChevronRight size={14} className="text-gray-300" />
                      </button>
                      {!user?.isSubUser && (
                        <button onClick={() => { setShowCouponModal(true); setShowMenu(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
                          <div className="w-8 h-8 rounded-lg bg-pink-50 flex items-center justify-center flex-shrink-0 group-hover:bg-pink-100 transition-colors"><Gift size={16} className="text-pink-500" /></div>
                          <div className="flex-1 text-left">
                            <p className="text-[13px] font-medium text-gray-800">领券</p>
                          </div>
                          <ChevronRight size={14} className="text-gray-300" />
                        </button>
                      )}
                      {(() => {
                        const u = JSON.parse(sessionStorage.getItem('user') || '{}');
                        return !!u.is_agent;
                      })() && (
                        <a href="/agent"
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-100 transition-colors"><TrendingUp size={16} className="text-indigo-500" /></div>
                          <div className="flex-1 text-left">
                            <p className="text-[13px] font-medium text-gray-800">佣金中心</p>
                          </div>
                          <ChevronRight size={14} className="text-gray-300" />
                        </a>
                      )}
                    </div>

                    <div className="h-px bg-gray-100 mx-5" />

                    {/* Footer */}
                    <div className="px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button onClick={() => { setShowTermsModal(true); setShowMenu(false); }}
                          className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">使用条款</button>
                        <span className="w-px h-3 bg-gray-200" />
                        <button onClick={() => { setShowPrivacyModal(true); setShowMenu(false); }}
                          className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">隐私政策</button>
                      </div>
                      <button onClick={() => { logout(); setShowMenu(false); }}
                          className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-[12px] text-red-500 hover:bg-red-50 transition-colors">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        退出
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className={`flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 transition-all duration-200 text-[13px] font-medium shadow-sm shadow-blue-200/50 ${sidebarCollapsed ? 'w-10 h-10 mx-auto' : 'w-full py-2.5'}`}
            >
              {sidebarCollapsed ? <User size={16} /> : '登录'}
            </button>
          )}
        </div>
      </div>

      {/* Notification Modal */}
      {showNotifModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setShowNotifModal(false)}>
          <div className="absolute inset-0 bg-black/10 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col shadow-2xl shadow-black/10 animate-slide-up border border-gray-100" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center shadow-sm">
                  <Bell size={16} className="text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-[#1a1a1a]">通知</h2>
                  <p className="text-[11px] text-[#bbb]">{notifications.length} 条通知</p>
                </div>
              </div>
              <button onClick={() => setShowNotifModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors">
                <X size={14} className="text-[#bbb]" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-14 h-14 bg-gray-50 rounded-xl flex items-center justify-center mb-3">
                    <Bell size={24} className="text-gray-300" />
                  </div>
                  <p className="text-sm font-medium text-[#999]">暂无通知</p>
                  <p className="text-xs text-[#ccc] mt-1">有新通知时会在这里显示</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-1 mb-3">
                    <span className="text-xs text-[#bbb]">{unreadCount} 条未读</span>
                    {unreadCount > 0 && (
                      <button onClick={() => setNotifDismissed(prev => new Set(notifications.map(n => n.id)))} className="text-xs text-[#999] hover:text-[#444] transition-colors">全部已读</button>
                    )}
                  </div>
                  {notifications.map(n => {
                    const isUnread = !notifDismissed.has(n.id);
                    return (
                      <div key={n.id} className={`relative group rounded-xl border transition-all ${isUnread ? 'bg-white border-gray-200 shadow-sm' : 'bg-white border-gray-100'}`}>
                        {isUnread && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500 rounded-l-xl" />}
                        <div className="p-4 pl-[18px]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className={`text-sm ${isUnread ? 'font-semibold text-[#1a1a1a]' : 'font-medium text-[#999]'}`}>{n.title}</h3>
                                {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                              </div>
                              <p className={`text-xs mt-1 leading-relaxed ${isUnread ? 'text-[#666]' : 'text-[#bbb]'}`}>{n.content}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                              <span className="text-[10px] text-gray-300 whitespace-nowrap">{new Date(n.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span>
                              {isUnread && (
                                <button onClick={() => setNotifDismissed(prev => new Set([...prev, n.id]))} className="opacity-0 group-hover:opacity-100 text-[10px] text-[#bbb] hover:text-[#666] transition-all whitespace-nowrap">已读</button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sub-account Modal */}
      {isSubAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setIsSubAccountModalOpen(false)}>
          <div className="absolute inset-0 bg-black/10 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl shadow-black/10 border border-gray-100" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center shadow-sm">
                  <Users size={16} className="text-white" />
                </div>
                <h2 className="text-base font-semibold text-[#1a1a1a]">子账号管理</h2>
              </div>
              <button onClick={() => setIsSubAccountModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors">
                <X size={14} className="text-[#bbb]" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <SubAccountManager token={sessionStorage.getItem('authToken') || ''} />
            </div>
          </div>
        </div>
      )}

      {/* Coupon Modal */}
      <CouponClaimModal isOpen={showCouponModal} onClose={() => setShowCouponModal(false)} />

      {/* Terms & Privacy Modals */}
      {showTermsModal && <TermsModal onClose={() => setShowTermsModal(false)} />}
      {showPrivacyModal && <PrivacyModal onClose={() => setShowPrivacyModal(false)} />}
    </>
  );
};

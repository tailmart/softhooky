import React, { useState, Suspense } from 'react';
import { Film, Share2, FileImage, Sparkles, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clapperboard, Coins, CreditCard, History, Users, Image as ImageIcon, Gift, TrendingUp, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSiteConfig } from '../contexts/SiteConfigContext';

const GeminiVideoPage = React.lazy(() => import('./plugins/GeminiVideoPage').then(m => ({ default: m.GeminiVideoPage })));
const Veo31VideoPage = React.lazy(() => import('./plugins/Veo31VideoPage').then(m => ({ default: m.Veo31VideoPage })));
const XiaohongshuPage = React.lazy(() => import('./plugins/XiaohongshuPage').then(m => ({ default: m.XiaohongshuPage })));
const SocialMediaPage = React.lazy(() => import('./plugins/SocialMediaPage').then(m => ({ default: m.SocialMediaPage })));
const StoryboardPage = React.lazy(() => import('./plugins/StoryboardPage').then(m => ({ default: m.StoryboardPage })));
const TikTokVideoPage = React.lazy(() => import('./plugins/TikTokVideoPage').then(m => ({ default: m.TikTokVideoPage })));

type TabId = 'gemini' | 'veo31' | 'xiaohongshu' | 'social' | 'storyboard' | 'tk-video';

interface TabItem { id: TabId; label: string; icon: React.ElementType; }
interface Category { id: string; label: string; icon: React.ElementType; color: string; items: TabItem[]; }

const CATEGORIES: Category[] = [
  {
    id: 'social', label: '社媒宣传', icon: Share2, color: 'text-rose-500',
    items: [
      { id: 'xiaohongshu', label: '小红书种草图文', icon: FileImage },
      { id: 'social', label: '社媒POV出图', icon: Share2 },
    ],
  },
  {
    id: 'video', label: '视频生成', icon: Film, color: 'text-violet-500',
    items: [
      { id: 'storyboard', label: '故事板', icon: Clapperboard },
      { id: 'tk-video', label: 'TK脚本图', icon: Film },
      { id: 'gemini', label: 'Gemini Omini', icon: Film },
      { id: 'veo31', label: 'Veo3.1 视频', icon: Film },
    ],
  },
];

const LoadingFallback = () => (
  <div className="flex-1 flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-[#E5E5E5] border-t-[#171717] rounded-full animate-spin" />
      <span className="text-sm text-[#A3A3A3]">加载中...</span>
    </div>
  </div>
);

const VideoProjectPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('xiaohongshu');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userCredits, setUserCredits] = useState(0);
  const [couponInfo, setCouponInfo] = useState<{ total: number; expiresAt: string | null }>({ total: 0, expiresAt: null });
  const [showSubAccountModal, setShowSubAccountModal] = useState(false);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const { user, logout } = useAuth();
  const { config } = useSiteConfig();

  const isLoggedIn = !!user?.email;
  const getInitial = (email: string) => email?.charAt(0).toUpperCase() || '?';

  React.useEffect(() => {
    const u = JSON.parse(sessionStorage.getItem('user') || '{}');
    setUserCredits(u.credits || 0);
    const handler = () => { const u2 = JSON.parse(sessionStorage.getItem('user') || '{}'); setUserCredits(u2.credits || 0); };
    window.addEventListener('credits-updated', handler);
    return () => window.removeEventListener('credits-updated', handler);
  }, []);

  React.useEffect(() => {
    try { const c = JSON.parse(sessionStorage.getItem('coupon_credits') || '{}'); setCouponInfo(c); } catch {}
  }, []);

  const toggleCat = (catId: string) => {
    setCollapsedCats(prev => { const n = new Set(prev); n.has(catId) ? n.delete(catId) : n.add(catId); return n; });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'gemini': return <GeminiVideoPage />;
      case 'veo31': return <Veo31VideoPage />;
      case 'xiaohongshu': return <XiaohongshuPage />;
      case 'social': return <SocialMediaPage />;
      case 'storyboard': return <StoryboardPage />;
      case 'tk-video': return <TikTokVideoPage />;
      default: return null;
    }
  };

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Sidebar */}
      <div className={`h-screen bg-white flex flex-col flex-shrink-0 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] border-r border-gray-200/60 ${sidebarCollapsed ? 'w-[68px]' : 'w-[220px]'}`}>
        {/* Header */}
        <div className={`flex items-center h-14 flex-shrink-0 border-b border-gray-100 ${sidebarCollapsed ? 'justify-center' : 'justify-between px-4'}`}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5">
              <img src={config.logo_url} alt="" className="w-5 h-5" />
              <span style={{ fontFamily: "'Fredoka', sans-serif", fontWeight: 600, fontSize: '1rem' }} className="text-[#1a1a1a]">Softhooky</span>
            </div>
          )}
          <button onClick={() => setSidebarCollapsed(p => !p)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-all flex-shrink-0">
            {sidebarCollapsed ? <ChevronsRight size={14} className="text-[#bbb]" strokeWidth={1.5} /> : <ChevronsLeft size={14} className="text-[#bbb]" strokeWidth={1.5} />}
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-2.5 py-1 scrollbar-none">
          {CATEGORIES.map(cat => {
            const isCollapsed = collapsedCats.has(cat.id);
            const CatIcon = cat.icon;
            return (
              <div key={cat.id} className="mb-1">
                {!sidebarCollapsed && (
                  <div className="flex items-center gap-2 px-2 pt-4 pb-2 group">
                    <CatIcon size={11} className={`${cat.color} flex-shrink-0`} strokeWidth={2} />
                    <span className="text-[11px] font-semibold tracking-wide text-[#666]">{cat.label}</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent" />
                    <button onClick={() => toggleCat(cat.id)}
                      className="w-4 h-4 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors opacity-60 group-hover:opacity-100">
                      <ChevronDown size={10} className={`text-[#999] transition-transform duration-300 ${isCollapsed ? '-rotate-90' : ''}`} />
                    </button>
                  </div>
                )}
                <div className={sidebarCollapsed ? 'space-y-1 pt-2' : 'space-y-0.5'}>
                  {cat.items.map(item => {
                    const isActive = activeTab === item.id;
                    const Icon = item.icon;
                    if (sidebarCollapsed) {
                      return (
                        <div key={item.id} className="flex justify-center">
                          <button onClick={() => setActiveTab(item.id)} title={item.label}
                            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 relative ${isActive ? 'text-blue-500 bg-blue-50 shadow-sm shadow-blue-100/50' : 'text-[#555] hover:text-[#1a1a1a] hover:bg-gray-50'}`}>
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-blue-500 rounded-r-full" />}
                            <Icon size={17} strokeWidth={isActive ? 2 : 1.5} />
                          </button>
                        </div>
                      );
                    }
                    return (
                      <button key={item.id} onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl transition-all duration-200 group relative ${isActive ? 'text-[#1a1a1a] bg-blue-50/80 shadow-sm shadow-blue-100/50' : 'text-[#444] hover:text-[#1a1a1a] hover:bg-gray-50/80'}`}>
                        {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-blue-500 rounded-r-full" />}
                        <div className={`w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 transition-all duration-200 ${isActive ? 'bg-blue-500 text-white shadow-sm shadow-blue-200' : 'text-[#555] bg-gray-100/50 group-hover:bg-gray-100'}`}>
                          <Icon size={13} strokeWidth={isActive ? 2 : 1.5} />
                        </div>
                        <span className={`text-[13px] truncate ${isActive ? 'font-medium' : ''}`}>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* User Section */}
        <div className={`border-t border-gray-100 ${sidebarCollapsed ? 'px-2.5 py-3' : 'px-2.5 py-2.5'}`}>
          {isLoggedIn ? (
            <div className="relative">
              <button onClick={() => setShowUserMenu(p => !p)}
                className={`w-full flex items-center rounded-xl transition-all duration-200 group hover:bg-gray-50/80 ${sidebarCollapsed ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'}`}>
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-blue-200/50">
                  <span className="text-white text-[11px] font-bold">{getInitial(user.email)}</span>
                </div>
                {!sidebarCollapsed && (
                  <>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[11px] text-[#666] truncate leading-tight">{user.email}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Coins size={11} className="text-amber-500" />
                        <span className="text-[11px] font-bold text-amber-600">{Number(user.credits || 0).toFixed(1)}</span>
                      </div>
                    </div>
                    <ChevronDown size={11} className={`text-[#ccc] transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>

              {showUserMenu && (
                <div className="fixed inset-0 z-[999] flex items-start justify-center pt-[8vh]" onClick={() => setShowUserMenu(false)}>
                  <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
                  <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-black/15 overflow-hidden animate-slide-up" onClick={(e) => e.stopPropagation()}>
                    <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm flex-shrink-0">
                          <span className="text-white text-base font-bold">{getInitial(user.email)}</span>
                        </div>
                        <div>
                          <p className="text-base font-semibold text-gray-900">{user.email}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Coins size={14} className="text-amber-500" />
                            <span className="text-sm font-bold text-amber-600">{Number(userCredits).toFixed(1)}</span>
                            <span className="text-xs text-gray-400">积分</span>
                            {couponInfo.total > 0 && (
                              <span className="text-[10px] text-pink-600 bg-pink-50 px-1.5 py-0.5 rounded-lg ml-1">
                                {couponInfo.total.toFixed(1)} 积分通过优惠券获得
                                {couponInfo.expiresAt && `，请在 ${Math.ceil((new Date(couponInfo.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} 天内用完`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => setShowUserMenu(false)} className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors flex-shrink-0">
                        <X size={14} className="text-gray-400" />
                      </button>
                    </div>
                    <div className="p-4 space-y-1">
                      {!user?.isSubUser && !user?.recharge_disabled && (
                        <button onClick={() => { setShowUserMenu(false); }}
                          className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-blue-50 transition-all">
                          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0"><CreditCard size={18} className="text-blue-600" /></div>
                          <div className="flex-1 text-left">
                            <p className="text-sm font-semibold text-gray-900">充值</p>
                            <p className="text-xs text-gray-400 mt-0.5">购买积分，解锁更多创作能力</p>
                          </div>
                        </button>
                      )}
                      <button onClick={() => { setShowUserMenu(false); }}
                        className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-purple-50 transition-all">
                        <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0"><History size={18} className="text-purple-600" /></div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-semibold text-gray-900">记录</p>
                          <p className="text-xs text-gray-400 mt-0.5">查看充值与消费明细</p>
                        </div>
                      </button>
                      {!user?.isSubUser && (
                        <button onClick={() => { setShowUserMenu(false); setShowSubAccountModal(true); }}
                          className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-emerald-50 transition-all">
                          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0"><Users size={18} className="text-emerald-600" /></div>
                          <div className="flex-1 text-left">
                            <p className="text-sm font-semibold text-gray-900">子账号</p>
                            <p className="text-xs text-gray-400 mt-0.5">创建和管理子账号</p>
                          </div>
                        </button>
                      )}
                      <button onClick={() => { setShowUserMenu(false); }}
                        className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-amber-50 transition-all">
                        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0"><ImageIcon size={18} className="text-amber-600" /></div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-semibold text-gray-900">图库</p>
                          <p className="text-xs text-gray-400 mt-0.5">查看和管理生成的图片</p>
                        </div>
                      </button>
                      {!user?.isSubUser && (
                        <button onClick={() => { setShowUserMenu(false); setShowCouponModal(true); }}
                          className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-pink-50 transition-all">
                          <div className="w-9 h-9 rounded-xl bg-pink-100 flex items-center justify-center flex-shrink-0"><Gift size={18} className="text-pink-600" /></div>
                          <div className="flex-1 text-left">
                            <p className="text-sm font-semibold text-gray-900">领券</p>
                            <p className="text-xs text-gray-400 mt-0.5">输入优惠券码兑换积分</p>
                          </div>
                        </button>
                      )}
                      {(() => { try { const u = JSON.parse(sessionStorage.getItem('user') || '{}'); return !!u.is_agent; } catch { return false; } })() && (
                        <a href="/agent"
                          className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-indigo-50 transition-all">
                          <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0"><TrendingUp size={18} className="text-indigo-600" /></div>
                          <div className="flex-1 text-left">
                            <p className="text-sm font-semibold text-gray-900">佣金中心</p>
                            <p className="text-xs text-gray-400 mt-0.5">邀请好友赚取佣金</p>
                          </div>
                        </a>
                      )}
                    </div>
                    <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button onClick={() => { setShowUserMenu(false); setShowTermsModal(true); }}
                          className="text-xs text-gray-400 hover:text-gray-600 transition-colors">使用条款</button>
                        <span className="w-px h-3 bg-gray-200" />
                        <button onClick={() => { setShowUserMenu(false); setShowPrivacyModal(true); }}
                          className="text-xs text-gray-400 hover:text-gray-600 transition-colors">隐私政策</button>
                      </div>
                      <button onClick={() => { logout(); setShowUserMenu(false); }}
                        className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-medium text-red-500 hover:bg-red-50 transition-all">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        退出
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center">
              <span className="text-[11px] text-[#ccc]">请先登录</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 h-full overflow-hidden">
        <Suspense fallback={<LoadingFallback />}>
          <div className="w-full h-full overflow-auto">
            {renderContent()}
          </div>
        </Suspense>
      </div>
    </div>
  );
};

export default VideoProjectPage;

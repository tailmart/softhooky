import React, { useState, useEffect } from 'react';
import {
  Sparkles, Bell, X, ArrowRight, ChevronRight,
  Film, Video, Camera, Image as ImageIcon, Layers,
  Zap, Star, TrendingUp, Play
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

// ============ 5大核心功能 ============
const CORE_FEATURES = [
  {
    id: 'storyboard',
    title: '故事板',
    subtitle: 'AI 分镜生成',
    description: '输入剧本，自动生成专业影视分镜画面',
    icon: Film,
    gradient: 'from-violet-600 to-indigo-700',
    accent: '#8b5cf6',
    caseImage: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=professional+film+storyboard+frames+cinematic+shot+sequence+dark+background+blue+accent+lighting&image_size=landscape_4_3',
  },
  {
    id: 'nano-gen',
    title: 'TK带货图片',
    subtitle: '产品商业大片',
    description: '上传产品图，AI生成TikTok风格带货海报',
    icon: Camera,
    gradient: 'from-blue-600 to-cyan-600',
    accent: '#3b82f6',
    caseImage: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=tiktok+style+product+photography+commercial+photo+studio+lighting+modern+aesthetic+dark+background&image_size=landscape_4_3',
  },
  {
    id: 'gemini-video',
    title: '视频生成',
    subtitle: '图片变营销视频',
    description: '上传图片，AI生成短视频广告',
    icon: Video,
    gradient: 'from-emerald-600 to-teal-700',
    accent: '#10b981',
    caseImage: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=product+video+production+cinematic+motion+graphics+marketing+video+dark+background+blue+neon+light&image_size=landscape_4_3',
  },
  {
    id: 'xiaohongshu',
    title: '小红书种草',
    subtitle: '一键生成笔记',
    description: '封面+文案+5张配图，完整种草笔记',
    icon: Star,
    gradient: 'from-rose-600 to-pink-700',
    accent: '#f43f5e',
    caseImage: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=xiaohongshu+social+media+post+aesthetic+flat+lay+product+photography+pastel+colors+minimalist&image_size=landscape_4_3',
  },
  {
    id: 'social',
    title: '社媒POV出图',
    subtitle: '第一视角场景图',
    description: '适配Ins/TikTok/FB，多平台一键出图',
    icon: Layers,
    gradient: 'from-amber-600 to-orange-700',
    accent: '#f59e0b',
    caseImage: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=social+media+content+creation+first+person+perspective+lifestyle+product+shot+modern+aesthetic+dark&image_size=landscape_4_3',
  },
];

// ============ 使用场景数据 ============
const USE_CASES = [
  { label: '电商卖家', desc: '产品图批量生成', icon: '🛍️' },
  { label: '内容创作者', desc: '社媒素材批量出', icon: '📱' },
  { label: '品牌营销', desc: '短视频广告制作', icon: '🎬' },
  { label: '独立站', desc: '详情页/Banner', icon: '🌐' },
];

interface HomePageProps {
  onNavigateToTool: (toolId: string) => void;
  onNavigateToPlugin: (pluginId: string) => void;
  onSwitchTab?: (tab: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigateToTool, onNavigateToPlugin, onSwitchTab }) => {
  const { isAuthenticated, user } = useAuth();
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: number; title: string; content: string; created_at: string }>>([]);
  const [notifDismissed, setNotifDismissed] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('notif_dismissed') || '[]')); } catch { return new Set(); }
  });

  useEffect(() => {
    localStorage.setItem('notif_dismissed', JSON.stringify(Array.from(notifDismissed)));
  }, [notifDismissed]);

  useEffect(() => {
    fetch('/api/notifications').then(r => r.json()).then(d => {
      if (d.success) setNotifications(d.data || []);
    }).catch(() => {});
  }, []);

  const unreadNotifs = notifications.filter(n => !notifDismissed.has(n.id)).length;

  return (
    <div className="min-h-screen bg-[#0a0a0a] animate-mobile-fade-in">
      {/* ===== Hero 区域 ===== */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[13px] text-white/40 font-medium">
              {isAuthenticated ? `Hi, ${user?.email?.split('@')[0] || ''}` : '欢迎回来'}
            </p>
            <h1 className="text-[22px] font-extrabold text-white mt-0.5">
              AI 创作工作台
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated && user && (
              <button onClick={() => onNavigateToPlugin('recharge')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20">
                <Sparkles size={12} className="text-blue-400" />
                <span className="text-[12px] font-bold text-blue-400">{Number(user.credits || 0).toFixed(0)}</span>
              </button>
            )}
            {unreadNotifs > 0 && (
              <button onClick={() => setShowNotifModal(true)} className="relative w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.05]">
                <Bell size={17} className="text-white/40" />
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center text-[8px] font-bold bg-blue-500 text-white rounded-full">
                  {unreadNotifs > 9 ? '9+' : unreadNotifs}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* 快捷入口 - 登录/体验 */}
        {!isAuthenticated && (
          <button
            onClick={() => window.dispatchEvent(new Event('mobile-auth-required'))}
            className="w-full mb-4 p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 relative overflow-hidden"
          >
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
            <div className="relative flex items-center justify-between">
              <div className="text-left">
                <p className="text-[15px] font-bold text-white">立即登录，开始创作</p>
                <p className="text-[12px] text-white/50 mt-1">新用户注册即送免费积分</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                <ArrowRight size={18} className="text-white" />
              </div>
            </div>
          </button>
        )}
      </div>

      {/* ===== 核心功能 - 5大工具 ===== */}
      <div className="px-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-bold text-white">核心功能</h2>
          <button onClick={() => onSwitchTab?.('tools')}
            className="flex items-center gap-1 text-[11px] text-white/30 font-medium">
            全部 <ChevronRight size={12} />
          </button>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="space-y-3">
          {CORE_FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <button
                key={feature.id}
                onClick={() => onNavigateToTool(feature.id)}
                className="mobile-tap w-full relative overflow-hidden rounded-2xl text-left group"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* 背景图 */}
                <div className="absolute inset-0">
                  <img
                    src={feature.caseImage}
                    alt={feature.title}
                    className="w-full h-full object-cover opacity-40"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent" />
                </div>

                {/* 内容 */}
                <div className="relative flex items-center gap-4 p-4">
                  {/* 图标 */}
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center flex-shrink-0 shadow-lg`}
                    style={{ boxShadow: `0 8px 24px ${feature.accent}33` }}>
                    <Icon size={24} className="text-white" />
                  </div>

                  {/* 文字 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[16px] font-bold text-white">{feature.title}</h3>
                      <span className="text-[9px] font-bold text-blue-400 bg-blue-500/15 px-1.5 py-0.5 rounded-full">{feature.subtitle}</span>
                    </div>
                    <p className="text-[12px] text-white/40 mt-1 truncate">{feature.description}</p>
                  </div>

                  {/* 箭头 */}
                  <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0 group-hover:bg-white/[0.1] transition-colors">
                    <ChevronRight size={16} className="text-white/30" />
                  </div>
                </div>

                {/* 底部高亮线 */}
                <div className="absolute bottom-0 left-0 right-0 h-[1px]"
                  style={{ background: `linear-gradient(90deg, transparent, ${feature.accent}40, transparent)` }} />
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== 使用场景 ===== */}
      <div className="px-4 pb-4">
        <h2 className="text-[15px] font-bold text-white mb-3">适用场景</h2>
        <div className="grid grid-cols-4 gap-2">
          {USE_CASES.map((uc, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
              <span className="text-[22px]">{uc.icon}</span>
              <span className="text-[10px] font-medium text-white/50">{uc.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ===== 快速开始 ===== */}
      <div className="px-4 pb-6">
        <button
          onClick={() => onSwitchTab?.('tools')}
          className="mobile-tap w-full rounded-2xl p-4 bg-white/[0.03] border border-white/[0.06] flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
            <Zap size={18} className="text-blue-400" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[13px] font-bold text-white">探索全部工具</p>
            <p className="text-[11px] text-white/30 mt-0.5">发现更多AI创作能力</p>
          </div>
          <ArrowRight size={16} className="text-white/20" />
        </button>
      </div>

      {/* ===== 底部留白 ===== */}
      <div className="h-4" />

      {/* ===== 通知弹窗 ===== */}
      {showNotifModal && (
        <div className="fixed inset-0 z-[100] flex items-end" onClick={() => setShowNotifModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full bg-[#141414] rounded-t-[28px] pb-[calc(16px+env(safe-area-inset-bottom))] animate-mobile-slide-up"
            style={{ maxHeight: '70vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-[16px] font-extrabold text-white">通知</h3>
                <span className="text-[12px] text-white/30">({notifications.length})</span>
              </div>
              <button onClick={() => setShowNotifModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06]">
                <X size={16} className="text-white/40" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(70vh-60px)] px-4 pb-3 space-y-2">
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-[11px] text-white/30">{unreadNotifs} 条未读</span>
                {unreadNotifs > 0 && (
                  <button onClick={() => setNotifDismissed(prev => new Set(notifications.map(n => n.id)))}
                    className="text-[11px] text-blue-400 font-medium">全部已读</button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-12 h-12 rounded-full bg-white/[0.04] flex items-center justify-center mb-3">
                    <Bell size={20} className="text-white/15" />
                  </div>
                  <p className="text-[13px] text-white/30">暂无通知</p>
                </div>
              ) : notifications.map((n) => {
                const isUnread = !notifDismissed.has(n.id);
                return (
                <div key={n.id} className={`rounded-2xl p-4 transition-all ${isUnread ? 'bg-white/[0.04] border border-white/[0.06]' : 'bg-white/[0.02]'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-[13px] ${isUnread ? 'font-bold text-white' : 'font-medium text-white/40'}`}>{n.title}</p>
                        {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />}
                      </div>
                      {n.content && <p className={`text-[11px] mt-1.5 leading-relaxed ${isUnread ? 'text-white/50' : 'text-white/20'}`}>{n.content}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {n.created_at && <span className="text-[10px] text-white/20 whitespace-nowrap">{new Date(n.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span>}
                      {isUnread && (
                        <button onClick={() => setNotifDismissed(prev => new Set([...prev, n.id]))}
                          className="text-[10px] text-blue-400 font-medium">已读</button>
                      )}
                    </div>
                  </div>
                </div>
              )})}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

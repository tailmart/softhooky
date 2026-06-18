import React, { useState, useEffect } from 'react';
import {
  Sparkles, Bell, X, ArrowRight,
  Film, Video, Camera, Star, Layers
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../services/api';

// ============ 5大核心功能 ============
const CORE_FEATURES = [
  {
    id: 'xiaohongshu',
    title: '小红书种草',
    description: '封面+文案+5张配图，一键生成',
    icon: Star,
    tag: '热门',
  },
  {
    id: 'nano-gen',
    title: 'TK带货图片',
    description: 'TikTok风格产品商业大片',
    icon: Camera,
    tag: '爆款',
  },
  {
    id: 'video',
    title: 'AI视频生成',
    description: '图片转视频，一键出片',
    icon: Video,
    tag: '新功能',
  },
  {
    id: 'storyboard',
    title: '故事板',
    description: '剧本自动AI分镜生成',
    icon: Film,
    tag: null,
  },
  {
    id: 'social',
    title: '社媒POV出图',
    description: 'Ins/TikTok/FB多平台适配',
    icon: Layers,
    tag: null,
  },
];

// ============ 案例展示数据 ============
const SHOWCASE_ITEMS = [
  {
    title: '小红书种草笔记',
    desc: 'AI自动生成封面+文案+配图',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=xiaohongshu+style+product+flat+lay+aesthetic+pink+white+minimalist+phone+case&image_size=portrait_4_3',
    tag: '小红书',
  },
  {
    title: 'TK带货海报',
    desc: 'TikTok爆款产品图',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=tiktok+product+photography+headphones+studio+lighting+blue+gradient+background+commercial&image_size=portrait_4_3',
    tag: 'TK图片',
  },
  {
    title: '产品场景融合',
    desc: 'AI智能场景合成',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=watch+product+on+wrist+lifestyle+photo+natural+light+outdoor+scene+premium+quality&image_size=portrait_4_3',
    tag: '场景图',
  },
  {
    title: '社媒POV视角',
    desc: '第一人称生活场景',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=first+person+perspective+holding+coffee+mug+cozy+cafe+setting+natural+light+lifestyle&image_size=portrait_4_3',
    tag: 'POV',
  },
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
    fetch(`${API_URL}/api/notifications`).then(r => r.json()).then(d => {
      if (d.success) setNotifications(d.data || []);
    }).catch(() => {});
  }, []);

  const unreadNotifs = notifications.filter(n => !notifDismissed.has(n.id)).length;

  const handleFeatureClick = (featureId: string) => {
    if (featureId === 'video') {
      onSwitchTab?.('video');
    } else {
      onNavigateToTool(featureId);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 animate-mobile-fade-in">
      {/* ===== 顶部栏 ===== */}
      <div className="bg-white px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] text-gray-400">
              {isAuthenticated ? `Hi, ${user?.email?.split('@')[0] || ''}` : '欢迎使用'}
            </p>
            <h1 className="text-[20px] font-bold text-gray-900">AI创作工作台</h1>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated && user && (
              <button onClick={() => onNavigateToPlugin('recharge')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100">
                <Sparkles size={12} className="text-blue-500" />
                <span className="text-[12px] font-semibold text-blue-600">{Number(user.credits || 0).toFixed(0)}</span>
              </button>
            )}
            {unreadNotifs > 0 && (
              <button onClick={() => setShowNotifModal(true)} className="relative w-9 h-9 flex items-center justify-center rounded-full bg-gray-100">
                <Bell size={17} className="text-gray-500" />
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center text-[8px] font-bold bg-blue-500 text-white rounded-full">
                  {unreadNotifs > 9 ? '9+' : unreadNotifs}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* 未登录提示 */}
        {!isAuthenticated && (
          <button
            onClick={() => window.dispatchEvent(new Event('mobile-auth-required'))}
            className="w-full mt-3 p-3 rounded-xl bg-blue-500 active:bg-blue-600 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <p className="text-[14px] font-semibold text-white">登录解锁全部功能</p>
                <p className="text-[11px] text-blue-100">新用户注册送免费积分</p>
              </div>
              <ArrowRight size={16} className="text-white" />
            </div>
          </button>
        )}
      </div>

      {/* ===== 案例展示 - 横向滚动 ===== */}
      <div className="pt-4 pb-2">
        <div className="px-4 flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-gray-900">AI创作案例</h2>
          <button onClick={() => onSwitchTab?.('tools')} className="text-[11px] text-blue-500">查看全部</button>
        </div>
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
          {SHOWCASE_ITEMS.map((item, i) => (
            <div key={i} className="flex-shrink-0 w-[140px] rounded-xl overflow-hidden bg-white border border-gray-100 shadow-sm">
              <div className="relative aspect-[3/4]">
                <img src={item.image} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute top-2 left-2">
                  <span className="text-[9px] font-medium bg-blue-500 text-white px-2 py-0.5 rounded-full">{item.tag}</span>
                </div>
              </div>
              <div className="p-2.5">
                <p className="text-[11px] font-medium text-gray-900 truncate">{item.title}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== 核心功能列表 ===== */}
      <div className="px-4 pt-2 pb-4">
        <h2 className="text-[14px] font-semibold text-gray-900 mb-3">核心功能</h2>
        <div className="space-y-2">
          {CORE_FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <button
                key={feature.id}
                onClick={() => handleFeatureClick(feature.id)}
                className="mobile-tap w-full flex items-center gap-3 p-3.5 bg-white rounded-xl border border-gray-100 active:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Icon size={20} className="text-blue-500" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-gray-900">{feature.title}</span>
                    {feature.tag && (
                      <span className="text-[9px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{feature.tag}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">{feature.description}</p>
                </div>
                <ArrowRight size={16} className="text-gray-300 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== 底部留白 ===== */}
      <div className="h-4" />

      {/* ===== 通知弹窗 ===== */}
      {showNotifModal && (
        <div className="fixed inset-0 z-[100] flex items-end" onClick={() => setShowNotifModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full bg-white rounded-t-[28px] pb-[calc(16px+env(safe-area-inset-bottom))] animate-mobile-slide-up"
            style={{ maxHeight: '70vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-[16px] font-bold text-gray-900">通知</h3>
                <span className="text-[12px] text-gray-400">({notifications.length})</span>
              </div>
              <button onClick={() => setShowNotifModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(70vh-60px)] px-4 pb-3 space-y-2">
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-[11px] text-gray-400">{unreadNotifs} 条未读</span>
                {unreadNotifs > 0 && (
                  <button onClick={() => setNotifDismissed(prev => new Set(notifications.map(n => n.id)))}
                    className="text-[11px] text-blue-500 font-medium">全部已读</button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                    <Bell size={20} className="text-gray-300" />
                  </div>
                  <p className="text-[13px] text-gray-400">暂无通知</p>
                </div>
              ) : notifications.map((n) => {
                const isUnread = !notifDismissed.has(n.id);
                return (
                <div key={n.id} className={`rounded-xl p-4 transition-all ${isUnread ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-[13px] ${isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-500'}`}>{n.title}</p>
                        {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                      </div>
                      {n.content && <p className={`text-[11px] mt-1.5 leading-relaxed ${isUnread ? 'text-gray-600' : 'text-gray-300'}`}>{n.content}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {n.created_at && <span className="text-[10px] text-gray-300 whitespace-nowrap">{new Date(n.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span>}
                      {isUnread && (
                        <button onClick={() => setNotifDismissed(prev => new Set([...prev, n.id]))}
                          className="text-[10px] text-blue-500 font-medium">已读</button>
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

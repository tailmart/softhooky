import React, { useState, useEffect } from 'react';
import {
  Sparkles, Image as ImageIcon, Layers, FileImage, Layout,
  ShoppingCart, Share2, Film, Wand2, Hand, MessageCircle,
  ChevronRight, Zap, Clock, Bell, X, ArrowRight, Star, Users, TrendingUp,
  Camera, Palette, MonitorPlay, Type, ShoppingBag, Play
} from 'lucide-react';
import { getAvailableNavItems } from '../../services/navService';
import { useAuth } from '../../contexts/AuthContext';

// 场景化入口 - 站在用户角度
const SCENES = [
  {
    id: 'xiaohongshu',
    icon: '📱',
    title: '做小红书',
    desc: '封面+文案+配图，一键出笔记',
    color: 'bg-[#FFF5F5]'
  },
  {
    id: 'banner',
    icon: '🖼️',
    title: '做电商图',
    desc: 'Banner、轮播图、详情页全搞定',
    color: 'bg-[#F5F8FF]'
  },
  {
    id: 'nano-gen',
    icon: '🎨',
    title: '创意生图',
    desc: '上传产品图，AI生成商业大片',
    color: 'bg-[#F5FFF5]'
  },
  {
    id: 'productFusion',
    icon: '📸',
    title: '场景融图',
    desc: '产品放入任意场景，真实自然',
    color: 'bg-[#FFF8F0]'
  },
  {
    id: 'social',
    icon: '✨',
    title: '社媒出图',
    desc: 'POV第一视角，适配各平台',
    color: 'bg-[#F8F5FF]'
  },
  {
    id: 'storyboard',
    icon: '🎬',
    title: '做短视频',
    desc: '剧本自动生成分镜脚本',
    color: 'bg-[#F5FFFA]'
  },
];

// 热门效果展示
const SHOWCASES = [
  { id: 1, tag: '小红书爆款', desc: '3分钟出一篇种草笔记' },
  { id: 2, tag: '电商首图', desc: '专业级Banner设计' },
  { id: 3, tag: '产品融图', desc: '产品放入场景中' },
];

interface HomePageProps {
  onNavigateToTool: (toolId: string) => void;
  onNavigateToChat: () => void;
  onNavigateToPlugin: (pluginId: string) => void;
  onSwitchTab?: (tab: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigateToTool, onNavigateToChat, onNavigateToPlugin, onSwitchTab }) => {
  const { isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState<Array<{ id: number; title: string; content: string; created_at: string }>>([]);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [notifDismissed, setNotifDismissed] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('notif_dismissed') || '[]')); } catch { return new Set(); }
  });

  useEffect(() => {
    localStorage.setItem('notif_dismissed', JSON.stringify(Array.from(notifDismissed)));
  }, [notifDismissed]);

  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const res = await fetch('/api/notifications');
        const data = await res.json();
        if (data.success) setNotifications(data.data || []);
      } catch {}
    };
    fetchNotifs();
  }, []);

  const unreadNotifs = notifications.filter(n => !notifDismissed.has(n.id)).length;

  return (
    <div className="min-h-screen bg-white animate-mobile-fade-in">
      {/* 顶部状态栏 */}
      <div className="flex items-center justify-between px-5 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs text-[#a3a3a3]">AI 就绪</span>
        </div>
        {unreadNotifs > 0 && (
          <button 
            onClick={() => setShowNotifModal(true)}
            className="relative w-8 h-8 flex items-center justify-center"
          >
            <Bell size={18} className="text-[#737373]" />
            <span className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center text-[9px] font-bold bg-[#ef4444] text-white rounded-full">
              {unreadNotifs > 9 ? '9+' : unreadNotifs}
            </span>
          </button>
        )}
      </div>

      {/* 核心价值主张 - 第一屏 */}
      <div className="px-5 pt-6 pb-8">
        <h1 className="text-[28px] font-bold text-[#171717] leading-tight mb-3">
          {isAuthenticated ? '欢迎回来' : '上传产品图'}
          <br />
          <span className="text-[#a3a3a3]">AI 自动生成大片</span>
        </h1>
        <p className="text-sm text-[#a3a3a3] mb-6">
          不会设计？没关系。上传一张图，AI帮你搞定所有电商视觉
        </p>

        {/* 主CTA按钮 */}
        <button
          onClick={() => onNavigateToTool('nano-gen')}
          className="mobile-tap w-full bg-[#171717] text-white rounded-xl py-4 flex items-center justify-center gap-2 mb-4"
        >
          <Sparkles size={18} />
          <span className="text-[15px] font-semibold">免费试一张</span>
        </button>

        {/* 信任数据 */}
        <div className="flex items-center justify-center gap-5">
          <div className="flex items-center gap-1.5">
            <Users size={14} className="text-[#d4d4d4]" />
            <span className="text-xs text-[#a3a3a3]">10万+用户</span>
          </div>
          <div className="w-1 h-1 rounded-full bg-[#e5e5e5]" />
          <div className="flex items-center gap-1.5">
            <ImageIcon size={14} className="text-[#d4d4d4]" />
            <span className="text-xs text-[#a3a3a3]">100万+张已生成</span>
          </div>
        </div>
      </div>

      {/* 你想要做什么 - 场景化入口 */}
      <div className="px-5 pb-8">
        <h2 className="text-base font-bold text-[#171717] mb-4">你想要做什么？</h2>
        <div className="grid grid-cols-2 gap-3">
          {SCENES.map(scene => (
            <button
              key={scene.id}
              onClick={() => onNavigateToTool(scene.id)}
              className={`${scene.color} rounded-2xl p-4 text-left`}
            >
              <div className="text-2xl mb-2">{scene.icon}</div>
              <h3 className="text-[15px] font-bold text-[#171717] mb-1">{scene.title}</h3>
              <p className="text-xs text-[#737373] leading-relaxed">{scene.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 效果展示 - 真实案例 */}
      <div className="px-5 pb-8">
        <h2 className="text-base font-bold text-[#171717] mb-4">看看别人用它做了什么</h2>
        <div className="mobile-scroll-x -mx-5 px-5">
          <div className="flex gap-3">
            {SHOWCASES.map(item => (
              <div
                key={item.id}
                className="flex-shrink-0 w-[200px] bg-[#f5f5f5] rounded-2xl overflow-hidden"
              >
                <div className="h-[140px] bg-gradient-to-br from-[#e5e5e5] to-[#d4d4d4] flex items-center justify-center">
                  <ImageIcon size={32} className="text-[#a3a3a3]" />
                </div>
                <div className="p-3">
                  <span className="text-[10px] font-medium text-[#737373] bg-white px-2 py-0.5 rounded-full">{item.tag}</span>
                  <p className="text-xs text-[#525252] mt-2">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3步开始 */}
      <div className="px-5 pb-8">
        <h2 className="text-base font-bold text-[#171717] mb-4">3步搞定</h2>
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-[#171717] flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">1</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#171717]">上传产品图</h3>
              <p className="text-xs text-[#a3a3a3] mt-0.5">手机拍的也行，AI会自动优化</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-[#171717] flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">2</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#171717]">选择你想要的效果</h3>
              <p className="text-xs text-[#a3a3a3] mt-0.5">小红书、电商Banner、详情页...</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-[#171717] flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">3</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#171717]">下载使用</h3>
              <p className="text-xs text-[#a3a3a3] mt-0.5">高清无水印，直接发布</p>
            </div>
          </div>
        </div>
      </div>

      {/* AI对话入口 */}
      <div className="px-5 pb-24">
        <button
          onClick={onNavigateToChat}
          className="mobile-tap w-full bg-[#f5f5f5] rounded-2xl p-4 flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-[#171717] flex items-center justify-center flex-shrink-0">
            <MessageCircle size={20} className="text-white" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-bold text-[#171717]">AI 电商助手</h3>
            <p className="text-xs text-[#a3a3a3] mt-0.5">帮你写文案、想创意、出方案</p>
          </div>
          <ChevronRight size={18} className="text-[#d4d4d4]" />
        </button>
      </div>

      {/* 通知弹窗 */}
      {showNotifModal && (
        <div className="fixed inset-0 z-[100] flex items-end" onClick={() => setShowNotifModal(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full bg-white rounded-t-3xl pb-[calc(16px+env(safe-area-inset-bottom))] animate-mobile-slide-up" onClick={e => e.stopPropagation()}
            style={{ maxHeight: '70vh' }}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#f0f0f0]">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-[#171717]" />
                <h3 className="text-base font-bold text-[#171717]">通知</h3>
                <span className="text-xs text-[#a3a3a3]">({notifications.length})</span>
              </div>
              <button onClick={() => setShowNotifModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f5f5f5]">
                <X size={16} className="text-[#737373]" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(70vh-60px)] px-4 py-3 space-y-2">
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-xs text-[#a3a3a3]">{unreadNotifs} 条未读</span>
                {unreadNotifs > 0 && (
                  <button onClick={() => setNotifDismissed(prev => new Set(notifications.map(n => n.id)))}
                    className="text-xs text-[#737373] hover:text-[#171717] transition-colors">全部标为已读</button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <Bell size={24} className="text-[#d4d4d4]" />
                  <p className="text-sm text-[#a3a3a3] mt-2">暂无通知</p>
                </div>
              ) : notifications.map((n) => {
                const isUnread = !notifDismissed.has(n.id);
                return (
                <div key={n.id} className={`rounded-2xl p-4 border ${isUnread ? 'bg-white border-gray-200 shadow-sm' : 'bg-[#fafafa] border-[#f0f0f0]'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm ${isUnread ? 'font-semibold text-[#171717]' : 'font-medium text-[#737373]'}`}>{n.title}</p>
                        {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-[#171717] flex-shrink-0" />}
                      </div>
                      {n.content && <p className={`text-xs mt-1 leading-relaxed ${isUnread ? 'text-[#525252]' : 'text-[#a3a3a3]'}`}>{n.content}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {n.created_at && <span className="text-[10px] text-[#bdbdbd] whitespace-nowrap">{new Date(n.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span>}
                      {isUnread && (
                        <button onClick={() => setNotifDismissed(prev => new Set([...prev, n.id]))}
                          className="text-[10px] text-[#a3a3a3] hover:text-[#737373] transition-colors whitespace-nowrap">已读</button>
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

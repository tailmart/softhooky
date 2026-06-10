import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { MobileLayout } from './MobileLayout';
import { HomePage } from './pages/HomePage';
import { ToolsPage } from './pages/ToolsPage';
import { ChatPage } from './pages/ChatPage';
import { ProfilePage } from './pages/ProfilePage';
import { PluginPage } from './pages/PluginPage';
import { MobileAuth } from './plugins/MobileAuth';
import { TabId } from './components/BottomTabs';
import './index.css';

const PLUGIN_LABELS: Record<string, string> = {
  'nano-gen': '创意生图',
  'deepseek-chat': '电商文案助手',
  'xiaohongshu': '小红书种草图文',
  'social': '社媒POV出图',
  'carousel': '独立站轮播图',
  'banner': 'Banner设计',
  'detail': '详情页设计',
  'tryon': '产品试穿',
  'handheld': '手持产品',
  'detailClone': '版式裂变',
  'productFusion': '产品融图',
  'productRefine': '产品精修',
  'image-library': '图片图库',
  'storyboard': '故事板',
  'three-view': '三视图生成',
  'gemini-video': 'Gemini视频',
  'veo31': 'Veo3.1视频',
  'tk-video': 'TK视频脚本',
  'poster': '智能海报设计',
  'recharge': '充值',
  'records': '消费记录',
  'coupon': '优惠券',
};

export const MobileApp: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  // 当前 Tab
  const [activeTab, setActiveTab] = useState<TabId>('home');

  // 插件页面状态：null = 不在插件页, string = 插件ID
  const [activePlugin, setActivePlugin] = useState<string | null>(null);

  // 认证弹窗
  const [showAuth, setShowAuth] = useState(false);

  // 对话页是否在聊天视图中（隐藏header）
  const [chatInView, setChatInView] = useState(false);
  const hideHeader = activeTab === 'chat' && chatInView;

  useEffect(() => {
    const handler = (e: Event) => setChatInView((e as CustomEvent).detail === true);
    window.addEventListener('mobile-chat-mode', handler);
    return () => window.removeEventListener('mobile-chat-mode', handler);
  }, []);

  // 监听认证状态：如果未登录且不在插件页和聊天页，显示弹窗
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !activePlugin) {
      // 不自动弹窗，让用户自由浏览首页
    }
  }, [isLoading, isAuthenticated, activePlugin]);

  // 导航到工具
  const handleNavigateToTool = useCallback((toolId: string) => {
    setActivePlugin(toolId);
  }, []);

  // 从插件页面返回
  const handlePluginBack = useCallback(() => {
    setActivePlugin(null);
  }, []);

  // Tab 切换
  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    setActivePlugin(null);
  }, []);

  // 当前插件名称
  const currentPluginLabel = activePlugin ? (PLUGIN_LABELS[activePlugin] || activePlugin) : '';

  // 触发登录
  const handleAuthRequired = useCallback(() => {
    setShowAuth(true);
  }, []);

  // 监听来自子组件的事件（ProfilePage/工具页触发的登录请求）
  useEffect(() => {
    const handler = () => setShowAuth(true);
    window.addEventListener('mobile-auth-required', handler);
    return () => window.removeEventListener('mobile-auth-required', handler);
  }, []);

  // 渲染主要内容 - 所有页面保持挂载，用CSS切换显示
  const renderContent = () => {
    // 优先显示插件页面
    if (activePlugin) {
      return (
        <PluginPage
          pluginId={activePlugin}
          pluginLabel={currentPluginLabel}
          onBack={handlePluginBack}
        />
      );
    }

    return (
      <div className="relative h-full">
        <div className={`absolute inset-0 overflow-y-auto ${activeTab === 'home' ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}>
          <HomePage
            onNavigateToTool={handleNavigateToTool}
            onNavigateToChat={() => setActiveTab('chat')}
            onNavigateToPlugin={handleNavigateToTool}
            onSwitchTab={(tab) => setActiveTab(tab as TabId)}
          />
        </div>
        <div className={`absolute inset-0 overflow-y-auto ${activeTab === 'tools' ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}>
          <ToolsPage onNavigateToTool={handleNavigateToTool} />
        </div>
        <div className={`absolute inset-0 overflow-y-auto ${activeTab === 'chat' ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}>
          <ChatPage />
        </div>
        <div className={`absolute inset-0 overflow-y-auto ${activeTab === 'profile' ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}>
          <ProfilePage onNavigateToPlugin={handleNavigateToTool} />
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#171717] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[#a3a3a3]">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 插件页面是全屏模式（不包含底部Tab） */}
      {activePlugin ? (
        <div className="min-h-screen bg-white">
          {/* 插件页面顶部由 PluginPage 自管理 */}
          {renderContent()}
        </div>
      ) : (
        <MobileLayout
          activeTab={activeTab}
          onTabChange={handleTabChange}
          hideHeader={hideHeader}
        >
          {renderContent()}
        </MobileLayout>
      )}

      {/* 认证弹窗 - 移动端底部弹出 */}
      <MobileAuth
        open={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={() => setShowAuth(false)}
      />
    </>
  );
};

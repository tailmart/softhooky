import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { MobileLayout } from './MobileLayout';
import { HomePage } from './pages/HomePage';
import { ToolsPage } from './pages/ToolsPage';
import { ProfilePage } from './pages/ProfilePage';
import { MobileVideoPage } from './pages/MobileVideoPage';
import { PluginPage } from './pages/PluginPage';
import { MobileAuth } from './plugins/MobileAuth';
import { TabId } from './components/BottomTabs';
import './index.css';

const PLUGIN_LABELS: Record<string, string> = {
  'storyboard': '故事板',
  'nano-gen': 'TK带货图片',
  'xiaohongshu': '小红书种草',
  'social': '社媒POV出图',
  'recharge': '充值',
  'records': '消费记录',
  'image-library': '图库',
  'coupon': '优惠券',
};

export const MobileApp: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [activePlugin, setActivePlugin] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !activePlugin) {
      // 不自动弹窗，让用户自由浏览首页
    }
  }, [isLoading, isAuthenticated, activePlugin]);

  const handleNavigateToTool = useCallback((toolId: string) => {
    setActivePlugin(toolId);
  }, []);

  const handlePluginBack = useCallback(() => {
    setActivePlugin(null);
  }, []);

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    setActivePlugin(null);
  }, []);

  const currentPluginLabel = activePlugin ? (PLUGIN_LABELS[activePlugin] || activePlugin) : '';

  useEffect(() => {
    const handler = () => setShowAuth(true);
    window.addEventListener('mobile-auth-required', handler);
    return () => window.removeEventListener('mobile-auth-required', handler);
  }, []);

  const renderContent = () => {
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
            onNavigateToPlugin={handleNavigateToTool}
            onSwitchTab={(tab) => setActiveTab(tab as TabId)}
          />
        </div>
        <div className={`absolute inset-0 overflow-y-auto ${activeTab === 'tools' ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}>
          <ToolsPage onNavigateToTool={handleNavigateToTool} />
        </div>
        <div className={`absolute inset-0 overflow-y-auto ${activeTab === 'video' ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}>
          <MobileVideoPage />
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
          <div className="w-8 h-8 border-2 border-blue-900/50 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-sm text-gray-400">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {activePlugin ? (
        <div className="min-h-screen bg-white flex flex-col">
          <div className="flex-1 min-h-0">
            {renderContent()}
          </div>
        </div>
      ) : (
        <MobileLayout
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onNavigateToPlugin={handleNavigateToTool}
        >
          {renderContent()}
        </MobileLayout>
      )}

      <MobileAuth
        open={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={() => setShowAuth(false)}
      />
    </>
  );
};

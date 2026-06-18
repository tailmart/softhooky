import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AuthModal } from '../../components/AuthModal';
import { StudioNav } from './components/StudioNav';
import { StudioStatusBar } from './components/StudioStatusBar';
import { TaskCenterDrawer } from './components/TaskCenterDrawer';
import { VideoPreviewModal } from './components/VideoPreviewModal';
import { VideoTab } from './tabs/VideoTab';
import { ScriptTab } from './tabs/ScriptTab';
import { SocialTab } from './tabs/SocialTab';

type TabKey = 'script' | 'social' | 'video';

interface VideoTask {
  taskId: string;
  status: string;
  progress: number;
  url?: string;
  error?: string;
}

export default function VideoStudioPage() {
  const { user, setUser, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('video');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showTaskCenter, setShowTaskCenter] = useState(false);
  const [activeTaskCount, setActiveTaskCount] = useState(0);
  const [tasks, setTasks] = useState<VideoTask[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // 监听401过期等登录态变化
  useEffect(() => {
    const handler = () => { setUser(null); setShowAuthModal(true); };
    window.addEventListener('auth-state-changed', handler);
    return () => window.removeEventListener('auth-state-changed', handler);
  }, [setUser]);

  const handleTaskCountChange = useCallback((count: number) => {
    setActiveTaskCount(count);
  }, []);

  const handleTasksChange = useCallback((newTasks: VideoTask[]) => {
    setTasks(newTasks);
  }, []);

  const handleRetry = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.taskId !== taskId));
  }, []);

  const handleRemove = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.taskId !== taskId));
  }, []);

  const handleDownload = useCallback(async (url: string) => {
    try {
      const r = await fetch(url);
      const b = await r.blob();
      const u = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = u; a.download = `video-${Date.now()}.mp4`; a.click();
      URL.revokeObjectURL(u);
    } catch {
      window.open(url, '_blank');
    }
  }, []);

  const renderTab = () => {
    switch (activeTab) {
      case 'script':
        return <ScriptTab />;
      case 'social':
        return <SocialTab />;
      case 'video':
        return <VideoTab onTaskCountChange={handleTaskCountChange} onTasksChange={handleTasksChange} onCreditsChange={refreshUser} />;
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-slate-50">
      <StudioNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onShowAuth={() => setShowAuthModal(true)}
        activeTaskCount={activeTaskCount}
        onToggleTaskCenter={() => setShowTaskCenter(p => !p)}
      />
      <div className="h-0 flex-1 min-h-0 overflow-hidden">
        {renderTab()}
      </div>
      <StudioStatusBar activeTaskCount={activeTaskCount} totalCredits={Number(user?.credits || 0)} />
      <TaskCenterDrawer
        isOpen={showTaskCenter}
        onClose={() => setShowTaskCenter(false)}
        tasks={tasks}
        onRetry={handleRetry}
        onRemove={handleRemove}
        onPreview={(url) => setPreviewUrl(url)}
        onDownload={handleDownload}
      />
      {previewUrl && (
        <VideoPreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} onDownload={handleDownload} />
      )}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onLoginSuccess={() => setShowAuthModal(false)} />
    </div>
  );
}

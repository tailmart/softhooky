import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SiteConfigProvider } from './contexts/SiteConfigContext';
import { CanvasPage } from './pages/CanvasPage';
import { SubAccountLoginPage } from './pages/SubAccountLoginPage';
import AgentApp from './pages/agent/AgentApp';
import AdminApp from './pages/admin/AdminApp';
import { refreshCredits } from './services/authService';
import { AuthModal } from './components/AuthModal';
import { MobileApp } from './mobile/MobileApp';

const VideoProjectPage = React.lazy(() => import('./pages/VideoProjectPage'));

const APP_VERSION_KEY = 'app_build_version';

type View = 'canvas';

const AppContent = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [view, setView] = useState<View>(() => {
    const savedView = localStorage.getItem('currentView') as View;
    return savedView || 'canvas';
  });

  useEffect(() => {
    localStorage.setItem('currentView', view);
  }, [view]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const creditsIntervalId = setInterval(async () => {
      const newCredits = await refreshCredits();
      if (newCredits > 0) window.dispatchEvent(new Event('credits-updated'));
    }, 120000);
    return () => clearInterval(creditsIntervalId);
  }, [isAuthenticated]);

  // 版本检测：PakePlus等桌面端缓存更新检测
  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await fetch('/api/app/version', { cache: 'no-store' });
        const data = await res.json();
        if (!data?.success) return;
        const serverVersion = String(data.version);
        const storedVersion = localStorage.getItem(APP_VERSION_KEY);
        if (storedVersion && storedVersion !== serverVersion) {
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('canvas_state_') || key === 'nanogen_history_images')) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(k => localStorage.removeItem(k));
          localStorage.setItem(APP_VERSION_KEY, serverVersion);
          window.location.href = '/?v=' + serverVersion;
        } else if (!storedVersion) {
          localStorage.setItem(APP_VERSION_KEY, serverVersion);
        }
      } catch {}
    };
    checkVersion();
    const interval = setInterval(checkVersion, 120000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#171717] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <main>
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {view === 'canvas' && <CanvasPage />}
          </motion.div>
        </AnimatePresence>
      </main>

      <AuthModal
        isOpen={!isAuthenticated}
        onClose={() => {}}
        onLoginSuccess={() => {}}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <SiteConfigProvider>
        <Routes>
          <Route path="/mobile" element={<MobileApp />} />
          <Route path="/sub-login" element={<SubAccountLoginPage />} />
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="/agent/*" element={<AgentApp />} />
          <Route path="/video" element={<VideoProjectPage />} />
          <Route path="/*" element={<AppContent />} />
        </Routes>
      </SiteConfigProvider>
    </AuthProvider>
  );
}

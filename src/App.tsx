import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SiteConfigProvider, useSiteConfig } from './contexts/SiteConfigContext';
import { CanvasPage } from './pages/CanvasPage';
import { SubAccountLoginPage } from './pages/SubAccountLoginPage';
import AgentApp from './pages/agent/AgentApp';
import AdminApp from './pages/admin/AdminApp';
import { refreshCredits } from './services/authService';
import { AuthModal } from './components/AuthModal';
import { MobileApp } from './mobile/MobileApp';
import TauriUpdater from './components/TauriUpdater';
import { API_URL } from './services/api';

const VideoStudioPage = React.lazy(() => import('./pages/video/VideoStudioPage'));
const WorkflowPage = React.lazy(() => import('./pages/plugins/WorkflowPage').then(m => ({ default: m.WorkflowPage })));

const APP_VERSION_KEY = 'app_build_version';

const WorkflowAuthWrapper = () => {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) window.location.href = '/';
  }, [isLoading, isAuthenticated]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#171717] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <React.Suspense fallback={
      <div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#171717] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <WorkflowPage />
    </React.Suspense>
  );
};

const VideoRoute = () => (
  <React.Suspense fallback={
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  }>
    <VideoStudioPage />
  </React.Suspense>
);

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
        const res = await fetch(`${API_URL}/api/app/version`, { cache: 'no-store' });
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

function OAuthCallbackHandler({ children }: { children: React.ReactNode }) {
  const [handled, setHandled] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state || handled) return;
    setHandled(true);

    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/oauth/callback?code=${code}&state=${state}`);
        const html = await res.text();
        const m = html.match(/var payload = ({.*?});/);
        const errM = html.match(/var msg = (".*?");/);
        if (m) {
          const payload = JSON.parse(m[1]);
          if (payload.token && payload.user) {
            const jsonPayload = JSON.stringify({ token: payload.token, user: payload.user });
            try { window.opener?.postMessage({ type: 'OAUTH_LOGIN_SUCCESS', payload }, '*'); } catch {}
            try { localStorage.setItem('oauth_login_result', jsonPayload); } catch {}
            window.close();
          }
        } else if (errM) {
          const msg = JSON.parse(errM[1]);
          try { window.opener?.postMessage({ type: 'OAUTH_LOGIN_ERROR', payload: { message: msg } }, '*'); } catch {}
          try { localStorage.setItem('oauth_login_error', msg); } catch {}
          alert(msg);
          window.close();
        }
      } catch (e) {
        console.error('OAuth callback error:', e);
      }
    })();
  }, [handled]);

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <SiteConfigProvider>
        <OAuthCallbackHandler>
          <TauriUpdater />
          <Routes>
            <Route path="/mobile" element={<MobileApp />} />
            <Route path="/sub-login" element={<SubAccountLoginPage />} />
            <Route path="/admin/*" element={<AdminApp />} />
            <Route path="/agent/*" element={<AgentApp />} />
            <Route path="/video" element={<VideoRoute />} />
            <Route path="/workflow" element={<WorkflowAuthWrapper />} />
            <Route path="/*" element={<AppContent />} />
          </Routes>
        </OAuthCallbackHandler>
      </SiteConfigProvider>
    </AuthProvider>
  );
}

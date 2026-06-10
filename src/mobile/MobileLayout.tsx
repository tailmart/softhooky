import React from 'react';
import { Coins } from 'lucide-react';
import { BottomTabs, TabId } from './components/BottomTabs';
import { useAuth } from '../contexts/AuthContext';
import { useSiteConfig } from '../contexts/SiteConfigContext';

interface MobileLayoutProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  children: React.ReactNode;
  unreadCount?: number;
  hideHeader?: boolean;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({
  activeTab,
  onTabChange,
  children,
  unreadCount = 0,
  hideHeader = false,
}) => {
  const { user, isAuthenticated } = useAuth();
  const { config } = useSiteConfig();

  return (
    <div className="mobile-app h-dvh bg-white flex flex-col overflow-hidden">
      {/* 顶部 Header - 在flex流中 */}
      {!hideHeader && <div className="mobile-header flex-shrink-0 bg-white border-b border-[#e5e5e5]">
        <div className="flex items-center justify-between px-4 h-12">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center shadow-sm flex-shrink-0">
              <img src={config.logo_url} alt="Softhooky" className="w-5 h-5" />
            </div>
            <span
              style={{
                fontFamily: "'Fredoka', sans-serif",
                fontWeight: 600,
                fontSize: '1.15rem',
                lineHeight: 1,
                letterSpacing: '0.3px',
              }}
              className="bg-gradient-to-r from-[#171717] via-[#404040] to-[#171717] bg-clip-text text-transparent"
            >
              Softhooky
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* 积分显示 */}
            {isAuthenticated && user && (
              <div className="flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-full">
                <Coins size={13} className="text-amber-500" />
                <span className="text-xs font-semibold text-amber-600">
                  {Number(user.credits || 0).toFixed(1)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>}

      {/* 内容区域 - flex-1 自动填充剩余高度 */}
      <main className="flex-1 min-h-0 overflow-y-auto bg-white">
        {children}
      </main>

      {/* 底部 Tab Bar - 在flex流中 */}
      <div className="flex-shrink-0 bg-white border-t border-[#e5e5e5] pb-[env(safe-area-inset-bottom,0px)]">
        <div className="h-14 flex items-center justify-around px-2">
          <BottomTabs
            activeTab={activeTab}
            onTabChange={onTabChange}
            unreadCount={unreadCount}
          />
        </div>
      </div>
    </div>
  );
};

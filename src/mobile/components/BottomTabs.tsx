import React from 'react';
import { Home, Sparkles, MessageCircle, User } from 'lucide-react';

export type TabId = 'home' | 'tools' | 'chat' | 'profile';

interface TabItem {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: TabItem[] = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'tools', label: '创作', icon: Sparkles },
  { id: 'chat', label: '消息', icon: MessageCircle },
  { id: 'profile', label: '我的', icon: User },
];

interface BottomTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  unreadCount?: number;
}

export const BottomTabs: React.FC<BottomTabsProps> = ({ activeTab, onTabChange, unreadCount = 0 }) => {
  return (
    <nav className="flex items-center justify-around w-full h-full">
      {TABS.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="mobile-tap relative flex flex-col items-center justify-center flex-1 h-full gap-0.5"
          >
            <div className={`relative flex items-center justify-center w-7 h-7 transition-all duration-200 ${
              isActive ? 'text-[#171717]' : 'text-[#a3a3a3]'
            }`}>
              <Icon
                size={22}
                strokeWidth={isActive ? 2.2 : 1.5}
                className={`transition-all duration-200 ${
                  isActive ? 'scale-110' : 'scale-100'
                }`}
              />
              {tab.id === 'chat' && unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold px-1 bg-[#ef4444] text-white rounded-full shadow-sm">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <span className={`text-[10px] font-medium transition-colors duration-200 ${
              isActive ? 'text-[#171717]' : 'text-[#a3a3a3]'
            }`}>
              {tab.label}
            </span>
            {isActive && (
              <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#171717] rounded-full" />
            )}
          </button>
        );
      })}
    </nav>
  );
};

export const TAB_HEIGHT = 56;

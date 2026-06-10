import React, { useState } from 'react';
import { GeminiVideoPage } from './plugins/GeminiVideoPage';
import { Veo31VideoPage } from './plugins/Veo31VideoPage';

const NAV_ITEMS = [
  { id: 'gemini' as const, label: 'Gemini Omini' },
  { id: 'veo31' as const, label: 'Veo3.1 视频生成' },
];

const VideoProjectPage: React.FC = () => {
  const [tab, setTab] = useState<'gemini' | 'veo31'>('gemini');

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* 自定义 header：替换页面自身的 header */}
      <div className="flex items-center gap-2 px-6 h-14 border-b border-gray-200 flex-shrink-0 bg-gray-50">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
          </svg>
        </div>
        <h1 className="text-base font-semibold text-[#171717]">视频项目</h1>
        <div className="flex items-center gap-1 ml-4 bg-gray-100 rounded-lg p-0.5">
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => setTab(item.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === item.id ? 'bg-white text-[#171717] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {/* 内容区域 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'gemini' ? <GeminiVideoPage hideHeader /> : <Veo31VideoPage hideHeader />}
      </div>
    </div>
  );
};

export default VideoProjectPage;

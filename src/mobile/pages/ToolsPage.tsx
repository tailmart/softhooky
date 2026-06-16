import React, { useState } from 'react';
import {
  Film, Video, Camera, Image as ImageIcon, Layers,
  ChevronRight, Search, X, Sparkles, ArrowRight, Zap
} from 'lucide-react';

// 只保留5个核心功能
const CORE_TOOLS = [
  {
    id: 'storyboard',
    title: '故事板',
    subtitle: 'AI 分镜生成',
    desc: '输入剧本，自动生成专业影视分镜画面，支持4-10个镜头',
    icon: Film,
    color: 'from-violet-500 to-indigo-600',
    accent: '#8b5cf6',
  },
  {
    id: 'nano-gen',
    title: 'TK带货图片',
    subtitle: '产品商业大片',
    desc: '上传产品图，AI生成TikTok风格带货海报，多比例多模型',
    icon: Camera,
    color: 'from-blue-500 to-cyan-500',
    accent: '#3b82f6',
  },
  {
    id: 'gemini-video',
    title: '视频生成',
    subtitle: '图片变营销视频',
    desc: '上传图片，AI生成4-10秒短视频广告，支持横屏竖屏',
    icon: Video,
    color: 'from-emerald-500 to-teal-600',
    accent: '#10b981',
  },
  {
    id: 'xiaohongshu',
    title: '小红书种草图文',
    subtitle: '一键生成笔记',
    desc: '封面+文案+5张配图，完整种草笔记，多比例适配',
    icon: Image as ImageIcon,
    color: 'from-rose-500 to-pink-600',
    accent: '#f43f5e',
  },
  {
    id: 'social',
    title: '社媒POV出图',
    subtitle: '第一视角场景图',
    desc: '第一人称视角产品场景图，适配Ins/TikTok/FB/Pinterest',
    icon: Layers,
    color: 'from-amber-500 to-orange-600',
    accent: '#f59e0b',
  },
];

// 更多工具（简化版）
const MORE_TOOLS = [
  { id: 'tk-video', title: 'TK视频脚本', icon: '🎬', desc: 'TikTok带货脚本生成' },
  { id: 'veo31', title: 'Veo3.1视频', icon: '🎥', desc: '高质量AI视频' },
  { id: 'poster', title: '营销海报', icon: '🎨', desc: 'AI设计海报' },
  { id: 'detail', title: '详情页设计', icon: '📄', desc: '电商详情页配图' },
  { id: 'banner', title: 'Banner设计', icon: '🖼️', desc: '电商首页Banner' },
  { id: 'deepseek-chat', title: 'AI文案助手', icon: '💬', desc: '智能文案生成' },
];

interface ToolsPageProps {
  onNavigateToTool: (toolId: string) => void;
}

export const ToolsPage: React.FC<ToolsPageProps> = ({ onNavigateToTool }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const allTools = [...CORE_TOOLS.map(t => ({ ...t, label: t.title })), ...MORE_TOOLS];
  const searchResults = allTools.filter(item =>
    item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.desc?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] animate-mobile-fade-in">
      {/* 搜索栏 */}
      <div className="px-4 pt-4 pb-3">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
          <input
            type="text"
            placeholder="搜索工具..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearching(e.target.value.length > 0);
            }}
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl py-2.5 pl-10 pr-8 text-sm text-white placeholder-white/20 outline-none focus:border-blue-500/30 transition-colors"
          />
          {isSearching && (
            <button
              onClick={() => { setSearchQuery(''); setIsSearching(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X size={16} className="text-white/20" />
            </button>
          )}
        </div>
      </div>

      {/* 搜索结果 */}
      {isSearching ? (
        <div className="px-4 pb-6">
          <p className="text-xs text-white/30 mb-3">搜索结果 ({searchResults.length})</p>
          {searchResults.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.04] flex items-center justify-center mx-auto mb-3">
                <Search size={24} className="text-white/10" />
              </div>
              <p className="text-sm text-white/30">没有找到相关工具</p>
            </div>
          ) : (
            <div className="space-y-2">
              {searchResults.map(item => (
                <button
                  key={item.id}
                  onClick={() => onNavigateToTool(item.id)}
                  className="mobile-tap w-full rounded-xl p-4 bg-white/[0.03] border border-white/[0.05] flex items-center gap-3.5 hover:bg-white/[0.05] transition-colors"
                >
                  <div className="w-11 h-11 rounded-xl bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                    <span className="text-[18px]">{'icon' in item ? '' : (item as any).icon || '🚀'}</span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-white/30 mt-0.5">{item.desc}</p>
                  </div>
                  <ChevronRight size={18} className="text-white/10" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 核心功能区 */}
          <div className="px-4 pb-2">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={14} className="text-blue-400" />
              <h2 className="text-[14px] font-bold text-white">核心功能</h2>
            </div>
          </div>

          <div className="px-4 pb-5">
            <div className="space-y-2.5">
              {CORE_TOOLS.map((tool, i) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    onClick={() => onNavigateToTool(tool.id)}
                    className="mobile-tap w-full rounded-2xl p-4 bg-white/[0.03] border border-white/[0.05] flex items-center gap-4 hover:bg-white/[0.05] transition-all group"
                  >
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tool.color} flex items-center justify-center flex-shrink-0 shadow-lg`}
                      style={{ boxShadow: `0 6px 20px ${tool.accent}25` }}>
                      <Icon size={22} className="text-white" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[14px] font-bold text-white">{tool.title}</p>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ color: tool.accent, background: `${tool.accent}15` }}>{tool.subtitle}</span>
                      </div>
                      <p className="text-[11px] text-white/30 mt-1 truncate">{tool.desc}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center flex-shrink-0 group-hover:bg-white/[0.08] transition-colors">
                      <ArrowRight size={14} className="text-white/20" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 更多工具 */}
          <div className="px-4 pb-2">
            <h2 className="text-[14px] font-bold text-white/50 mb-3">更多工具</h2>
          </div>
          <div className="px-4 pb-8">
            <div className="grid grid-cols-2 gap-2">
              {MORE_TOOLS.map(tool => (
                <button
                  key={tool.id}
                  onClick={() => onNavigateToTool(tool.id)}
                  className="mobile-tap flex items-center gap-3 px-3.5 py-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-[18px]">{tool.icon}</span>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-[12px] font-semibold text-white/60 truncate">{tool.title}</p>
                    <p className="text-[10px] text-white/20 truncate">{tool.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

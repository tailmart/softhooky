import React, { useState } from 'react';
import {
  Film, Video, Camera, Image as ImageIcon, Layers,
  ChevronRight, Search, X, Zap
} from 'lucide-react';

// 只保留5个核心功能
const CORE_TOOLS = [
  {
    id: 'storyboard',
    title: '故事板',
    subtitle: 'AI 分镜生成',
    desc: '输入剧本，自动生成专业影视分镜画面',
    icon: Film,
    color: 'from-violet-500 to-indigo-600',
    accent: '#8b5cf6',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=professional+film+storyboard+frames+cinematic+dark+background+blue+accent&image_size=square',
  },
  {
    id: 'nano-gen',
    title: 'TK带货图片',
    subtitle: '产品商业大片',
    desc: '上传产品图，AI生成TikTok风格带货海报',
    icon: Camera,
    color: 'from-blue-500 to-cyan-500',
    accent: '#3b82f6',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=tiktok+product+photography+commercial+studio+dark+blue+accent&image_size=square',
  },
  {
    id: 'xiaohongshu',
    title: '小红书种草',
    subtitle: '一键生成笔记',
    desc: '封面+文案+配图，完整种草笔记',
    icon: ImageIcon,
    color: 'from-rose-500 to-pink-600',
    accent: '#f43f5e',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=xiaohongshu+aesthetic+flat+lay+product+photography+minimalist&image_size=square',
  },
  {
    id: 'social',
    title: '社媒POV出图',
    subtitle: '第一视角场景图',
    desc: '适配Ins/TikTok/FB，多平台出图',
    icon: Layers,
    color: 'from-amber-500 to-orange-600',
    accent: '#f59e0b',
    image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=social+media+first+person+perspective+lifestyle+product+dark&image_size=square',
  },
];

interface ToolsPageProps {
  onNavigateToTool: (toolId: string) => void;
}

export const ToolsPage: React.FC<ToolsPageProps> = ({ onNavigateToTool }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const searchResults = searchQuery
    ? CORE_TOOLS.filter(t =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.desc.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : CORE_TOOLS;

  return (
    <div className="min-h-screen bg-[#0a0a0a] animate-mobile-fade-in">
      {/* 搜索栏 */}
      <div className="px-4 pt-4 pb-3">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
          <input
            type="text"
            placeholder="搜索功能..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl py-2.5 pl-10 pr-8 text-sm text-white placeholder-white/20 outline-none focus:border-blue-500/30 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X size={16} className="text-white/20" />
            </button>
          )}
        </div>
      </div>

      {/* 功能列表 */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={14} className="text-blue-400" />
          <h2 className="text-[14px] font-bold text-white">
            {searchQuery ? `搜索结果 (${searchResults.length})` : '全部功能'}
          </h2>
        </div>
      </div>

      <div className="px-4 pb-6">
        {searchResults.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.04] flex items-center justify-center mx-auto mb-3">
              <Search size={24} className="text-white/10" />
            </div>
            <p className="text-sm text-white/30">没有找到相关功能</p>
          </div>
        ) : (
          <div className="space-y-3">
            {searchResults.map((tool, i) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  onClick={() => onNavigateToTool(tool.id)}
                  className="mobile-tap w-full relative overflow-hidden rounded-2xl text-left group"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  {/* 背景图 */}
                  <div className="absolute inset-0">
                    <img
                      src={tool.image}
                      alt={tool.title}
                      className="w-full h-full object-cover opacity-25"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/90 to-[#0a0a0a]/60" />
                  </div>

                  {/* 内容 */}
                  <div className="relative flex items-center gap-4 p-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tool.color} flex items-center justify-center flex-shrink-0`}
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
                      <ChevronRight size={16} className="text-white/20" />
                    </div>
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 h-[1px]"
                    style={{ background: `linear-gradient(90deg, transparent, ${tool.accent}30, transparent)` }} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 底部提示 */}
      {!searchQuery && (
        <div className="px-4 pb-6">
          <div className="p-3 rounded-xl bg-blue-500/[0.06] border border-blue-500/10">
            <div className="flex items-start gap-2">
              <Zap size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-blue-400/80 leading-relaxed">
                选择功能后，上传图片即可开始创作。所有功能均支持 AI 自动分析和批量生成。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

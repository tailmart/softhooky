import React, { useState, useEffect } from 'react';
import {
  Image as ImageIcon, Layers, Layout, FileImage, Share2,
  ShoppingCart, Hand, Film, MessageCircle, Copy, Wand2,
  User, Clapperboard, Video, ChevronRight, Search, X
} from 'lucide-react';
import { getAvailableNavItems } from '../../services/navService';

interface NavTool {
  id: string;
  label: string;
  category: string;
  icon: React.ElementType;
  desc?: string;
}

const ICON_MAP: Record<string, React.ElementType> = {
  'nano-gen': ImageIcon,
  'productRefine': Wand2,
  'productFusion': Layers,
  'three-view': Layout,
  'detailClone': Copy,
  'carousel': ShoppingCart,
  'detail': FileImage,
  'tryon': User,
  'handheld': Hand,
  'banner': Layout,
  'poster': Wand2,
  'xiaohongshu': FileImage,
  'social': Share2,
  'storyboard': Film,
  'gemini-video': Video,
  'tk-video': Clapperboard,
  'veo31': Film,
  'deepseek-chat': MessageCircle,
};

// 工具描述 - 用用户能理解的语言
const TOOL_DESCS: Record<string, string> = {
  'nano-gen': '上传产品图，AI生成商业级海报',
  'productFusion': '把产品放入任意场景，效果真实',
  'productRefine': 'AI自动优化产品图细节',
  'three-view': '一键生成正面+侧面+背面',
  'banner': '3秒生成电商首页Banner',
  'carousel': '多角度展示产品卖点',
  'detail': 'AI自动生成详情页配图',
  'poster': '上传图片+文案，AI设计海报',
  'xiaohongshu': '封面+文案+配图，一键出笔记',
  'social': '第一视角POV，适配各平台',
  'storyboard': '剧本自动生成分镜脚本',
  'gemini-video': 'AI生成短视频',
  'tk-video': 'TikTok带货视频脚本',
  'veo31': 'Veo3.1视频生成',
  'deepseek-chat': '帮你写文案、想创意、出方案',
};

// 按场景分类 - 用户视角
const SCENES = [
  {
    key: '电商',
    label: '电商素材',
    icon: '🛍️',
    desc: 'Banner、详情页、轮播图',
    tools: ['banner', 'carousel', 'detail', 'poster']
  },
  {
    key: '小红书',
    label: '小红书/社媒',
    icon: '📱',
    desc: '种草笔记、社媒出图',
    tools: ['xiaohongshu', 'social']
  },
  {
    key: '生图',
    label: '图片生成',
    icon: '🎨',
    desc: '创意生图、融图、精修',
    tools: ['nano-gen', 'productFusion', 'productRefine', 'three-view']
  },
  {
    key: '视频',
    label: '视频/动态',
    icon: '🎬',
    desc: '故事板、短视频',
    tools: ['storyboard', 'gemini-video', 'tk-video', 'veo31']
  },
  {
    key: 'AI',
    label: 'AI 助手',
    icon: '🤖',
    desc: '写文案、想创意',
    tools: ['deepseek-chat']
  },
];

interface ToolsPageProps {
  onNavigateToTool: (toolId: string) => void;
}

export const ToolsPage: React.FC<ToolsPageProps> = ({ onNavigateToTool }) => {
  const [navItems, setNavItems] = useState<NavTool[]>([]);
  const [activeScene, setActiveScene] = useState(SCENES[0].key);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // 服务端分类名 → 前端分类名映射
  const CATEGORY_MAP: Record<string, string> = {
    'AI对话': 'AI',
    '营销工具': '小红书',
    '电商': '电商',
    '创意': '生图',
    '视频工具': '视频',
  };
  const CATEGORY_OVERRIDE: Record<string, string> = {
    'nano-gen': '生图',
    'three-view': '生图',
    'productFusion': '生图',
    'productRefine': '生图',
  };

  useEffect(() => {
    getAvailableNavItems().then(items => {
      setNavItems(
        items.filter(n => {
          if (n.enabled === false) return false;
          if (n.nav_id === 'detailClone' || n.nav_id === 'detail_clone' || n.nav_id === 'detailclone') return false;
          if (n.label?.includes('版式裂变') || n.label?.includes('风格复刻')) return false;
          return true;
        }).map(n => ({
          id: n.nav_id,
          label: ({ xiaohongshu: '小红书种草图文', social: '社媒POV出图' })[n.nav_id] || n.label,
          category: CATEGORY_OVERRIDE[n.nav_id] || CATEGORY_MAP[n.category] || n.category,
          icon: ICON_MAP[n.nav_id] || ImageIcon,
          desc: TOOL_DESCS[n.nav_id] || '',
        }))
      );
    });
  }, []);

  // 搜索过滤
  const searchResults = navItems.filter(item =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.desc?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 获取当前场景的工具
  const currentScene = SCENES.find(s => s.key === activeScene);
  const activeItems = currentScene
    ? navItems.filter(item => currentScene.tools.includes(item.id))
    : [];

  return (
    <div className="min-h-screen bg-white animate-mobile-fade-in">
      {/* 搜索栏 */}
      <div className="px-5 pt-4 pb-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a3a3a3]" />
          <input
            type="text"
            placeholder="搜索工具..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearching(e.target.value.length > 0);
            }}
            className="w-full bg-[#f5f5f5] rounded-xl py-2.5 pl-9 pr-8 text-sm text-[#171717] placeholder-[#a3a3a3] outline-none"
          />
          {isSearching && (
            <button
              onClick={() => {
                setSearchQuery('');
                setIsSearching(false);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X size={16} className="text-[#a3a3a3]" />
            </button>
          )}
        </div>
      </div>

      {/* 搜索结果 */}
      {isSearching ? (
        <div className="px-5 pb-6">
          <p className="text-xs text-[#a3a3a3] mb-3">搜索结果 ({searchResults.length})</p>
          {searchResults.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-[#a3a3a3]">没有找到相关工具</p>
            </div>
          ) : (
            <div className="space-y-2">
              {searchResults.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigateToTool(item.id)}
                    className="mobile-tap w-full bg-white rounded-2xl p-4 border border-[#e5e5e5] flex items-center gap-3.5"
                  >
                    <div className="w-11 h-11 rounded-xl bg-[#f5f5f5] flex items-center justify-center flex-shrink-0">
                      <Icon size={20} className="text-[#171717]" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold text-[#171717]">{item.label}</p>
                      <p className="text-xs text-[#a3a3a3] mt-0.5">{item.desc}</p>
                    </div>
                    <ChevronRight size={18} className="text-[#d4d4d4]" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 场景分类 Tab */}
          <div className="mobile-scroll-x px-5 pb-4">
            <div className="flex gap-2">
              {SCENES.map(scene => {
                const isActive = activeScene === scene.key;
                return (
                  <button
                    key={scene.key}
                    onClick={() => setActiveScene(scene.key)}
                    className={`mobile-tap flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap transition-all ${
                      isActive
                        ? 'bg-[#171717] text-white'
                        : 'bg-[#f5f5f5] text-[#737373]'
                    }`}
                  >
                    <span className="text-base">{scene.icon}</span>
                    <span className="text-sm font-medium">{scene.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 当前场景描述 */}
          {currentScene && (
            <div className="px-5 pb-4">
              <div className="bg-[#f5f5f5] rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{currentScene.icon}</span>
                  <div>
                    <h2 className="text-base font-bold text-[#171717]">{currentScene.label}</h2>
                    <p className="text-xs text-[#a3a3a3]">{currentScene.desc}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 工具列表 */}
          <div className="px-5 pb-6">
            <div className="space-y-3">
              {activeItems.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigateToTool(item.id)}
                    className="mobile-tap w-full bg-white rounded-2xl p-4 border border-[#e5e5e5] flex items-center gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-[#f5f5f5] flex items-center justify-center flex-shrink-0">
                      <Icon size={22} className="text-[#171717]" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-[15px] font-bold text-[#171717]">{item.label}</p>
                      <p className="text-xs text-[#a3a3a3] mt-1">{item.desc}</p>
                    </div>
                    <ChevronRight size={20} className="text-[#d4d4d4]" />
                  </button>
                );
              })}
            </div>

            {activeItems.length === 0 && (
              <div className="text-center py-16">
                <p className="text-sm text-[#a3a3a3]">暂无工具</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

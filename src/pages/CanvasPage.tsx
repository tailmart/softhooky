import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Copy, Layers, ImageIcon, FileImage, Layout, ShoppingCart, Hand, Coins, User, Boxes, Wand2, Globe } from 'lucide-react';
import { LeftSidebar } from '../components/LeftSidebar';
import { AuthModal } from '../components/AuthModal';
import { useAuth } from '../contexts/AuthContext';
import { RechargeModal, PaymentRecordsModal } from './RechargePage';

const AmazonImageGenPage = React.lazy(() => import('./plugins/AmazonImageGenPage').then(m => ({ default: m.AmazonImageGenPage })));
const BannerPage = React.lazy(() => import('./plugins/BannerPage').then(m => ({ default: m.BannerPage })));
const DetailPage2 = React.lazy(() => import('./plugins/DetailPage2').then(m => ({ default: m.DetailPage2 })));
const HandheldPage = React.lazy(() => import('./plugins/HandheldPage').then(m => ({ default: m.HandheldPage })));
const DetailClonePage = React.lazy(() => import('./plugins/DetailClonePage').then(m => ({ default: m.DetailClonePage })));
const ProductFusionPage = React.lazy(() => import('./plugins/ProductFusionPage').then(m => ({ default: m.ProductFusionPage })));
const ProductRefinePage = React.lazy(() => import('./plugins/ProductRefinePage').then(m => ({ default: m.ProductRefinePage })));
const ImageLibraryPage = React.lazy(() => import('./plugins/ImageLibraryPage').then(m => ({ default: m.ImageLibraryPage })));
const ImageEditRegionPage = React.lazy(() => import('./plugins/ImageEditRegionPage').then(m => ({ default: m.ImageEditRegionPage })));
const ImageTranslatePage = React.lazy(() => import('./plugins/ImageTranslatePage').then(m => ({ default: m.ImageTranslatePage })));

const ThreeViewPage = React.lazy(() => import('./plugins/ThreeViewPage').then(m => ({ default: m.ThreeViewPage })));

const ProductTryonPage = React.lazy(() => import('./plugins/ProductTryonPage').then(m => ({ default: m.ProductTryonPage })));
const Product9GridPage = React.lazy(() => import('./plugins/Product9GridPage').then(m => ({ default: m.Product9GridPage })));
const ChatGenPageWrapper = React.lazy(() => import('./chat/ImageGenPageWrapper').then(m => ({ default: m.ChatGenPageWrapper })));
const WorkflowPage = React.lazy(() => import('./plugins/WorkflowPage').then(m => ({ default: m.WorkflowPage })));
import { getDefaultModel } from '../services/modelService';
import { imageLibraryService } from '../services/imageLibraryService';

interface Conversation {
  id: string;
  title: string;
  messages: Array<{ type: 'user' | 'ai'; content: string; images?: string[] }>;
  uploadedImages: string[];
  generatedImages: Array<{ url: string; position: { x: number; y: number }; width?: number; height?: number }>;
  mode?: string;
}

const createConversation = (): Conversation => ({
  id: Date.now().toString(),
  title: '新对话',
  messages: [],
  uploadedImages: [],
  generatedImages: []
});

const getStorageKey = () => {
  try {
    const userStr = sessionStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      const userId = user.id || user.email || 'guest';
      return `canvas_state_${userId}`;
    }
  } catch {}
  return 'canvas_state_guest';
};

const saveState = (data: any) => {
  try {
    const conversations = (data.conversations || []).slice(0, 15);
    const cleanedData = {
      view: data.view,
      resolution: data.resolution,
      aspectRatio: data.aspectRatio,
      model: data.model,
      activeNav: data.activeNav,
      activeConversationId: data.activeConversationId,
      conversations: conversations.map((conv: any) => ({
        id: conv.id, title: conv.title, mode: conv.mode,
        uploadedImages: conv.uploadedImages?.filter((url: string) => !url.startsWith('data:')).slice(0, 10),
        generatedImages: conv.generatedImages?.map((img: any) => ({
          url: img.url, position: img.position || { x: 50, y: 50 }, width: img.width || 200, height: img.height || 200
        })),
        messages: conv.messages?.slice(-20).map((msg: any) => ({
          type: msg.type, content: msg.content?.substring(0, 500)
        }))
      }))
    };
    const serialized = JSON.stringify(cleanedData);
    if (serialized.length > 512000) {
      cleanedData.conversations = cleanedData.conversations.map((c: any) => ({
        ...c, messages: c.messages?.slice(-5).map((m: any) => ({ type: m.type, content: m.content?.substring(0, 200) }))
      }));
    }
    localStorage.setItem(getStorageKey(), JSON.stringify(cleanedData));
    const token = sessionStorage.getItem('authToken');
    if (token) {
      axios.post('/api/canvas/state', { stateData: cleanedData }, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
  } catch (e: any) {
    if (e.name === 'QuotaExceededError') localStorage.removeItem(getStorageKey());
  }
};

const loadState = () => {
  try {
    const saved = localStorage.getItem(getStorageKey());
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
};

const NAV_IDS = {
  CHAT_GEN: 'chat-gen',
  AMAZON_IMAGE_GEN: 'amazon-image-gen',
  BANNER: 'banner',
  DETAIL2: 'detail2',
  DETAIL_CLONE: 'detailClone',
  HANDHELD: 'handheld',
  PRODUCT_FUSION: 'productFusion',
  PRODUCT_9_GRID: 'product-9grid',

  IMAGE_LIBRARY: 'image-library',
  IMAGE_EDIT_REGION: 'image-edit-region',
  THREE_VIEW: 'three-view',
  LANDING: 'landing',
} as const;

const PLUGIN_LABELS: Record<string, string> = {
  'chat-gen': '创意生图',
  'amazon-image-gen': '亚马逊生图',
  banner: 'Banner设计',
  detail2: '详情页设计',
  handheld: 'Handheld Product',
  detailClone: '智能设计克隆',
  productFusion: '场景融合',
  productRefine: '产品精修',
  productTryon: '产品穿搭',
  'product-9grid': '产品展示图',

  'image-library': 'Image Library',
  'image-edit-region': '区域编辑',
  'image-translate': '图片转译',
  'three-view': '三视图生成',
  workflow: '工作流生图',
};

const PLUGIN_COMPONENTS: Record<string, React.FC> = {
  'chat-gen': ChatGenPageWrapper,
  'amazon-image-gen': AmazonImageGenPage,
  banner: BannerPage,
  detail2: DetailPage2,
  handheld: HandheldPage,
  detailClone: DetailClonePage,
  productFusion: ProductFusionPage,
  productRefine: ProductRefinePage,
  productTryon: ProductTryonPage,
  'product-9grid': Product9GridPage,

  'image-library': ImageLibraryPage,
  'image-edit-region': ImageEditRegionPage,
  'image-translate': ImageTranslatePage,
  'three-view': ThreeViewPage,
  workflow: WorkflowPage,
};

export const CanvasPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([createConversation()]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [resolution, setResolution] = useState('2K');
  const [aspectRatio, setAspectRatio] = useState('Smart');
  const [model, setModel] = useState('nanobann2');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRechargeModalOpen, setIsRechargeModalOpen] = useState(false);
  const [isRecordsModalOpen, setIsRecordsModalOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeNav, setActiveNav] = useState<string>(NAV_IDS.CHAT_GEN);
  const [credits, setCredits] = useState(0);

  useEffect(() => {
    const updateCredits = () => {
      try {
        const userStr = sessionStorage.getItem('user');
        if (userStr) setCredits(Number(JSON.parse(userStr).credits) || 0);
      } catch {}
    };
    updateCredits();
    window.addEventListener('credits-updated', updateCredits);
    return () => window.removeEventListener('credits-updated', updateCredits);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      let saved = loadState();
      let serverImages: any[] = [];

      // 优先从服务器加载 ImageGenPage 的画布数据
      try {
        const token = sessionStorage.getItem('authToken');
        if (token) {
          const pluginRes = await axios.get('/api/canvas/plugin-state?pluginId=chatgen_history', { 
            headers: { Authorization: `Bearer ${token}` }, 
            timeout: 5000 
          });
          if (pluginRes.data?.success && pluginRes.data?.data?.generatedImages?.length > 0) {
            serverImages = pluginRes.data.data.generatedImages;
            localStorage.setItem('chatgen_history_images', JSON.stringify(serverImages));
          }
        }
      } catch {}

      if (!saved?.conversations?.length) {
        try {
          const token = sessionStorage.getItem('authToken');
          if (token) {
            const res = await axios.get('/api/canvas/state', { headers: { Authorization: `Bearer ${token}` }, timeout: 5000 });
            if (res.data?.success && res.data?.data) {
              saved = res.data.data;
              localStorage.setItem(getStorageKey(), JSON.stringify(saved));
            }
          }
        } catch {}
      }

      if (saved?.conversations?.length > 0) {
        // 从服务器获取有效图片 URL 集合（过滤已过期的）
        let validImageUrls = new Set<string>();
        try {
          const token = sessionStorage.getItem('authToken');
          if (token) {
            const libRes = await axios.get('/api/images/library?page=1&pageSize=100', {
              headers: { Authorization: `Bearer ${token}` }, timeout: 5000
            });
            if (libRes.data?.success && libRes.data?.data) {
              (libRes.data.data as any[]).forEach((img: any) => {
                if (img.image_url) validImageUrls.add(img.image_url);
              });
            }
          }
        } catch {}

        // 合并服务器和本地图片数据（去重）
        const localImages = saved.conversations[0]?.generatedImages || [];
        const allImages = [...serverImages, ...localImages];
        const seenUrls = new Set<string>();
        const mergedImages: any[] = [];
        for (const img of allImages) {
          const url = typeof img === 'string' ? img : img?.url;
          if (url && !seenUrls.has(url)) {
            seenUrls.add(url);
            mergedImages.push(img);
          }
        }

        const convertedConversations = saved.conversations.map((conv: any, idx: number) => ({
          ...conv,
          generatedImages: (idx === 0 ? mergedImages : conv.generatedImages || []).filter((img: any) => {
            const url = typeof img === 'string' ? img : img?.url;
            // 过滤已删除/过期的图片
            if (!url) return false;
            if (imageLibraryService.isImageDeleted(url)) return false;
            // 检查是否还在服务端有效（未过期）
            if (validImageUrls.size > 0 && !validImageUrls.has(url)) return false;
            return true;
          }).map((img: any) =>
            typeof img === 'string' ? { url: img, position: { x: 50 + Math.random() * 600, y: 50 + Math.random() * 500 } } : (img.position ? img : { ...img, position: { x: 50 + Math.random() * 600, y: 50 + Math.random() * 500 } })
          ) || []
        }));
        setConversations(convertedConversations);
        const savedId = saved.activeConversationId;
        const exists = convertedConversations.some((c: any) => c.id === savedId);
        setActiveConversationId(exists ? savedId : convertedConversations[0].id);
        setResolution(saved.resolution || '2K');
        setAspectRatio(saved.aspectRatio || 'Smart');
        setModel(saved.model || 'nanobann2');
        const savedNav = saved.activeNav;
        const validNav = savedNav && (PLUGIN_COMPONENTS[savedNav] || savedNav === NAV_IDS.LANDING) ? savedNav : NAV_IDS.CHAT_GEN;
        setActiveNav(validNav);
      } else {
        const newConv = createConversation();
        setConversations([newConv]);
        setActiveConversationId(newConv.id);
      }
      setIsLoaded(true);
    };
    loadData();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isLoaded) return;
    const stateData = { view: 'canvas', conversations, resolution, aspectRatio, model, activeNav, activeConversationId };
    saveState(stateData);
  }, [conversations, resolution, aspectRatio, model, isLoaded, activeNav, activeConversationId]);

  useEffect(() => {
    const handleImagesDeleted = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.urls?.length) return;
      setConversations(prev => prev.map(conv => ({
        ...conv,
        generatedImages: (conv.generatedImages || []).filter(
          img => !detail.urls.some((delUrl: string) => img.url.includes(delUrl) || delUrl.includes(img.url))
        )
      })));
    };

    // 监听 ImageGenPage 的图片更新事件
    const handleCanvasImagesUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.images) return;
      setConversations(prev => {
        if (prev.length === 0) return prev;
        const firstConv = prev[0];
        return [{
          ...firstConv,
          generatedImages: detail.images
        }, ...prev.slice(1)];
      });
    };

    window.addEventListener('images-deleted', handleImagesDeleted);
    window.addEventListener('canvas-images-updated', handleCanvasImagesUpdated);
    return () => {
      window.removeEventListener('images-deleted', handleImagesDeleted);
      window.removeEventListener('canvas-images-updated', handleCanvasImagesUpdated);
    };
  }, []);

  const handleNewConversation = useCallback(() => {
    const newConv = createConversation();
    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const handleDeleteConversation = useCallback((id: string) => {
    if (conversations.length <= 1) return;
    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== id);
      if (activeConversationId === id) setActiveConversationId(filtered[0].id);
      return filtered;
    });
  }, [conversations.length, activeConversationId]);

  const handleUpdateConversations = useCallback((updater: (prev: Conversation[]) => Conversation[]) => {
    setConversations(prev => {
      const updated = updater(prev);
      const activeConv = updated.find(c => c.id === activeConversationId);
      if (activeConv && activeConv.messages.length > 0) {
        const firstUserMsg = activeConv.messages.find(m => m.type === 'user');
        if (firstUserMsg && activeConv.title === 'New Chat') {
          activeConv.title = firstUserMsg.content.substring(0, 20);
        }
      }
      return updated;
    });
  }, [activeConversationId]);

  const handleUpdateGeneratedImages = useCallback((updater: (prev: Conversation['generatedImages']) => Conversation['generatedImages']) => {
    setConversations(prev => prev.map(c =>
      c.id === activeConversationId ? { ...c, generatedImages: updater(c.generatedImages || []) } : c
    ));
  }, [activeConversationId]);

  const handleSelectNav = useCallback((navId: string) => {
    setActiveNav(navId);
    setModel(getDefaultModel(navId));
  }, []);

  const TOOLS = [
    { id: 'chat-gen', icon: Sparkles, label: '创意生图', desc: '上传产品图，AI智能生成电商素材', color: 'from-[#171717] to-[#404040]' },
    { id: 'workflow', icon: Boxes, label: '工作流生图', desc: '可视化节点连线，灵活定制生图流程', color: 'from-[#4338CA] to-[#6D28D9]' },
    { id: 'productFusion', icon: Layers, label: '场景融合', desc: '场景融合 · 海报设计，一站式AI产品视觉生成', color: 'from-[#171717] to-[#404040]' },
    { id: 'productTryon', icon: User, label: '产品穿搭', desc: '模特+产品，AI自动生成穿搭效果展示图', color: 'from-[#171717] to-[#404040]' },
    { id: 'product-9grid', icon: Layout, label: '产品展示图', desc: '6种不同角度，AI生成产品多视角展示拼接图', color: 'from-[#171717] to-[#404040]' },
    { id: 'detailClone', icon: Layout, label: '智能设计克隆', desc: '上传模板参考图，AI提取设计语言并迁移到你的产品上，智能适配优化', color: 'from-[#171717] to-[#404040]' },
    { id: 'banner', icon: FileImage, label: 'Banner设计', desc: '一键生成电商首屏Banner轮播图', color: 'from-[#171717] to-[#404040]' },
    { id: 'amazon-image-gen', icon: ShoppingCart, label: '亚马逊生图', desc: '主图 · A+页面 · 海报，亚马逊产品视觉生成', color: 'from-[#FF9900] to-[#232F3E]' },
    { id: 'handheld', icon: Hand, label: '手持产品', desc: '产品手持展示场景图生成', color: 'from-[#171717] to-[#404040]' },
    { id: 'three-view', icon: Layout, label: '三视图生成', desc: '上传产品图，生成正面+侧面+背面三视图', color: 'from-[#171717] to-[#404040]' },
    { id: 'image-edit-region', icon: Wand2, label: '区域编辑', desc: '圈选图片区域，AI智能修改内容或替换产品', color: 'from-[#6366F1] to-[#8B5CF6]' },
    { id: 'image-translate', icon: Globe, label: '图片转译', desc: '上传海报图片，AI自动提取文案并翻译替换为多语言版本', color: 'from-[#171717] to-[#404040]' },
  ];

  const renderPluginView = () => {
    if (activeNav === NAV_IDS.LANDING) {
      return (
        <div className="flex-1 flex flex-col bg-[#FAFAFA] overflow-y-auto">
          {/* Hero */}
          <div className="px-10 pt-12 pb-8 bg-gradient-to-br from-white to-gray-50 border-b border-gray-100">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[#171717] flex items-center justify-center">
                  <Sparkles size={16} className="text-white" />
                </div>
                <span className="text-sm font-medium text-[#171717]">Softhooky AI</span>
              </div>
              <h1 className="text-3xl font-bold text-[#171717] leading-tight mb-3">
                AI 电商视觉生成平台
              </h1>
              <p className="text-base text-[#737373] leading-relaxed max-w-2xl">
                从产品图到电商详情页、社媒宣传图、故事板、Banner 设计<br className="hidden md:block" />
                上传产品图，AI 帮你完成剩下的
              </p>
            </div>
          </div>

          {/* Tools Grid */}
          <div className="px-10 py-8">
            <h2 className="text-sm font-semibold text-[#A3A3A3] uppercase tracking-wider mb-5">选择工具开始创作</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {TOOLS.map(tool => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    onClick={() => handleSelectNav(tool.id)}
                    className="group bg-white rounded-2xl p-5 border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-200 text-left hover:-translate-y-0.5"
                  >
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tool.color} flex items-center justify-center mb-3 shadow-sm`}>
                      <Icon size={18} className="text-white" />
                    </div>
                    <h3 className="text-sm font-semibold text-[#171717] mb-1 group-hover:text-[#171717]">{tool.label}</h3>
                    <p className="text-xs text-[#A3A3A3] leading-relaxed">{tool.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="px-10 py-6 border-t border-gray-100">
            <p className="text-xs text-[#BDBDBD] text-center">选择左侧导航栏或上方工具开始使用 · 上传产品图即可体验</p>
          </div>
        </div>
      );
    }

    const PluginComponent = PLUGIN_COMPONENTS[activeNav];
    if (PluginComponent) {
      return (
        <div className="relative flex-1 min-h-0 flex">
          <React.Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#E5E5E5] border-t-[#171717] rounded-full animate-spin" /></div>}>
            <PluginComponent />
          </React.Suspense>
          {activeNav !== 'chat-gen' && activeNav !== 'image-library' && credits > 0 && (
            <div className="absolute top-4 right-6 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-full border border-gray-200 shadow-sm">
              <Coins size={13} className="text-amber-500" />
              <span className="text-xs font-bold text-amber-600">{credits.toFixed(1)}</span>
              <span className="text-[10px] text-gray-400">积分</span>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="flex-1 flex items-center justify-center bg-[#FAFAFA]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-[#E5E5E5] rounded-2xl flex items-center justify-center">
            <span className="text-2xl">🚀</span>
          </div>
          <h2 className="text-xl font-semibold text-[#171717] mb-2">{PLUGIN_LABELS[activeNav] || activeNav}</h2>
          <p className="text-sm text-[#737373]">Plugin coming soon...</p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      <LeftSidebar
        onOpenAuth={() => setShowAuthModal(true)}
        onOpenRecharge={() => setIsRechargeModalOpen(true)}
        onOpenRecords={() => setIsRecordsModalOpen(true)}
        onNewConversation={handleNewConversation}
        activeNav={activeNav}
        onSelectNav={handleSelectNav}
        activeConversationId={activeConversationId}
        conversations={conversations}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* 全局提示横幅 */}
        <div className="flex-shrink-0 bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center justify-center gap-2">
          <Globe size={13} className="text-blue-500 flex-shrink-0" />
          <span className="text-xs text-blue-600">海外 AI 模型生成中，出图约需 50~100 秒，精品值得等待</span>
        </div>

        {!isLoaded ? (
        <div className="flex-1 flex items-center justify-center bg-white">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#E5E5E5] border-t-[#171717] rounded-full animate-spin" />
            <span className="text-sm text-[#A3A3A3]">加载中...</span>
          </div>
        </div>
      ) : renderPluginView()}
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLoginSuccess={() => {}}
      />
      <RechargeModal isOpen={isRechargeModalOpen} onClose={() => setIsRechargeModalOpen(false)} />
      <PaymentRecordsModal isOpen={isRecordsModalOpen} onClose={() => setIsRecordsModalOpen(false)} />
    </div>
  );
};
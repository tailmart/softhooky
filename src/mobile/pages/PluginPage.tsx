import React from 'react';
import { ChevronLeft, Smartphone } from 'lucide-react';
import { MobileToolTemplate } from '../plugins/MobileToolTemplate';
import { MobileImageGen } from '../plugins/MobileImageGen';
import { MobileImageLibrary } from '../plugins/MobileImageLibrary';
import { MobileTryon } from '../plugins/MobileTryon';
import { MobileHandheld } from '../plugins/MobileHandheld';
import { MobileVideoGen, GEMINI_CONFIG, VEO31_CONFIG } from '../plugins/MobileVideoGen';
import { MobileStoryboard } from '../plugins/MobileStoryboard';
import { MobileTikTok } from '../plugins/MobileTikTok';
import { MobileRecharge } from '../plugins/MobileRecharge';
import { MobileRecords } from '../plugins/MobileRecords';
import { MobileCoupon } from '../plugins/MobileCoupon';
import { ChatPage } from './ChatPage';
import { MobileProductFusion } from '../plugins/MobileProductFusion';
import {
  XIAOHONGSHU_CONFIG, SOCIAL_CONFIG, CAROUSEL_CONFIG,
  BANNER_CONFIG, POSTER_CONFIG, DETAIL_CONFIG,
  THREE_VIEW_CONFIG,
  PRODUCT_REFINE_CONFIG, DETAIL_CLONE_CONFIG,
} from '../plugins/toolConfigs';

// ==================== 工具路由 ====================

// 配置驱动的工具（使用 MobileToolTemplate + config）
const CONFIG_TOOLS: Record<string, React.FC<{ onBack: () => void }>> = {
  xiaohongshu: ({ onBack }) => <MobileToolTemplate config={XIAOHONGSHU_CONFIG} onBack={onBack} />,
  social: ({ onBack }) => <MobileToolTemplate config={SOCIAL_CONFIG} onBack={onBack} />,
  carousel: ({ onBack }) => <MobileToolTemplate config={CAROUSEL_CONFIG} onBack={onBack} />,
  banner: ({ onBack }) => <MobileToolTemplate config={BANNER_CONFIG} onBack={onBack} />,
  poster: ({ onBack }) => <MobileToolTemplate config={POSTER_CONFIG} onBack={onBack} />,
  detail: ({ onBack }) => <MobileToolTemplate config={DETAIL_CONFIG} onBack={onBack} />,
  productRefine: ({ onBack }) => <MobileToolTemplate config={PRODUCT_REFINE_CONFIG} onBack={onBack} />,
  'three-view': ({ onBack }) => <MobileToolTemplate config={THREE_VIEW_CONFIG} onBack={onBack} />,
};

// 自定义移动端工具页面
const CUSTOM_TOOLS: Record<string, React.FC<{ onBack: () => void }>> = {
  'deepseek-chat': ({ onBack }) => <ChatPage onBack={onBack} />,
  'nano-gen': ({ onBack }) => <MobileImageGen onBack={onBack} />,
  'image-library': ({ onBack }) => <MobileImageLibrary onBack={onBack} />,
  tryon: ({ onBack }) => <MobileTryon onBack={onBack} />,
  handheld: ({ onBack }) => <MobileHandheld onBack={onBack} />,
  'gemini-video': ({ onBack }) => <MobileVideoGen config={GEMINI_CONFIG} onBack={onBack} />,
  veo31: ({ onBack }) => <MobileVideoGen config={VEO31_CONFIG} onBack={onBack} />,
  storyboard: ({ onBack }) => <MobileStoryboard onBack={onBack} />,
  'tk-video': ({ onBack }) => <MobileTikTok onBack={onBack} />,
  productFusion: ({ onBack }) => <MobileProductFusion onBack={onBack} />,
  recharge: ({ onBack }) => <MobileRecharge onBack={onBack} />,
  records: ({ onBack }) => <MobileRecords onBack={onBack} />,
  coupon: ({ onBack }) => <MobileCoupon onBack={onBack} />,
};

// 工具名称映射
const TOOL_LABELS: Record<string, string> = {
  'nano-gen': '创意生图', 'deepseek-chat': '电商文案助手',
  xiaohongshu: '小红书种草图文', social: '社媒POV出图',
  carousel: '独立站轮播图', banner: 'Banner设计', detail: '详情页设计',
  tryon: '产品试穿', handheld: '手持产品', detailClone: '版式裂变',
  productFusion: '产品融图', productRefine: '产品精修',
  'image-library': '图片图库', storyboard: '故事板',
  'three-view': '三视图生成', 'gemini-video': 'Gemini视频',
  veo31: 'Veo3.1视频', 'tk-video': 'TK视频脚本', poster: '智能海报设计',
  recharge: '充值', records: '消费记录', coupon: '优惠券',
};

// ==================== 主组件 ====================

interface PluginPageProps {
  pluginId: string;
  pluginLabel: string;
  onBack: () => void;
}

export const PluginPage: React.FC<PluginPageProps> = ({ pluginId, pluginLabel, onBack }) => {
  const label = pluginLabel || TOOL_LABELS[pluginId] || pluginId;

  // 优先使用自定义移动端工具
  if (CUSTOM_TOOLS[pluginId]) {
    const ToolComponent = CUSTOM_TOOLS[pluginId];
    return <ToolComponent onBack={onBack} />;
  }

  // 其次使用配置驱动的工具
  if (CONFIG_TOOLS[pluginId]) {
    const ToolComponent = CONFIG_TOOLS[pluginId];
    return <ToolComponent onBack={onBack} />;
  }

  // 没有移动端版本的，显示开发中占位页
  const icon = ({ tryon: '👔', handheld: '✋', detailClone: '📋', productFusion: '🔀', productRefine: '✨', storyboard: '🎬', 'three-view': '📐', 'gemini-video': '🎥', veo31: '🎬', 'tk-video': '📱', recharge: '💳', records: '📊', coupon: '🎫' })[pluginId] || '🚀';

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#f0f0f0] bg-white flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f5f5f5] mobile-tap">
          <ChevronLeft size={18} className="text-[#737373]" />
        </button>
        <h1 className="text-base font-bold text-[#171717]">{label}</h1>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="w-20 h-20 rounded-3xl bg-white flex items-center justify-center mb-4 shadow-sm border border-[#f0f0f0]">
          <span className="text-3xl">{icon}</span>
        </div>
        <h2 className="text-lg font-bold text-[#171717] mb-1">{label}</h2>
        <p className="text-sm text-[#a3a3a3] text-center mb-6">移动版正在开发中</p>
        <div className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-2xl border border-[#f0f0f0]">
          <Smartphone size={14} className="text-[#a3a3a3]" />
          <span className="text-xs text-[#a3a3a3]">请先在 PC 端使用此功能</span>
        </div>
      </div>
    </div>
  );
};

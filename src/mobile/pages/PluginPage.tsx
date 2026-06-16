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
  XIAOHONGSHU_CONFIG, SOCIAL_CONFIG,
  BANNER_CONFIG, POSTER_CONFIG, DETAIL_CONFIG,
  THREE_VIEW_CONFIG,
  PRODUCT_REFINE_CONFIG, DETAIL_CLONE_CONFIG,
  PRODUCT_9GRID_CONFIG, IMAGE_TRANSLATE_CONFIG,
} from '../plugins/toolConfigs';

// ==================== 工具路由 ====================

// 配置驱动的工具（使用 MobileToolTemplate + config）
const CONFIG_TOOLS: Record<string, React.FC<{ onBack: () => void }>> = {
  xiaohongshu: ({ onBack }) => <MobileToolTemplate config={XIAOHONGSHU_CONFIG} onBack={onBack} />,
  social: ({ onBack }) => <MobileToolTemplate config={SOCIAL_CONFIG} onBack={onBack} />,
  banner: ({ onBack }) => <MobileToolTemplate config={BANNER_CONFIG} onBack={onBack} />,
  poster: ({ onBack }) => <MobileToolTemplate config={POSTER_CONFIG} onBack={onBack} />,
  detail: ({ onBack }) => <MobileToolTemplate config={DETAIL_CONFIG} onBack={onBack} />,
  detail2: ({ onBack }) => <MobileToolTemplate config={DETAIL_CONFIG} onBack={onBack} />,
  productRefine: ({ onBack }) => <MobileToolTemplate config={PRODUCT_REFINE_CONFIG} onBack={onBack} />,
  'three-view': ({ onBack }) => <MobileToolTemplate config={THREE_VIEW_CONFIG} onBack={onBack} />,
  detailClone: ({ onBack }) => <MobileToolTemplate config={DETAIL_CLONE_CONFIG} onBack={onBack} />,
  'product-9grid': ({ onBack }) => <MobileToolTemplate config={PRODUCT_9GRID_CONFIG} onBack={onBack} />,
  'image-translate': ({ onBack }) => <MobileToolTemplate config={IMAGE_TRANSLATE_CONFIG} onBack={onBack} />,
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

// 工具名称映射（匹配PC端）
const TOOL_LABELS: Record<string, string> = {
  'nano-gen': '创意生图', 'deepseek-chat': '电商文案助手',
  xiaohongshu: '小红书种草图文', social: '社媒POV出图',
  'amazon-image-gen': '亚马逊生图',
  banner: 'Banner设计', detail: '详情页设计', detail2: '详情页设计',
  tryon: '产品穿搭', handheld: '手持产品', detailClone: '智能设计克隆',
  productFusion: '场景融合', productRefine: '产品精修',
  'product-9grid': '产品展示图',
  'image-library': '图片图库', storyboard: '故事板',
  'three-view': '三视图生成', 'gemini-video': 'Gemini视频',
  veo31: 'Veo3.1视频', 'tk-video': 'TK视频脚本', poster: '营销海报设计',
  'image-edit-region': '区域编辑', 'image-translate': '图片转译',
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
  const icon = ({ tryon: '👔', handheld: '✋', detailClone: '📋', productFusion: '🔀', productRefine: '✨', storyboard: '🎬', 'three-view': '📐', 'gemini-video': '🎥', veo31: '🎬', 'tk-video': '📱', recharge: '💳', records: '📊', coupon: '🎫', 'product-9grid': '📐', 'amazon-image-gen': '🛒', 'image-edit-region': '🖌️', 'image-translate': '🌐' })[pluginId] || '🚀';

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-[#0a0a0a] flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] mobile-tap">
          <ChevronLeft size={18} className="text-white/40" />
        </button>
        <h1 className="text-base font-bold text-white">{label}</h1>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="w-20 h-20 rounded-3xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
          <span className="text-3xl">{icon}</span>
        </div>
        <h2 className="text-lg font-bold text-white mb-1">{label}</h2>
        <p className="text-sm text-white/30 text-center mb-6">移动版正在开发中</p>
        <div className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] rounded-2xl border border-white/[0.06]">
          <Smartphone size={14} className="text-white/20" />
          <span className="text-xs text-white/20">请先在 PC 端使用此功能</span>
        </div>
      </div>
    </div>
  );
};

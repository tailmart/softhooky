export interface ModelOption {
  model_id: string;
  label: string;
  enabled: boolean;
  sort_order: number;
}

// 图片生成模型列表
const IMAGE_MODELS: ModelOption[] = [
  { model_id: 'nanobann2', label: 'Nanobann2', enabled: true, sort_order: 1 },
  { model_id: 'gpt-image-2', label: 'GPT Image 2', enabled: true, sort_order: 2 },
  { model_id: 'agnes-image-2.1-flash', label: 'Agnes Image 2.1 Flash', enabled: true, sort_order: 3 },
];

// 视频生成模型列表
const VIDEO_MODELS: ModelOption[] = [
  { model_id: 'grok-video-1.5-pro', label: 'Grok Video 1.5 Pro', enabled: true, sort_order: 10 },
  { model_id: 'grok-video-1.5-max', label: 'Grok Video 1.5 Max', enabled: true, sort_order: 11 },
];

export async function getAvailableModels(excludeModels?: string[]): Promise<ModelOption[]> {
  if (excludeModels && excludeModels.length > 0) {
    return IMAGE_MODELS.filter(m => !excludeModels.includes(m.model_id));
  }
  return IMAGE_MODELS;
}

// 获取视频模型列表
export async function getVideoModels(): Promise<ModelOption[]> {
  try {
    const response = await fetch('/api/models');
    const data = await response.json();
    if (data.success && Array.isArray(data.data)) {
      // 过滤出视频模型（model_id 包含 'video'）
      const videoModels = data.data.filter((m: any) =>
        m.model_id.includes('video') && m.enabled
      );
      if (videoModels.length > 0) {
        return videoModels.map((m: any) => ({
          model_id: m.model_id,
          label: m.label,
          enabled: m.enabled,
          sort_order: m.sort_order || 0,
        }));
      }
    }
  } catch (e) {}
  // fallback 到硬编码列表
  return VIDEO_MODELS;
}

// 每个页面各自的默认模型
const DEFAULT_MODEL_MAP: Record<string, string> = {
  'chat-gen': 'nanobann2',
  productRefine: 'nanobann2',
  productFusion: 'nanobann2',
  tryon: 'nanobann2',
  handheld: 'nanobann2',
  'three-view': 'nanobann2',
  social: 'nanobann2',
  detailClone: 'gpt-image-2',
  detail2: 'gpt-image-2',
  banner: 'gpt-image-2',
  xiaohongshu: 'nanobann2',
  storyboard: 'gpt-image-2',
  'tk-video': 'gpt-image-2',
  'image-edit-region': 'nanobann2',
  'image-translate': 'nanobann2',
};

export function getDefaultModel(navId: string): string {
  return DEFAULT_MODEL_MAP[navId] || 'nanobann2';
}

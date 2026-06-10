export interface ModelOption {
  model_id: string;
  label: string;
  enabled: boolean;
  sort_order: number;
}

// 固定模型列表
const MODELS: ModelOption[] = [
  { model_id: 'seedream', label: 'Seedream', enabled: true, sort_order: 0 },
  { model_id: 'nanobann2', label: 'Nanobann2', enabled: true, sort_order: 1 },
  { model_id: 'gpt-image-2', label: 'GPT Image 2', enabled: true, sort_order: 2 },
];

export async function getAvailableModels(excludeModels?: string[]): Promise<ModelOption[]> {
  if (excludeModels && excludeModels.length > 0) {
    return MODELS.filter(m => !excludeModels.includes(m.model_id));
  }
  return MODELS;
}

// 每个页面各自的默认模型
const DEFAULT_MODEL_MAP: Record<string, string> = {
  'chat-gen': 'seedream',
  productRefine: 'nanobann2',
  productFusion: 'nanobann2',
  tryon: 'nanobann2',
  handheld: 'nanobann2',
  'three-view': 'nanobann2',
  social: 'nanobann2',
  detailClone: 'gpt-image-2',
  carousel: 'gpt-image-2',
  detail2: 'gpt-image-2',
  banner: 'gpt-image-2',
  poster: 'nanobann2',
  xiaohongshu: 'nanobann2',
  storyboard: 'gpt-image-2',
  'tk-video': 'gpt-image-2',
};

export function getDefaultModel(navId: string): string {
  return DEFAULT_MODEL_MAP[navId] || 'nanobann2';
}

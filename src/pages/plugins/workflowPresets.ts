interface PresetNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
}

interface PresetConnection {
  id: string;
  sourceId: string;
  sourcePort: string;
  targetId: string;
  targetPort: string;
}

export interface WorkflowPreset {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  nodes: PresetNode[];
  connections: PresetConnection[];
}

// Standard spacing
const GX = 320;

export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  // ===== 电商图片 =====
  {
    id: 'product-refine',
    name: '产品精修',
    description: '上传产品图，AI自动分析特征并生成商业级精修图（白底居中、柔和投影）',
    category: '电商图片',
    icon: 'Wand2',
    nodes: [
      { id: 'start-1', type: 'start', position: { x: 60, y: 60 }, data: { description: '上传需要精修的产品图片', referenceImages: [] } },
      { id: 'analyze-1', type: 'imageAnalyze', position: { x: 60 + GX, y: 60 }, data: { instruction: '分析这张产品图片，用一句话描述它是什么产品（如：一款银色金属表盘的简约手表、一副黑色无线蓝牙耳机）。直接返回产品描述，不要其他内容。' } },
      { id: 'gen-1', type: 'imageEdit', position: { x: 60 + GX * 2, y: 60 }, data: { model: 'nanobann2', aspectRatio: '1:1', resolution: '2K', prompt: '产品精修图。纯白色背景，产品居中展示，产品细节清晰锐利，边缘干净，添加柔和自然的投影，产品表面质感真实，光影过渡细腻，商业产品摄影级别，高分辨率，无任何文字标签，极简干净' } },
      { id: 'out-1', type: 'output', position: { x: 60 + GX * 3, y: 60 }, data: { saveToLibrary: true } },
    ],
    connections: [
      { id: 'c1-1', sourceId: 'start-1', sourcePort: 'out', targetId: 'analyze-1', targetPort: 'in' },
      { id: 'c1-2', sourceId: 'analyze-1', sourcePort: 'out', targetId: 'gen-1', targetPort: 'in' },
      { id: 'c1-3', sourceId: 'gen-1', sourcePort: 'out', targetId: 'out-1', targetPort: 'in' },
    ],
  },
  {
    id: 'scene-fusion',
    name: '场景融合',
    description: '上传产品图，AI分析推荐场景并将产品融入指定场景，支持海报模式',
    category: '电商图片',
    icon: 'ImageIcon',
    nodes: [
      { id: 'start-2', type: 'start', position: { x: 60, y: 60 }, data: { description: '上传产品图片，AI将分析并推荐融合场景', referenceImages: [] } },
      { id: 'prompt-2', type: 'prompt', position: { x: 60 + GX, y: 60 }, data: { prompt: '产品图片：\n场景：简约纯色背景，柔和自然光\n请将产品自然地融入到场景中，产品本身保持不变，注意光影协调和透视关系', autoOptimize: true } },
      { id: 'gen-2', type: 'imageEdit', position: { x: 60 + GX * 2, y: 60 }, data: { model: 'nanobann2', aspectRatio: '1:1', resolution: '2K', prompt: '' } },
      { id: 'out-2', type: 'output', position: { x: 60 + GX * 3, y: 60 }, data: { saveToLibrary: true } },
    ],
    connections: [
      { id: 'c2-1', sourceId: 'start-2', sourcePort: 'out', targetId: 'prompt-2', targetPort: 'in' },
      { id: 'c2-2', sourceId: 'prompt-2', sourcePort: 'out', targetId: 'gen-2', targetPort: 'in' },
      { id: 'c2-3', sourceId: 'gen-2', sourcePort: 'out', targetId: 'out-2', targetPort: 'in' },
    ],
  },
  {
    id: 'product-tryon',
    name: '产品穿搭',
    description: '上传模特参考图+产品图，AI生成模特穿搭展示效果，支持多角度多姿势',
    category: '电商图片',
    icon: 'User',
    nodes: [
      { id: 'start-3', type: 'start', position: { x: 60, y: 60 }, data: { description: '上传2-10张模特参考图 + 产品图片', referenceImages: [] } },
      { id: 'gen-3a', type: 'imageGen', position: { x: 60 + GX, y: 0 }, data: { model: 'nanobann2', aspectRatio: '3:4', resolution: '4K', batchSize: 1, prompt: '时尚外国模特，半身展示，浅色木地板背景，白色/米白色窗帘，真实人像质感' } },
      { id: 'edit-3', type: 'imageEdit', position: { x: 60 + GX * 2, y: 60 }, data: { model: 'nanobann2', aspectRatio: '3:4', resolution: '2K', prompt: '模特身着该产品的场景展示，产品100%不变，模特面部发型体型一致，真人质感无磨皮' } },
      { id: 'out-3', type: 'output', position: { x: 60 + GX * 3, y: 60 }, data: { saveToLibrary: true } },
    ],
    connections: [
      { id: 'c3-1', sourceId: 'start-3', sourcePort: 'out', targetId: 'gen-3a', targetPort: 'in' },
      { id: 'c3-2', sourceId: 'gen-3a', sourcePort: 'out', targetId: 'edit-3', targetPort: 'in' },
      { id: 'c3-3', sourceId: 'edit-3', sourcePort: 'out', targetId: 'out-3', targetPort: 'in' },
    ],
  },
  {
    id: 'three-view',
    name: '三视图生成',
    description: '上传产品图片（最多3张），AI生成正面+侧面+背面三视图，16:9横版排列',
    category: '电商图片',
    icon: 'Eye',
    nodes: [
      { id: 'start-4', type: 'start', position: { x: 60, y: 60 }, data: { description: '上传产品图片（最多3张：正面、侧面、背面）', referenceImages: [] } },
      { id: 'analyze-4', type: 'imageAnalyze', position: { x: 60 + GX, y: 60 }, data: { instruction: '分析这张图片中的主体是人还是产品。如果图中有人物（真人、模特、人物形象）或者该产品适合被人佩戴穿戴（如手表、首饰、耳机、眼镜、帽子等），返回"person"。如果只是普通产品，返回"product"。只返回一个词。' } },
      { id: 'gen-4', type: 'imageEdit', position: { x: 60 + GX * 2, y: 60 }, data: { model: 'nanobann2', aspectRatio: '16:9', resolution: '2K', prompt: '三视图，纯白色背景，左中右排列展示产品的正面、侧面、背面，标注"正面""侧面""背面"，专业摄影打光，产品细节清晰' } },
      { id: 'out-4', type: 'output', position: { x: 60 + GX * 3, y: 60 }, data: { saveToLibrary: true } },
    ],
    connections: [
      { id: 'c4-1', sourceId: 'start-4', sourcePort: 'out', targetId: 'analyze-4', targetPort: 'in' },
      { id: 'c4-2', sourceId: 'analyze-4', sourcePort: 'out', targetId: 'gen-4', targetPort: 'in' },
      { id: 'c4-3', sourceId: 'gen-4', sourcePort: 'out', targetId: 'out-4', targetPort: 'in' },
    ],
  },
  {
    id: 'product-9grid',
    name: '产品展示图',
    description: '上传产品正面/背面图，AI分析后生成六宫格(4:3)或九宫格(16:9)展示图',
    category: '电商图片',
    icon: 'ImageIcon',
    nodes: [
      { id: 'start-5', type: 'start', position: { x: 60, y: 60 }, data: { description: '上传产品正面图（可加背面图），AI分析细节后生成多视角展示图', referenceImages: [] } },
      { id: 'analyze-5a', type: 'imageAnalyze', position: { x: 60 + GX, y: 0 }, data: { instruction: '仔细分析这张产品图片的所有细节：材质、纹理、颜色、形状、结构、Logo、功能键、接口等。判断产品是"平铺"还是"立体"展示。请详细描述所有可见的细节特征。' } },
      { id: 'gen-5', type: 'imageEdit', position: { x: 60 + GX * 2, y: 60 }, data: { model: 'gpt-image-2', aspectRatio: '4:3', resolution: '4K', prompt: '产品六宫格展示图，4:3比例，6种相机角度展示：仰视、俯视、超低角度、旋转动态、微距特写、全景环境，白底，无水印无文字' } },
      { id: 'out-5', type: 'output', position: { x: 60 + GX * 3, y: 60 }, data: { saveToLibrary: true } },
    ],
    connections: [
      { id: 'c5-1', sourceId: 'start-5', sourcePort: 'out', targetId: 'analyze-5a', targetPort: 'in' },
      { id: 'c5-2', sourceId: 'analyze-5a', sourcePort: 'out', targetId: 'gen-5', targetPort: 'in' },
      { id: 'c5-3', sourceId: 'gen-5', sourcePort: 'out', targetId: 'out-5', targetPort: 'in' },
    ],
  },
  {
    id: 'design-clone',
    name: '智能设计克隆',
    description: '上传产品图+模板参考图，AI分析设计语言并将风格迁移到产品上',
    category: '电商图片',
    icon: 'Copy',
    nodes: [
      { id: 'start-6', type: 'start', position: { x: 60, y: 60 }, data: { description: '上传产品图片 + 模板参考图，AI将模板风格迁移到产品', referenceImages: [] } },
      { id: 'analyze-6', type: 'imageAnalyze', position: { x: 60 + GX, y: 60 }, data: { instruction: '分析模板参考图的设计语言：风格调性、色彩倾向、字体气质、留白节奏、构图规律、装饰手法。同时分析产品图的形态和特征，输出设计迁移方案。' } },
      { id: 'gen-6', type: 'imageEdit', position: { x: 60 + GX * 2, y: 60 }, data: { model: 'nanobann2', aspectRatio: '1:1', resolution: '2K', prompt: '将模板的设计风格迁移到产品上，保持产品的原始形态和特征，使用模板的色彩方案、构图布局和装饰风格' } },
      { id: 'out-6', type: 'output', position: { x: 60 + GX * 3, y: 60 }, data: { saveToLibrary: true } },
    ],
    connections: [
      { id: 'c6-1', sourceId: 'start-6', sourcePort: 'out', targetId: 'analyze-6', targetPort: 'in' },
      { id: 'c6-2', sourceId: 'analyze-6', sourcePort: 'out', targetId: 'gen-6', targetPort: 'in' },
      { id: 'c6-3', sourceId: 'gen-6', sourcePort: 'out', targetId: 'out-6', targetPort: 'in' },
    ],
  },
  // ===== 营销设计 =====
  {
    id: 'amazon-image-gen',
    name: '亚马逊生图',
    description: '分析产品图片，生成亚马逊Listing主图和A+页面配图，多语言支持',
    category: '营销设计',
    icon: 'Layers',
    nodes: [
      { id: 'start-7', type: 'start', position: { x: 60, y: 60 }, data: { description: '上传产品图片，AI分析后生成亚马逊轮播图', referenceImages: [] } },
      { id: 'analyze-7', type: 'imageAnalyze', position: { x: 60 + GX, y: 60 }, data: { instruction: '分析这张产品图，提取：产品名称、核心功能、材质、使用场景、目标人群、差异化卖点。输出详细的产品分析报告用于生成电商配图。' } },
      { id: 'gen-7', type: 'imageEdit', position: { x: 60 + GX * 2, y: 60 }, data: { model: 'nanobann2', aspectRatio: '1:1', resolution: '2K', prompt: '亚马逊Listing主图，纯白背景，产品居中展示，清晰展现产品全貌和核心卖点，专业电商摄影品质，高分辨率' } },
      { id: 'out-7', type: 'output', position: { x: 60 + GX * 3, y: 60 }, data: { saveToLibrary: true } },
    ],
    connections: [
      { id: 'c7-1', sourceId: 'start-7', sourcePort: 'out', targetId: 'analyze-7', targetPort: 'in' },
      { id: 'c7-2', sourceId: 'analyze-7', sourcePort: 'out', targetId: 'gen-7', targetPort: 'in' },
      { id: 'c7-3', sourceId: 'gen-7', sourcePort: 'out', targetId: 'out-7', targetPort: 'in' },
    ],
  },
  {
    id: 'detail-page',
    name: '详情页设计',
    description: '生成独立站/电商详情页配图方案，智能区块划分展示产品卖点',
    category: '营销设计',
    icon: 'Layers',
    nodes: [
      { id: 'start-8', type: 'start', position: { x: 60, y: 60 }, data: { description: '上传产品图片，AI分析后生成详情页配图方案', referenceImages: [] } },
      { id: 'prompt-8', type: 'prompt', position: { x: 60 + GX, y: 60 }, data: { prompt: '生成产品详情页配图方案，包含：产品全景展示、材质细节特写、功能卖点图解、使用场景演示、尺寸规格说明、对比优势展示，排版清晰，品牌调性统一', autoOptimize: true } },
      { id: 'gen-8', type: 'imageGen', position: { x: 60 + GX * 2, y: 60 }, data: { model: 'nanobann2', aspectRatio: '3:4', resolution: '2K', batchSize: 1 } },
      { id: 'out-8', type: 'output', position: { x: 60 + GX * 3, y: 60 }, data: { saveToLibrary: true } },
    ],
    connections: [
      { id: 'c8-1', sourceId: 'start-8', sourcePort: 'out', targetId: 'prompt-8', targetPort: 'in' },
      { id: 'c8-2', sourceId: 'prompt-8', sourcePort: 'out', targetId: 'gen-8', targetPort: 'in' },
      { id: 'c8-3', sourceId: 'gen-8', sourcePort: 'out', targetId: 'out-8', targetPort: 'in' },
    ],
  },
  {
    id: 'banner-design',
    name: 'Banner设计',
    description: '分析产品图片，生成首页轮播Banner配图，覆盖全链路展示',
    category: '营销设计',
    icon: 'ImageIcon',
    nodes: [
      { id: 'start-9', type: 'start', position: { x: 60, y: 60 }, data: { description: '上传产品图片，AI生成Banner设计方案', referenceImages: [] } },
      { id: 'prompt-9', type: 'prompt', position: { x: 60 + GX, y: 60 }, data: { prompt: '电商首页轮播Banner，包含：首屏主图突出产品、核心功能卖点展示、使用场景带入、购买引导，排版大气，色彩搭配和谐，品牌识别度高', autoOptimize: true } },
      { id: 'gen-9', type: 'imageEdit', position: { x: 60 + GX * 2, y: 60 }, data: { model: 'nanobann2', aspectRatio: '16:9', resolution: '2K', prompt: '' } },
      { id: 'out-9', type: 'output', position: { x: 60 + GX * 3, y: 60 }, data: { saveToLibrary: true } },
    ],
    connections: [
      { id: 'c9-1', sourceId: 'start-9', sourcePort: 'out', targetId: 'prompt-9', targetPort: 'in' },
      { id: 'c9-2', sourceId: 'prompt-9', sourcePort: 'out', targetId: 'gen-9', targetPort: 'in' },
      { id: 'c9-3', sourceId: 'gen-9', sourcePort: 'out', targetId: 'out-9', targetPort: 'in' },
    ],
  },
  // ===== 社交媒体 =====
  {
    id: 'xiaohongshu',
    name: '小红书种草图文',
    description: '上传产品图，生成小红书种草图文，含封面/主图/细节图/场景图',
    category: '社交媒体',
    icon: 'Type',
    nodes: [
      { id: 'start-11', type: 'start', position: { x: 60, y: 60 }, data: { description: '上传产品图片，生成小红书种草图文', referenceImages: [] } },
      { id: 'analyze-11', type: 'imageAnalyze', position: { x: 60 + GX, y: 60 }, data: { instruction: '分析产品，提取适合小红书种草的内容点：外观颜值亮点、使用场景、核心功能、价格优势、适合人群、真实使用感受' } },
      { id: 'gen-11', type: 'imageEdit', position: { x: 60 + GX * 2, y: 60 }, data: { model: 'nanobann2', aspectRatio: '3:4', resolution: '2K', prompt: '小红书种草风格，清新自然，产品突出展示，背景简约有质感，适合社交平台传播，真实自然不做作' } },
      { id: 'out-11', type: 'output', position: { x: 60 + GX * 3, y: 60 }, data: { saveToLibrary: true } },
    ],
    connections: [
      { id: 'c11-1', sourceId: 'start-11', sourcePort: 'out', targetId: 'analyze-11', targetPort: 'in' },
      { id: 'c11-2', sourceId: 'analyze-11', sourcePort: 'out', targetId: 'gen-11', targetPort: 'in' },
      { id: 'c11-3', sourceId: 'gen-11', sourcePort: 'out', targetId: 'out-11', targetPort: 'in' },
    ],
  },
  {
    id: 'social-pov',
    name: '社媒POV出图',
    description: '分析产品，生成社交媒体第一人称POV视角营销图，多平台适配',
    category: '社交媒体',
    icon: 'User',
    nodes: [
      { id: 'start-12', type: 'start', position: { x: 60, y: 60 }, data: { description: '上传产品图片，生成社媒POV展示图', referenceImages: [] } },
      { id: 'analyze-12', type: 'imageAnalyze', position: { x: 60 + GX, y: 60 }, data: { instruction: '深度分析产品：名称、品牌、品类、规格、核心卖点、目标人群、使用场景、差异化优势。输出完整的产品画像用于社媒营销。' } },
      { id: 'gen-12', type: 'imageEdit', position: { x: 60 + GX * 2, y: 60 }, data: { model: 'nanobann2', aspectRatio: '1:1', resolution: '2K', prompt: '社交媒体第一人称POV视角，产品在日常场景中自然展示，真实生活化风格，ins风格滤镜，适合社交媒体传播' } },
      { id: 'out-12', type: 'output', position: { x: 60 + GX * 3, y: 60 }, data: { saveToLibrary: true } },
    ],
    connections: [
      { id: 'c12-1', sourceId: 'start-12', sourcePort: 'out', targetId: 'analyze-12', targetPort: 'in' },
      { id: 'c12-2', sourceId: 'analyze-12', sourcePort: 'out', targetId: 'gen-12', targetPort: 'in' },
      { id: 'c12-3', sourceId: 'gen-12', sourcePort: 'out', targetId: 'out-12', targetPort: 'in' },
    ],
  },
  // ===== 视频创作 =====
  {
    id: 'video-gen',
    name: '视频生成',
    description: '输入文案描述+参考图，生成AI视频（Veo 3.1），支持横/竖屏',
    category: '视频创作',
    icon: 'Play',
    nodes: [
      { id: 'start-13', type: 'start', position: { x: 60, y: 60 }, data: { description: '输入视频文案描述，可选择参考图', referenceImages: [] } },
      { id: 'prompt-13', type: 'prompt', position: { x: 60 + GX, y: 60 }, data: { prompt: '优化以下视频文案，使其更适合AI视频生成：\n\n', autoOptimize: true } },
      { id: 'out-13', type: 'output', position: { x: 60 + GX * 2, y: 60 }, data: { saveToLibrary: true } },
    ],
    connections: [
      { id: 'c13-1', sourceId: 'start-13', sourcePort: 'out', targetId: 'prompt-13', targetPort: 'in' },
      { id: 'c13-2', sourceId: 'prompt-13', sourcePort: 'out', targetId: 'out-13', targetPort: 'in' },
    ],
  },
  {
    id: 'storyboard',
    name: '故事板',
    description: '上传参考图+剧本，AI生成分镜方案，自动生成16:9故事板合成图',
    category: '视频创作',
    icon: 'Eye',
    nodes: [
      { id: 'start-14', type: 'start', position: { x: 60, y: 60 }, data: { description: '上传参考图片（最多6张）+ 输入剧本文案', referenceImages: [] } },
      { id: 'prompt-14', type: 'prompt', position: { x: 60 + GX, y: 60 }, data: { prompt: '基于以下参考图和剧本，生成故事板分镜方案：包含角色设定、场景、光影、情绪基调、音效、道具。每个镜头包含：画面描述、动作、台词、景别、机位、时长。\n\n剧本：', autoOptimize: true } },
      { id: 'gen-14', type: 'imageGen', position: { x: 60 + GX * 2, y: 60 }, data: { model: 'gpt-image-2', aspectRatio: '16:9', resolution: '2K', batchSize: 1, prompt: '故事板分镜合成图，16:9比例，多镜头网格排列，电影级画面质感' } },
      { id: 'out-14', type: 'output', position: { x: 60 + GX * 3, y: 60 }, data: { saveToLibrary: true } },
    ],
    connections: [
      { id: 'c14-1', sourceId: 'start-14', sourcePort: 'out', targetId: 'prompt-14', targetPort: 'in' },
      { id: 'c14-2', sourceId: 'prompt-14', sourcePort: 'out', targetId: 'gen-14', targetPort: 'in' },
      { id: 'c14-3', sourceId: 'gen-14', sourcePort: 'out', targetId: 'out-14', targetPort: 'in' },
    ],
  },
  {
    id: 'tk-script',
    name: 'TK脚本图',
    description: '上传产品图，选择脚本模板，AI生成TikTok短视频脚本分镜合成图',
    category: '视频创作',
    icon: 'Play',
    nodes: [
      { id: 'start-15', type: 'start', position: { x: 60, y: 60 }, data: { description: '上传产品图片（最多10张），生成TikTok短视频脚本', referenceImages: [] } },
      { id: 'analyze-15', type: 'imageAnalyze', position: { x: 60 + GX, y: 60 }, data: { instruction: '深度分析产品信息：产品名称、品类、核心卖点、目标受众、使用场景、差异化优势、价格区间。为TikTok短视频脚本创作准备。' } },
      { id: 'prompt-15', type: 'prompt', position: { x: 60 + GX * 2, y: 30 }, data: { prompt: '痛点场景开场 → 解决方案展示产品 → 行动号召。视频时长10秒，6个镜头，TikTok竖屏风格，产品外观一致性，人物真实自然', autoOptimize: false } },
      { id: 'gen-15', type: 'imageGen', position: { x: 60 + GX * 3, y: 60 }, data: { model: 'gpt-image-2', aspectRatio: '16:9', resolution: '2K', batchSize: 1, prompt: 'TikTok短视频分镜合成图，16:9比例，多镜头网格排列展示脚本分镜' } },
      { id: 'out-15', type: 'output', position: { x: 60 + GX * 4, y: 60 }, data: { saveToLibrary: true } },
    ],
    connections: [
      { id: 'c15-1', sourceId: 'start-15', sourcePort: 'out', targetId: 'analyze-15', targetPort: 'in' },
      { id: 'c15-2', sourceId: 'analyze-15', sourcePort: 'out', targetId: 'prompt-15', targetPort: 'in' },
      { id: 'c15-3', sourceId: 'prompt-15', sourcePort: 'out', targetId: 'gen-15', targetPort: 'in' },
      { id: 'c15-4', sourceId: 'gen-15', sourcePort: 'out', targetId: 'out-15', targetPort: 'in' },
    ],
  },
];

export const PRESET_CATEGORIES = [
  { id: '电商图片', label: '电商图片', icon: 'Boxes' },
  { id: '营销设计', label: '营销设计', icon: 'Layers' },
  { id: '社交媒体', label: '社交媒体', icon: 'Users' },
  { id: '视频创作', label: '视频创作', icon: 'Play' },
];

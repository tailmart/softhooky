import { ToolConfig, ToolOption } from './MobileToolTemplate';

const COMMON_RATIOS: ToolConfig['aspectRatios'] = [
  { value: '1:1', label: '1:1 方形' },
  { value: '4:3', label: '4:3 横版' },
  { value: '3:4', label: '3:4 竖版' },
  { value: '16:9', label: '16:9 宽屏' },
  { value: '9:16', label: '9:16 手机' },
];

const COMMON_MODELS: ToolConfig['models'] = [
  { value: 'nanobann2', label: 'Nano 智能' },
  { value: 'gpt-image-2', label: 'GPT 图像' },
];

const LANGUAGES: ToolConfig['languages'] = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
];

// ==================== 分析提示词（与 PC 完全一致） ====================

const XIAOHONGSHU_PROMPT = `分析这些产品图片，为小红书帖子生成营销内容。
请以JSON格式返回以下内容{
  "coverKeywordsCN": "中文封面关键词，竖版，吸引眼球的描述",
  "coverKeywordsEN": "English cover keywords, Xiaohongshu viral cover",
  "imageDescriptions": [
    "封面图描述，突出核心卖点",
    "主图描述，产品展示",
    "细节图描述，材质工艺",
    "对比图描述，使用效果",
    "使用场景图描述，生活场景"
  ],
  "copywriting": "小红书文案，引人入胜的开头，中间的产品介绍，结尾的互动引导"
}

## 重要：文案差异化要求
- 5张图的描述必须**各有侧重，不能重复**
- 封面图放核心卖点大标题
- 中间图分别从不同角度切入（功能卖点、使用场景、用户痛点、材质工艺、对比优势等）
- 避免所有配图都用相同的句式来描述产品
- 即使提供了产品描述，也要**创造性扩展**，不要照搬用户描述
- 文案正文需加入适当的emoji表情符号，风格自然`;

const SOCIAL_PROMPT = `You are a social media marketing expert. Analyze the product images and create a social media campaign plan.

For each image to be generated, provide:
1. "title": A catchy social media post title/headline
2. "description": A detailed image description for AI image generation (include POV style, lighting, composition, mood)
3. "pov": The POV perspective type (choose from: hands using product, overhead arrangement, eye level lifestyle, close-up detail, outdoor scene, flat lay)
4. "ratio": Aspect ratio (choose from: 1:1, 9:16, 4:5, 2:3)

## Output format - STRICT JSON array:
[{"title":"Post title","description":"Full image generation prompt with POV, lighting, composition, mood, setting details","pov":"hands using product","ratio":"1:1"},...]

## Principles
- For each selected ratio, generate images with different POV perspectives
- Each image in the same ratio should have a different POV and composition
- Cover varied perspectives: hands using product, overhead arrangement, eye level lifestyle, close-up detail, outdoor scene, flat lay
- Titles should be engaging, platform-native, and varied (not repetitive)
- Descriptions must include: POV perspective, lighting, composition, mood, setting
- Assign varied ratios across the campaign
- First image should be the hero/product spotlight
- All text must be in the target language
- Each image must have a unique POV perspective`;

const CAROUSEL_PROMPT = `你是一位电商产品详情页设计师。分析产品图片，为商品详情页左侧轮播图规划一组产品介绍图。

每张图需要：
1. "title": 这张图展示的内容标题（如"产品正面全景"、"材质细节特写"、"核心功能展示"、"使用场景"、"尺寸对比"、"配件清单"）
2. "desc": 这张图要展示的内容描述（强调：展示产品的哪个方面、画面中要突出的产品特征、需要标注的卖点文案等）

## 输出格式 - STRICT JSON array:
[{"title":"展示标题","desc":"内容描述"},...]

## 原则
- 生成的每张图围绕**产品本身**的一个方面进行介绍
- 这是电商详情页左侧的**产品轮播图**，不是场景摄影，而是对产品全方位的详细介绍
- 覆盖维度包括：产品整体展示、材质/工艺细节、功能卖点图解、尺寸/规格说明、使用方式/场景、配件/包装、对比/差异化优势
- 每张图标题和内容差异化，互不重复
- 风格：产品主图风格，白底或简约背景，产品清晰居中
- 画面上的文案突出该张图的核心卖点`;

const BANNER_PROMPT = `你是一位资深的电商Banner视觉设计师。分析产品图片，为首页轮播Banner设计一套配图方案。

每张Banner需要：
1. "title": Banner大标题（吸引眼球的核心卖点）
2. "desc": Banner配图详细描述（构图、场景、光线、风格、调性等）
3. "subtitle": 副标题或补充文案（简洁的一句话）

## 输出格式 - STRICT JSON array:
[{"title":"主标题","desc":"详细配图描述","subtitle":"副标题文案"},...]

## 设计原则
- 生成 {count} 张Banner，覆盖不同展示角度
- 第一张为品牌大促/首屏主图，中间从功能卖点/使用场景/细节工艺等切入，最后一张为购买引导
- 每张Banner的标题和文案必须**有差异化**，不要重复相同的句式
- **即使提供了文案参考，也要创造性扩展**：不要照搬用户提供的文案，而是以用户文案为灵感，生成全新有吸引力的Banner标题和副标题
- 不同Banner之间的文案角度各异：促销感、品质感、场景感、紧迫感等轮换使用
- 标题醒目、视觉冲击力强
- 适合首页Banner轮播，文案风格电商化`;

const POSTER_PROMPT = `你是一位资深平面设计师和品牌视觉专家。分析用户上传的图片（可能是产品图、Logo、素材图）和海报需求，设计一张营销海报。

请仔细分析：
1. **图片分析**：识别每张图片的内容（产品、Logo、背景素材等）。Logo类图片需要突出展示，产品图需要作为视觉主体
2. **构图规划**：如何安排各元素在海报中的位置（标题位置、产品位置、Logo位置、文案位置、装饰元素）
3. **色彩方案**：建议主色调、辅助色，基于产品/品牌的调性
4. **排版设计**：标题字体风格、文案排版方式、层级关系

## 输出格式 - STRICT JSON:
{
  "layout": "描述整体构图布局（如：上下结构，上半部分为产品展示区，下半部分为文案区）",
  "colorScheme": "色彩方案说明",
  "elements": [
    {"type":"标题","description":"标题的排版位置和字体风格"},
    {"type":"产品图","description":"产品图如何展示和处理"},
    {"type":"Logo","description":"Logo的放置位置和大小"},
    {"type":"文案","description":"营销文案的排版方式"},
    {"type":"装饰","description":"背景或装饰元素设计"}
  ],
  "designBrief": "一段完整的设计说明，描述最终海报的效果"
}

## 原则
- 如果用户上传了Logo图片，Logo应放置在海报顶部或角落显眼位置
- 产品图片应作为视觉中心或核心展示元素
- 多张图片需要合理安排融合，避免杂乱
- 输出使用目标语言`;

const FUSION_PROMPT = `请分析这张产品图片。判断该产品是否适合被人佩戴或穿戴（如手表、首饰、耳机、眼镜、帽子、领带、围巾、鞋、包等）。返回JSON格式：{"wearable":true/false,"scenes":["场景1","场景2","场景3","场景4","场景5","场景6"]}。如果wearable为true，则scenes中务必包含"人物佩戴近景图"；如果wearable为false，则推荐6个常规场景类型。`;

const CLONE_PROMPT = `你是一位资深的电商视觉版式设计师。你的任务是：分析用户上传的产品图片和模板参考图，规划一套"版式裂变"方案。

## 核心要求
- 严格分析模板图的版式结构：文字位置、构图布局、配色方案、装饰元素、字体风格、留白比例
- 基于产品图片的内容和卖点，将模板的版式"迁移"到每个产品上
- 保持产品的视觉特征不变，只改变布局和背景

## 输出格式 - STRICT JSON array:
[{"product_idx":0,"variation":0,"title":"版式标题","desc":"详细画面描述","layout_ref":"参考模板图的关键版式特征说明","subtitle":"副标题或补充文案"}]

## 设计原则
- 每张标题必须突出对应产品的核心卖点
- desc 要详细描述构图布局，明确说明需要保留的版式特征
- 所有文案使用目标语言`;

const THREEVIEW_PROMPT = `分析这张图片中的主体是人还是产品。如果图中有人物（真人、模特、人物形象）或者该产品适合被人佩戴穿戴（如手表、首饰、耳机、眼镜、帽子等），返回"person"。如果只是普通产品，返回"product"。只返回一个词。`;

const REFINE_PROMPT = `分析这张产品图片，用一句话描述它是什么产品（如：一款银色金属表盘的简约手表、一副黑色无线蓝牙耳机）。直接返回产品描述，不要其他内容。`;

const DETAIL_PROMPT = `你是一位顶级的电商详情页视觉设计专家。分析用户上传的多张产品图片，对图片进行全面分析，然后为电商详情页配图设计一套完整的AI绘图提示词。

## 分析要求
1. 仔细查看用户提供的所有产品图片（可能有1-10张）
2. 分析并理解产品的真实外观、造型、颜色、材质、细节
3. 如果有多张图片，说明它们展示了产品的哪些角度/细节
4. 基于分析结果，设计详情页配图方案

## 输出格式 - STRICT JSON:
{"prompts":[{"id":1,"title":"配图类别名称","prompt":"完整的AI绘图提示词（中文，200-300字，包含主体描述、场景、构图、光线、风格、参数等所有细节）"},...]}

## 设计原则
1. **必须基于用户实际图片中产品的真实外观**，不能编造产品特征
2. 配图覆盖产品展示、细节、功能、场景等多个维度
3. 画面标准：8K超高清、商业电商头图质感、专业柔光立体打光
4. 产品主体居中突出、无畸形扭曲、无多余杂物
5. 每张配图上必须有电商文案（标题、卖点、规格参数等）
6. 所有配图统一竖版9:16比例
7. 配图数量：6-12张，根据产品特点灵活决定，不固定张数
8. 所有title和prompt内容请使用目标语言
9. **【重要】保持产品图片不变，产品原图上的文字、标志、标签不做任何翻译修改，保持原样。仅新增的电商文案使用目标语言。**

## 文案要求（重要）
- 每张配图的文案必须**有创意、有差异化**，不要所有配图都重复相同的产品描述
- 第一张图放核心卖点大标题，突出品牌和产品名称
- 中间图分别从不同角度切入：功能卖点、使用场景、用户痛点、对比优势、材质工艺等
- 最后一张图放购买引导或售后保障类文案
- 文案风格：电商详情页风格，标题醒目，小字补充细节
- 避免每张图都写"产品采用xxx材质，xxx设计"这种重复句式`;

const STORYBOARD_PROMPT = `你是一个专业的影视故事板编剧。根据剧本，生成分镜头的画面描述。每个分镜包含：镜头编号、画面描述、景别（远景/中景/特写）、角度。以JSON数组格式输出：[{ "shot": 1, "description": "...", "scale": "...", "angle": "..." }]`;

// ==================== 生成提示词后缀（与 PC 一致） ====================

const GEN_REFINE = `产品精修图。纯白色背景，产品居中展示，产品细节清晰锐利，边缘干净，添加柔和自然的投影，产品表面质感真实，光影过渡细腻，商业产品摄影级别，高分辨率，无任何文字标签，极简干净`;

const GEN_FUSION_PERSON = `人物佩戴该产品的人物近景写真，产品清晰展示，模特脸部真实自然像真人实拍，皮肤纹理毛孔清晰可见，无AI塑料假面无过度磨皮，专业摄影棚柔和光线，商业人像摄影，高细节，背景虚化，突出产品佩戴效果`;

const GEN_FUSION_SCENE = `将产品融入场景中，保持产品清晰，突出场景氛围，专业摄影棚光线，产品主色保留，高品质商业摄影，精确边缘识别`;

const GEN_THREEVIEW_PERSON = `三视图展示，画面分为三个区域左中右排列展示同一人物的正面、侧面、背面三视图。保持人物外观完全不变，仅旋转角度拍摄。人物真实自然，真实人像照片质感，专业摄影打光`;
const GEN_THREEVIEW_PRODUCT = `三视图展示，画面分为三个区域左中右排列展示同一产品的正面、侧面、背面三视图。保持产品外观完全不变，仅旋转角度展示。专业摄影打光，产品清晰高清，纯白色背景`;

// ==================== 工具配置 ====================

export const XIAOHONGSHU_CONFIG: ToolConfig = {
  id: 'xiaohongshu',
  title: '小红书种草图文',
  description: 'AI 分析产品生成封面关键词、文案正文 + 5张配图，一站式发布小红书笔记',
  uploadType: 'product',
  maxUploads: 5,
  hasAnalysis: true,
  analysisPrompt: XIAOHONGSHU_PROMPT,
  textInputLabel: '产品名称',
  textInputPlaceholder: '输入产品名称...',
  textInput2Label: '产品描述（可选）',
  textInput2Placeholder: '卖点、材质、风格要求等',
  defaultModel: 'nanobann2',
  models: COMMON_MODELS,
  aspectRatios: [
    { value: '3:4', label: '3:4 竖版' },
    { value: '1:1', label: '1:1 方形' },
    { value: '9:16', label: '9:16 手机' },
  ],
  defaultAspectRatio: '3:4',
  languages: LANGUAGES,
  hasCountSelector: true,
  hideCountSelector: true,
  defaultCount: 5,
  maxCount: 5,
  promptSuffix: `按照以上分析方案中的封面关键词、配图描述、文案来执行。图片类型包括：封面图、主图、细节图、对比图、使用场景图，每张图对应不同的配图描述，各不重复。产品为主，光线充足，构图精美，符合小红书审美。8K超高清。`,
  resultType: 'image',
  autoGenerate: true,
};

export const SOCIAL_CONFIG: ToolConfig = {
  id: 'social',
  title: '社媒POV出图',
  description: '第一视角 POV 生活场景图，适配多平台社交图片',
  uploadType: 'product',
  maxUploads: 5,
  hasAnalysis: true,
  analysisPrompt: SOCIAL_PROMPT,
  textInputLabel: '产品名称',
  textInputPlaceholder: '输入产品名称...',
  textInput2Label: '产品描述（可选）',
  textInput2Placeholder: '卖点、使用场景等',
  defaultModel: 'nanobann2',
  models: COMMON_MODELS,
  aspectRatios: [
    { value: '1:1', label: '1:1 Ins' },
    { value: '9:16', label: '9:16 TikTok' },
    { value: '4:5', label: '4:5 FB' },
    { value: '2:3', label: '2:3 Pinterest' },
  ],
  defaultAspectRatio: '1:1',
  multiSelectRatios: true,
  languages: LANGUAGES,
  hasCountSelector: true,
  defaultCount: 3,
  maxCount: 6,
  promptSuffix: `按照以上分析方案中的POV视角、构图描述来生成。第一人称视角，真实生活场景，自然光线，产品展示清晰。多张时每张使用不同的POV视角和构图，不能雷同。8K超高清。`,
  resultType: 'image',
  autoGenerate: true,
};

export const CAROUSEL_CONFIG: ToolConfig = {
  id: 'carousel',
  title: '独立站轮播图',
  description: '多角度展示产品细节、特写、功能卖点，适合电商详情页',
  uploadType: 'product',
  maxUploads: 5,
  hasAnalysis: true,
  analysisPrompt: CAROUSEL_PROMPT,
  textInputLabel: '产品标题',
  textInputPlaceholder: '输入产品标题...',
  textInput2Label: '描述（可选）',
  textInput2Placeholder: '卖点、风格要求等',
  defaultModel: 'nanobann2',
  models: COMMON_MODELS,
  aspectRatios: [
    { value: '1:1', label: '1:1 方形' },
    { value: '3:4', label: '3:4 竖版' },
    { value: '4:3', label: '4:3 横版' },
  ],
  defaultAspectRatio: '1:1',
  languages: LANGUAGES,
  hasCountSelector: true,
  defaultCount: 3,
  maxCount: 10,
  promptSuffix: `独立站详情页轮播图。产品主图风格，白底或简约背景，产品清晰居中展示。产品的造型、颜色、材质等视觉特征必须与参考图一致，产品原图上已有的文字/标志/标签保持原样。每张图的文案必须独特有创意，不同轮播图之间各有侧重互不重复。画面中必须包含文案标注（标题、卖点文字），排版清晰美观。8K超高清画质，商业电商头图质感，专业柔光立体打光。`,
  resultType: 'image',
  autoGenerate: true,
};

export const BANNER_CONFIG: ToolConfig = {
  id: 'banner',
  title: 'Banner设计',
  description: '一键生成电商首页 Banner 轮播图',
  uploadType: 'product',
  maxUploads: 3,
  hasAnalysis: true,
  analysisPrompt: BANNER_PROMPT,
  textInputLabel: '文案参考',
  textInputPlaceholder: '输入Banner文案参考（可选）...',
  defaultModel: 'nanobann2',
  models: COMMON_MODELS,
  promptSuffix: `电商首页Banner设计，视觉冲击力强，图文排版合理，主次分明。产品在画面中突出展示，色彩搭配协调。大标题文字清晰可读，排版高端有设计感。整体风格符合电商首页Banner调性，促销感/品质感强。产品的造型、颜色、材质等视觉特征必须与参考图一致，产品原图上已有的文字/标志/标签保持原样。每张Banner的标题和文案必须有差异化，多角度展示。8K超高清画质，商业电商视觉水准。画面中必须包含排版好的大标题文字和产品展示，不能只有产品图。`,
  aspectRatios: [
    { value: '9:16', label: '9:16 竖版' },
    { value: '16:9', label: '16:9 横版' },
    { value: '3:4', label: '3:4 竖版' },
    { value: '21:9', label: '21:9 超宽' },
  ],
  defaultAspectRatio: '9:16',
  languages: LANGUAGES,
  hasCountSelector: true,
  defaultCount: 1,
  maxCount: 8,
  resultType: 'image',
};

export const POSTER_CONFIG: ToolConfig = {
  id: 'poster',
  title: '智能海报设计',
  description: '上传产品图片和文案，AI 设计营销海报',
  uploadType: 'product',
  maxUploads: 3,
  hasAnalysis: true,
  analysisPrompt: POSTER_PROMPT,
  textInputLabel: '海报文案',
  textInputPlaceholder: '输入海报上要显示的文案内容...',
  textInput2Label: '海报描述（可选）',
  textInput2Placeholder: '描述海报风格、色调要求等',
  defaultModel: 'nanobann2',
  models: COMMON_MODELS,
  aspectRatios: [
    { value: '2:3', label: '2:3 竖版' },
    { value: '3:4', label: '3:4 海报' },
    { value: '9:16', label: '9:16 手机' },
    { value: '1:1', label: '1:1 方形' },
  ],
  defaultAspectRatio: '2:3',
  languages: LANGUAGES,
  hasCountSelector: true,
  defaultCount: 1,
  maxCount: 6,
  promptSuffix: `按照以上分析方案中的布局、色彩、设计说明来执行。专业营销海报风格，视觉冲击力强，8K超高清。多张时每张使用不同的构图布局，不能雷同。`,
  resultType: 'image',
  autoGenerate: true,
};

export const PRODUCT_FUSION_CONFIG: ToolConfig = {
  id: 'productFusion',
  title: '产品融图',
  description: '把产品放入各种场景，看不同环境里的呈现效果',
  uploadType: 'product',
  maxUploads: 10,
  hasAnalysis: true,
  analysisPrompt: FUSION_PROMPT,
  defaultModel: 'nanobann2',
  models: COMMON_MODELS,
  aspectRatios: COMMON_RATIOS,
  defaultAspectRatio: '1:1',
  resultType: 'image',
};

export const THREE_VIEW_CONFIG: ToolConfig = {
  id: 'three-view',
  title: '三视图生成',
  description: '上传产品图，生成正面 + 侧面 + 背面三视图',
  uploadType: 'product',
  maxUploads: 3,
  hasAnalysis: false,
  defaultModel: 'nanobann2',
  models: COMMON_MODELS,
  aspectRatios: [{ value: '16:9', label: '16:9 横版' }],
  defaultAspectRatio: '16:9',
  promptSuffix: GEN_THREEVIEW_PRODUCT,
  resultType: 'image',
};

export const PRODUCT_REFINE_CONFIG: ToolConfig = {
  id: 'productRefine',
  title: '产品精修',
  description: '上传产品图片，AI 自动精修优化细节',
  uploadType: 'product',
  maxUploads: 10,
  hasAnalysis: false,
  analysisPrompt: REFINE_PROMPT,
  defaultModel: 'nanobann2',
  models: COMMON_MODELS,
  aspectRatios: [
    { value: '智能', label: '智能适配' },
    ...COMMON_RATIOS,
  ],
  defaultAspectRatio: '智能',
  hasCountSelector: true,
  defaultCount: 1,
  maxCount: 6,
  promptSuffix: GEN_REFINE,
  resultType: 'image',
};

export const DETAIL_CLONE_CONFIG: ToolConfig = {
  id: 'detailClone',
  title: '版式裂变',
  description: '参考模板版式风格，生成相似但有创意的裂变设计',
  uploadType: 'both',
  maxUploads: 5,
  hasAnalysis: true,
  analysisPrompt: CLONE_PROMPT,
  defaultModel: 'nanobann2',
  models: COMMON_MODELS,
  aspectRatios: [{ value: '1:1', label: '1:1 方形' }, { value: '3:4', label: '3:4 竖版' }, { value: '9:16', label: '9:16 手机' }],
  defaultAspectRatio: '1:1',
  languages: LANGUAGES,
  hasCountSelector: true,
  defaultCount: 1,
  maxCount: 6,
  resultType: 'image',
};

export const DETAIL_CONFIG: ToolConfig = {
  id: 'detail',
  title: '详情页设计',
  description: '上传产品图，AI 自动生成电商详情页内容方案',
  uploadType: 'product',
  maxUploads: 5,
  hasAnalysis: true,
  analysisPrompt: DETAIL_PROMPT,
  textInputLabel: '产品名称',
  textInputPlaceholder: '输入产品名称...',
  textInput2Label: '描述（可选）',
  textInput2Placeholder: '卖点、规格、风格要求等',
  defaultModel: 'gpt-image-2',
  models: COMMON_MODELS,
  aspectRatios: [{ value: '9:16', label: '9:16 竖版' }],
  defaultAspectRatio: '9:16',
  languages: LANGUAGES,
  hasCountSelector: true,
  hideCountSelector: true,
  defaultCount: 6,
  maxCount: 12,
  promptSuffix: `你是一位顶级的电商详情页视觉设计师。请基于以上分析方案和产品信息，生成一张电商详情页配图。

## 设计要求
1. **产品必须基于上传的参考图片**，产品的造型、颜色、材质等视觉特征必须保持与参考图一致
2. **每张图必须有独特的电商文案**——大标题突出该张图的核心卖点，配以副标题、卖点说明文字或规格参数，文案排版清晰美观有设计感。不同配图之间的文案必须各有侧重、绝不重复
3. 覆盖不同展示维度：产品整体展示、局部细节特写、功能卖点图解、使用场景展示、材质工艺说明、尺寸规格展示等，每张图从一个维度切入
4. 竖版9:16比例，白底或简约背景，专业棚拍柔和布光，商业电商头图质感，8K超高清
5. 画面新增的电商文案使用目标语言，产品原图上的原有文字/标志/标签保持原样不变`,
  resultType: 'image',
  autoGenerate: true,
};

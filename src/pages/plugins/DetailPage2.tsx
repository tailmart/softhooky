import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, FileImage, Copy, Check, ChevronDown, Download, Wand2 } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { analyzeMultipleImages } from '../../services/aiChatService';
import { uploadFileToCos } from '../../services/cosService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { requireAuth } from '../../utils/authCheck';
import { getAvailableModels } from '../../services/modelService';
import { createConcurrencyLimit } from '../../utils/concurrency';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import { ModelSpeedNote } from '../../components/ModelSpeedNote';
import { LoadingAnimation } from '../../components/LoadingAnimation';
import { LANGUAGES, getSavedLanguage, saveLanguage } from '../../constants/languages';

interface PromptCard {
  id: number;
  title: string;
  prompt: string;
  refImageIndices?: number[];
}

interface DeepProductAnalysis {
  productName: string;
  brandName: string;
  brandEnglishName: string;
  logoDescription: string;
  productCategory: string;
  productSpec: string;
  sellingPoints: string;
  targetAudience: string;
  productDescription: string;
  productDetails: string;
  specialNeeds: string;
}

interface AnalysisResult {
  productName?: string;
  productDescription?: string;
  prompts: PromptCard[];
}

interface GenImage {
  url: string;
  title: string;
  idx: number;
}

const QUALITIES = ['2K', '4K'];

const SMART_SECTIONS = [
  { title: '品牌首图+卖点概览', prompt: '电商详情页首图，浅色/白色背景，画面顶部一个小圆角标签（如产品品类），下方大号粗体主标题（6-12个字核心卖点），再下方小号副标题，中间产品多角度/多色展示图，底部一排功能图标网格（6个小圆形图标+文字标签，如"大风速""静音""长续航"等），排版干净专业，竖版9:16' },
  { title: '核心卖点+大号数据', prompt: '电商详情页卖点图，白色背景，顶部大号粗体标题（如"100档无级风速"），副标题（如"从微风到劲爽 自由掌控"），中间产品特写图（展示关键功能部位），底部对比卡片区域（2-3个并排小卡片，每个卡片展示不同档位/模式，如"1档 微弱清风""50档 柔爽清风""100档 劲爽劲风"），竖版9:16' },
  { title: '技术细节+内部结构', prompt: '电商详情页技术展示图，白色背景，顶部大号粗体标题（如"高速涡轮 风力澎湃"），副标题，中间产品内部结构/核心技术特写（如电机、风扇叶片、芯片等），展示技术实力，底部简短技术说明文字，竖版9:16' },
  { title: '功能标注线说明', prompt: '电商详情页功能标注图，白色背景，顶部大号粗体标题，产品图居中，从产品不同部位引出3-4条标注线，每条标注线连接一个小文字标签（如"剩余时间显示""当前档位显示""Type-C充电口"等），标注线用细线+小圆点，排版整洁，竖版9:16' },
  { title: '细节特写网格', prompt: '电商详情页细节展示图，白色背景，顶部大号粗体标题（如"细节之处 更显用心"），下方2x2网格排列4个产品细节特写——每个格子包含一张局部特写小图+一行标题+一行说明文字（如"挂绳孔设计 便携不占空间""隐藏式进风口 美观防尘"等），竖版9:16' },
  { title: '人物使用效果', prompt: '电商详情页人物使用图，白色背景，顶部大号粗体标题（如"轻巧便携 随时随地"），副标题，中间真人模特正在使用/佩戴产品的自然瞬间，模特表情自然放松，产品清晰可见，底部2-3个小数据标签（如"轻至146g""小巧55mm"），竖版9:16' },
  { title: '多场景适用', prompt: '电商详情页场景展示图，白色背景，顶部大号粗体标题（如"多场景适用 清凉随行每一刻"），副标题列出场景（如"办公、出行、户外、居家都适用"），下方2x2网格排列4个使用场景——每个格子包含一张场景照片+场景名称+简短描述（如"日常通勤 清爽随行不闷热""办公学习 静享清凉不打扰""户外出行 越热越爽 随时降温""居家休闲 享受"），竖版9:16' },
  { title: '多色展示', prompt: '电商详情页多色展示图，白色背景，顶部大号粗体标题（如"多彩配色 选你所爱"），副标题（如"清爽配色，点亮你的每个瞬间"），下方产品的所有颜色/款式并排展示（3-5个），每个颜色下方标注颜色名称（中文），排版整齐美观，竖版9:16' },
  { title: '产品参数表', prompt: '电商详情页参数表图，白色背景，顶部大号粗体标题（如"产品参数"），下方干净的参数表格——左列参数名（如"产品名称""电池容量""充电接口""产品尺寸"等），右列参数值，表格线条细浅灰色，排版整洁专业，竖版9:16' },
];

const PRODUCT_DEEP_ANALYSIS_PROMPT = `你是一位顶级的电商产品深度分析师。仔细分析上传的产品图片，从以下所有维度进行全面深度分析，输出结构化JSON。即使图片信息有限，也要尽最大能力推断和提取。

## 1. 品牌名称识别 & LOGO文字提取
- brandName: 中文品牌名，如"妮维雅"
- brandEnglishName: 英文品牌名（若无则留空），如"NIVEA"
- logoDescription: 详细描述品牌LOGO的字体、图标形状、配色方案及整体视觉感受

## 2. 产品类型判断
- productCategory: 所属大类（美妆护肤/食品饮料/3C数码/家居日用/服饰箱包等）
- productName: 具体产品名称，精准到款型，如"妮维雅LUMINOUS630抗斑匀色晚霜"

## 3. 产品规格
- productSpec: 从包装提取净含量、尺寸、重量、数量等，尽量完整

## 4. 卖点提取
- sellingPoints: 综合包装文案卖点、认证标识、视觉特征卖点、数据化卖点，用分条列出

## 5. 目标受众推断
- targetAudience: 核心使用人群、年龄段、消费层级

## 6. 产品详细介绍
- productDescription: 综合外观设计、材质、功能、使用场景的300-500字完整介绍，用emoji分段

## 7. 产品细节识别
- productDetails: 材质质感、结构特点、包装特色

## 8. 特殊需求（可选）
- specialNeeds: 是否需要模特、场景、数据对比等特殊需求说明

## 输出格式 - STRICT JSON:
{"productName":"...","brandName":"...","brandEnglishName":"...","logoDescription":"...","productCategory":"...","productSpec":"...","sellingPoints":"...","targetAudience":"...","productDescription":"...","productDetails":"...","specialNeeds":"..."}

## 文案语言要求
- 所有分析和输出的文案内容必须全部使用 {language}
- 如果 {language} 为 English，全部输出英文
- 如果 {language} 为 简体中文/日本語/한국어 等，全部输出对应语言
- 产品原图上的文字、标志、标签保持原样不变，不做翻译

## 要求
- 仅输出JSON对象，不要额外文字
- 每个字段尽量详细、有信息量
- 不确定的要合理推断，不能留空`;

const SMART_PROMPT = `你是一位资深电商视觉设计师，具备8年以上品牌电商详情页设计经验，精通产品视觉营销、版式设计和消费者心理学。

## 识别报备（严格参考以下产品信息，每屏提示词不得脱离）
- 产品名称: {productName}
- 品牌: {brandName} / {brandEnglishName}
- LOGO设计: {logoDescription}
- 产品品类: {productCategory}
- 规格参数: {productSpec}
- 核心卖点: {sellingPoints}
- 目标受众: {targetAudience}
- 产品描述: {productDescription}
- 细节材质: {productDetails}
- 特殊需求: {specialNeeds}

## 任务指令
生成一套完整的电商产品详情页设计提示词，AI根据产品特点和卖点灵活决定屏数（通常6-12屏），单屏尺寸严格限定为9:16竖版。

**核心原则：详情页是以产品力为核心的专业展示，用数据说话，用细节征服，用排版提升品质感。**

---

## ★ 版式设计规范（最高优先级）

### 1. 浅色统一背景
整套详情页统一使用浅色/白色背景，深色文字，保持干净专业的视觉风格：
- 所有屏使用白色或浅灰色背景
- 文字使用深色（黑色/深灰/品牌色）
- 产品图在浅色背景上清晰展示
- 品牌色作为点缀色贯穿全套详情页

### 2. 文字排版铁律
- **主标题**：每屏顶部，大号粗体无衬线字体（中文24-32pt等效），简洁有力，6-12个字
- **副标题**：主标题下方，小号字体（中文14-18pt等效），补充说明，10-20个字
- **数字突出**：关键数据用超大号字体（48-72pt等效）+ 醒目颜色（如橙色/蓝色/金色）高亮显示
- **文字位置**：永远在画面上方1/3区域，产品图在下方2/3区域
- **禁止**：大段文字堆砌、密集文案、文字遮挡产品

### 3. 产品展示规范
- 产品图占画面下方60-70%空间，居中或略偏一侧
- 产品必须清晰锐利，材质质感可见
- 产品自然光展示，浅色背景上用柔和阴影
- 产品角度每屏不同：正面/侧面/45°/俯拍/仰拍/特写交替

### 4. 数字/数据可视化
- 核心参数用超大号数字展示（如"240°"、"48dB"、"20+"）
- 数字下方配一行小字说明（如"超广角调节"、"深度降噪"、"小时续航"）
- 数字颜色用品牌色或醒目对比色高亮

### 5. 专业排版组件（必须使用）
- **功能图标网格**：6个小圆形图标+文字标签，2行3列排列，用于首屏卖点概览
- **对比卡片**：2-3个并排小卡片，展示不同档位/模式/规格
- **标注线**：从产品不同部位引出细线+小圆点，连接功能说明文字
- **细节网格**：2x2网格，每个格子包含特写小图+标题+说明
- **场景网格**：2x2网格，每个格子包含场景照片+场景名称+描述
- **参数表格**：左列参数名，右列参数值，细浅灰色线条

---

## ★ 内容规划框架

### 屏数分配建议（AI根据产品特点灵活调整）
1. **品牌首图+卖点概览**——品类标签+主标题+副标题+产品多色展示+底部功能图标网格（6个）
2. **核心卖点+大号数据**——卖点标题+副标题+产品特写+底部对比卡片（2-3个档位/模式）
3. **技术细节+内部结构**——技术标题+产品内部结构/核心技术特写
4. **功能标注线说明**——产品居中+3-4条标注线连接功能标签
5. **细节特写网格**——标题+2x2网格（4个细节特写+标题+说明）
6. **人物使用效果**——标题+副标题+真人使用图+底部数据标签
7. **多场景适用**——标题+副标题+2x2场景网格（4个场景照片+名称+描述）
8. **多色展示**——标题+副标题+所有颜色并排+颜色名称
9. **产品参数表**——标题+干净的参数表格

### 每屏差异化强制规则
- **一屏一主题**：每屏聚焦一个完全不同的角度/卖点，严禁重复
- **数据不重复**：每屏突出不同的数据/参数
- **构图不重复**：每屏的产品角度/构图必须不同

---

## 视觉设计核心要求

### 1. 照片级真实感（最高优先级，禁止AI感）
画面中出现的所有人物必须达到专业摄影级别的真实感，**绝对禁止AI生成感**：

**模特要求**：
- 优先使用欧美/西方面孔模特（高鼻梁、深眼窝、自然肤色）
- 年龄20-35岁，形象自然健康，表情是抓拍般的自然瞬间（微笑/专注/放松），禁止僵硬摆拍
- 手指数量正确（5根），关节和指甲自然

**皮肤真实感**：
- 皮肤必须有真实纹理和毛孔，允许自然的雀斑、细纹、痘印等小瑕疵
- 皮肤光泽自然，禁止过度磨皮、塑料感、蜡质质感
- 肤色自然，禁止过度美白或不自然的色调

**光线要求（关键！禁止AI感光线）**：
- 使用自然环境光（窗边散射光/户外阴天柔光/普通室内灯光）
- 禁止：刻意的黄金时刻暖光、逆光光晕、过曝高光、不自然的边缘光
- 光线方向单一自然，禁止多光源混合导致的不自然阴影
- 色温中性偏暖（5000-5500K），禁止过度橙黄色调

**相机参数**：提示词中涉及人物时必须附加"photorealistic, shot on Sony A7R IV, 85mm f/1.8 lens, natural window light, soft shadows, no lens flare, no golden hour, real skin texture, pores visible, editorial photography"

### 2. 产品还原度（每屏提示词开头必须包含）
①严格还原上传产品参考图，精准复刻颜色、配色、LOGO位置及比例、文字内容及字体、图案元素及细节
②产品与画面中其他元素的比例遵循真实物理空间逻辑

### 3. 整体风格统一
所有屏使用白色/浅灰色背景+深色文字，字体风格、排版逻辑、色彩体系保持一致。品牌色作为点缀色贯穿全套详情页。

### 4. 无产品页面规范
允许设计无完整产品呈现的页面，可单独聚焦技术参数、材质工艺等，用大号数字+图表+文字排版呈现。

## 输出格式
你必须输出严格的JSON格式，不要包含任何其他文字：
{"prompts":[{"id":1,"title":"第1屏-XX主题","prompt":"完整AI绘图提示词"},{"id":2,"title":"第2屏-XX主题","prompt":"完整AI绘图提示词"},...]}

## 文案语言要求（绝对禁止违反！）
- **{language}** 是唯一允许使用的语言，所有内容必须100%使用此语言
- **绝对禁止中英混合**：如果 {language} 是 English，则所有文案100%英文；如果 {language} 是 简体中文，则所有文案100%中文（产品品牌名除外）
- 绝对禁止出现任何非 {language} 的文字内容
- 产品原图上已有的文字/标志保持原样不变
- 提示词中的画面描述必须用 {language} 书写`;

const Dropdown: React.FC<{
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  label: string;
}> = ({ value, options, onChange, label }) => {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <label className="text-xs font-medium text-[#A3A3A3] mb-1.5 block">{label}</label>
      <div
        onClick={() => setOpen(!open)}
        className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-xl text-sm flex items-center justify-between cursor-pointer hover:bg-[#EEEEEE] transition-colors border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      >
        <span className={selected ? 'text-[#171717] font-medium' : 'text-[#BDBDBD]'}>{selected?.label || '请选择'}</span>
        <ChevronDown size={16} className={`text-[#A3A3A3] transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <div className="absolute z-10 top-full mt-1 w-full bg-white rounded-xl shadow-lg border border-[#E5E5E5] py-1 max-h-48 overflow-y-auto">
          {options.map(opt => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-[#F5F5F5] flex items-center justify-between ${value === opt.value ? 'text-[#171717] font-semibold bg-[#F5F5F5]' : 'text-[#737373]'}`}
            >
              {opt.label}
              {value === opt.value && <Check size={14} className="text-blue-500" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const DetailPage2: React.FC = () => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getAvailableModels().then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) {
        setSelectedModel('gpt-image-2');
      }
    });
  }, []);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [productName, setProductName] = useState('');
  const [productDesc, setProductDesc] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-image-2');
  const [quality, setQuality] = useState('2K');
  const [language, setLanguage] = useState(getSavedLanguage());
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [deepAnalysis, setDeepAnalysis] = useState<DeepProductAnalysis | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GenImage[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLTextAreaElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  useEffect(() => {
    if (nameRef.current) autoResize(nameRef.current);
  }, [productName]);
  useEffect(() => {
    if (descRef.current) autoResize(descRef.current);
  }, [productDesc]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files;
    if (!inputFiles || inputFiles.length === 0) return;
    const files = Array.from(inputFiles) as File[];
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    const oversized = files.find(f => f.size > MAX_FILE_SIZE);
    if (oversized) {
      alert(`图片"${oversized.name}"超过 20MB，请压缩后重新上传`);
      e.target.value = '';
      return;
    }
    const remaining = 10 - productImages.length;
    const filesToAdd = files.slice(0, remaining);
    try {
      const b64s = await Promise.all(filesToAdd.map(f => fileToDataUrl(f, 1200)));
      setProductImages(prev => [...prev, ...b64s].slice(0, 10));
    } catch (err) {
      console.error('图片处理失败:', err);
      alert('部分图片处理失败，请尝试使用更小的图片');
    }
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setProductImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    if (!requireAuth()) return;
    if (productImages.length === 0) { alert('请至少上传一张产品图片'); return; }

    setAnalyzing(true);
    setResult(null);
    setDeepAnalysis(null);
    setGeneratedImages([]);
    setProgress('AI正在进行第一轮深度产品分析...');

    try {
      // Step 0: Identify each image
      setProgress('AI正在识别每张图片展示的产品部位...');
      const identifyPrompt = `分析所有上传的图片，对每张图片用一句话（10字以内）说明这张图展示的是产品的哪个部分或角度。
返回JSON数组，顺序与图片顺序一致。
示例：["产品正面","产品背面","接口特写","侧面按键","包装正面"]
仅输出JSON数组，不要其他文字。`;
      const identifyRaw = await analyzeMultipleImages(productImages, identifyPrompt, { model: 'gemini-3.5-flash', maxTokens: 1000 });
      let imageLabels: string[] = [];
      try {
        const parsed = JSON.parse(identifyRaw.match(/\[[\s\S]*\]/)?.[0] || '[]');
        if (Array.isArray(parsed) && parsed.length === productImages.length) imageLabels = parsed;
      } catch {}
      if (imageLabels.length === 0) imageLabels = productImages.map((_, i) => `产品图 ${i + 1}`);
      const imageDesc = imageLabels.map((label, i) => `图${i + 1}：${label}`).join('\n');

      // 第一步：深度产品分析（无论用户是否提供了标题/描述，都执行）
      const langLabel = LANGUAGES.find(l => l.value === language)?.label || '简体中文';
      const deepPromptWithLang = PRODUCT_DEEP_ANALYSIS_PROMPT.replace(/\{language\}/g, langLabel);
      const deepAnalysisUserContent = `${deepPromptWithLang}\n\n=====\n\n用户提供的产品名：${productName || '（未提供）'}\n用户提供的描述：${productDesc || '（未提供）'}\n目标语言：${langLabel}\n\n请全面分析以上产品图片，输出深度分析JSON。`;

      const deepRaw = await analyzeMultipleImages(productImages, deepAnalysisUserContent, {
        model: 'gemini-3.5-flash',
        maxTokens: 10000,
      });
      const deepJsonMatch = deepRaw.match(/\{[\s\S]*\}/);
      if (!deepJsonMatch) throw new Error('AI返回格式异常，请重试');
      const deepParsed = JSON.parse(deepJsonMatch[0]) as DeepProductAnalysis;
      if (!deepParsed.productName || !deepParsed.productDescription) throw new Error('AI未能生成有效的产品分析');
      setDeepAnalysis(deepParsed);
      setProductName(deepParsed.productName);
      setProductDesc(deepParsed.productDescription);

      // 第二步：基于深度分析结果，规划详情页配图方案
      setProgress('AI正在基于深度分析规划详情页配图...');
      const smartPrompt = SMART_PROMPT
        .replace('{productName}', deepParsed.productName)
        .replace('{brandName}', deepParsed.brandName)
        .replace('{brandEnglishName}', deepParsed.brandEnglishName)
        .replace('{logoDescription}', deepParsed.logoDescription)
        .replace('{productCategory}', deepParsed.productCategory)
        .replace('{productSpec}', deepParsed.productSpec)
        .replace('{sellingPoints}', deepParsed.sellingPoints)
        .replace('{targetAudience}', deepParsed.targetAudience)
        .replace('{productDescription}', deepParsed.productDescription)
        .replace('{productDetails}', deepParsed.productDetails)
        .replace('{specialNeeds}', deepParsed.specialNeeds)
        .replace('{language}', langLabel)
        + `\n\n## 上传图片清单\n${imageDesc}\n\n重要：每张详情页配图必须指定使用哪张参考图。在输出中为每个对象添加 "refImageIndices" 字段，表示该配图需要参考哪些上传的图片（数组中的数字对应上文图1、图2...的索引，从0开始）。例如某张配图需要参考第1张和第3张图，则写 "refImageIndices": [0, 2]。`;

      const raw2 = await analyzeMultipleImages(productImages, smartPrompt, {
        model: 'gemini-3.5-flash',
        maxTokens: 12000,
      });
      const jsonMatch2 = raw2.match(/\{[\s\S]*\}/);
      if (!jsonMatch2) throw new Error('AI返回格式异常，请重试');
      const parsed2 = JSON.parse(jsonMatch2[0]);
      if (!parsed2.prompts || !Array.isArray(parsed2.prompts) || parsed2.prompts.length === 0) {
        throw new Error('AI未能生成有效的配图方案，请重试');
      }
      setResult(parsed2);
    } catch (err: any) {
      console.error('分析失败:', err);
      alert('AI分析失败: ' + (err.message || '请稍后重试'));
    } finally {
      setAnalyzing(false);
      setProgress('');
    }
  };

  const handleGenerate = async () => {
    if (!requireAuth()) return;
    if (productImages.length === 0) { alert('请至少上传一张产品图片'); return; }

    setGenerating(true);
    setGeneratedImages([]);
    imageLibraryService.clearSavedUrlsCache();
    const sections: ({ title: string; prompt: string; refImageIndices?: number[] })[] = (result?.prompts || []).length > 0
      ? (result?.prompts || []).map(c => ({ title: c.title, prompt: c.prompt, refImageIndices: c.refImageIndices }))
      : SMART_SECTIONS;
    if (sections.length === 0) { setGenerating(false); return; }

    const total = sections.length;
    setProgress(`生成中 (0/${total})...`);
    let doneCount = 0;
    const allImages: GenImage[] = [];
    const limit = createConcurrencyLimit(3);

    const tasks = sections.map((section, idx) => limit(async () => {
      const langLabel = LANGUAGES.find(l => l.value === language)?.label || '中文';
      const analysisContext = deepAnalysis
        ? `\n\n## AI深度分析产品信息\n品牌：${deepAnalysis.brandName} ${deepAnalysis.brandEnglishName}\n品类：${deepAnalysis.productCategory}\n规格：${deepAnalysis.productSpec}\n卖点：${deepAnalysis.sellingPoints}\n目标人群：${deepAnalysis.targetAudience}\n产品详情：${deepAnalysis.productDetails}\n特殊需求：${deepAnalysis.specialNeeds}`
        : '';
      const finalPrompt = `${section.prompt}\n\n产品名：${productName || '该产品'}${productDesc ? `，描述：${productDesc}` : ''}${analysisContext}\n\n## 设计规范（必须遵守）\n- 统一使用浅色/白色背景，深色文字，保持干净专业的视觉风格\n- 文字永远在画面上方1/3区域，产品图在下方2/3区域\n- 主标题用大号粗体无衬线字体（6-12个字），副标题用小号字体（10-20个字）\n- 关键数据用超大号数字+醒目颜色高亮（如"5000mAh"、"100档"、"146g"）\n- 产品图必须清晰锐利，材质质感可见，占画面下方60-70%\n- 使用专业排版组件：功能图标网格（小圆形图标+文字标签）、对比卡片（并排小卡片）、标注线（细线+小圆点+功能标签）、2x2网格（特写/场景）、参数表格\n- 人物必须照片级真实，优先欧美模特：皮肤有真实纹理和毛孔、允许自然小瑕疵、禁止磨皮塑料感。光线用自然环境光（窗边散射光/阴天柔光），禁止黄金时刻暖光/逆光光晕/过曝高光。涉及人物时附加"photorealistic, shot on Sony A7R IV, 85mm f/1.8 lens, natural window light, soft shadows, no lens flare, no golden hour, real skin texture, pores visible, editorial photography"\n\n## 差异化要求\n- 本屏内容必须与其他屏完全不同，严禁重复相同的场景、构图、角度或卖点\n- 如果其他屏已使用过某个场景/构图，本屏必须换到不同的场景/角度\n\n## 技术要求\n- AI自动分析所有上传的参考图，从中识别产品的真实外观特征并保持一致\n- 产品的造型、颜色、材质等视觉特征必须与参考图一致\n- 产品原图上已有的文字/标志/标签保持原样不变`;
      try {
        const refIndices = section.refImageIndices?.filter(idx => idx >= 0 && idx < productImages.length) || []
        const images = refIndices.length > 0 ? refIndices.map(idx => productImages[idx]) : productImages
        console.log(`[详情页] 开始生成第${idx + 1}张: ${section.title}, model=${selectedModel}, images=${images.length}`);
        const resp = await editImage({
          prompt: finalPrompt,
          images,
          aspectRatio: '9:16',
          resolution: quality,
          model: selectedModel,
        });
        console.log(`[详情页] 第${idx + 1}张生成成功:`, JSON.stringify(resp).substring(0, 200));
        const url = resp.data?.[0]?.url || resp.image_url || resp.url || '';
        if (url) {
          const item = { url, title: section.title, idx: idx + 1 };
          allImages.push(item);
          setGeneratedImages(prev => [...prev, item]);
          imageLibraryService.saveToLibrary({ image_url: url, prompt: finalPrompt, model: String(selectedModel || 'nanobann2'), aspect_ratio: String('9:16'), resolution: String(quality || '2K'), type: 'edited' });
          console.log(`[详情页] 第${idx + 1}张URL: ${url.substring(0, 100)}`);
        } else {
          console.error(`[详情页] 第${idx + 1}张无URL, resp:`, JSON.stringify(resp).substring(0, 300));
        }
      } catch (err: any) {
        console.error(`[详情页] 生成第${idx + 1}张失败:`, err.message || err, err.stack);
      }
      doneCount++;
      setProgress(`生成中 (${doneCount}/${total})...`);
    }));

    await Promise.all(tasks);

    // 生成完毕，自动拼接长截图
    if (allImages.length > 1) {
      setProgress('正在拼接长图...');
      const collageDataUrl = await createCollage(allImages, 750);
      if (collageDataUrl) {
        try {
          const blob = await (await fetch(collageDataUrl)).blob();
          const file = new File([blob], `detail-merge-${Date.now()}.jpg`, { type: 'image/jpeg' });
          const cosUrl = await uploadFileToCos(file);
          const collageCard = { url: cosUrl, title: '纵向合并长截图', idx: 0 };
          setGeneratedImages(prev => {
            const filtered = prev.filter(img => img.title !== '纵向合并长截图');
            return [collageCard, ...filtered];
          });
        } catch {
          // fallback: use dataUrl directly
          const collageCard = { url: collageDataUrl, title: '纵向合并长截图', idx: 0 };
          setGeneratedImages(prev => [...prev, collageCard]);
        }
      }
    }

    setGenerating(false);
    setProgress('');
  };

  const copyPrompt = (idx: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleNewAnalysis = () => {
    setResult(null);
    setDeepAnalysis(null);
    setGeneratedImages([]);
  };

  const proxyUrl = (url: string) => `/api/images/proxy?url=${encodeURIComponent(url)}`;

  const createCollage = async (images: GenImage[], mergeWidth = 750): Promise<string | null> => {
    try {
      // Sort by original generation order
      const sorted = [...images].sort((a, b) => a.idx - b.idx);
      const loaded = await Promise.all(sorted.filter(img => img.url).map(img => new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.crossOrigin = 'anonymous';
        i.onload = () => resolve(i);
        i.onerror = () => {
          // Fallback: try without proxy (in case image is already CORS-friendly)
          const fallback = new Image();
          fallback.crossOrigin = 'anonymous';
          fallback.onload = () => resolve(fallback);
          fallback.onerror = reject;
          fallback.src = img.url;
        };
        i.src = proxyUrl(img.url);
      })));

      if (loaded.length === 0) return null;

      const GAP = 6;
      const totalH = loaded.reduce((s, img) => s + Math.round((mergeWidth / img.width) * img.height) + GAP, 0) - GAP;

      const canvas = document.createElement('canvas');
      canvas.width = mergeWidth;
      canvas.height = totalH;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, mergeWidth, totalH);

      let y = 0;
      for (const img of loaded) {
        const h = Math.round((mergeWidth / img.width) * img.height);
        ctx.drawImage(img, 0, y, mergeWidth, h);
        y += h + GAP;
      }
      return canvas.toDataURL('image/jpeg', 0.95);
    } catch {
      return null;
    }
  };

  const handleMerge = async () => {
    if (!requireAuth()) return;
    const toMerge = generatedImages.filter(img => img.title !== '纵向合并长截图');
    if (toMerge.length < 2) { alert('至少需要2张图片才能合并'); return; }

    setIsMerging(true);
    setProgress('正在拼接长图...');
    try {
      const collageDataUrl = await createCollage(toMerge, 750);
      if (!collageDataUrl) throw new Error('合并失败');

      // Upload to COS for persistence
      const blob = await (await fetch(collageDataUrl)).blob();
      const file = new File([blob], `detail-merge-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const cosUrl = await uploadFileToCos(file);

      const collageCard = { url: cosUrl, title: '纵向合并长截图', idx: 0 };
      setGeneratedImages(prev => {
        // Replace existing merge if any, otherwise add
        const filtered = prev.filter(img => img.title !== '纵向合并长截图');
        return [collageCard, ...filtered];
      });
      setProgress('长图合并完成！');
    } catch (err: any) {
      alert('合并失败: ' + (err.message || '请重试'));
    } finally {
      setIsMerging(false);
      setProgress('');
    }
  };

  const handleDownload = async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `detail-${Date.now()}.png`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-[#E5E5E5] flex-shrink-0 bg-[#F7F7F7]">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center">
          <FileImage size={16} className="text-white" />
        </div>
        <h1 className="text-base font-semibold text-[#171717]">详情页设计</h1>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Settings */}
        <div className="w-[380px] border-r border-[#E5E5E5] overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-[#FAFAFA]">
          {/* Product Images */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <FileImage size={16} className="text-blue-500" />
              <div>
                <h3 className="text-sm font-semibold text-[#171717]">产品图片</h3>
                <p className="text-xs text-[#A3A3A3]">AI会通过提供参考图自行选择设计</p>
              </div>
              <span className="ml-auto text-xs text-[#A3A3A3] bg-[#F5F5F5] px-2 py-1 rounded-xl">{productImages.length}/10</span>
            </div>
            {productImages.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mb-3">
                {productImages.map((img, index) => (
                  <div key={index} className="relative group aspect-square rounded-2xl overflow-hidden bg-[#F5F5F5]">
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeImage(index)} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <X size={14} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleUpload} accept="image/*" multiple className="hidden" />
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA] p-3 flex flex-col items-center justify-center gap-1 hover:border-[#171717]/30 hover:bg-[#F5F5F5] transition-all cursor-pointer bg-[#FAFAFA]">
              <Plus size={18} className="text-[#A3A3A3]" />
              <span className="text-xs text-[#A3A3A3]">上传产品图</span>
            </div>
          </div>

          {/* Product Name */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <FileImage size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">产品名 </span>
            </div>
            <textarea ref={nameRef} value={productName} onChange={e => { setProductName(e.target.value); autoResize(e.target); }} placeholder="例如：高端无线降噪蓝牙耳机" rows={1}
              className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none overflow-hidden text-[#333333] placeholder:text-[#BDBDBD]" />
          </div>

          {/* Product Description */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <FileImage size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">产品描述</span>
            </div>
            <textarea ref={descRef} value={productDesc} onChange={e => { setProductDesc(e.target.value); autoResize(e.target); }} placeholder="详细描述产品卖点、功能、材质、使用场景..." rows={1}
              className="w-full bg-[#F5F5F5] rounded-xl p-3 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none overflow-hidden text-[#333333] placeholder:text-[#BDBDBD]" />
          </div>

          {/* Settings */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <h3 className="text-sm font-semibold text-[#171717] mb-4">生图设置</h3>
            <div className="space-y-4">
              <Dropdown label="模型" value={selectedModel} options={models.length > 0 ? models : [{ value: 'nanobann2', label: 'Nanobann2' }]} onChange={setSelectedModel} />
              <ModelSpeedNote />
              <Dropdown label="目标语言" value={language} options={LANGUAGES} onChange={(v: string) => { setLanguage(v); saveLanguage(v); }} />
              <div>
                <label className="text-xs font-medium text-[#A3A3A3] mb-1.5 block">清晰度</label>
                <div className="flex gap-1.5">
                  {QUALITIES.map(q => (
                    <button key={q} onClick={() => setQuality(q)}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${quality === q ? 'bg-blue-500 text-white' : 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'}`}>{q}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between bg-[#F5F5F5] rounded-xl px-4 py-2.5">
                <span className="text-xs text-[#A3A3A3]">比例</span>
                <span className="text-xs font-medium text-[#171717]">9:16（固定竖版）</span>
              </div>
            </div>
          </div>

          {/* Analyze Button */}
          {!result && (
            <button onClick={handleAnalyze} disabled={productImages.length === 0 || analyzing}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-[#E5E5E5] disabled:text-[#A3A3A3] disabled:cursor-not-allowed shadow-sm">
              {analyzing ? <><Loader2 size={18} className="animate-spin" /> AI分析中...</> : <><Sparkles size={18} /> AI分析并规划配图</>}
            </button>
          )}

          {/* Re-analyze Button */}
          {result && (
            <button onClick={handleNewAnalysis}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all shadow-sm">
              <Sparkles size={18} /> 重新分析
            </button>
          )}

          {/* Generate Button */}
          {result && !generating && (
            <button onClick={handleGenerate} disabled={generating}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all shadow-sm">
              {generating ? <><Loader2 size={18} className="animate-spin" /> 生成中...</> : <><Sparkles size={18} /> 生成详情页配图 ({result.prompts.length}张)</>}
            </button>
          )}

          {/* Merge Button */}
          {generatedImages.filter(img => img.title !== '纵向合并长截图').length >= 2 && !generating && !analyzing && (
            <button onClick={handleMerge} disabled={isMerging}
              className="w-full bg-white text-[#171717] py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#F5F5F5] transition-all border border-[#E5E5E5] shadow-sm">
              {isMerging ? <><Loader2 size={18} className="animate-spin" /> 合并中...</> : <><Copy size={18} /> 合并详情页 ({generatedImages.filter(img => img.title !== '纵向合并长截图').length}张 → 1张)</>}
            </button>
          )}

          {(analyzing || generating || isMerging) && (
            <div className="text-center text-xs text-[#A3A3A3] bg-[#F5F5F5] rounded-xl py-3">
              <Loader2 size={14} className="animate-spin inline mr-2" />
              {progress}
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#FAFAFA]">
          {analyzing && !result ? (
            <div className="flex-1 flex items-center justify-center">
              <LoadingAnimation title="AI分析中" description="AI正在深度学习分析产品，规划详情页配图方案..." progress={progress} />
            </div>
          ) : !result && generatedImages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 mx-auto mb-5 bg-[#F5F5F5] rounded-2xl flex items-center justify-center">
                  <FileImage size={32} className="text-[#D4D4D4]" />
                </div>
                <h2 className="text-lg font-semibold text-[#171717] mb-2">详情页设计配图规划</h2>
                <p className="text-sm text-[#A3A3A3] leading-relaxed">
                  上传产品图片并填写信息 → AI深度学习分析 → 自动生成专业配图方案
                </p>
                <div className="mt-6 flex flex-wrap gap-2 justify-center">
                  {['全景展示', '多角度', '细节特写', '功能卖点', '使用场景', '尺寸规格', '包装展示', '对比效果', '正品保障'].map(tag => (
                    <span key={tag} className="px-3 py-1 bg-[#F5F5F5] text-[#737373] rounded-xl text-xs">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Progress bar when generating/merging with existing content */}
              {(generating || isMerging) && (
                <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm px-6 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <Loader2 size={16} className="animate-spin text-[#171717]" />
                    <span className="text-sm font-medium text-[#171717]">{progress}</span>
                    {generating && result && (
                      <span className="text-xs text-gray-400 ml-auto">{generatedImages.filter(img => img.title !== '纵向合并长截图').length} / {result.prompts.length} 张</span>
                    )}
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Prompt Cards */}
                {result && (
                <div>
                  <h2 className="text-sm font-semibold text-[#171717] mb-4">
                    AI配图方案 ({result?.prompts.length || 0}张)
                  </h2>
                    <div className="grid grid-cols-1 gap-4">
                      {result?.prompts.map((card, idx) => {
                        const genImg = generatedImages.find(g => g.idx === card.id);
                        return (
                          <div key={card.id} className="bg-white rounded-2xl border border-[#E5E5E5] shadow-sm overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-3 bg-[#FAFAFA] border-b border-[#E5E5E5]">
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 bg-[#171717] text-white rounded-xl flex items-center justify-center text-xs font-bold">{card.id}</span>
                                <span className="text-sm font-semibold text-[#171717]">{card.title}</span>
                              </div>
                              <button onClick={() => copyPrompt(idx, card.prompt)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all hover:bg-[#F5F5F5] text-[#737373]">
                                {copiedIdx === idx ? <><Check size={14} className="text-green-600" /> 已复制</> : <><Copy size={14} /> 复制提示词</>}
                              </button>
                            </div>
                            <div className="p-4 flex gap-4">
                              {genImg && (
                                <div className="w-[120px] flex-shrink-0">
                                  <div className="aspect-[9/16] rounded-xl overflow-hidden bg-[#F5F5F5] border border-[#E5E5E5] relative group cursor-pointer" onClick={() => setPreviewImage(genImg.url)}>
                                    <img src={genImg.url} alt="" className="w-full h-full object-cover" />
                                    <button onClick={() => handleDownload(genImg.url)} className="absolute bottom-2 right-2 w-7 h-7 bg-black/50 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Download size={12} className="text-white" />
                                    </button>

                                  </div>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-[#525252] leading-relaxed whitespace-pre-wrap font-mono bg-[#F9F9F9] p-4 rounded-xl border border-[#E5E5E5]">
                                  {card.prompt}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  )}

                {/* Deep Analysis Result */}
                {deepAnalysis && (
                  <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-sm overflow-hidden">
                    <div className="px-5 py-3 bg-[#FAFAFA] border-b border-[#E5E5E5]">
                      <h2 className="text-sm font-semibold text-[#171717]">AI深度产品分析</h2>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#F9F9F9] p-3 rounded-xl border border-[#E5E5E5]">
                          <span className="text-[10px] font-medium text-[#A3A3A3] uppercase tracking-wider">品牌</span>
                          <p className="text-sm font-semibold text-[#171717] mt-1">{deepAnalysis.brandName}{deepAnalysis.brandEnglishName ? ` / ${deepAnalysis.brandEnglishName}` : ''}</p>
                        </div>
                        <div className="bg-[#F9F9F9] p-3 rounded-xl border border-[#E5E5E5]">
                          <span className="text-[10px] font-medium text-[#A3A3A3] uppercase tracking-wider">品类</span>
                          <p className="text-sm font-semibold text-[#171717] mt-1">{deepAnalysis.productCategory}</p>
                        </div>
                      </div>
                      {deepAnalysis.logoDescription && (
                        <div className="bg-[#F9F9F9] p-3 rounded-xl border border-[#E5E5E5]">
                          <span className="text-[10px] font-medium text-[#A3A3A3] uppercase tracking-wider">LOGO设计</span>
                          <p className="text-xs text-[#525252] mt-1 leading-relaxed">{deepAnalysis.logoDescription}</p>
                        </div>
                      )}
                      <div className="bg-[#F9F9F9] p-3 rounded-xl border border-[#E5E5E5]">
                        <span className="text-[10px] font-medium text-[#A3A3A3] uppercase tracking-wider">规格</span>
                        <p className="text-xs text-[#525252] mt-1 leading-relaxed">{deepAnalysis.productSpec}</p>
                      </div>
                      <div className="bg-[#F9F9F9] p-3 rounded-xl border border-[#E5E5E5]">
                        <span className="text-[10px] font-medium text-[#A3A3A3] uppercase tracking-wider">核心卖点</span>
                        <p className="text-xs text-[#525252] mt-1 leading-relaxed whitespace-pre-wrap">{deepAnalysis.sellingPoints}</p>
                      </div>
                      <div className="bg-[#F9F9F9] p-3 rounded-xl border border-[#E5E5E5]">
                        <span className="text-[10px] font-medium text-[#A3A3A3] uppercase tracking-wider">目标受众</span>
                        <p className="text-xs text-[#525252] mt-1 leading-relaxed">{deepAnalysis.targetAudience}</p>
                      </div>
                      <div className="bg-[#F9F9F9] p-3 rounded-xl border border-[#E5E5E5]">
                        <span className="text-[10px] font-medium text-[#A3A3A3] uppercase tracking-wider">产品详情</span>
                        <p className="text-xs text-[#525252] mt-1 leading-relaxed whitespace-pre-wrap">{deepAnalysis.productDetails}</p>
                      </div>
                      {deepAnalysis.specialNeeds && (
                        <div className="bg-[#F9F9F9] p-3 rounded-xl border border-[#E5E5E5]">
                          <span className="text-[10px] font-medium text-[#A3A3A3] uppercase tracking-wider">特殊需求</span>
                          <p className="text-xs text-[#525252] mt-1 leading-relaxed">{deepAnalysis.specialNeeds}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Generated Images Grid */}
                {generatedImages.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold text-[#171717] mb-4">
                      已生成图片 ({generatedImages.length}/{result?.prompts.length})
                    </h2>
                    <div className="grid grid-cols-3 xl:grid-cols-4 gap-4">
                      {generatedImages.map((img, idx) => {
                        const isMerged = img.title === '纵向合并长截图';
                        return (
                        <div key={idx} className={`group relative bg-[#FAFAFA] rounded-2xl overflow-hidden border ${isMerged ? 'border-[#171717] col-span-2 row-span-2' : 'border-[#E5E5E5]'}`}>
                          {isMerged && (
                            <div className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-[#171717] text-white text-[10px] rounded-xl font-medium">合并长图</div>
                          )}
                          <div className={isMerged ? 'max-h-[600px] cursor-pointer overflow-hidden' : 'aspect-[9/16] cursor-pointer'} onClick={() => setPreviewImage(img.url)}>
                            <img src={img.url} alt="" className="w-full h-full object-contain" />
                          </div>
                          <div className="p-2.5 flex items-center justify-between">
                            <span className="text-[10px] font-medium text-[#525252] truncate">{img.title}</span>
                            <div className="flex gap-1">
                              <button onClick={() => setReEditImage(img.url)} className="w-6 h-6 flex items-center justify-center rounded-xl text-[#A3A3A3] hover:bg-[#F5F5F5] hover:text-[#171717] transition-colors flex-shrink-0" title="微调">
                                <Wand2 size={12} />
                              </button>
                              <button onClick={() => handleDownload(img.url)} className="w-6 h-6 flex items-center justify-center rounded-xl text-[#A3A3A3] hover:bg-[#F5F5F5] hover:text-[#171717] transition-colors flex-shrink-0 ml-1">
                                <Download size={12} />
                              </button>

                            </div>
                          </div>
                          {result && (() => {
                            const matched = result.prompts.find(p => p.id === img.idx);
                            return matched ? (
                              <div className="px-2.5 pb-2.5">
                                <p className="text-[9px] text-[#A3A3A3] leading-relaxed line-clamp-2">{matched.prompt}</p>
                              </div>
                            ) : null;
                          })()}
                        </div>
                      );})}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <ImagePreviewModal isOpen={!!previewImage} onClose={() => setPreviewImage(null)} imageUrl={previewImage || ''} />
      <ReEditModal
        isOpen={!!reEditImage}
        imageUrl={reEditImage || ''}
        aspectRatio="9:16"
        model={selectedModel}
        resolution={quality}
        onClose={() => setReEditImage(null)}
        onReplaced={(oldUrl, newUrl) => setGeneratedImages(prev => prev.map(item => item.url === oldUrl ? {...item, url: newUrl} : item))}
      />
    </div>
  );
};

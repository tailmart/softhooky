import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, FileImage, Copy, Check, ChevronDown, Download, Wand2 } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { analyzeMultipleImages } from '../../services/aiChatService';
import { uploadFileToCos } from '../../services/cosService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { requireAuth } from '../../utils/authCheck';
import { getAvailableModels } from '../../services/modelService';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import { ModelSpeedNote } from '../../components/ModelSpeedNote';
import { LoadingAnimation } from '../../components/LoadingAnimation';
import { PsdExportButton } from '../../components/PsdExportButton';

interface PromptCard {
  id: number;
  title: string;
  prompt: string;
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
  { title: '产品整体展示', prompt: '电商详情页首图，产品整体展示，纯白背景，专业棚拍布光，产品居中，8K超清，商业级质感，锐利清晰，色彩真实，产品上叠加产品名称和核心卖点的中文文案，排版简洁大气，竖版9:16' },
  { title: '产品细节特写', prompt: '电商详情页细节图，产品局部特写放大，展示精工细节和材质质感，微距拍摄，景深虚化背景，光线聚焦产品细节区域，标注细节说明文字，8K超清，竖版9:16' },
  { title: '功能卖点展示', prompt: '电商详情页功能展示图，产品核心功能可视化呈现，用图标或示意图标注功能卖点，产品为主体，配简洁功能说明文案，科技感光效，专业构图，竖版9:16' },
  { title: '使用场景图', prompt: '电商详情页场景图，产品在真实使用环境中的效果展示，生活化场景，自然光线，产品自然融入场景，体现产品实际使用方式，氛围感强，竖版9:16' },
  { title: '材质工艺图', prompt: '电商详情页材质展示图，产品材质和工艺特写，展示表面纹理、做工细节、材质质感，侧光拍摄突出纹理，配材质说明文案，高端质感，竖版9:16' },
  { title: '尺寸规格图', prompt: '电商详情页尺寸规格图，产品搭配尺寸标注和规格参数展示，产品主体清晰，配尺寸数字和规格图标，信息图表风格，简洁专业，竖版9:16' },
];

const LANGUAGES = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'ru', label: 'Русский' },
  { value: 'th', label: 'ไทย' },
  { value: 'ms', label: 'Bahasa Melayu' },
  { value: 'vi', label: 'Tiếng Việt' },
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

const SMART_PROMPT = `你是一位资深电商视觉设计师，具备5年以上电商详情页设计经验，精通平面构成、色彩搭配、版式设计及电商视觉营销逻辑。

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
生成一套完整的电商产品详情页设计提示词，AI根据产品特点和卖点灵活决定屏数（通常5-12屏），单屏尺寸严格限定为9:16竖版（适配手机端详情排版，符合移动端用户浏览视觉习惯）。所有提示词需达到"复制即可生效"标准，无需人工补充信息，直接粘贴至AI出图即可生成符合需求的详情页。

**核心约束**：提示词需形成完整的详情页逻辑链，视觉风格统一，无割裂感、无杂乱图。每屏提示词需具备高细节度，明确传递设计逻辑、视觉元素及内容布局，确保AI可精准拆解并还原设计意图。

## 视觉设计核心要求

### 1. 卖点可视化规范
严格提取【识别报备】中产品核心卖点，采用场景化、示意图、特写等视觉形式具象化呈现，拒绝单纯产品陈列。需将卖点（如续航、防水、材质优势）转化为可视化的元素（如防水场景展现产品淋水动态、材质优势呈现微观质感）。

### 2. 杂志级版式规范
单屏版式遵循高端杂志/画册排版逻辑，注重留白、层级感与平衡感，杜绝杂乱无章。卖点可视化采用"图标+示意图+精简文字"结合的形式，避免纯文字堆砌。产品展示角度多元化，涵盖正面、侧面、俯视、仰视、细节特写等。

### 3. 视觉吸引力约束
视觉设计需具备创新性与视觉冲击力，符合当下电商高端视觉趋势。单屏画面分辨率不低于300DPI，高清无模糊、无噪点。所有屏整体视觉风格统一（现代简约风），色彩、字体、排版逻辑、装饰元素保持一致。所有文字左对齐，字体统一采用无衬线黑体。**即使语言改变（中文/英文/日文等），产品实物的颜色、造型、LOGO位置、材质质感等视觉特征必须完全一致，不受语言影响。**

### 4. 提示词完整性要求
单屏提示词为一段式完整文本，可直接复制用于AI出图，包含以下核心要素（缺一不可）：
①主标题——明确单屏核心主题，贴合卖点，简洁有冲击力
②副标题+补充主题——传递产品价值，字数控制在15字以内
③信息布局——明确主标题、副标题、产品、卖点元素、装饰元素的具体位置
④排版形式——明确留白比例、元素对齐方式、视觉焦点位置
⑤设计细节——明确色彩搭配、元素样式及数量、材质呈现方式

### 5. 产品尺寸精准规范
严格提取【识别报备】中产品具体尺寸参数，提示词中需明确产品实际尺寸与画面中的比例呈现，确保产品与画面中其他元素的比例符合真实物理空间逻辑，无比例失衡、突兀感。

### 6. 产品还原度强制指令（每屏提示词开头必须包含以下两句，不可遗漏）
①严格还原上传产品参考图，精准复刻颜色、产品配色、LOGO位置及比例、文字内容及字体、图案元素及细节，无任何偏差、色彩无失真
②产品与画面中其他物体的比例遵循真实物理空间逻辑，视角规范，比例舒适，杜绝尺寸错乱、比例失衡

### 8. 跨语言一致性（重要）
无论新增文案使用何种语言，产品的实物视觉特征必须完全一致：
- 产品的颜色、配色方案、LOGO位置和大小在所有屏中严格统一
- 产品的造型、角度、材质质感不因语言切换而改变
- 产品实物的展示风格、光影效果保持一致
- 唯一会随语言变化的是新增的电商文案内容，产品本身不变

### 7. 无产品页面规范
允许设计无完整产品呈现，可单独聚焦产品功能、材质、工艺等核心优势，采用材质特写、功能示意图、工艺拆解图等形式呈现，重点突出功能价值与材质优势。

## 逻辑链设计参考（AI根据产品特点灵活调整屏数和顺序）
推荐的详情页逻辑递进顺序：
1. 品牌形象/产品全景大图，品牌LOGO+产品名称+核心Slogan
2. 产品多角度展示+核心卖点标注
3. 产品细节特写（材质、工艺、LOGO、配件细节）
4. 功能卖点可视化（每个核心功能独立展示）
5. 使用场景图（真实场景展示产品使用）
6. 尺寸/规格/参数展示
7. 品质保障/认证/信赖背书
8. 实拍对比或使用前后对比
9. 购买引导/促销行动号召

AI可根据产品特点灵活增减屏数和调整顺序，确保逻辑完整、卖点覆盖全面。

## 输出格式
你必须输出严格的JSON格式，不要包含任何其他文字：
{"prompts":[{"id":1,"title":"第1屏-XX主题","prompt":"完整AI绘图提示词"},{"id":2,"title":"第2屏-XX主题","prompt":"完整AI绘图提示词"},...]}

## 文案语言要求（重要！必须严格遵守）
- **{language}**：如果此值为 English，全部文案输出英文；如果为 简体中文/日本語/한국어/Русский 等，则全部输出对应语言
- 所有 title 字段和 prompt 字段中的所有文案内容必须**严格使用 {language}**
- 禁止中英混合，所有新增文案必须统一使用 {language}
- 产品原图上的文字、标志、标签保持原样不变，不做翻译修改
- 标题、副标题、卖点标签、说明文字等所有新增文案元素均使用 {language}`;

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
    getAvailableModels(['seedream']).then(m => {
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
  const [language, setLanguage] = useState('zh-CN');
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
        .replace('{language}', langLabel);

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
    const sections = (result?.prompts || []).length > 0
      ? (result?.prompts || []).map(c => ({ title: c.title, prompt: c.prompt }))
      : SMART_SECTIONS;
    if (sections.length === 0) { setGenerating(false); return; }

    const total = sections.length;
    setProgress(`生成中 (0/${total})...`);
    let doneCount = 0;
    const allImages: GenImage[] = [];

    const tasks = sections.map(async (section, idx) => {
      const langLabel = LANGUAGES.find(l => l.value === language)?.label || '中文';
      const analysisContext = deepAnalysis
        ? `\n\n## AI深度分析产品信息\n品牌：${deepAnalysis.brandName} ${deepAnalysis.brandEnglishName}\n品类：${deepAnalysis.productCategory}\n规格：${deepAnalysis.productSpec}\n卖点：${deepAnalysis.sellingPoints}\n目标人群：${deepAnalysis.targetAudience}\n产品详情：${deepAnalysis.productDetails}\n特殊需求：${deepAnalysis.specialNeeds}`
        : '';
      const finalPrompt = `${section.prompt}\n\n产品名：${productName || '该产品'}${productDesc ? `，描述：${productDesc}` : ''}${analysisContext}\n\n## 设计要求\n- AI自动分析所有上传的参考图，从中识别产品的真实外观特征并保持一致，忽略不清晰或与该产品无关的图片\n- 产品的造型、颜色、材质等视觉特征必须与筛选后的参考图一致\n- 产品原图上已有的文字/标志/标签保持原样不变\n- 画面中新增的电商文案必须使用${langLabel}，禁止使用其他语言\n- 每张图的电商文案**必须独特、有创意**，与大标题"${section.title}"呼应，不同配图之间各有侧重互不重复\n- 覆盖使用场景、产品亮点、功能卖点、细节工艺等不同维度\n- 文案排版清晰美观，标题醒目，副标题补充细节，电商详情页风格`;
      try {
        const resp = await editImage({
          prompt: finalPrompt,
          images: productImages,
          aspectRatio: '9:16',
          resolution: quality,
          model: selectedModel,
        });
        const url = resp.data?.[0]?.url || resp.image_url || resp.url || '';
        if (url) {
          const item = { url, title: section.title, idx: idx + 1 };
          allImages.push(item);
          setGeneratedImages(prev => [...prev, item]);
        }
      } catch (err: any) {
        console.error(`生成第${idx + 1}张失败:`, err);
      }
      doneCount++;
      setProgress(`生成中 (${doneCount}/${total})...`);
    });

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
              <Dropdown label="目标语言" value={language} options={LANGUAGES} onChange={setLanguage} />
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
                                    <PsdExportButton imageUrl={genImg.url} size="sm" className="absolute bottom-2 right-11 bg-black/50 opacity-0 group-hover:opacity-100" />
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
                              <PsdExportButton imageUrl={img.url} size="sm" />
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

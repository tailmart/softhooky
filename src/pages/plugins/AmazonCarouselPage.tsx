import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, ShoppingCart, Images, Globe, Download, Layout, Wand2, ChevronDown } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { analyzeMultipleImages } from '../../services/aiChatService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { requireAuth } from '../../utils/authCheck';
import { getAvailableModels } from '../../services/modelService';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import { ModelSpeedNote } from '../../components/ModelSpeedNote';
import { LoadingAnimation } from '../../components/LoadingAnimation';
import { PsdExportButton } from '../../components/PsdExportButton';

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '简体中文' },
  { value: 'ja', label: '日本語' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'it', label: 'Italiano' },
];

const MODES = [
  { value: 'main', label: '主图' },
  { value: 'aplus', label: 'A+页面' },
  { value: 'poster', label: '海报' },
  { value: 'all', label: '全部' },
];

const PRODUCT_DEEP_ANALYSIS_PROMPT = `你是一位专业亚马逊产品分析师。仔细分析所有上传的参考图，从中识别产品的真实外观特征，忽略不清晰或无关的图片，进行全面深度分析。

请从以下所有维度进行分析，返回一个JSON对象，格式如下：
{
  "title": "产品名称（简短有力的标题，适合亚马逊Listing，如"Cordless Electric Kettle 1.7L"）",
  "description": "产品外观与设计、材质、功能特性描述",
  "brand": "品牌名（从图片中识别，如无则空字符串）",
  "category": "产品品类（如"厨房小家电"、"蓝牙耳机"）",
  "specs": "规格参数（尺寸、容量、重量、功率等关键参数）",
  "sellingPoints": "核心卖点（3-5个关键卖点，逗号分隔）",
  "targetAudience": "目标人群描述"
}

要求：
- title 要简洁，突出核心特征，适合亚马逊Listing标题风格
- description 要详细、有条理
- 必须从图片中真实提取信息，不要编造
- 仅输出JSON对象，不要额外文字`;

const PROMPT_PREFIX = 'Professional commercial product photography, photorealistic, 8K ultra high definition, sharp focus, soft natural daylight, soft shadow, clean aesthetic, e-commerce style, Amazon listing image, no watermark, no clutter, pure tone';

const MAIN_IMAGE_PROMPT = `你是一位亚马逊产品主图与信息图设计师。分析所有上传的产品图片，从中识别产品的真实外观特征，忽略不清晰或无关的图片，为亚马逊主图规划展示方案。

每张图需要：
1. "title": 展示内容标题（英文，简洁概括）
2. "desc": 详细画面描述（英文）

## 输出格式 - STRICT JSON array:
[{"title":"展示标题","desc":"完整英文图像生成提示词"},...]

## 图像类型与风格规范
- **首图/主图**：photorealistic product photo, clean background or lifestyle interior, natural light, eye-level angle, product centered, highlighting overall design and texture, no text
- **卖点信息图**：infographic-style split layout, left text section with bold headline and 3-4 icon-labeled bullet points, right side product image, clean neutral background, warm natural light, commercial Amazon listing style, soft shadows. 文字用英文包含产品名和卖点
- **场景应用图**：infographic-style multi-section layout showing 2-3 usage scenarios (e.g. dining, office, living), product as main subject, bright natural light, neutral decor, warm inviting tone, soft shadows, section labels in English
- **多角度展示图**：infographic-style multi-angle layout, main product with arrow indicator + text "360° design - beautiful from every angle", 2-3 smaller inset views (front/side/back), minimalist background, bright light, 8K detail
- **尺寸规格图**：infographic-style with dimension lines and measurement labels, front/side view, bottom table listing specs (size, color, material, weight capacity), light beige background, clean text layout
- **细节特写图**：infographic-style with 2-3 circular close-up insets showing texture/craftsmanship details, main product image on side, right text section with headline and bullet points, warm natural light, neutral decor, high detail

## 原则
- desc 必须是完整的英文图像生成提示词，可直接用于 AI 生图
- 数量7-9张，覆盖以上类型
- 文字使用英文
- 每张图差异化
- ★★★ 所有输出的图片必须作为一套完整的视觉系列，左右拼接时背景色调、光影方向、视觉风格必须统一，形成连贯的视觉流 ★★★`;

const APLUS_IMAGE_PROMPT = `你是一位亚马逊A+页面设计师。分析所有上传的产品图片，从中识别产品的真实外观特征，忽略不清晰或无关的图片，为A+详情页规划展示方案。

每张图需要：
1. "title": 展示内容标题
2. "desc": 详细画面描述（构图布局、场景氛围、光线色调、生活方式元素等）

## 输出格式 - STRICT JSON array:
[{"title":"展示标题","desc":"内容描述"},...]

## 原则
- 根据产品特征自行决定最适合的A+图片数量（通常5-8张）
- 高端电商A+页面风格，产品与生活方式场景结合
- 画面采用统一暖色或品牌色调
- 布局清晰，信息分层明确，视觉丰富但不杂乱
- 适用于亚马逊A+详情页
- ★★★ 所有输出的图片必须作为一个完整的视觉系列，当左右拼接展示时颜色、光影、背景风格必须高度一致，视觉过渡自然无缝 ★★★`;

const POSTER_IMAGE_PROMPT = `你是一位亚马逊海报设计师。分析所有上传的产品图片，从中识别产品的真实外观特征，忽略不清晰或无关的图片，为亚马逊促销海报规划方案。

每张图需要：
1. "title": 海报主题标题
2. "desc": 详细画面描述（产品位置、场景、情绪氛围、构图、色调、光影等）

## 输出格式 - STRICT JSON array:
[{"title":"展示标题","desc":"内容描述"},...]

## 原则
- 根据产品特征自行决定最适合的海报数量（通常3-5张）
- 产品位于视觉中心，突出核心卖点
- 画面营造情绪氛围，干净但视觉丰富
- 高级商业海报风格
- ★★★ 所有输出的图片必须作为一套完整的视觉系列，左右拼接时背景色调、光影方向、视觉风格必须统一 ★★★`;

const MODE_GEN_PROMPTS: Record<string, string> = {
  main: `${PROMPT_PREFIX}. {desc}. IMPORTANT: This image is part of a cohesive Amazon listing set. Must use consistent color palette, same lighting direction and intensity, matching background style as all other images in this set. Seamless visual transition when placed side by side.`,
  aplus: `${PROMPT_PREFIX}. Amazon A+ page image, lifestyle usage scene, warm unified color tone, product combined with real usage environment, clean layout, clear information hierarchy, rich visual but not cluttered, commercial photography style, brand trust feeling. {desc}. IMPORTANT: This image is part of a cohesive A+ module set. Must share identical color palette, consistent lighting direction and intensity, matching background tone with all other A+ images. Designed to be displayed side by side with seamless visual flow.`,
  poster: `${PROMPT_PREFIX}. Amazon promotional poster, product at visual center, emotional atmosphere, professional composition, unified color tone, natural light and shadow, high-end commercial poster style, clean but visually rich, premium feeling. {desc}. IMPORTANT: This image is part of a cohesive poster set. Must maintain consistent color palette, uniform lighting, matching visual mood across all posters in this set.`,
};

interface Card {
  title: string;
  desc: string;
}

export const AmazonCarouselPage: React.FC = () => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getAvailableModels(['seedream']).then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) setSelectedModel('gpt-image-2');
    });
  }, []);
  const [productImages, setProductImages] = useState<{ file: File; preview: string }[]>([]);
  const [productTitle, setProductTitle] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [mode, setMode] = useState('main');
  const [bannerCount] = useState(0);
  const [language, setLanguage] = useState('en');
  const [aspectRatio, setAspectRatio] = useState('1:1');

  // 各模式默认比例
  const MODE_RATIOS: Record<string, { default: string; options: string[] }> = {
    main: { default: '1:1', options: ['1:1', '3:4'] },
    aplus: { default: '16:9', options: ['16:9', '3:4', '1:1'] },
    poster: { default: '9:16', options: ['9:16', '16:9', '4:3'] },
    all: { default: '1:1', options: ['1:1', '16:9', '9:16', '3:4', '4:3'] },
  };

  const ALL_MODE_LIST = ['main', 'aplus', 'poster'];

  const handleModeChange = (newMode: string) => {
    setMode(newMode);
    if (newMode !== 'all') setAspectRatio(MODE_RATIOS[newMode].default);
  };
  const [selectedModel, setSelectedModel] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [quality, setQuality] = useState('2K');
  const [progress, setProgress] = useState('');
  const [deepAnalysis, setDeepAnalysis] = useState<Record<string, string> | null>(null);
  const [results, setResults] = useState<{ url: string; title: string }[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    const oversized = files.find(f => f.size > MAX_FILE_SIZE);
    if (oversized) {
      alert(`图片"${oversized.name}"超过 20MB，请压缩后重新上传`);
      e.target.value = '';
      return;
    }
    const newItems = files.map(f => ({ file: f, preview: '' }));
    Promise.all(newItems.map(item => new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => { item.preview = reader.result as string; resolve(); };
      reader.onerror = reject;
      reader.readAsDataURL(item.file);
    }))).then(() => {
      setProductImages(prev => [...prev, ...newItems].slice(0, 10));
    }).catch(err => {
      console.error('图片处理失败:', err);
      alert('部分图片处理失败，请尝试使用更小的图片');
    });
  };

  const removeImage = (idx: number) => setProductImages(prev => prev.filter((_, i) => i !== idx));

  const handleAnalyzeAndGenerate = async () => {
    if (!requireAuth()) return;
    if (productImages.length === 0) { alert('请上传产品图片'); return; }
    setAnalyzing(true);
    setResults([]);
    setProgress('AI正在筛选图片...');
    try {
      // 第一步：筛图 — 让AI识别哪些图片是有效的产品图
      const b64sAll = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1200)));
      const langLabel = LANGUAGES.find(l => l.value === language)?.label || 'English';

      const screenRaw = await analyzeMultipleImages(b64sAll,
        `分析所有上传的图片，判断哪些是有效产品图（清晰展示产品的正/侧/背面、细节、包装等），忽略不清晰、无关、重复角度或乱入的图片。
返回JSON数组，只包含有效图片的索引（从0开始）。如果全部有效则返回全部索引。
示例：{"validIndices":[0,1,3]}`,
        { model: 'gemini-3.5-flash', maxTokens: 1000 }
      );
      let validIndices: number[] = [];
      try {
        const parsed = JSON.parse(screenRaw.match(/\{[\s\S]*\}/)?.[0] || '{}');
        validIndices = Array.isArray(parsed.validIndices) && parsed.validIndices.length > 0 ? parsed.validIndices : productImages.map((_, i) => i);
      } catch { validIndices = productImages.map((_, i) => i); }

      // 只保留筛选后的图片
      const filteredB64s = validIndices.map(i => b64sAll[i]).filter(Boolean);
      const filteredFiles = validIndices.map(i => productImages[i]).filter(Boolean);

      // 深度产品分析（始终执行）
      let finalTitle = productTitle;
      let finalDesc = customDescription;
      let analysisContext = '';
      setProgress('AI正在深度分析产品...');
      const raw = await analyzeMultipleImages(filteredB64s, PRODUCT_DEEP_ANALYSIS_PROMPT, { model: 'gemini-3.5-flash', maxTokens: 4000 });
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
        setDeepAnalysis(parsed);
        if (!finalTitle.trim() && parsed.title) {
          setProductTitle(parsed.title);
          finalTitle = parsed.title;
        }
        if (!finalDesc.trim() && parsed.description) {
          setCustomDescription(parsed.description);
          finalDesc = parsed.description;
        }
        analysisContext = `\n## AI深度分析产品信息\n品牌：${parsed.brand || ''}\n品类：${parsed.category || ''}\n规格：${parsed.specs || ''}\n卖点：${parsed.sellingPoints || ''}\n目标人群：${parsed.targetAudience || ''}`;
      }

      // 决定要生成的模式列表
      const modeLabelMap: Record<string, string> = { main: '主图', aplus: 'A+页面', poster: '海报' };

      setAnalyzing(false);
      setIsGenerating(true);
      setProgress('');

      const urls = await Promise.all(filteredFiles.map(item => fileToDataUrl(item.file, 1536)));
      imageLibraryService.clearSavedUrlsCache();

      // 定义一个生成函数，根据模式和卡片列表生成图片
      const generateForMode = async (currentMode: string, cards: Card[]) => {
        const currentRatio = mode === 'all' ? MODE_RATIOS[currentMode].default : aspectRatio;
        // 统一视觉风格指南：所有图片共享相同的光影、色调和背景基调
        const visualStyleGuide = `\n\n## 统一视觉风格规范（本组所有图片必须严格遵守）\n- 色调：整组图片使用统一的暖色调（warm tone），色温一致\n- 光影：所有图片的光源方向均为左上侧自然光，阴影柔和一致\n- 背景：所有图片的背景色调和风格保持一致，形成视觉连贯性\n- 氛围：整体呈现高端、干净的商业摄影质感\n- 拼接：每张图左右边缘的色调和亮度与邻图完美衔接，过渡自然`;
        for (let i = 0; i < cards.length; i++) {
          const card = cards[i];
          setProgress(`${modeLabelMap[currentMode]} 生成中 (${i + 1}/${cards.length})...`);
          const genTemplate = MODE_GEN_PROMPTS[currentMode];
          const genPrompt = genTemplate
            .replace('{title}', finalTitle)
            .replace('{desc}', `${card.desc}。${finalDesc || ''}`)
            + `${analysisContext}${visualStyleGuide}\n\n要求：\n- **产品本身已有的文字、标签、Logo、包装文字绝对不能被翻译或修改，必须保持原样**\n- 产品上的中文文字不能变成英文，反之亦然\n- 产品的造型、颜色、材质等视觉特征必须与参考图一致\n- 画面新增文案使用${langLabel}\n- 每张图差异化，互不重复`;
          try {
            const resp = await editImage({ prompt: genPrompt, images: urls, aspectRatio: currentRatio, resolution: quality, model: selectedModel });
            if (resp.data?.[0]?.url) {
              imageLibraryService.saveToLibrary({ image_url: resp.data[0].url, prompt: `亚马逊 - ${finalTitle} - ${modeLabelMap[currentMode]} - ${card.title}`, model: selectedModel, aspect_ratio: currentRatio, resolution: quality, type: 'generated' });
              setResults(prev => [{ url: resp.data[0].url, title: `[${modeLabelMap[currentMode]}] ${card.title}` }, ...prev]);
            }
          } catch {}
        }
      };

      if (mode === 'all') {
        // 全部模式：一次API调用规划三种模式
        setProgress('AI正在规划主图/A+页面/海报方案...');
        const combinedPrompt = `你是一位亚马逊视觉设计师。为以下产品同时规划三种类型的视觉方案：主图、A+页面、海报。

产品：${finalTitle}
描述：${finalDesc || ''}${analysisContext}
目标语言：${langLabel}

请输出JSON，格式如下：
{
  "main": [{"title":"主图标题","desc":"画面描述"},...],
  "aplus": [{"title":"A+标题","desc":"画面描述"},...],
  "poster": [{"title":"海报标题","desc":"画面描述"},...]
}

## 各类型要求
- 主图：白色纯背景，产品居中占85%以上，无文字无logo（通常5-8张）
- A+页面：生活方式场景，品牌调性，产品+场景融合（通常5-8张）
- 海报：促销风格，产品视觉中心，情绪氛围（通常3-5张）
- 所有文案使用目标语言，每张图差异化不重复
- ★★★ 整套图片无论哪种类型，色调、光影方向、背景风格必须高度统一，左右拼接展示时视觉连贯无缝 ★★★`;
        const combinedRaw = await analyzeMultipleImages(filteredB64s, combinedPrompt, { model: 'gemini-3.5-flash', maxTokens: 12000 });
        const combinedMatch = combinedRaw.match(/\{[\s\S]*\}/);
        if (combinedMatch) {
          const combined = JSON.parse(combinedMatch[0]);
          for (const cm of ALL_MODE_LIST) {
            const cards = combined[cm];
            if (Array.isArray(cards) && cards.length > 0) {
              await generateForMode(cm, cards);
            } else {
              console.warn(`${modeLabelMap[cm]}方案为空，跳过`);
            }
          }
        }
      } else {
        // 单个模式：正常走一个API
        setProgress(`AI正在规划${modeLabelMap[mode]}方案...`);
        const singlePrompt = mode === 'main' ? MAIN_IMAGE_PROMPT : mode === 'aplus' ? APLUS_IMAGE_PROMPT : POSTER_IMAGE_PROMPT;
        const userContent = `${singlePrompt}\n\n=====\n\n产品：${finalTitle}\n描述：${finalDesc || ''}${analysisContext}\n目标语言：${langLabel}\n\n根据产品特征自行决定最适合的图片数量。`;
        const raw2 = await analyzeMultipleImages(filteredB64s, userContent, { model: 'gemini-3.5-flash', maxTokens: 8000 });
        const jsonMatch2 = raw2.match(/\[[\s\S]*\]/);
        if (jsonMatch2) {
          const cards = JSON.parse(jsonMatch2[0]) as Card[];
          if (Array.isArray(cards) && cards.length > 0) {
            await generateForMode(mode, cards);
          }
        }
      }
    } catch (err: any) {
      console.error('分析/生成失败:', err);
      alert('操作失败: ' + (err.message || '请稍后重试'));
    } finally {
      setAnalyzing(false);
      setIsGenerating(false);
      setProgress('');
    }
  };

  const handleDownload = async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `amazon-${Date.now()}.png`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-gray-200 flex-shrink-0 bg-gray-50">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center"><ShoppingCart size={16} className="text-white" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[#171717]">亚马逊轮播图</h1>
          <p className="text-[10px] text-gray-400 leading-tight">主图 · A+页面 · 海报，一站式亚马逊视觉生成</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[380px] border-r border-gray-200 overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-gray-50">
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Images size={16} className="text-blue-500" />
              <div><h3 className="text-sm font-semibold text-[#171717]">产品图片</h3><p className="text-xs text-gray-400">所有图片作为参考传入</p></div>
              <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-xl">{productImages.length}/10</span>
            </div>
            {productImages.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mb-3">{productImages.map((item, idx) => (
                <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden bg-gray-100">
                  <img src={item.preview} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removeImage(idx)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100"><X size={14} className="text-white" /></button>
                </div>
              ))}</div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleUpload} multiple accept="image/*" className="hidden" />
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA] p-3 flex flex-col items-center justify-center gap-1 hover:border-gray-400 hover:bg-gray-50 transition-all cursor-pointer bg-[#FAFAFA]">
              <Plus size={18} className="text-gray-400" /><span className="text-xs text-gray-400">上传产品图</span>
            </div>
          </div>

          {/* 模式选择 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Layout size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">模式</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {MODES.map(m => (
                <button key={m.value} onClick={() => handleModeChange(m.value)}
                  className={`py-2.5 rounded-xl text-xs font-medium transition-all ${mode === m.value ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{m.label}</button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">{mode === 'all' ? '将依次生成主图 + A+页面 + 海报' : `默认比例：${MODE_RATIOS[mode].default}`}</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <ShoppingCart size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">产品标题 <span className="text-red-500">*</span></span>
            </div>
            <input value={productTitle} onChange={e => setProductTitle(e.target.value)} placeholder="例如：Wireless Bluetooth Headphones"
              className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-2xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder:text-gray-400" />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">描述（可选）</span>
            </div>
            <textarea value={customDescription} onChange={e => { setCustomDescription(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder="卖点、颜色、材质、风格要求等"
              className="w-full bg-[#F5F5F5] rounded-2xl p-3 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none text-[#333333] placeholder:text-gray-400 overflow-hidden" rows={1}
              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Globe size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">目标语言</span>
            </div>
            <select value={language} onChange={e => setLanguage(e.target.value)}
              className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-2xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 appearance-none cursor-pointer">
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          {mode !== 'all' && (
            <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Layout size={14} className="text-blue-500" />
                <span className="text-sm font-semibold text-[#171717]">比例</span>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${MODE_RATIOS[mode].options.length}, 1fr)` }}>
                {MODE_RATIOS[mode].options.map(r => (
                  <button key={r} onClick={() => setAspectRatio(r)}
                    className={`py-2 rounded-xl text-xs font-medium transition-all ${aspectRatio === r ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{r}</button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Images size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">模型</span>
            </div>
            <div className="relative">
              <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                className="w-full bg-gray-100 px-3 py-2.5 pr-8 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer">
                {models.length > 0 ? models.map(m => <option key={m.value} value={m.value}>{m.label}</option>) : <option value="nanobann2">Nanobann2</option>}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <ModelSpeedNote />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">分辨率</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {['2K', '4K'].map(q => (
                <button key={q} onClick={() => setQuality(q)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${quality === q ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{q}</button>
              ))}
            </div>
          </div>

          {!analyzing && !isGenerating && (
            <button onClick={handleAnalyzeAndGenerate} disabled={productImages.length === 0}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-gray-200 disabled:text-gray-400 shadow-sm">
              <Sparkles size={18} /> AI分析并生成
            </button>
          )}
          {(analyzing || isGenerating) && (
            <div className="text-center text-xs text-gray-400 bg-gray-100 rounded-xl py-3 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              {isGenerating ? (progress || '生成中...') : 'AI分析中...'}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
          {!analyzing && !isGenerating && results.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 mx-auto mb-5 bg-gray-100 rounded-2xl flex items-center justify-center"><ShoppingCart size={32} className="text-gray-300" /></div>
                <h2 className="text-lg font-semibold text-[#171717] mb-2">亚马逊轮播图</h2>
                <p className="text-sm text-gray-400 leading-relaxed">上传产品图 → 选择模式 → 一键生成亚马逊视觉</p>
              </div>
            </div>
          ) : (
            <div className="p-6">
              {analyzing && results.length === 0 && (
                <LoadingAnimation
                  title="AI 正在分析"
                  description={progress || '分析产品并规划方案...'}
                  progress={progress || undefined}
                />
              )}
              {isGenerating && !analyzing && results.length === 0 && (
                <LoadingAnimation
                  title="正在生成"
                  description={progress || '正在生成...'}
                  progress={progress || undefined}
                  showProgressBar
                />
              )}
              {results.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-[#171717]">
                      已生成 ({results.length})
                      {isGenerating && <span className="text-xs text-[#A3A3A3] font-normal ml-2">生成中...</span>}
                    </h2>
                    {isGenerating && (
                      <div className="flex items-center gap-2 text-xs text-[#A3A3A3] bg-[#F5F5F5] rounded-xl px-3 py-1.5">
                        <Loader2 size={12} className="animate-spin text-violet-500" />
                        {progress}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                    {results.map((item, idx) => (
                      <div key={idx} className="group relative bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
                        <div className="aspect-square cursor-pointer" onClick={() => setPreviewImage(item.url)}><img src={item.url} alt="" className="w-full h-full object-cover" /></div>
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-600 truncate">{item.title}</span>
                          <button onClick={() => handleDownload(item.url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#171717]"><Download size={14} /></button>
                          <PsdExportButton imageUrl={item.url} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <ImagePreviewModal isOpen={!!previewImage} onClose={() => setPreviewImage(null)} imageUrl={previewImage || ''} />
      <ReEditModal
        isOpen={!!reEditImage}
        imageUrl={reEditImage || ''}
        aspectRatio={aspectRatio}
        model={selectedModel}
        resolution={quality}
        onClose={() => setReEditImage(null)}
        onReplaced={(oldUrl, newUrl) => { setResults(prev => prev.map(item => item.url === oldUrl ? {...item, url: newUrl} : item)); }}
      />
    </div>
  );
};

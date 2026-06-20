import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, Download, Eye, FileText, Check, Shirt } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { analyzeMultipleImages } from '../../services/aiChatService';
import { requireAuth } from '../../utils/authCheck';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { Toast } from '../../components/Toast';
import { EcommerceImageUpload, EcommerceSettings } from '../../components/ecommerce';
import { LoadingAnimation } from '../../components/LoadingAnimation';
import { LANGUAGES, getSavedLanguage, saveLanguage } from '../../constants/languages';

// --- Constants ---
const MODEL_IMAGE_EDIT = 'gpt-image-2';
const RESOLUTION_4K = '4K';
const BACK_ANALYSIS_PROMPT = '分析这张产品背面图的所有可见细节，补充到前面的分析中。只描述实际可见的细节。返回补充分析。';

const ANALYSIS_PROMPT = `You are analyzing product photos (front and back views). Carefully examine ALL visible details and return a detailed product analysis in Chinese.

First, identify if the product is shown as a flat/layout item (平铺) or a 3D/stereoscopic item (立体). If flat, describe how it would look as a 3D object with depth and form.

First, identify the product type and adapt the analysis accordingly.

Then analyze and describe these aspects based ONLY on what is actually visible in the photos:

1. 产品基本信息：品类、颜色、材质（如磨砂塑料/金属/皮革/布料等）
2. 正面细节：观察并描述正面的所有可见细节 — 品牌Logo/标识（印刷工艺、字体、位置）、功能按键/触控区（纹理、形状、尺寸）、接缝/拼接工艺（均匀度、处理方式）、屏幕/显示区域（若有）、任何正面装饰元素
3. 背面细节：观察并描述背面的所有可见细节 — 材质纹理（磨砂/光滑/编织等）、接口/充电口（类型、位置、排列）、孔位/通风口（排列方式、边缘处理）、装饰线条/纹理（走向、颜色）、标签/文字信息（若有）
4. 侧面/边缘：边缘圆角弧度、厚度变化、材质过渡、按键/开关位置
5. 配件/衔接处：产品与配件的契合区域（若有）、贴合度、衔接工艺
6. 核心功能部件：针对该品类最核心的功能部件（如耳机发声网罩、相机镜头、水杯壶嘴等）的细节描述

IMPORTANT: Only describe details that are ACTUALLY VISIBLE in the photos. Do NOT invent or imagine details that don't exist. If a feature cannot be seen, do not include it.

Return as a structured analysis in Chinese, 200-400 words.`;

const VIEW_PROMPT_STANDARD = `Based on the following product analysis, generate a single 4:3 product showcase image with 6 product views arranged in a clean grid. NO WATERMARKS, NO AI BADGES, NO LOGOS on the image.

Product Analysis:
{ANALYSIS}

IMPORTANT: If the reference image shows the product as flat/laid-out (平铺), you MUST render it as a 3D product with depth, volume, and form in all 6 views.

Requirements:
- Clean white background, 6 views in a grid (3 rows x 2 columns)
- Each cell shows ONLY the product on clean white background
- NO text, NO labels, NO scenes, NO models, NO people, NO watermark, NO AI badge
- Each view must show the SAME product with exact colors, materials, proportions
- Subtle cell dividers, commercial product photography quality
- 4:3 aspect ratio for the overall composite image
- ABSOLUTELY NO AI brand stamp or watermark anywhere

CRITICAL - Each view must be a TRULY DIFFERENT camera angle, not just slight variations of the same view. Think like a professional product photographer moving around the product with different lenses and heights.

The 6 views:
1. 仰视角度 — 相机从下往上拍，突出产品的立体感和高度，展示底部和正面同时可见的夸张透视效果
2. 俯视角度 — 相机从斜上方45°俯拍，展示产品顶面和侧面，模拟人手拿着看的视角
3. 超低角度 — 贴地平拍，产品像建筑物一样矗立在镜头前，极具视觉冲击力
4. 旋转动态 — 产品倾斜15-20度旋转展示，模拟产品正在被翻转的动态瞬间
5. 微距特写 — 贴近产品最核心的特征区域放大，展示材质纹理和细节
6. 全景环境 — 拉远镜头展示产品在空间中的比例关系，带一点简洁场景感`;

const DETAIL_PROMPT = `Based on the following product analysis, generate a single 16:9 product detail close-up image with 9 macro views in a 3x3 grid. NO WATERMARKS, NO AI BADGES, NO LOGOS on the image.

Product Analysis:
{ANALYSIS}

If the reference image shows the product flat (平铺), render it as a 3D object with visible details and depth.

You MUST ONLY magnify and enlarge REAL, VISIBLE details described in the analysis. Do NOT invent any details.

Each cell: macro close-up filling 80%+ of cell, clean white background, razor sharp focus, professional macro lighting, subtle cell borders. NO watermark or AI badge.

The 9 detail close-ups (adapt detail descriptions based on the actual product analysis):
Cell 1 — 正面标识特写: 产品正面Logo/品牌标识区域放大，展示印刷工艺与质感
Cell 2 — 功能键/操作区: 正面功能按键或触控区域放大，展示纹理与工艺
Cell 3 — 接缝/拼接: 正面外壳拼接缝隙放大，展示做工精细度
Cell 4 — 背面材质: 产品背面材质纹理放大，展示表面质感与光泽
Cell 5 — 接口/孔位: 背面接口或孔位放大，展示排列与边缘处理
Cell 6 — 装饰/标识: 背面装饰元素或文字标识放大
Cell 7 — 边缘/圆角: 产品边缘圆角弧度特写，展示打磨与过渡
Cell 8 — 配件/衔接: 产品与配件衔接区域放大（若适用），展示贴合度
Cell 9 — 核心功能部件: 产品核心功能部件特写（如发声单元/镜头/壶嘴等）

Overall: 16:9, clean white background, no text/labels, no watermark, no AI badge.`;

// --- Types ---
type GenerationPhase = 'idle' | 'analyzing' | 'standard' | 'detail';

interface ViewConfig {
  key: string;
  label: string;
  labelShort: string;
  description: string;
  aspectRatio: string;
  viewLabels: string[];
}

const VIEW_CONFIGS: ViewConfig[] = [
  {
    key: 'standard',
    label: '标准六宫格',
    labelShort: '六宫格',
    description: '6种相机角度白底展示',
    aspectRatio: '4:3',
    viewLabels: ['仰视角度', '俯视角度', '超低角度', '旋转动态', '微距特写', '全景环境'],
  },
  {
    key: 'detail',
    label: '九宫格细节特写',
    labelShort: '细节图',
    description: '16:9产品细节放大拼接图',
    aspectRatio: '16:9',
    viewLabels: [],
  },
];

const PHASE_LABELS: Record<GenerationPhase, string> = {
  analyzing: '分析产品细节中',
  standard: '生成标准六宫格中',
  detail: '生成九宫格细节图中',
  idle: '',
};

// --- Component ---
export const Product9GridPage: React.FC = () => {
  const [productImages, setProductImages] = useState<{ file: File; preview: string }[]>([]);
  const [language, setLanguage] = useState(getSavedLanguage());
  const [selectedModel, setSelectedModel] = useState('');
  const [quality, setQuality] = useState('2K');
  const [enabledViews, setEnabledViews] = useState<Record<string, boolean>>({
    standard: true,
    detail: false,
  });
  const [results, setResults] = useState<Record<string, string | null>>({
    standard: null,
    detail: null,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [phase, setPhase] = useState<GenerationPhase>('idle');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const activeViewCount = Object.values(enabledViews).filter(Boolean).length;

  // 上传新图片时重置结果
  useEffect(() => {
    setResults({ standard: null, detail: null });
    setAnalysis('');
  }, [productImages]);

  const toggleView = (key: string) => {
    setEnabledViews(prev => ({ ...prev, [key]: !prev[key] }));
    setResults(prev => ({ ...prev, [key]: null }));
  };

  const getPrompt = (key: string, analysisText: string): string => {
    switch (key) {
      case 'standard': return VIEW_PROMPT_STANDARD.replace('{ANALYSIS}', analysisText);
      case 'detail': return DETAIL_PROMPT.replace('{ANALYSIS}', analysisText);
      default: return '';
    }
  };

  const handleDownload = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `product-${Date.now()}.png`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleDownloadAll = async () => {
    const urls: string[] = Object.values(results).filter((v): v is string => !!v);
    for (const url of urls) {
      await handleDownload(url);
    }
  };

  const handleGenerate = async () => {
    if (!requireAuth() || productImages.length === 0) return;

    const activeKeys = Object.entries(enabledViews).filter(([, v]) => v).map(([k]) => k);
    if (activeKeys.length === 0) return;

    setIsGenerating(true);
    setResults(prev => {
      const next = { ...prev };
      activeKeys.forEach(k => { next[k] = null; });
      return next;
    });
    setAnalysis('');
    setToast(null);

    try {
      // Convert files to data URLs — one pass per image
      const fileResults = await Promise.all(
        productImages.map(item => Promise.all([
          fileToDataUrl(item.file, 1536),
          fileToDataUrl(item.file, 1024),
        ]))
      );
      const imageUrls = fileResults.map(r => r[0]);
      const analysisUrls = fileResults.map(r => r[1]);

      // Phase 1: Analyze front image
      setPhase('analyzing');
      setProgress('AI正在分析产品细节特征...');
      const analysisText = await analyzeMultipleImages(
        [analysisUrls[0]],
        ANALYSIS_PROMPT,
        { model: 'gemini-3.5-flash', maxTokens: 2000 }
      );
      let fullAnalysis = analysisText;

      // Phase 2: Analyze back image (if available)
      if (analysisUrls.length > 1) {
        setProgress('AI正在分析产品背面特征...');
        const backAnalysis = await analyzeMultipleImages(
          [analysisUrls[1]],
          BACK_ANALYSIS_PROMPT,
          { model: 'gemini-3.5-flash', maxTokens: 1000 }
        );
        fullAnalysis += '\n\n背面补充：' + backAnalysis;
      }
      setAnalysis(fullAnalysis);

      // Phase 3: Generate each enabled view type sequentially
      for (const key of activeKeys) {
        setPhase(key as GenerationPhase);
        const config = VIEW_CONFIGS.find(v => v.key === key)!;
        setProgress(`正在生成${config.label}...`);
        const response = await editImage({
          prompt: getPrompt(key, fullAnalysis),
          images: imageUrls,
          aspectRatio: config.aspectRatio,
          resolution: quality,
          model: selectedModel,
          type: 'edited',
        });
        if (response.data?.[0]?.url) {
          setResults(prev => ({ ...prev, [key]: response.data[0].url }));
          imageLibraryService.saveToLibrary({
            image_url: response.data[0].url,
            prompt: getPrompt(key, fullAnalysis),
            model: selectedModel || MODEL_IMAGE_EDIT,
            aspect_ratio: config.aspectRatio,
            resolution: quality || RESOLUTION_4K,
            type: 'edited',
          });
        }
      }
    } catch (err: any) {
      setToast({ message: '生成失败: ' + (err.message || '请稍后重试'), type: 'error' });
    }
    setIsGenerating(false);
    setProgress('');
    setPhase('idle');
  };

  const hasAnyResult = Object.values(results).some(Boolean);
  const hasAllResults = VIEW_CONFIGS.filter(v => enabledViews[v.key]).every(v => results[v.key]);

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-b from-gray-50 to-white min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-14 border-b border-[#E5E5E5] flex-shrink-0 bg-white/80 backdrop-blur-md">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center shadow-sm">
          <Sparkles size={16} className="text-white" />
        </div>
        <h1 className="text-base font-semibold text-[#171717]">产品展示图</h1>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        <div className="w-[380px] border-r border-[#E5E5E5] overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-[#FAFAFA]">
          {/* Image upload */}
          <EcommerceImageUpload
            images={productImages}
            onImagesChange={setProductImages}
            maxImages={2}
            title="产品图片"
            subtitle="最多2张，正面+背面"
            icon="image"
          />

          {/* Settings: model, language, quality */}
          <EcommerceSettings
            language={language}
            onLanguageChange={(lang) => { setLanguage(lang); saveLanguage(lang); }}
            languages={LANGUAGES}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            quality={quality}
            onQualityChange={setQuality}
          />

          {/* View type selection */}
          <div className="bg-white rounded-2xl p-5 border border-[#E5E5E5] shadow-sm hover:shadow-md transition-shadow space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center">
                <Shirt size={13} className="text-amber-500" />
              </div>
              <span className="text-sm font-semibold text-[#171717]">选择生成内容</span>
            </div>
            {VIEW_CONFIGS.map(config => {
              const isOn = enabledViews[config.key];
              return (
                <label
                  key={config.key}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                    isOn ? 'bg-[#F5F5F5]' : 'hover:bg-gray-50'
                  }`}
                >
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOn}
                    onClick={() => toggleView(config.key)}
                    className={`w-10 h-6 rounded-full transition-all duration-300 relative flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-[#171717]/30 ${
                      isOn ? 'bg-[#171717]' : 'bg-[#D1D5DB]'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${
                      isOn ? 'left-[19px]' : 'left-0.5'
                    }`} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-[#171717]">{config.label}</span>
                      {isOn && (
                        <div className="w-4 h-4 rounded-full bg-green-500/10 flex items-center justify-center">
                          <Check size={9} className="text-green-600" />
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-[#A3A3A3]">{config.description}</p>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={productImages.length === 0 || isGenerating || activeViewCount === 0}
            className="w-full bg-gradient-to-r from-[#171717] to-[#333333] hover:from-[#27272A] hover:to-[#404040] text-white py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg disabled:from-[#E5E5E5] disabled:to-[#E5E5E5] disabled:text-[#A3A3A3] disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isGenerating ? (
              <><Loader2 size={16} className="animate-spin" /> {progress}</>
            ) : (
              <><Sparkles size={16} /> {activeViewCount > 0 ? `生成${activeViewCount}张产品图` : '选择要生成的内容'}</>
            )}
          </button>
          <p className="text-[10px] text-[#B0B0B0] text-center leading-relaxed px-2">
            产出的图片为 4K 超高清画质，生成速度会稍慢，请耐心等待
          </p>
        </div>

        {/* Right content area */}
        <div className="flex-1 overflow-y-auto bg-white p-8">
          {/* Empty state */}
          {!hasAnyResult && !isGenerating && !analysis && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="relative mb-8">
                <div className="w-28 h-28 bg-gradient-to-br from-blue-50 via-purple-50 to-amber-50 rounded-3xl flex items-center justify-center shadow-lg shadow-blue-100/50">
                  <Sparkles size={44} className="text-[#171717]/70" />
                </div>
                <div className="absolute -top-1 -right-1 w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-400 rounded-xl flex items-center justify-center shadow-md animate-pulse">
                  <Sparkles size={14} className="text-white" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-[#171717] mb-2">产品展示图</h2>
              <p className="text-sm text-[#A3A3A3] max-w-sm leading-relaxed mb-6">
                上传产品图片，选择要生成的展示图类型，AI 自动分析产品特征后生成专业级产品展示图
              </p>
              <div className="grid grid-cols-2 gap-3 max-w-sm w-full">
                {[
                  { label: '标准六宫格', desc: '6 种不同角度的专业展示' },
                  { label: '九宫格细节', desc: '9 处核心细节的特写展示' },
                ].map((item, i) => (
                  <div key={i} className="bg-gradient-to-b from-[#F8F8F8] to-[#F0F0F0] rounded-xl py-3.5 px-3 text-center border border-[#E8E8E8]">
                    <p className="text-sm font-semibold text-[#171717] mb-0.5">{item.label}</p>
                    <p className="text-[10px] text-[#A3A3A3]">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analysis report */}
          {analysis && (
            <div className="mb-6 bg-gradient-to-br from-[#F8FAFB] to-[#F0F4F8] border border-[#E0E8F0] rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center shadow-sm">
                  <FileText size={13} className="text-white" />
                </div>
                <span className="text-sm font-semibold text-[#171717]">产品分析报告</span>
              </div>
              <div className="bg-white/80 rounded-xl p-4 border border-[#E8ECF0]">
                <p className="text-xs text-[#525252] leading-relaxed whitespace-pre-wrap">{analysis}</p>
              </div>
            </div>
          )}

          {/* Full-page loading state (analysis phase or initial generation) */}
          {isGenerating && !hasAnyResult && (
            <div className="flex flex-col items-center justify-center h-full">
              <LoadingAnimation
                title={PHASE_LABELS[phase] || '处理中'}
                description={progress}
                variant="featured"
              />
            </div>
          )}

          {/* Results area */}
          {(hasAnyResult || (isGenerating && VIEW_CONFIGS.some(v => enabledViews[v.key]))) && (
            <div className="space-y-8">
              {/* All done header */}
              {hasAllResults && (
                <div className="flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200/50 rounded-2xl px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-sm">
                      <Check size={16} className="text-white" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-[#171717]">全部生成完成</h2>
                      <p className="text-[11px] text-green-600">图片已就绪，可以下载或预览</p>
                    </div>
                  </div>
                  <button
                    onClick={handleDownloadAll}
                    className="flex items-center gap-1.5 text-sm text-white px-4 py-2 bg-gradient-to-r from-[#171717] to-[#333333] rounded-xl hover:from-[#27272A] hover:to-[#404040] transition-all shadow-sm"
                  >
                    <Download size={14} /> 下载全部
                  </button>
                </div>
              )}

              {/* Per-view sections */}
              {VIEW_CONFIGS.filter(v => enabledViews[v.key]).map(config => {
                const url = results[config.key];
                const isLoading = isGenerating && !url;

                if (!url && !isLoading) return null;

                return (
                  <div key={config.key}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-[#171717]">
                          {config.label}
                        </h2>
                        <span className="text-[11px] text-[#9CA3AF] bg-[#F5F5F5] px-2 py-0.5 rounded-md font-medium">{config.aspectRatio}</span>
                      </div>
                      {url && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPreviewImage(url)}
                            className="flex items-center gap-1.5 text-sm text-[#737373] hover:text-[#171717] px-4 py-2 bg-[#F5F5F5] rounded-xl hover:bg-[#E5E5E5] transition-all"
                          >
                            <Eye size={14} /> 预览
                          </button>
                          <button
                            onClick={() => handleDownload(url)}
                            className="flex items-center gap-1.5 text-sm text-white px-4 py-2 bg-[#171717] rounded-xl hover:bg-[#27272A] transition-all shadow-sm"
                          >
                            <Download size={14} /> 下载
                          </button>
                        </div>
                      )}
                    </div>

                    {url ? (
                      <div className="rounded-2xl overflow-hidden border border-[#E0E0E0] bg-[#FAFBFC] shadow-sm hover:shadow-md transition-all group relative">
                        <img
                          src={url}
                          alt={`${config.label}生成结果`}
                          className="w-full cursor-pointer"
                          loading="lazy"
                          onClick={() => setPreviewImage(url)}
                        />
                        {/* Hover overlay with quick actions */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={(e) => { e.stopPropagation(); setPreviewImage(url); }}
                            className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-all flex items-center justify-center"
                            title="预览"
                          >
                            <Eye size={16} className="text-white" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownload(url); }}
                            className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-all flex items-center justify-center"
                            title="下载"
                          >
                            <Download size={16} className="text-white" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Skeleton placeholder during generation */
                      <div className="rounded-2xl border-2 border-dashed border-[#D1D5DB] bg-gradient-to-b from-[#FAFAFA] to-[#F5F5F5] flex flex-col items-center justify-center gap-3 py-20 mb-6">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-full border-[3px] border-[#E5E5E5] border-t-[#171717] animate-spin" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium text-[#737373]">{config.label} 生成中...</p>
                          <p className="text-xs text-[#B0B0B0] mt-1">AI 正在渲染，请耐心等待</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Preview modal */}
      {previewImage && <ImagePreviewModal isOpen onClose={() => setPreviewImage(null)} imageUrl={previewImage} />}

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          visible
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

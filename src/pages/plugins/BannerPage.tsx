import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Loader2, Layout, Wand2 } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { analyzeMultipleImages } from '../../services/aiChatService';
import { requireAuth } from '../../utils/authCheck';
import { createConcurrencyLimit } from '../../utils/concurrency';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import { LoadingAnimation } from '../../components/LoadingAnimation';
import { EcommerceImageUpload, EcommerceSettings, EcommerceResults } from '../../components/ecommerce';
import type { Language, AspectRatio } from '../../components/ecommerce';
import { LANGUAGES, getSavedLanguage, saveLanguage } from '../../constants/languages';

const ASPECT_RATIOS: AspectRatio[] = [
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '3:4', label: '3:4' },
  { value: '21:9', label: '21:9' },
];

const BANNER_ANALYSIS_PROMPT = '你是一位资深的电商Banner视觉设计师。分析产品图片，为首页轮播Banner设计一套配图方案。\n\n每张Banner需要：\n1. "title": Banner大标题（吸引眼球的核心卖点）\n2. "desc": Banner配图详细描述（构图、场景、光线、风格、调性等）\n3. "subtitle": 副标题或补充文案（简洁的一句话）\n\n## 输出格式 - STRICT JSON array:\n[{"title":"主标题","desc":"详细配图描述","subtitle":"副标题文案"},...]\n\n## 设计原则\n- 生成 {count} 张Banner，覆盖不同展示角度\n- 第一张为品牌大促/首屏主图，中间从功能卖点/使用场景/细节工艺等切入，最后一张为购买引导\n- 每张Banner的标题和文案必须**有差异化**，不要重复相同的句式\n- **即使提供了文案参考，也要创造性扩展**：不要照搬用户提供的文案，而是以用户文案为灵感，生成全新有吸引力的Banner标题和副标题\n- 不同Banner之间的文案角度各异：促销感、品质感、场景感、紧迫感等轮换使用\n- 标题醒目、视觉冲击力强\n- 适合首页Banner轮播，文案风格电商化';

const DEEP_ANALYSIS_PROMPT = `你是一位专业电商产品分析师。仔细分析所有上传的参考图，从多个维度进行全面深度分析。

请从以下所有维度进行分析，返回JSON对象：
{
  "title": "产品名称（简短有力的标题）",
  "description": "产品外观与设计、材质、功能特性描述",
  "brand": "品牌名（从图片中识别，如无则空字符串）",
  "category": "产品品类",
  "specs": "规格参数（尺寸、容量、重量等关键参数）",
  "sellingPoints": "核心卖点（3-5个，逗号分隔）",
  "targetAudience": "目标人群描述"
}

要求：仅输出JSON对象，不要额外文字`;

interface BannerCard {
  title: string;
  desc: string;
  subtitle: string;
  refImageIndices?: number[];
}

export const BannerPage: React.FC = () => {
  const [productImages, setProductImages] = useState<{ file: File; preview: string }[]>([]);
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerSubtitle, setBannerSubtitle] = useState('');
  const [bannerDescription, setBannerDescription] = useState('');
  const [copyText, setCopyText] = useState('');
  const [bannerCount, setBannerCount] = useState(1);
  const [language, setLanguage] = useState(getSavedLanguage());
  const [selectedRatios, setSelectedRatios] = useState<string[]>(['9:16']);
  const [selectedModel, setSelectedModel] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [quality, setQuality] = useState('2K');
  const [progress, setProgress] = useState('');
  const [analysisResult, setAnalysisResult] = useState<BannerCard[]>([]);
  const [results, setResults] = useState<{ url: string; idx: number; ratio?: string }[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);
  const deepAnalysisRef = useRef('');

  const handleRatioToggle = (value: string) => {
    setSelectedRatios(prev => {
      if (prev.length === 1 && prev.includes(value)) return prev;
      return prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value];
    });
  };

  const handleAnalyze = async () => {
    if (!requireAuth()) return;
    if (productImages.length === 0) { alert('请上传产品图片'); return; }
    setAnalyzing(true);
    setAnalysisResult([]);
    setResults([]);
    setProgress('AI正在深度分析产品...');
    try {
      const b64s = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1200)));
      const langLabel = LANGUAGES.find(l => l.value === language)?.label || '中文';

      setProgress('AI正在识别每张图片展示的产品部位...');
      const identifyPrompt = `分析所有上传的图片，对每张图片用一句话（10字以内）说明这张图展示的是产品的哪个部分或角度。
返回JSON数组，顺序与图片顺序一致。
示例：["产品正面","产品背面","接口特写","侧面按键","包装正面"]
仅输出JSON数组，不要其他文字。`;
      const identifyRaw = await analyzeMultipleImages(b64s, identifyPrompt, { model: 'gemini-3.5-flash', maxTokens: 1000 });
      let imageLabels: string[] = [];
      try {
        const parsed = JSON.parse(identifyRaw.match(/\[[\s\S]*\]/)?.[0] || '[]');
        if (Array.isArray(parsed) && parsed.length === b64s.length) imageLabels = parsed;
      } catch {}
      if (imageLabels.length === 0) imageLabels = b64s.map((_, i) => `产品图 ${i + 1}`);
      const imageDesc = imageLabels.map((label, i) => `图${i + 1}：${label}`).join('\n');

      let finalTitle = bannerTitle;
      let finalSubtitle = bannerSubtitle;
      let finalDesc = bannerDescription;
      let analysisContext = '';
      setProgress('AI正在分析产品图片...');
      const raw = await analyzeMultipleImages(b64s, DEEP_ANALYSIS_PROMPT, { model: 'gemini-3.5-flash', maxTokens: 4000 });
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
        if (!finalTitle.trim() && parsed.title) { setBannerTitle(parsed.title); finalTitle = parsed.title; }
        if (!finalDesc.trim() && parsed.description) { setBannerDescription(parsed.description); finalDesc = parsed.description; }
        analysisContext = `\n## AI深度分析产品信息\n品牌：${parsed.brand || ''}\n品类：${parsed.category || ''}\n规格：${parsed.specs || ''}\n卖点：${parsed.sellingPoints || ''}\n目标人群：${parsed.targetAudience || ''}`;
        deepAnalysisRef.current = analysisContext;
      }

      setProgress('AI正在规划Banner展示方案...');
      const promptText = BANNER_ANALYSIS_PROMPT.replace('{count}', String(bannerCount));
      const userContent = `${promptText}\n\n=====\n\nBanner标题：${finalTitle}\n${finalSubtitle ? `副标题：${finalSubtitle}` : ''}\n产品描述：${finalDesc || ''}${analysisContext}\n文案参考：${copyText || '（AI自主创意）'}\n目标语言：${langLabel}\n图片比例：${selectedRatios.join(' / ')}\n\n## 上传图片清单\n${imageDesc}\n\n重要：每张Banner必须指定使用哪张参考图。在输出中为每个对象添加 "refImageIndices" 字段，表示该Banner需要参考哪些上传的图片（数组中的数字对应上文图1、图2...的索引，从0开始）。例如某张Banner需要参考第1张和第3张图，则写 "refImageIndices": [0, 2]。\n\n请分析以上产品图片，输出JSON格式的Banner方案。每张Banner的标题和描述要有差异化、不能重复。所有文案使用目标语言。`;
      const raw2 = await analyzeMultipleImages(b64s, userContent, { model: 'gemini-3.5-flash', maxTokens: 8000 });
      const jsonMatch2 = raw2.match(/\[[\s\S]*\]/);
      if (!jsonMatch2) throw new Error('AI返回格式异常，请重试');
      const parsed = JSON.parse(jsonMatch2[0]) as BannerCard[];
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('AI未能生成有效的方案，请重试');
      setAnalysisResult(parsed);
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
    if (productImages.length === 0) return;
    setIsProcessing(true);
    try {
      const urls = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1536)));
      const cards = analysisResult.length > 0 ? analysisResult : Array.from({ length: bannerCount }, (_, i) => ({ title: `Banner ${i + 1}`, desc: `首页Banner展示图${i + 1}`, subtitle: '' }));
      const flatTasks = cards.flatMap(card => selectedRatios.map(ratio => ({ card, ratio })));
      const totalCount = flatTasks.length;
      setProgress(`生成中 (0/${totalCount})...`);
      let doneCount = 0;
      const limit = createConcurrencyLimit(3);
      await Promise.all(flatTasks.map(({ card, ratio }, flatIdx) => limit(async () => {
        const langLabel = LANGUAGES.find(l => l.value === language)?.label || '中文';
        const prompt = `电商首页Banner轮播图，第${flatIdx + 1}张\n比例：${ratio}\n语言：${langLabel}\n\n主标题：${card.title}\n${card.subtitle ? `副标题：${card.subtitle}` : ''}\n配图描述：${card.desc}\n${copyText ? `文案参考：${copyText}` : ''}\n\n产品信息：\nBanner标题：${bannerTitle}\n${bannerSubtitle ? `Banner副标题：${bannerSubtitle}` : ''}\n产品描述：${bannerDescription || ''}${deepAnalysisRef.current}\n\n要求：\n- 电商首屏Banner设计，视觉冲击力强\n- 图文排版合理，主次分明\n- 产品在画面中突出，色彩搭配协调\n- 大标题文字清晰可读，排版高端\n- 不同Banner之间的文案各有特色、互不重复\n\n## 人物真实感要求（最高优先级，如画面中有人物则必须遵守）\n- 模特必须使用欧美/西方面孔（高鼻梁、深眼窝、自然肤色），年龄20-35岁\n- 皮肤必须有真实纹理和毛孔，允许自然的雀斑、细纹等小瑕疵，禁止过度磨皮、塑料感\n- 表情是抓拍般的自然瞬间，禁止僵硬摆拍\n- 光线用自然环境光（窗边散射光/阴天柔光），禁止刻意的黄金时刻暖光、逆光光晕、过曝高光\n- 手指数量正确（5根），关节和指甲自然\n- 附加关键词：photorealistic, shot on Sony A7R IV, 85mm f/1.8 lens, natural window light, soft shadows, no lens flare, no golden hour, real skin texture, pores visible, editorial photography`;
        try {
          const refIndices = card.refImageIndices?.filter(idx => idx >= 0 && idx < urls.length) || [];
          const images = refIndices.length > 0 ? refIndices.map(idx => urls[idx]) : urls;
          const resp = await editImage({ prompt, images, aspectRatio: ratio, resolution: quality, model: selectedModel, type: 'edited' });
          if (resp.data?.[0]?.url) {
            setResults(prev => [{ url: resp.data[0].url, idx: flatIdx + 1, ratio }, ...prev]);
            imageLibraryService.saveToLibrary({ image_url: resp.data[0].url, prompt, model: String(selectedModel || 'nanobann2'), aspect_ratio: String(ratio), resolution: String(quality || '2K'), type: 'edited' });
          }
        } catch {}
        doneCount++;
        setProgress(`生成中 (${doneCount}/${totalCount})...`);
      })));
    } catch (err: any) { console.error('生成失败:', err); }
    finally { setIsProcessing(false); setProgress(''); }
  };

  const handleDownload = async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `banner-${Date.now()}.png`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
  };

  const handleNewAnalysis = () => { setAnalysisResult([]); setResults([]); };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-gray-200 flex-shrink-0 bg-gray-50">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center"><Layout size={16} className="text-white" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[#171717]">Banner设计</h1>
          <p className="text-[10px] text-gray-400 leading-tight">AI分析产品 → 生成差异化Banner轮播方案 + 多比例适配</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[380px] border-r border-gray-200 overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-gray-50">
          {/* 产品图片 */}
          <EcommerceImageUpload
            images={productImages}
            onImagesChange={setProductImages}
            title="产品图片"
            subtitle="所有图片作为参考图传入"
          />

          {/* Banner标题 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">Banner标题 <span className="text-red-500">*</span></span>
            </div>
            <textarea value={bannerTitle} onChange={e => { setBannerTitle(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder="例如：夏日冰爽·整箱特惠"
              className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder:text-gray-400 resize-none overflow-hidden" rows={1}
              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
          </div>

          {/* 副标题 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">副标题（可选）</span>
            </div>
            <textarea value={bannerSubtitle} onChange={e => { setBannerSubtitle(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder="例如：限时7折 满199包邮"
              className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder:text-gray-400 resize-none overflow-hidden" rows={1}
              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
          </div>

          {/* 产品描述 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">产品描述（可选）</span>
            </div>
            <textarea value={bannerDescription} onChange={e => { setBannerDescription(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder="产品外观、材质、卖点、适用场景..."
              className="w-full bg-[#F5F5F5] rounded-xl p-3 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none text-[#333333] placeholder:text-gray-400 overflow-hidden" rows={1}
              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
          </div>

          {/* 文案参考 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">文案参考（可选）</span>
            </div>
            <textarea value={copyText} onChange={e => { setCopyText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder="核心卖点、促销信息、品牌标语..."
              className="w-full bg-[#F5F5F5] rounded-xl p-3 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none text-[#333333] placeholder:text-gray-400 overflow-hidden" rows={1}
              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
          </div>

          {/* 设置 */}
          <EcommerceSettings
            language={language}
            onLanguageChange={(lang) => { setLanguage(lang); saveLanguage(lang); }}
            languages={LANGUAGES}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            quality={quality}
            onQualityChange={setQuality}
            aspectRatios={ASPECT_RATIOS}
            selectedRatios={selectedRatios}
            onRatioToggle={handleRatioToggle}
            batchCount={bannerCount}
            onBatchCountChange={setBannerCount}
            showBatchCount={true}
            batchLabel="生成张数"
          />

          {/* 操作按钮 */}
          {!analysisResult.length && (
            <button onClick={handleAnalyze} disabled={productImages.length === 0 || analyzing}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-gray-200 disabled:text-gray-400 shadow-sm">
              {analyzing ? <><Loader2 size={18} className="animate-spin" /> AI分析中...</> : <><Sparkles size={18} /> AI分析并规划Banner方案</>}
            </button>
          )}
          {analysisResult.length > 0 && (
            <button onClick={handleNewAnalysis}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all shadow-sm">
              <Sparkles size={18} /> 重新分析
            </button>
          )}
          {analysisResult.length > 0 && !isProcessing && (
            <button onClick={handleGenerate}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all shadow-sm">
              <Wand2 size={18} /> 生成Banner图 ({analysisResult.length * selectedRatios.length}张)
            </button>
          )}
        </div>

        {/* 右侧结果 */}
        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
          {!analysisResult.length && results.length === 0 && !isProcessing ? (
            <EcommerceResults
              results={[]}
              onPreview={() => {}}
              onDownload={() => {}}
              emptyTitle="Banner设计"
              emptyDescription="上传产品图 → AI分析方案 → 确认后生成差异化Banner轮播图"
            />
          ) : (
            <div className="p-6 space-y-6">
              {/* 分析中 */}
              {analyzing && results.length === 0 && (
                <LoadingAnimation
                  title="AI正在分析产品"
                  description={progress || '正在分析产品并规划Banner方案...'}
                  thumbnails={productImages.map(item => item.preview)}
                  variant="featured"
                />
              )}
              {/* 生成中 */}
              {isProcessing && results.length === 0 && (
                <LoadingAnimation
                  title="正在生成Banner"
                  description={progress || 'AI视觉引擎全力运行中...'}
                  variant="featured"
                />
              )}
              {/* Banner方案 */}
              {analysisResult.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-[#171717] mb-4">Banner方案 ({analysisResult.length}张)</h2>
                  <div className="grid grid-cols-1 gap-4">
                    {analysisResult.map((card, idx) => (
                      <div key={idx} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-6 h-6 bg-[#171717] text-white rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0">{idx + 1}</span>
                            <span className="text-xs font-medium text-gray-400">Banner #{idx + 1}</span>
                          </div>
                          <div className="space-y-2">
                            <textarea value={card.title} onChange={e => {
                              const next = [...analysisResult];
                              next[idx] = { ...next[idx], title: e.target.value };
                              setAnalysisResult(next);
                              e.target.style.height = 'auto';
                              e.target.style.height = e.target.scrollHeight + 'px';
                            }} placeholder="Banner标题"
                              className="w-full bg-white px-3 py-2 rounded-xl text-sm font-semibold text-[#171717] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 placeholder:text-gray-400 resize-none overflow-hidden"
                              rows={1} />
                            <textarea value={card.subtitle} onChange={e => {
                              const next = [...analysisResult];
                              next[idx] = { ...next[idx], subtitle: e.target.value };
                              setAnalysisResult(next);
                              e.target.style.height = 'auto';
                              e.target.style.height = e.target.scrollHeight + 'px';
                            }} placeholder="副标题（可选）"
                              className="w-full bg-white px-3 py-2 rounded-xl text-xs text-gray-600 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 placeholder:text-gray-400 resize-none overflow-hidden"
                              rows={1} />
                            <textarea value={card.desc} onChange={e => {
                              const next = [...analysisResult];
                              next[idx] = { ...next[idx], desc: e.target.value };
                              setAnalysisResult(next);
                              e.target.style.height = 'auto';
                              e.target.style.height = e.target.scrollHeight + 'px';
                            }} placeholder="配图描述"
                              className="w-full bg-white rounded-xl p-3 text-sm text-gray-600 leading-relaxed border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none overflow-hidden placeholder:text-gray-400"
                              rows={3} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* 生成结果 */}
              {results.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-[#171717]">已生成 ({results.length})</h2>
                    {isProcessing && (
                      <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-1.5">
                        <Loader2 size={12} className="animate-spin" />
                        {progress}
                      </div>
                    )}
                  </div>
                  <EcommerceResults
                    results={results.sort((a, b) => a.idx - b.idx).map(item => ({ url: item.url, label: `Banner #${item.idx}${item.ratio ? ` ${item.ratio}` : ''}` }))}
                    onPreview={setPreviewImage}
                    onReEdit={setReEditImage}
                    onDownload={handleDownload}
                  />
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
        aspectRatio={selectedRatios[0]}
        model={selectedModel}
        resolution={quality}
        onClose={() => setReEditImage(null)}
        onReplaced={(oldUrl, newUrl) => { setResults(prev => prev.map(item => item.url === oldUrl ? { ...item, url: newUrl } : item)); }}
      />
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, ShoppingCart, Images, Globe, Download, Copy, Check, Layout, Wand2, ChevronDown } from 'lucide-react';
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
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'ru', label: 'Русский' },
  { value: 'th', label: 'ไทย' },
  { value: 'ms', label: 'Bahasa Melayu' },
  { value: 'vi', label: 'Tiếng Việt' },
];

const CAROUSEL_ANALYSIS_PROMPT = '你是一位独立站产品详情页设计师。分析产品图片，为独立站详情页轮播图规划一组产品介绍图。\n\n每张图需要：\n1. "title": 这张图展示的内容标题（如"产品正面全景"、"材质细节特写"、"核心功能展示"、"使用场景"、"尺寸对比"、"配件清单"）\n2. "desc": 这张图要展示的内容描述（强调：展示产品的哪个方面、画面中要突出的产品特征、需要标注的卖点文案等）\n\n## 输出格式 - STRICT JSON array:\n[{"title":"展示标题","desc":"内容描述"},...]\n\n## 原则\n- 根据产品特征，自行判断最适合的轮播图数量（通常是5-8张），覆盖足够全面的展示维度\n- 每张围绕**产品本身**的一个方面进行介绍\n- 这是独立站详情页的**产品轮播图**，不是场景摄影，而是对产品全方位的详细介绍\n- 覆盖维度包括：产品整体展示、材质/工艺细节、功能卖点图解、尺寸/规格说明、使用方式/场景、配件/包装、对比/差异化优势\n- 每张图标题和内容差异化，互不重复\n- 风格：产品主图风格，白底或简约背景，产品清晰居中，{ratio}比例\n- 画面上的文案突出该张图的核心卖点';

const DEEP_ANALYSIS_PROMPT = `你是一位专业电商产品分析师。仔细分析所有上传的参考图，进行全面深度分析。

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

interface Card {
  title: string;
  desc: string;
}

export const CarouselPage: React.FC = () => {
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
  const [bannerCount, setBannerCount] = useState(0); // 0 = 智能
  const [language, setLanguage] = useState('en');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [selectedModel, setSelectedModel] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [quality, setQuality] = useState('2K');
  const [progress, setProgress] = useState('');
  const [analysisResult, setAnalysisResult] = useState<Card[]>([]);
  const [results, setResults] = useState<{ url: string; title: string }[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
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
    setProgress('AI正在深度分析产品...');
    try {
      const b64s = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1200)));
      const langLabel = LANGUAGES.find(l => l.value === language)?.label || 'English';

      // 深度分析（始终执行）
      let finalTitle = productTitle;
      let finalDesc = customDescription;
      let analysisContext = '';
      setProgress('AI正在分析产品图片，生成产品描述...');
      const raw = await analyzeMultipleImages(b64s, DEEP_ANALYSIS_PROMPT, { model: 'gemini-3.5-flash', maxTokens: 4000 });
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
        if (!finalTitle.trim() && parsed.title) { setProductTitle(parsed.title); finalTitle = parsed.title; }
        if (!finalDesc.trim() && parsed.description) { setCustomDescription(parsed.description); finalDesc = parsed.description; }
        analysisContext = `\n## AI深度分析产品信息\n品牌：${parsed.brand || ''}\n品类：${parsed.category || ''}\n规格：${parsed.specs || ''}\n卖点：${parsed.sellingPoints || ''}\n目标人群：${parsed.targetAudience || ''}`;
      }

      // 第二步：规划详情图方案
      setProgress('AI正在规划详情图展示方案...');
      const countDesc = bannerCount > 0 ? `生成 ${bannerCount} 张图` : '根据产品特征自行决定最适合的轮播图数量（通常5-8张）';
      const promptText = CAROUSEL_ANALYSIS_PROMPT.replace('{ratio}', aspectRatio);
      const userContent = `${promptText}\n\n=====\n\n产品：${finalTitle}\n描述：${finalDesc || ''}${analysisContext}\n目标语言：${langLabel}\n\n${countDesc}\n请分析以上产品图片，输出JSON格式的详情图方案。每张图的标题和描述要差异化、不重复。使用目标语言。`;
      const raw2 = await analyzeMultipleImages(b64s, userContent, { model: 'gemini-3.5-flash', maxTokens: 8000 });
      const jsonMatch2 = raw2.match(/\[[\s\S]*\]/);
      if (!jsonMatch2) throw new Error('AI返回格式异常');
      const cards = JSON.parse(jsonMatch2[0]) as Card[];
      if (!Array.isArray(cards) || cards.length === 0) throw new Error('AI未能生成有效方案');

      setAnalyzing(false);
      setIsGenerating(true);
      setProgress('');

      const urls = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1536)));
      imageLibraryService.clearSavedUrlsCache();
      const errors: string[] = [];
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        setProgress(`生成中 (${i + 1}/${cards.length})...`);
        const prompt = `独立站详情页轮播图 第${i + 1}张\n展示内容：${card.title}\n内容描述：${card.desc}\n产品：${finalTitle}\n描述：${finalDesc || ''}${analysisContext}\n语言：${langLabel}\n\n要求：\n- 产品的造型、颜色、材质等视觉特征必须与参考图一致，产品原图上已有的文字/标志/标签保持原样\n- 每张图的电商文案必须独特、有创意，与"${card.title}"呼应，不同轮播图之间各有侧重互不重复\n- 产品主图风格，白底或简约背景，产品清晰居中展示\n- ${aspectRatio} 比例\n- 画面新增文案使用目标语言，突出该张图核心卖点`;
        try {
          const resp = await editImage({ prompt, images: urls, aspectRatio, resolution: quality, model: selectedModel });
          if (resp.data?.[0]?.url) {
            imageLibraryService.saveToLibrary({ image_url: resp.data[0].url, prompt: `${finalTitle} - ${card.title}`, model: selectedModel, aspect_ratio: aspectRatio, resolution: quality, type: 'generated' });
            setResults(prev => [{ url: resp.data[0].url, title: card.title }, ...prev]);
          } else {
            errors.push(`第${i + 1}张「${card.title}」未返回图片`);
          }
        } catch (err: any) {
          errors.push(`第${i + 1}张「${card.title}」${err.message || '生成失败'}`);
        }
      }
      if (errors.length > 0) {
        console.warn('轮播图生成部分失败:', errors);
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
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `carousel-${Date.now()}.png`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleNewAnalysis = () => { setAnalysisResult([]); setResults([]); };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-gray-200 flex-shrink-0 bg-gray-50">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center"><ShoppingCart size={16} className="text-white" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[#171717]">独立站轮播图</h1>
          <p className="text-[10px] text-gray-400 leading-tight">独立站详情页轮播图，多角度展示、细节、卖点介绍</p>
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

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <ShoppingCart size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">产品标题 <span className="text-red-500">*</span></span>
            </div>
            <input value={productTitle} onChange={e => setProductTitle(e.target.value)} placeholder="例如：无线蓝牙耳机、智能手表"
              className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-2xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder:text-gray-400" />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">描述（可选）</span>
            </div>
            <textarea value={customDescription} onChange={e => { setCustomDescription(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder="卖点、风格要求等"
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

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Layout size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">比例</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {['1:1', '3:4'].map(r => (
                <button key={r} onClick={() => setAspectRatio(r)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${aspectRatio === r ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{r}</button>
              ))}
            </div>
          </div>

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

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Images size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">生成数量</span>
            </div>
            <select value={bannerCount} onChange={e => setBannerCount(Number(e.target.value))}
              className="w-full bg-gray-100 px-3 py-2.5 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer">
              <option value={0}>智能（AI根据产品决定）</option>
              <option value={3}>3张</option>
              <option value={5}>5张</option>
              <option value={6}>6张</option>
              <option value={7}>7张</option>
              <option value={8}>8张</option>
              <option value={10}>10张</option>
            </select>
          </div>

          {!analyzing && !isGenerating && (
            <button onClick={handleAnalyzeAndGenerate} disabled={productImages.length === 0}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-gray-200 disabled:text-gray-400 shadow-sm">
              <Sparkles size={18} /> AI分析并生成轮播图
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
                <h2 className="text-lg font-semibold text-[#171717] mb-2">独立站轮播图</h2>
                <p className="text-sm text-gray-400 leading-relaxed">上传产品图 → 一键生成独立站详情页轮播图</p>
              </div>
            </div>
          ) : (
            <div className="p-6">
              {/* 分析中的进度指示 */}
              {analyzing && results.length === 0 && (
                <LoadingAnimation
                  title="AI 正在分析产品"
                  description={progress || '分析产品并规划轮播图方案...'}
                  progress={progress || undefined}
                />
              )}
              {/* 生成中的进度指示（还没有结果时） */}
              {isGenerating && !analyzing && results.length === 0 && (
                <LoadingAnimation
                  title="正在生成轮播图"
                  description={progress || '正在生成...'}
                  progress={progress || undefined}
                  showProgressBar
                />
              )}
              {/* 生成结果 - 出图即显示 */}
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
                          <div className="flex gap-1">
                            <button onClick={(e) => { e.stopPropagation(); setReEditImage(item.url); }} className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#171717]"><Wand2 size={14} /></button>
                            <button onClick={() => handleDownload(item.url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#171717]"><Download size={14} /></button>
                            <PsdExportButton imageUrl={item.url} />
                          </div>
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

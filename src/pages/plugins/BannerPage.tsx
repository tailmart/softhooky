import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, Layout, Images, Globe, Wand2, Download, Copy, Check, ChevronDown } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { analyzeMultipleImages } from '../../services/aiChatService';
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

const ASPECT_RATIOS = [
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
}

export const BannerPage: React.FC = () => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getAvailableModels(['seedream']).then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) setSelectedModel('gpt-image-2');
    });
  }, []);
  const [productImages, setProductImages] = useState<{ file: File; preview: string }[]>([]);
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerSubtitle, setBannerSubtitle] = useState('');
  const [bannerDescription, setBannerDescription] = useState('');
  const [copyText, setCopyText] = useState('');
  const [bannerCount, setBannerCount] = useState(1);
  const [language, setLanguage] = useState('zh');
  const [selectedRatios, setSelectedRatios] = useState<string[]>(['9:16']);
  const [selectedModel, setSelectedModel] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [quality, setQuality] = useState('2K');
  const [progress, setProgress] = useState('');
  const [analysisResult, setAnalysisResult] = useState<BannerCard[]>([]);
  const [results, setResults] = useState<{ url: string; idx: number; ratio?: string }[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);
  const deepAnalysisRef = useRef('');
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

      // 深度分析（始终执行）
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

      // 第二步：规划Banner方案
      setProgress('AI正在规划Banner展示方案...');
      const promptText = BANNER_ANALYSIS_PROMPT.replace('{count}', String(bannerCount));
      const userContent = `${promptText}\n\n=====\n\nBanner标题：${finalTitle}\n${finalSubtitle ? `副标题：${finalSubtitle}` : ''}\n产品描述：${finalDesc || ''}${analysisContext}\n文案参考：${copyText || '（AI自主创意）'}\n目标语言：${langLabel}\n图片比例：${selectedRatios.join(' / ')}\n\n请分析以上产品图片，输出JSON格式的Banner方案。每张Banner的标题和描述要有差异化、不能重复。所有文案使用目标语言。`;
      const raw2 = await analyzeMultipleImages(b64s, userContent, { model: 'gemini-3.5-flash', maxTokens: 8000});
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
      // 展平：每张卡 × 每个比例 → [{card, ratio}, ...]
      const flatTasks = cards.flatMap(card => selectedRatios.map(ratio => ({ card, ratio })));
      const totalCount = flatTasks.length;
      setProgress(`生成中 (0/${totalCount})...`);
      let doneCount = 0;
      await Promise.all(flatTasks.map(async ({ card, ratio }, flatIdx) => {
        const langLabel = LANGUAGES.find(l => l.value === language)?.label || '中文';
        const prompt = `电商首页Banner轮播图，第${flatIdx + 1}张\n比例：${ratio}\n语言：${langLabel}\n\n主标题：${card.title}\n${card.subtitle ? `副标题：${card.subtitle}` : ''}\n配图描述：${card.desc}\n${copyText ? `文案参考：${copyText}` : ''}\n\n产品信息：\nBanner标题：${bannerTitle}\n${bannerSubtitle ? `Banner副标题：${bannerSubtitle}` : ''}\n产品描述：${bannerDescription || ''}${deepAnalysisRef.current}\n\n要求：\n- 电商首屏Banner设计，视觉冲击力强\n- 图文排版合理，主次分明\n- 产品在画面中突出，色彩搭配协调\n- 大标题文字清晰可读，排版高端\n- 不同Banner之间的文案各有特色、互不重复`;
        try {
          const resp = await editImage({ prompt, images: urls, aspectRatio: ratio, resolution: quality, model: selectedModel });
          if (resp.data?.[0]?.url) setResults(prev => [{ url: resp.data[0].url, idx: flatIdx + 1, ratio }, ...prev]);
        } catch {}
        doneCount++;
        setProgress(`生成中 (${doneCount}/${totalCount})...`);
      }));
    } catch (err: any) { console.error('生成失败:', err); }
    finally { setIsProcessing(false); setProgress(''); }
  };

  const handleDownload = async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `banner-${Date.now()}.png`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
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
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center"><Layout size={16} className="text-white" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[#171717]">Banner设计</h1>
          <p className="text-[10px] text-gray-400 leading-tight">AI分析产品 → 生成差异化Banner轮播方案 + 多比例适配</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[380px] border-r border-gray-200 overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-gray-50">
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Images size={16} className="text-blue-500" />
              <div><h3 className="text-sm font-semibold text-[#171717]">产品图片</h3><p className="text-xs text-gray-400">所有图片作为参考图传入</p></div>
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
              <Sparkles size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">Banner标题 <span className="text-red-500">*</span></span>
            </div>
            <textarea value={bannerTitle} onChange={e => { setBannerTitle(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder="例如：夏日冰爽·整箱特惠"
              className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-2xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder:text-gray-400 resize-none overflow-hidden" rows={1}
              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">副标题（可选）</span>
            </div>
            <textarea value={bannerSubtitle} onChange={e => { setBannerSubtitle(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder="例如：限时7折 满199包邮"
              className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-2xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder:text-gray-400 resize-none overflow-hidden" rows={1}
              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">产品描述（可选）</span>
            </div>
            <textarea value={bannerDescription} onChange={e => { setBannerDescription(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder="产品外观、材质、卖点、适用场景..."
              className="w-full bg-[#F5F5F5] rounded-2xl p-3 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none text-[#333333] placeholder:text-gray-400 overflow-hidden" rows={1}
              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">文案参考（可选）</span>
            </div>
            <textarea value={copyText} onChange={e => { setCopyText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder="核心卖点、促销信息、品牌标语..."
              className="w-full bg-[#F5F5F5] rounded-2xl p-3 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none text-[#333333] placeholder:text-gray-400 overflow-hidden" rows={1}
              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Globe size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">语言</span>
            </div>
            <select value={language} onChange={e => setLanguage(e.target.value)}
              className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-2xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 appearance-none cursor-pointer">
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 size={14} className="text-blue-500" />
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
              <span className="text-sm font-semibold text-[#171717]">比例（多选）</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ASPECT_RATIOS.map(r => {
                const sel = selectedRatios.includes(r.value);
                return (<button key={r.value} onClick={() => {
                  if (selectedRatios.length === 1 && sel) return; // 至少选一个
                  setSelectedRatios(prev => sel ? prev.filter(v => v !== r.value) : [...prev, r.value]);
                }}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${sel ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{r.label}</button>);
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Images size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">生成张数</span>
            </div>
            <div className="relative">
              <select value={bannerCount} onChange={e => setBannerCount(Number(e.target.value))}
                className="w-full bg-[#F5F5F5] px-3 py-2.5 pr-8 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 appearance-none cursor-pointer">
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}张</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

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
          {(analyzing || isProcessing) && (
            <div className="text-center text-xs text-gray-400 bg-gray-100 rounded-xl py-3">
              <Loader2 size={14} className="animate-spin inline mr-2" />{progress}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
          {!analysisResult.length && results.length === 0 && !isProcessing ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 mx-auto mb-5 bg-gray-100 rounded-2xl flex items-center justify-center"><Layout size={32} className="text-gray-300" /></div>
                <h2 className="text-lg font-semibold text-[#171717] mb-2">Banner设计</h2>
                <p className="text-sm text-gray-400 leading-relaxed">上传产品图 → AI分析方案 → 确认后生成差异化Banner轮播图</p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
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
              {results.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-[#171717] mb-4">已生成 ({results.length})</h2>
                  <div className="grid grid-cols-2 gap-4">
                    {results.sort((a, b) => a.idx - b.idx).map((item) => (
                      <div key={item.idx} className="group relative bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
                        <div className="cursor-pointer bg-gray-50" onClick={() => setPreviewImage(item.url)}>
                          <img src={item.url} alt="" className="w-full h-64 object-contain" />
                        </div>
                        <div className="p-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-600">Banner #{item.idx}</span>
                            {item.ratio && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-lg">{item.ratio}</span>}
                          </div>
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
        aspectRatio={selectedRatios[0]}
        model={selectedModel}
        resolution={quality}
        onClose={() => setReEditImage(null)}
        onReplaced={(oldUrl, newUrl) => { setResults(prev => prev.map(item => item.url === oldUrl ? {...item, url: newUrl} : item)); }}
      />
    </div>
  );
};

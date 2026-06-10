import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, Share2, Images, Globe, Wand2, Download, ChevronDown } from 'lucide-react';
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

const ASPECT_RATIOS = [
  { value: '1:1', label: '1:1', platform: 'Ins' },
  { value: '9:16', label: '9:16', platform: 'TikTok' },
  { value: '4:5', label: '4:5', platform: 'FB' },
  { value: '2:3', label: '2:3', platform: 'Pinterest' },
];

const SOCIAL_ANALYSIS_PROMPT = `You are a social media marketing expert. Analyze the product images and create a social media campaign plan.

For each image to be generated, provide:
1. "title": A catchy social media post title/headline in target language — this will be used as the social media post copy
2. "description": A detailed image description for AI image generation (include POV style, lighting, composition, mood)
3. "pov": The POV perspective type (choose from: hands using product, overhead arrangement, eye level lifestyle, close-up detail, outdoor scene, flat lay)
4. "ratio": Aspect ratio (choose from: 1:1, 9:16, 4:5, 2:3)

## Output format - STRICT JSON array:
[{"title":"Post title (social media copy)","description":"Full image generation prompt with POV, lighting, composition, mood, setting details","pov":"hands using product","ratio":"1:1"},...]

## Principles
- For each selected ratio, generate images with different POV perspectives
- Each image in the same ratio should have a different POV and composition
- Cover varied perspectives: hands using product, overhead arrangement, eye level lifestyle, close-up detail, outdoor scene, flat lay
- 【CRITICAL】Every image MUST be first-person POV (user's own hands/eyes perspective), NOT third-person or model shooting
- Titles should be engaging, platform-native, and varied (not repetitive) — these ARE the social media post copies
- Descriptions must include: POV perspective, lighting, composition, mood, setting
- Assign varied ratios across the campaign
- First image should be the hero/product spotlight
- All text (titles and descriptions) must be in the target language
- Each image must have a unique POV perspective`;

interface AnalysisCard {
  title: string;
  description: string;
  pov: string;
  ratio: string;
}

interface GenResult {
  url: string;
  title: string;
  ratio: string;
  idx: number;
}

export const SocialMediaPage: React.FC = () => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getAvailableModels(['seedream']).then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) setSelectedModel(sorted[0].model_id);
    });
  }, []);
  const [productImages, setProductImages] = useState<{ file: File; preview: string }[]>([]);
  const [productName, setProductName] = useState('');
  const [productDesc, setProductDesc] = useState('');
  const [language, setLanguage] = useState('en');
  const [selectedRatios, setSelectedRatios] = useState<string[]>(['1:1']);
  const [imageCount, setImageCount] = useState(0); // 0 = AI自动
  const [selectedModel, setSelectedModel] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [quality, setQuality] = useState('2K');
  const [progress, setProgress] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisCard[]>([]);
  const [results, setResults] = useState<GenResult[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);
  const productNameRef = useRef<HTMLTextAreaElement>(null);
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };
  useEffect(() => {
    if (productNameRef.current) autoResize(productNameRef.current);
  }, [productName]);
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

  const toggleRatio = (value: string) => {
    setSelectedRatios(prev =>
      prev.includes(value) ? prev.filter(r => r !== value) : [...prev, value]
    );
  };

  const handleAnalyze = async () => {
    if (!requireAuth()) return;
    if (productImages.length === 0) { alert('请至少上传一张产品图片'); return; }

    setAnalyzing(true);
    setAnalysisResult([]);
    setResults([]);
    setProgress('AI正在深度分析产品...');

    try {
      const b64s = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1200)));
      const langLabel = LANGUAGES.find(l => l.value === language)?.label || 'English';
      const perRatio = imageCount > 0 ? imageCount : 3;
      const total = perRatio * selectedRatios.length;
      const countStr = imageCount > 0
        ? `请生成方案，每个选中比例各${imageCount}张，共${total}张。同一比例内视角不能重复。`
        : '请根据产品特点自由决定，每个比例2-4张。';

      // Step 1: Deep product analysis
      let analysisContext = '';
      setProgress('AI正在分析产品特征...');
      const deepRaw = await analyzeMultipleImages(b64s,
        `分析所有上传的图片中的产品，返回JSON：{"title":"产品名称","brand":"品牌","category":"品类","specs":"规格","sellingPoints":"卖点(逗号分隔)","targetAudience":"目标人群"}。仅输出JSON。`,
        { model: 'gemini-3.5-flash', maxTokens: 2000 }
      );
      const deepMatch = deepRaw.match(/\{[\s\S]*\}/);
      if (deepMatch) {
        const d = JSON.parse(deepMatch[0]) as Record<string, string>;
        if (!productName.trim() && d.title) { setProductName(d.title); }
        if (!productDesc.trim() && d.description) { setProductDesc(d.description); }
        analysisContext = `\n## AI深度分析产品信息\n产品名称：${d.title || productName}\n品牌：${d.brand || ''}\n品类：${d.category || ''}\n规格：${d.specs || ''}\n卖点：${d.sellingPoints || ''}\n目标人群：${d.targetAudience || ''}`;
      }

      // Step 2: Social media plan
      setProgress('AI正在规划社媒宣传方案...');
      const userContent = `${SOCIAL_ANALYSIS_PROMPT}

=====
${analysisContext}
目标语言：${langLabel}
可选比例：${selectedRatios.join(', ')}

${countStr}

请基于以上产品分析结果，输出JSON格式的社媒宣传方案。每个比例的图片视角不同。所有title和description内容请使用目标语言。`;

      const raw = await analyzeMultipleImages(b64s, userContent, {
        model: 'gemini-3.5-flash',
        maxTokens: 8000,
      });

      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('AI返回格式异常，请重试');
      const parsed = JSON.parse(jsonMatch[0]) as AnalysisCard[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('AI未能生成有效的方案，请重试');
      }
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
    if (analysisResult.length === 0) return;
    setIsProcessing(true);
    try {
      const urls = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1536)));
      const total = analysisResult.length;

      setProgress(`生成中 (0/${total})...`);
      let doneCount = 0;
      const allResults: GenResult[] = [];

      const tasks = analysisResult.map(async (card, idx) => {
        const platform = ASPECT_RATIOS.find(r => r.value === card.ratio)?.platform || '';
        const prompt = `Social media promotional image. STRICT first-person POV perspective. Aspect ratio: ${card.ratio} (${platform}).

${card.description}

IMPORTANT:
- The product's shape, color, texture and visual features MUST match the reference image; existing text/logos/labels on original product image remain unchanged
- 【CRITICAL】This image MUST be shot from a TRUE FIRST-PERSON POV — as if the photographer is holding/using the product with their own hands. The viewer sees through the user's eyes.
- NO third-person perspective, NO product on table shot from above, NO model holding product for camera
- Must look like the user took a photo with their phone while using the product
- 【重要】画面中禁止出现任何文字、文案、标语、标签等文字内容
- Authentic user-generated style, NOT commercial product photography, NOT AI-generated look
- If people appear, faces must look like real phone photos — visible skin texture, pores, natural imperfections, no AI plastic face, no over-smoothing
- Natural lighting, candid feel, realistic life场景
- 8K ultra realistic, no watermarks`;

        try {
          const resp = await editImage({ prompt, images: urls, aspectRatio: card.ratio, resolution: quality, model: selectedModel });
          const url = resp.data?.[0]?.url || resp.image_url || resp.url || '';
          if (url) {
            imageLibraryService.saveToLibrary({
              image_url: url,
              prompt: `社媒-${card.title}`,
              model: selectedModel,
              aspect_ratio: card.ratio,
              resolution: quality,
              type: 'generated',
            });
            const item: GenResult = { url, title: card.title, ratio: card.ratio, idx: idx + 1 };
            allResults.push(item);
            setResults(prev => [...prev, item]);
          }
        } catch {}
        doneCount++;
        setProgress(`生成中 (${doneCount}/${total})...`);
      });

      await Promise.all(tasks);
    } catch (err: any) { console.error('生成失败:', err); }
    finally { setIsProcessing(false); setProgress(''); }
  };

  const handleDownload = async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `social-${Date.now()}.png`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
  };

  const handleNewAnalysis = () => {
    setAnalysisResult([]);
    setResults([]);
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-gray-200 flex-shrink-0 bg-gray-50">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center">
          <Share2 size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[#171717]">海外社媒POV出图</h1>
          <p className="text-[10px] text-gray-400 leading-tight">AI分析产品 → 生成第一视角生活场景图 + 适配多平台比例批量出图</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[380px] border-r border-gray-200 overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-gray-50">
          {/* Product Images */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Images size={16} className="text-blue-500" />
              <div><h3 className="text-sm font-semibold text-[#171717]">产品图片</h3><p className="text-xs text-gray-400">AI会通过提供参考图自行选择设计</p></div>
              <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-xl">{productImages.length}/10</span>
            </div>
            {productImages.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mb-3">
                {productImages.map((item, idx) => (
                  <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden bg-gray-100">
                    <img src={item.preview} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeImage(idx)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100"><X size={14} className="text-white" /></button>
                  </div>
                ))}
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleUpload} multiple accept="image/*" className="hidden" />
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA] p-3 flex flex-col items-center justify-center gap-1 hover:border-gray-400 hover:bg-gray-50 transition-all cursor-pointer bg-[#FAFAFA]">
              <Plus size={18} className="text-gray-400" /><span className="text-xs text-gray-400">上传产品图</span>
            </div>
          </div>

          {/* Product Name */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">产品标题</span>
            </div>
            <textarea value={productName} onChange={e => { setProductName(e.target.value); autoResize(e.target); }} placeholder="例如：无线降噪蓝牙耳机"
              className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-2xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder:text-gray-400 resize-none overflow-hidden"
              rows={1} ref={productNameRef} />
          </div>

          {/* Product Description */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">产品描述（可选）</span>
            </div>
            <textarea value={productDesc} onChange={e => { setProductDesc(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder="产品卖点、功能、使用场景..."
              className="w-full bg-[#F5F5F5] rounded-2xl p-3 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none text-[#171717] placeholder:text-gray-400 overflow-hidden" rows={1}
              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
          </div>

          {/* Language */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Globe size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">社媒文案语言</span>
            </div>
            <select value={language} onChange={e => setLanguage(e.target.value)}
              className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-2xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 appearance-none cursor-pointer">
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          {/* Count */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Images size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">生成张数</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[{ v: 0, l: 'AI自动' }, { v: 3, l: '3张' }, { v: 5, l: '5张' }].map(n => (
                <button key={n.v} onClick={() => setImageCount(n.v)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${imageCount === n.v ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{n.l}</button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Images size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">图片比例（可选参考）</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ASPECT_RATIOS.map(r => {
                const selected = selectedRatios.includes(r.value);
                return (
                <button key={r.value} onClick={() => toggleRatio(r.value)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${selected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {r.label}
                  <span className={`block text-[9px] ${selected ? 'text-white/70' : 'text-gray-400'}`}>{r.platform}</span>
                </button>
                );
              })}
            </div>
          </div>

          {/* Model */}
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

          {/* Resolution */}
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

          {/* Analyze Button */}
          {!analysisResult.length && (
            <button onClick={handleAnalyze} disabled={productImages.length === 0 || analyzing}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed shadow-sm">
              {analyzing ? <><Loader2 size={18} className="animate-spin" /> AI分析中...</> : <><Sparkles size={18} /> AI分析并规划社媒方案</>}
            </button>
          )}

          {/* Re-analyze Button */}
          {analysisResult.length > 0 && (
            <button onClick={handleNewAnalysis}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all shadow-sm">
              <Sparkles size={18} /> 重新分析
            </button>
          )}

          {/* Generate Button */}
          {analysisResult.length > 0 && !isProcessing && (
            <button onClick={handleGenerate}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all shadow-sm">
              <Wand2 size={18} /> 生成社媒宣传图 ({analysisResult.length}张)
            </button>
          )}

        </div>

        {/* Results */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {analyzing && !analysisResult.length ? (
            <div className="flex-1 flex items-center justify-center">
              <LoadingAnimation title="AI分析中..." description={progress || '正在分析产品并规划社媒宣传方案...'} />
            </div>
          ) : !analysisResult.length && results.length === 0 && !isProcessing ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 mx-auto mb-5 bg-gray-100 rounded-2xl flex items-center justify-center">
                  <Share2 size={32} className="text-gray-300" />
                </div>
                <h2 className="text-lg font-semibold text-[#171717] mb-2">海外社媒POV出图</h2>
                <p className="text-sm text-gray-400 leading-relaxed">上传产品图 → AI分析 → 多比例批量出图</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Sticky progress bar during generation */}
              {isProcessing && (
                <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm px-6 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <Loader2 size={16} className="animate-spin text-[#171717]" />
                    <span className="text-sm font-medium text-[#171717]">{progress}</span>
                    <span className="text-xs text-gray-400 ml-auto">已生成 {results.length} 张</span>
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Analysis Cards */}
              {analysisResult.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-[#171717] mb-4">AI社媒方案 ({analysisResult.length}张)</h2>
                  <div className="grid grid-cols-1 gap-4">
                    {analysisResult.map((card, idx) => {
                      const gen = results.find(r => r.idx === idx + 1);
                      return (
                        <div key={idx} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="w-6 h-6 bg-[#171717] text-white rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0">{idx + 1}</span>
                              <span className="text-xs font-medium text-gray-400">社媒文案</span>
                              <span className="px-1.5 py-0.5 text-[10px] bg-gray-200 text-gray-500 rounded ml-auto">{card.ratio}</span>
                              <span className="text-[10px] text-gray-400">{card.pov}</span>
                            </div>
                            <div className="space-y-2">
                              <textarea value={card.title} onChange={e => {
                                const next = [...analysisResult];
                                next[idx] = { ...next[idx], title: e.target.value };
                                setAnalysisResult(next);
                                e.target.style.height = 'auto';
                                e.target.style.height = e.target.scrollHeight + 'px';
                              }} placeholder="社媒帖子文案"
                                className="w-full bg-white px-3 py-2 rounded-xl text-sm font-semibold text-[#171717] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 placeholder:text-gray-400 resize-none overflow-hidden"
                                rows={1} />
                              <textarea value={card.description} onChange={e => {
                                const next = [...analysisResult];
                                next[idx] = { ...next[idx], description: e.target.value };
                                setAnalysisResult(next);
                                e.target.style.height = 'auto';
                                e.target.style.height = e.target.scrollHeight + 'px';
                              }} placeholder="配图描述（生图提示词）"
                                className="w-full bg-white rounded-xl p-3 text-sm text-gray-600 leading-relaxed border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none overflow-hidden placeholder:text-gray-400"
                                rows={2} />
                            </div>
                          </div>
                          <div className="p-4">
                            {gen && (
                              <div className="flex gap-4">
                                <div className="w-[120px] flex-shrink-0">
                                  <div className="aspect-[1/1] rounded-xl overflow-hidden bg-gray-100 border border-gray-200 relative group cursor-pointer" onClick={() => setPreviewImage(gen.url)}>
                                    <img src={gen.url} alt="" className="w-full h-full object-cover" />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Generated Images */}
              {results.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-[#171717] mb-4">已生成图片 ({results.length})</h2>
                  <div className="grid grid-cols-2 gap-4">
                    {results.map((item, idx) => (
                      <div key={idx} className="group relative bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
                        <div className="cursor-pointer" onClick={() => setPreviewImage(item.url)}>
                          <img src={item.url} alt="" className="w-full h-full object-cover" style={{ aspectRatio: item.ratio.replace(':', '/') }} />
                        </div>
                        <div className="p-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-600">{item.title}</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded">{item.ratio}</span>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => setReEditImage(item.url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#171717] transition-colors flex-shrink-0" title="微调"><Sparkles size={14} /></button>
                            <button onClick={() => handleDownload(item.url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#171717] transition-colors flex-shrink-0" title="下载"><Download size={14} /></button>
                            <PsdExportButton imageUrl={item.url} />
                          </div>
                        </div>
                      </div>
                    ))}
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
        aspectRatio="1:1"
        model={selectedModel}
        resolution={quality}
        onClose={() => setReEditImage(null)}
        onReplaced={(oldUrl, newUrl) => setResults(prev => prev.map(item => item.url === oldUrl ? {...item, url: newUrl} : item))}
      />
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, Wand2, Images, Globe, Download, Copy, Check, Layout, Type, FileText, ChevronDown } from 'lucide-react';
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

const ASPECTS = ['3:4', '9:16', '16:9', '21:9'];

const RESOLUTIONS = ['2K', '4K'];

const POSTER_ANALYSIS_PROMPT = `你是一位资深平面设计师和品牌视觉专家。分析用户上传的图片（可能是产品图、Logo、素材图）和海报需求，设计一张营销海报。

请仔细分析：
1. **图片分析**：识别每张图片的内容（产品、Logo、背景素材等）。**所有上传的图片都要使用**，如果是产品多角度/多细节图，需通过排版组合在一张海报中展示。Logo类图片需要突出展示，产品图需要作为视觉主体
2. **构图规划**：如何安排各元素在海报中的位置（标题位置、产品位置、Logo位置、文案位置、装饰元素），多张产品图时考虑拼贴或网格布局
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

interface DesignPlan {
  layout: string;
  colorScheme: string;
  elements: { type: string; description: string }[];
  designBrief: string;
}

export const PosterPage: React.FC = () => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getAvailableModels(['seedream']).then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) setSelectedModel('nanobann2');
    });
  }, []);

  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [posterDescription, setPosterDescription] = useState('');
  const [posterCopy, setPosterCopy] = useState('');
  const [language, setLanguage] = useState('zh');
  const [selectedRatios, setSelectedRatios] = useState<string[]>(['3:4']);
  const [resolution, setResolution] = useState('2K');
  const [selectedModel, setSelectedModel] = useState('');
  const [count, setCount] = useState(1);
  const [analyzing, setAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [analysisResult, setAnalysisResult] = useState<DesignPlan | null>(null);
  const [results, setResults] = useState<{ url: string; label: string; ratio?: string }[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
      setImages(prev => [...prev, ...newItems].slice(0, 10));
    }).catch(err => {
      console.error('图片处理失败:', err);
      alert('部分图片处理失败，请尝试使用更小的图片');
    });
  };

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));

  const handleAnalyze = async () => {
    if (!requireAuth()) return;
    if (images.length === 0) { alert('请上传图片（产品图或Logo）'); return; }
    if (!posterCopy.trim()) { alert('请输入海报设计文案'); return; }
    setAnalyzing(true);
    setAnalysisResult(null);
    setResults([]);
    setProgress('AI正在深度分析产品...');
    try {
      const b64s = await Promise.all(images.map(item => fileToDataUrl(item.file, 1200)));
      const langLabel = LANGUAGES.find(l => l.value === language)?.label || '中文';

      // 深度分析
      let analysisContext = '';
      const deepRaw = await analyzeMultipleImages(b64s,
        `分析所有上传的图片中的产品，返回JSON：{"title":"产品名称","description":"产品描述","brand":"品牌","category":"品类","specs":"规格","sellingPoints":"卖点(逗号分隔)","targetAudience":"目标人群"}。仅输出JSON。`,
        { model: 'gemini-3.5-flash', maxTokens: 2000 }
      );
      const deepMatch = deepRaw.match(/\{[\s\S]*\}/);
      if (deepMatch) {
        const d = JSON.parse(deepMatch[0]) as Record<string, string>;
        analysisContext = `\n## AI深度分析产品信息\n品牌：${d.brand || ''}\n品类：${d.category || ''}\n规格：${d.specs || ''}\n卖点：${d.sellingPoints || ''}\n目标人群：${d.targetAudience || ''}`;
        deepAnalysisRef.current = analysisContext;
      }

      setProgress('AI规划海报设计方案...');
      const userContent = `${POSTER_ANALYSIS_PROMPT}\n\n=====\n\n海报描述：${posterDescription || '无'}\n海报文案内容：${posterCopy}\n目标语言：${langLabel}\n比例：${selectedRatios.join(' / ')}${analysisContext}\n\n请分析以上图片，输出JSON格式的海报设计方案。使用目标语言。`;
      const raw = await analyzeMultipleImages(b64s, userContent, { model: 'gemini-3.5-flash', maxTokens: 8000 });
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI返回格式异常');
      const parsed = JSON.parse(jsonMatch[0]) as DesignPlan;
      if (!parsed.layout || !parsed.designBrief) throw new Error('AI未能生成完整方案');
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
    if (images.length === 0 || !posterCopy.trim()) return;
    setIsGenerating(true);
    try {
      const urls = await Promise.all(images.map(item => fileToDataUrl(item.file, 1536)));
      imageLibraryService.clearSavedUrlsCache();
      // 展平：count × ratios
      const flatTasks = Array.from({ length: count }).flatMap((_, i) =>
        selectedRatios.map(ratio => ({ cardIdx: i, ratio }))
      );
      const totalCount = flatTasks.length;
      setProgress(`生成中 (0/${totalCount})...`);
      let doneCount = 0;
      await Promise.all(flatTasks.map(async ({ cardIdx, ratio }, flatIdx) => {
        const langLabel = LANGUAGES.find(l => l.value === language)?.label || '中文';
        const designBrief = analysisResult?.designBrief
          ? `\n设计方案：${analysisResult.designBrief}`
          : '';
        const prompt = `电商营销海报设计 第${cardIdx + 1}张/共${count}张  比例：${ratio}\n海报描述：${posterDescription || '无'}\n\n海报文案内容（请将这些文字排版到海报上）：\n${posterCopy}${deepAnalysisRef.current}\n\n${designBrief ? `按照以下设计方案执行：${designBrief}\n\n` : ''}要求：\n- 如果只生成1张：所有上传的图片都必须用在这张海报中\n- 如果生成多张（共${count}张）：这是第${cardIdx + 1}张，请从上传的图片中选取不同的产品角度/细节进行组合，每张海报侧重展示不同的内容维度\n- 多张之间要有明显差异：比如有的侧重全景展示、有的侧重局部细节、有的侧重使用场景组合\n- 将文案内容以美观的排版设计到海报中\n- 专业营销海报风格，视觉冲击力强\n- ${ratio} 比例\n- 目标语言：${langLabel}\n- 多张时每张使用完全不同的构图布局，不能雷同`;
        try {
          const resp = await editImage({ prompt, images: urls, aspectRatio: ratio, resolution, model: selectedModel });
          if (resp.data?.[0]?.url) {
            imageLibraryService.saveToLibrary({
              image_url: resp.data[0].url,
              prompt: `AI海报 - ${posterCopy.substring(0, 50)}`,
              model: selectedModel,
              aspect_ratio: ratio,
              resolution,
              type: 'generated'
            });
            setResults(prev => [{ url: resp.data[0].url, label: `海报 ${cardIdx + 1}`, ratio }, ...prev]);
          }
        } catch (err: any) {
          console.error(`生成第${cardIdx + 1}张失败:`, err);
        }
        doneCount++;
        setProgress(`生成中 (${doneCount}/${totalCount})...`);
      }));
    } catch (err: any) {
      console.error('生成失败:', err);
    } finally {
      setIsGenerating(false);
      setProgress('');
    }
  };

  const handleDownload = async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `poster-${Date.now()}.png`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
  };

  const handleCopyDesignBrief = () => {
    if (!analysisResult) return;
    const text = `【布局】${analysisResult.layout}\n【色彩】${analysisResult.colorScheme}\n【设计说明】${analysisResult.designBrief}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNewAnalysis = () => { setAnalysisResult(null); setResults([]); };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-14 border-b border-gray-200 flex-shrink-0 bg-gray-50">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center"><Layout size={16} className="text-white" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[#171717]">智能海报设计</h1>
          <p className="text-[10px] text-gray-400 leading-tight">上传产品/Logo + 文案，AI设计营销海报</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Configuration */}
        <div className="w-[380px] border-r border-gray-200 overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-gray-50">
          {/* Image Upload */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Images size={16} className="text-blue-500" />
              <div><h3 className="text-sm font-semibold text-[#171717]">上传图片</h3><p className="text-xs text-gray-400">产品图、Logo、素材图</p></div>
              <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-xl">{images.length}/10</span>
            </div>
            {images.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mb-3">{images.map((item, idx) => (
                <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden bg-gray-100">
                  <img src={item.preview} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removeImage(idx)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100"><X size={14} className="text-white" /></button>
                </div>
              ))}</div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleUpload} multiple accept="image/*" className="hidden" />
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA] p-3 flex flex-col items-center justify-center gap-1 hover:border-gray-400 hover:bg-gray-50 transition-all cursor-pointer">
              <Plus size={18} className="text-gray-400" /><span className="text-xs text-gray-400">上传产品图 / Logo</span>
            </div>
          </div>

          {/* Poster Description */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">海报描述</span>
              <span className="text-xs text-gray-400 ml-auto">可选</span>
            </div>
            <textarea value={posterDescription} onChange={e => { setPosterDescription(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
              placeholder="想要的风格、色调、排版方向等，例如：简约高端、产品居中、Logo左上方"
              className="w-full bg-[#F5F5F5] rounded-2xl p-3 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none text-[#333333] placeholder:text-gray-400 overflow-hidden" rows={2}
              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
          </div>

          {/* Poster Copy */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Type size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">海报文案 <span className="text-red-500">*</span></span>
            </div>
            <textarea value={posterCopy} onChange={e => { setPosterCopy(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
              placeholder="要展示在海报上的文字内容，如：品牌Slogan、产品卖点、促销信息、活动时间等"
              className="w-full bg-[#F5F5F5] rounded-2xl p-3 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none text-[#333333] placeholder:text-gray-400 overflow-hidden min-h-[80px]" rows={3}
              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
          </div>

          {/* Language */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Globe size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">海报语言</span>
            </div>
            <select value={language} onChange={e => setLanguage(e.target.value)}
              className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-2xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 appearance-none cursor-pointer">
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          {/* Aspect Ratio */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Layout size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">比例（多选）</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {ASPECTS.map(r => {
                const info: Record<string, { label: string; icon: string }> = {
                  '3:4': { label: '竖版', icon: '▯' },
                  '9:16': { label: '手机', icon: '▯' },
                  '16:9': { label: '横版', icon: '▭' },
                  '21:9': { label: '超宽屏', icon: '▭' },
                };
                const d = info[r] || { label: '', icon: '▯' };
                const isSelected = selectedRatios.includes(r);
                return (
                  <button key={r} onClick={() => {
                    if (selectedRatios.length === 1 && isSelected) return;
                    setSelectedRatios(prev => isSelected ? prev.filter(v => v !== r) : [...prev, r]);
                  }}
                    className={`relative flex items-center gap-3 py-3 px-4 rounded-2xl text-sm font-medium transition-all border ${
                      isSelected
                        ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                        : 'bg-gray-50 text-gray-500 border-gray-100 hover:border-gray-300 hover:bg-gray-100'
                    }`}>
                    <span className={`text-lg ${isSelected ? 'text-white' : 'text-gray-400'}`}>{d.icon}</span>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold">{r}</span>
                        {isSelected && <Check size={12} className="text-white/80" />}
                      </div>
                      <span className={`text-[10px] ${isSelected ? 'text-white/60' : 'text-gray-400'}`}>{d.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-blue-500" />
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
            <div className="grid grid-cols-2 gap-3">
              {RESOLUTIONS.map(r => {
                const pixels = r === '4K' ? '4096×4096' : '2048×2048';
                const label = r === '4K' ? '超高清' : '高清';
                const isSelected = resolution === r;
                return (
                  <button key={r} onClick={() => setResolution(r)}
                    className={`relative flex flex-col items-center py-3 px-4 rounded-2xl text-sm font-medium transition-all border ${
                      isSelected
                        ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                        : 'bg-gray-50 text-gray-500 border-gray-100 hover:border-gray-300 hover:bg-gray-100'
                    }`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : 'bg-gray-300'}`} />
                      <span className="font-bold">{r}</span>
                      {isSelected && <Check size={12} className="text-white/80" />}
                    </div>
                    <span className={`text-[10px] mt-0.5 ${isSelected ? 'text-white/60' : 'text-gray-400'}`}>{label} · {pixels}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Count */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Images size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">生成数量</span>
            </div>
            <div className="relative">
              <select value={count} onChange={e => setCount(Number(e.target.value))}
                className="w-full bg-[#F5F5F5] px-3 py-2.5 pr-8 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 appearance-none cursor-pointer">
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}张</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Action Buttons */}
          {!analysisResult && (
            <button onClick={handleAnalyze} disabled={images.length === 0 || !posterCopy.trim() || analyzing}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-gray-200 disabled:text-gray-400 shadow-sm">
              {analyzing ? <><Loader2 size={18} className="animate-spin" /> AI分析中...</> : <><Sparkles size={18} /> AI分析并设计方案</>}
            </button>
          )}
          {analysisResult && (
            <button onClick={handleNewAnalysis} className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all shadow-sm">
              <Sparkles size={18} /> 重新分析
            </button>
          )}
          {analysisResult && !isGenerating && (
            <button onClick={handleGenerate}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all shadow-sm">
              <Wand2 size={18} /> 生成海报 ({count * selectedRatios.length}张)
            </button>
          )}
          {(analyzing || isGenerating) && (
            <div className="text-center text-xs text-gray-400 bg-gray-100 rounded-xl py-3"><Loader2 size={14} className="animate-spin inline mr-2" />{isGenerating ? (progress || '生成中...') : 'AI分析中...'}</div>
          )}
        </div>

        {/* Right Panel - Results */}
        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
          {analyzing ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <LoadingAnimation title="AI 分析中" description={progress || '正在分析图片和文案，规划海报设计方案...'} />
            </div>
          ) : !analysisResult && results.length === 0 && !isGenerating ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 mx-auto mb-5 bg-gray-100 rounded-2xl flex items-center justify-center"><Layout size={32} className="text-gray-300" /></div>
                <h2 className="text-lg font-semibold text-[#171717] mb-2">智能海报设计</h2>
                <p className="text-sm text-gray-400 leading-relaxed">上传图片 → AI分析 → 生成营销海报</p>
              </div>
            </div>
          ) : isGenerating && !analysisResult ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <LoadingAnimation title="生成中" description={progress || '正在生成海报...'} showProgressBar={results.length > 0} />
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Analysis Result */}
              {analysisResult && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-[#171717]">海报设计方案</h2>
                    <button onClick={handleCopyDesignBrief}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all hover:bg-gray-100 text-gray-500">
                      {copied ? <><Check size={14} className="text-green-600" /> 已复制</> : <><Copy size={14} /> 复制方案</>}
                    </button>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    {/* Layout */}
                    <div className="border-b border-gray-100">
                      <div className="px-5 py-3 bg-gray-50 flex items-center gap-2">
                        <Layout size={14} className="text-blue-500" />
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">构图布局</span>
                      </div>
                      <div className="px-5 py-4">
                        <p className="text-sm text-gray-700 leading-relaxed">{analysisResult.layout}</p>
                      </div>
                    </div>
                    {/* Color Scheme */}
                    <div className="border-b border-gray-100">
                      <div className="px-5 py-3 bg-gray-50 flex items-center gap-2">
                        <Wand2 size={14} className="text-blue-500" />
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">色彩方案</span>
                      </div>
                      <div className="px-5 py-4">
                        <p className="text-sm text-gray-700 leading-relaxed">{analysisResult.colorScheme}</p>
                      </div>
                    </div>
                    {/* Elements */}
                    <div className="border-b border-gray-100">
                      <div className="px-5 py-3 bg-gray-50 flex items-center gap-2">
                        <Layout size={14} className="text-blue-500" />
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">元素规划</span>
                      </div>
                      <div className="px-5 py-4 space-y-3">
                        {analysisResult.elements.map((el, idx) => (
                          <div key={idx} className="flex gap-3">
                            <span className="w-16 flex-shrink-0 text-xs font-semibold text-[#171717] bg-gray-100 rounded-lg px-2 py-1 text-center">{el.type}</span>
                            <span className="text-sm text-gray-600">{el.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Design Brief */}
                    <div>
                      <div className="px-5 py-3 bg-gray-50 flex items-center gap-2">
                        <FileText size={14} className="text-blue-500" />
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">设计说明</span>
                      </div>
                      <div className="px-5 py-4">
                        <p className="text-sm text-gray-700 leading-relaxed bg-amber-50 p-4 rounded-xl border border-amber-200">{analysisResult.designBrief}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Generated Posters */}
              {results.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-[#171717] mb-4">已生成 ({results.length})</h2>
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                    {results.map((item, idx) => (
                      <div key={idx} className="group relative bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
                        <div className="cursor-pointer bg-gray-50" onClick={() => setPreviewImage(item.url)}><img src={item.url} alt="" className="w-full h-56 object-contain" /></div>
                        <div className="p-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-600 truncate">{item.label}</span>
                            {item.ratio && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-lg">{item.ratio}</span>}
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => setReEditImage(item.url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#171717]"><Wand2 size={14} /></button>
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
        resolution={resolution}
        onClose={() => setReEditImage(null)}
        onReplaced={(oldUrl, newUrl) => setResults(prev => prev.map(item => item.url === oldUrl ? {...item, url: newUrl} : item))}
      />
    </div>
  );
};

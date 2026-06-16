import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, Wand2, Images, Globe, Download, Copy, Check, Layout, Type, FileText, ChevronDown } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { analyzeMultipleImages } from '../../services/aiChatService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { requireAuth } from '../../utils/authCheck';
import { getAvailableModels } from '../../services/modelService';
import { createConcurrencyLimit } from '../../utils/concurrency';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import { ModelSpeedNote } from '../../components/ModelSpeedNote';
import { LoadingAnimation } from '../../components/LoadingAnimation';
import { LANGUAGES, getSavedLanguage, saveLanguage } from '../../constants/languages';

const ASPECTS = ['3:4', '9:16', '16:9', '21:9'];

const RESOLUTIONS = ['2K', '4K'];

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

const POSTER_ANALYSIS_PROMPT = `你是一位资深平面设计师和品牌视觉专家。分析用户上传的图片（可能是产品图、Logo、素材图）和海报需求，设计一套电商海报方案。

生成 {count} 张海报，每张海报需要：
1. "title": 海报标题（吸引眼球的核心卖点）
2. "desc": 海报配图详细描述（构图、场景、光线、风格、调性等）
3. "subtitle": 副标题或补充文案（简洁的一句话）

## 输出格式 - STRICT JSON array:
[{"title":"主标题","desc":"详细配图描述","subtitle":"副标题文案","refImageIndices":[0,1]},...]

## 设计原则
- 第一张为品牌大促/首屏主图，中间从功能卖点/使用场景/细节工艺等切入，最后一张为购买引导
- 每张海报的标题和文案必须**有差异化**，不要重复相同的句式
- **即使提供了文案参考，也要创造性扩展**：不要照搬用户提供的文案，而是以用户文案为灵感，生成全新有吸引力的海报标题和副标题
- 不同海报之间的文案角度各异：促销感、品质感、场景感、紧迫感等轮换使用
- 标题醒目、视觉冲击力强
- 适合电商详情页或店铺海报展示
- 输出使用目标语言
- 所有返回内容必须使用目标语言，绝对禁止混入其他语言
- 每张海报必须指定使用哪张参考图，refImageIndices 数组中的数字对应上传图片的索引（从0开始）`;

interface PosterCard {
  title: string;
  desc: string;
  subtitle: string;
  refImageIndices?: number[];
}

export const EcommercePosterPage: React.FC = () => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getAvailableModels().then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) setSelectedModel('gpt-image-2');
    });
  }, []);

  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [posterDescription, setPosterDescription] = useState('');
  const [posterCopy, setPosterCopy] = useState('');
  const [language, setLanguage] = useState(getSavedLanguage());
  const [selectedRatios, setSelectedRatios] = useState<string[]>(['3:4']);
  const [resolution, setResolution] = useState('2K');
  const [selectedModel, setSelectedModel] = useState('');
  const [count, setCount] = useState(1);
  const [analyzing, setAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [analysisResult, setAnalysisResult] = useState<PosterCard[]>([]);
  const [results, setResults] = useState<{ url: string; label: string; ratio?: string }[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
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
      setImages(prev => [...prev, ...newItems].slice(0, 10));
    }).catch(err => {
      console.error('图片处理失败:', err);
      alert('部分图片处理失败，请尝试使用更小的图片');
    });
  };

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));

  const handleAnalyzeAndGenerate = async () => {
    if (!requireAuth()) return;
    if (images.length === 0) { alert('请上传图片（产品图或Logo）'); return; }
    setAnalyzing(true);
    setAnalysisResult([]);
    setResults([]);
    setProgress('AI正在深度分析产品...');

    try {
      const b64s = await Promise.all(images.map(item => fileToDataUrl(item.file, 1200)));
      const langLabel = LANGUAGES.find(l => l.value === language)?.label || '中文';

      // Step 1: Identify each image
      setProgress('AI正在识别每张图片展示的产品部位...');
      const identifyPrompt = `Analyze all uploaded images. For each image, describe in one short phrase (under 10 words) in ENGLISH what part or angle of the product it shows.
Return a JSON array, in order matching the image sequence.
Example: ["product front","product back","port detail","side buttons","packaging front"]
Return ONLY the JSON array, nothing else.`;
      const identifyRaw = await analyzeMultipleImages(b64s, identifyPrompt, { model: 'gemini-3.5-flash', maxTokens: 1000 });
      let imageLabels: string[] = [];
      try {
        const parsed = JSON.parse(identifyRaw.match(/\[[\s\S]*\]/)?.[0] || '[]');
        if (Array.isArray(parsed) && parsed.length === b64s.length) imageLabels = parsed;
      } catch {}
      if (imageLabels.length === 0) imageLabels = b64s.map((_, i) => `产品图 ${i + 1}`);
      const imageDesc = imageLabels.map((label, i) => `图${i + 1}：${label}`).join('\n');

      // Step 2: Deep analysis
      let analysisContext = '';
      setProgress('AI正在分析产品图片...');
      const raw = await analyzeMultipleImages(b64s, DEEP_ANALYSIS_PROMPT, { model: 'gemini-3.5-flash', maxTokens: 4000 });
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
        analysisContext = `\n## AI深度分析产品信息\n品牌：${parsed.brand || ''}\n品类：${parsed.category || ''}\n规格：${parsed.specs || ''}\n卖点：${parsed.sellingPoints || ''}\n目标人群：${parsed.targetAudience || ''}`;
        deepAnalysisRef.current = analysisContext;
      }

      // Step 3: Plan poster scheme
      setProgress('AI正在规划海报设计方案...');
      const promptText = POSTER_ANALYSIS_PROMPT.replace('{count}', String(count));
      const userContent = `${promptText}\n\n=====\n\n海报描述：${posterDescription || '无'}\n海报文案内容：${posterCopy || '无'}\n目标语言：${langLabel}\n比例：${selectedRatios.join(' / ')}${analysisContext}\n\n## 上传图片清单\n${imageDesc}\n\n请分析以上图片，输出JSON格式的海报设计方案。每张海报的标题和描述要有差异化、不能重复。所有文案使用目标语言。`;
      const raw2 = await analyzeMultipleImages(b64s, userContent, { model: 'gemini-3.5-flash', maxTokens: 8000 });
      const jsonMatch2 = raw2.match(/\[[\s\S]*\]/);
      if (!jsonMatch2) throw new Error('AI返回格式异常，请重试');
      const parsed = JSON.parse(jsonMatch2[0]) as PosterCard[];
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('AI未能生成有效的方案，请重试');
      setAnalysisResult(parsed);

      // Step 4: Auto generate after analysis
      setProgress('方案规划完成，开始生成海报...');
      setAnalyzing(false);
      setIsGenerating(true);

      const allUrls = await Promise.all(images.map(item => fileToDataUrl(item.file, 1536)));
      imageLibraryService.clearSavedUrlsCache();

      const flatTasks = parsed.flatMap(card => selectedRatios.map(ratio => ({ card, ratio })));
      const totalCount = flatTasks.length;
      setProgress(`生成中 (0/${totalCount})...`);
      let doneCount = 0;
      const limit = createConcurrencyLimit(3);

      await Promise.all(flatTasks.map(({ card, ratio }, flatIdx) => limit(async () => {
        const designBrief = card.desc ? `\n设计方案：${card.desc}` : '';
        const isEn = language === 'en';
        const prompt = isEn
          ? `E-commerce poster design #${flatIdx + 1}/${totalCount} | Ratio: ${ratio}\nProduct: ${posterDescription || 'N/A'}\nTitle: ${card.title}\n${card.subtitle ? `Subtitle: ${card.subtitle}` : ''}\nText on poster: ${posterCopy || 'N/A'}\n\nImage reference: ${imageLabels.map((l, i) => `图${i+1}=${l}`).join(', ')}\n${designBrief}\n\nLayout rules:\n- Product image as hero visual, large and prominent\n- Bold oversized title (English) as visual anchor, half the frame\n- Spec callout boxes with icons on the side\n- Bottom info bar: series name, slogan, brand\n- Color: AI selects best palette based on product type and brand positioning\n- English only, no Chinese/Korean/Japanese\n- ALL uploaded images MUST be incorporated into the poster\n\nIf person appears: Western face, real skin texture, natural lighting, photorealistic, Sony A7R IV, 85mm f/1.8, no golden hour`
          : `电商海报设计 第${flatIdx + 1}张/共${totalCount}张  比例：${ratio}\n产品描述：${posterDescription || '无'}\n标题：${card.title}\n${card.subtitle ? `副标题：${card.subtitle}` : ''}\n文案内容：${posterCopy || '无'}\n\n图片说明：${imageLabels.map((l, i) => `图${i+1}=${l}`).join(', ')}\n${designBrief}\n\n要求：\n- 产品图作为视觉中心，占据画面60-70%\n- 大号粗体英文标题作为视觉锚点\n- 参数标注框+底部信息栏\n- 根据产品类型自动搭配配色\n- 所有上传的图片都必须用在这张海报中\n- 画面文字100%英文，禁止中文/日文/韩文\n\n人物真实感：欧美面孔、真实皮肤纹理、自然光线、photorealistic、Sony A7R IV、85mm f/1.8、禁止黄金时刻暖光`;

        const refIndices = card.refImageIndices?.filter(idx => idx >= 0 && idx < allUrls.length) || [];
        const urls = refIndices.length > 0 ? refIndices.map(idx => allUrls[idx]) : allUrls;

        let success = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const resp = await editImage({ prompt, images: urls, aspectRatio: ratio, resolution, model: selectedModel });
            if (resp.data?.[0]?.url) {
              setResults(prev => [{ url: resp.data[0].url, label: `海报 ${flatIdx + 1}`, ratio }, ...prev]);
              imageLibraryService.saveToLibrary({ image_url: resp.data[0].url, prompt, model: String(selectedModel || 'gpt-image-2'), aspect_ratio: String(ratio), resolution: String(resolution || '2K'), type: 'edited' });
              success = true;
            }
            break;
          } catch (err: any) {
            if (attempt < 2 && err?.response?.status === 503) {
              const wait = 5000 * (attempt + 1);
              setProgress(`服务繁忙，${wait/1000}秒后重试 (${attempt+1}/3)...`);
              await new Promise(r => setTimeout(r, wait));
              continue;
            }
            console.error(`生成第${flatIdx + 1}张失败:`, err);
          }
        }
        doneCount++;
        setProgress(`生成中 (${doneCount}/${totalCount})...`);
      })));

    } catch (err: any) {
      console.error('处理失败:', err);
      alert('AI处理失败: ' + (err.message || '请稍后重试'));
    } finally {
      setAnalyzing(false);
      setIsGenerating(false);
      setProgress('');
    }
  };

  const handleDownload = async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `ecommerce-poster-${Date.now()}.png`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
  };

  const handleNewAnalysis = () => { setAnalysisResult([]); setResults([]); };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-14 border-b border-gray-200 flex-shrink-0 bg-gray-50">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center"><Layout size={16} className="text-white" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[#171717]">电商海报设计</h1>
          <p className="text-[10px] text-gray-400 leading-tight">上传产品/Logo + 文案，AI分析后自动生成海报</p>
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
              <span className="text-sm font-semibold text-[#171717]">海报文案</span>
              <span className="text-xs text-gray-400 ml-auto">可选</span>
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
            <select value={language} onChange={e => { setLanguage(e.target.value); saveLanguage(e.target.value); }}
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
                {models.length > 0 ? models.map(m => <option key={m.value} value={m.value}>{m.label}</option>) : <option value="gpt-image-2">GPT Image 2</option>}
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

          {/* Action Button */}
          {!isGenerating && !analyzing && (
            <button onClick={handleAnalyzeAndGenerate} disabled={images.length === 0 || analyzing}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-gray-200 disabled:text-gray-400 shadow-sm">
              <Sparkles size={18} /> AI分析并生成海报 ({count * selectedRatios.length}张)
            </button>
          )}
          {analysisResult.length > 0 && !isGenerating && !analyzing && (
            <button onClick={handleNewAnalysis}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all shadow-sm">
              <Sparkles size={18} /> 重新分析
            </button>
          )}
          {(analyzing || isGenerating) && (
            <div className="text-center text-xs text-gray-400 bg-gray-100 rounded-xl py-3"><Loader2 size={14} className="animate-spin inline mr-2" />{progress}</div>
          )}
        </div>

        {/* Right Panel - Results */}
        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
          {analyzing ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <LoadingAnimation title="AI 分析中" description={progress || '正在分析图片和文案，规划海报设计方案...'} />
            </div>
          ) : !analysisResult.length && results.length === 0 && !isGenerating ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 mx-auto mb-5 bg-gray-100 rounded-2xl flex items-center justify-center"><Layout size={32} className="text-gray-300" /></div>
                <h2 className="text-lg font-semibold text-[#171717] mb-2">电商海报设计</h2>
                <p className="text-sm text-gray-400 leading-relaxed">上传图片 → AI分析 → 自动生成电商海报</p>
              </div>
            </div>
          ) : isGenerating && results.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <LoadingAnimation title="生成中" description={progress || '正在生成海报...'} showProgressBar={results.length > 0} />
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Analysis Result */}
              {analysisResult.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-[#171717] mb-4">海报方案 ({analysisResult.length}张)</h2>
                  <div className="grid grid-cols-1 gap-4">
                    {analysisResult.map((card, idx) => (
                      <div key={idx} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-6 h-6 bg-[#171717] text-white rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0">{idx + 1}</span>
                            <span className="text-xs font-medium text-gray-400">海报 #{idx + 1}</span>
                          </div>
                          <div className="space-y-2">
                            <div className="w-full bg-white px-3 py-2 rounded-xl text-sm font-semibold text-[#171717] border border-gray-200">{card.title}</div>
                            {card.subtitle && <div className="w-full bg-white px-3 py-2 rounded-xl text-xs text-gray-600 border border-gray-200">{card.subtitle}</div>}
                            <div className="w-full bg-white rounded-xl p-3 text-sm text-gray-600 leading-relaxed border border-gray-200">{card.desc}</div>
                          </div>
                        </div>
                      </div>
                    ))}
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

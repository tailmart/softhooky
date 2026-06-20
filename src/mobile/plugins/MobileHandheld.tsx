import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Loader2, Sparkles, Plus, ChevronDown, Check, Coins, AlertTriangle, Download, Image as ImageIcon } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { useAuth } from '../../contexts/AuthContext';
import { getGeneratePrice } from '../../services/pricingService';
import { getAuthToken } from '../../services/authService';
import { getAvailableModels } from '../../services/modelService';
import { analyzeMultipleImages } from '../../services/aiChatService';
import { RatioPicker } from '../components/RatioPicker';

const GENDERS = [
  { value: 'female', label: '女性' },
  { value: 'male', label: '男性' },
];
const ETHNICITIES = [
  { value: 'chinese', label: '中国' },
  { value: 'korean', label: '韩国' },
  { value: 'japanese', label: '日本' },
  { value: 'western', label: '欧美' },
];
const WEAR_TYPES = [
  { value: 'handheld', label: '手持产品' },
  { value: 'wrist', label: '手腕佩戴' },
];
const RATIOS = [
  { value: '1:1', label: '1:1 方形' },
  { value: '3:4', label: '3:4 竖版' },
  { value: '9:16', label: '9:16 手机' },
];

interface MobileHandheldProps { onBack: () => void; }

export const MobileHandheld: React.FC<MobileHandheldProps> = ({ onBack }) => {
  const { isAuthenticated, user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<string[]>([]);
  const [gender, setGender] = useState('female');
  const [ethnicity, setEthnicity] = useState('chinese');
  const [wearType, setWearType] = useState('handheld');
  const [ratio, setRatio] = useState('3:4');
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState('nanobann2');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [price, setPrice] = useState(0.3);
  const [error, setError] = useState('');
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [count, setCount] = useState(1);

  useEffect(() => {
    getGeneratePrice().then(setPrice);
    getAvailableModels().then(m => {
      const sorted = m.filter(x => x.enabled && x.model_id !== 'agnes-image-2.1-flash').sort((a, b) => a.sort_order - b.sort_order);
      if (sorted.length > 0) {
        setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
        setSelectedModel(sorted[0].model_id);
      }
    });
  }, []);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const urls = await Promise.all(Array.from(files).slice(0, 3 - images.length).map(f => fileToDataUrl(f)));
    setImages(prev => [...prev, ...urls].slice(0, 3));
    if (e.target) e.target.value = '';
  }, [images.length]);

  const ethnicityMap: Record<string, string> = { chinese: '中国', korean: '韩国', japanese: '日本', western: '欧美' };

  const buildAnalysisPrompt = () => {
    const wearLabel = WEAR_TYPES.find(w => w.value === wearType)?.label || wearType;
    const ethLabel = ethnicityMap[ethnicity] || '中国';
    const genderLabel = GENDERS.find(g => g.value === gender)?.label || gender;
    return `你是一位产品展示摄影师。分析产品图片，为${wearLabel}展示图设计方案。

每张图需要：
1. "title": 场景标题
2. "desc": 详细拍摄描述（人物姿态、手部动作、背景、光线、氛围等）

输出JSON数组[{"title":"场景标题","desc":"详细描述"}]

原则：
- 人物：${ethLabel}${genderLabel}，自然出镜
- ${wearType === 'wrist' ? '手腕佩戴展示：产品戴在手腕上，展示佩戴效果，手部自然摆放' : '手持展示：手握住产品，展示握持姿态，产品清晰可见'}
- 人物正脸出镜，展示完整人物形象，脸部五官真实自然，皮肤纹理细节清晰可见（毛孔、肤质），真实人像照片质感，像手机人像模式拍的真人实拍，无AI感、无塑料假面、无过度磨皮、无对称假脸
- 描述包含：握持/佩戴方式、手部姿态、背景、光线
- 每张图握持/佩戴方式和场景各不相同`;
  };

  const handleAnalyzeAndGenerate = useCallback(async () => {
    if (!images.length) return;
    if (!isAuthenticated) { window.dispatchEvent(new Event('mobile-auth-required')); return; }
    setIsAnalyzing(true); setError('');
    try {
      const prompt = buildAnalysisPrompt();
      const result = await analyzeMultipleImages(images, prompt, { model: 'gemini-3.5-flash', maxTokens: 8000 });
      setAnalysisResult(result);
      setIsAnalyzing(false);
      await handleGenerateWithAnalysis(result);
    } catch (err: any) { setError(err.message || '分析失败'); }
    finally { setIsAnalyzing(false); }
  }, [images, isAuthenticated, gender, ethnicity, wearType]);

  const handleGenerateWithAnalysis = useCallback(async (analysisText?: string) => {
    if (!isAuthenticated || !images.length) return;
    setIsGenerating(true); setError('');
    const genderLabel = GENDERS.find(g => g.value === gender)?.label || gender;
    const ethLabel = ethnicityMap[ethnicity] || '中国';
    const wearLabel = WEAR_TYPES.find(w => w.value === wearType)?.label || wearType;
    const analysisInput = analysisText || analysisResult;
    const basePrompt = `${analysisInput || ''}

人物设定：${ethLabel}${genderLabel}
展示方式：${wearLabel}

要求：
- ${wearType === 'wrist' ? '产品戴在手腕上展示，手部自然摆放，突出佩戴效果' : '手握住产品展示，握持自然真实'}
- 产品图片必须保持不变：产品不变形、大小不变、形状不变、产品上的文字图案不变、产品必须高清
- 人物正脸出镜，脸部五官真实自然，皮肤纹理细节清晰可见（毛孔、肤质），真实人像照片质感，像手机实拍照片，无AI感、无塑料假面、无过度磨皮、无对称假脸
- 手部皮肤纹理真实自然，光线柔和`;
    const allUrls: string[] = [];
    try {
      for (let n = 0; n < count; n++) {
        const seq = count > 1 ? `\n---\n第${n + 1}张/${count}张，与上一张的构图、角度、姿势必须有明显区别 ---` : '';
        const prompt = basePrompt + seq;
        const result = await editImage({ prompt, images, model: selectedModel, aspectRatio: ratio });
        const urls = (Array.isArray(result.data) ? result.data : [result]).map((i: any) => i.url || i.image_url || '').filter(Boolean);
        allUrls.push(...urls);
        if (urls.length > 0) setResults(prev => [...urls, ...prev]);
      }
      if (allUrls.length > 0) window.dispatchEvent(new Event('credits-updated'));
    } catch (err: any) { setError(err.message || '生成失败'); }
    finally { setIsGenerating(false); }
  }, [isAuthenticated, images, gender, ethnicity, wearType, ratio, selectedModel, analysisResult, count]);

  const handleGenerate = useCallback(async () => {
    if (!isAuthenticated || !images.length) return;
    setIsGenerating(true); setError('');
    const genderLabel = GENDERS.find(g => g.value === gender)?.label || gender;
    const ethnicityLabel = ETHNICITIES.find(e => e.value === ethnicity)?.label || ethnicity;
    const wearLabel = WEAR_TYPES.find(w => w.value === wearType)?.label || wearType;
    const basePrompt = `${analysisResult || ''} ${genderLabel}，${ethnicityLabel}，${wearLabel}，自然光线，真实场景，产品展示。`;
    const allUrls: string[] = [];
    try {
      for (let n = 0; n < count; n++) {
        const seq = count > 1 ? `\n---\n第${n + 1}张/${count}张，与上一张的构图、角度、姿势必须有明显区别 ---` : '';
        const prompt = basePrompt + seq;
        const result = await editImage({ prompt, images, model: selectedModel, aspectRatio: ratio });
        const urls = (Array.isArray(result.data) ? result.data : [result]).map((i: any) => i.url || i.image_url || '').filter(Boolean);
        allUrls.push(...urls);
        if (urls.length > 0) setResults(prev => [...urls, ...prev]);
      }
      if (allUrls.length > 0) window.dispatchEvent(new Event('credits-updated'));
    } catch (err: any) { setError(err.message || '生成失败'); }
    finally { setIsGenerating(false); }
  }, [isAuthenticated, images, gender, ethnicity, wearType, ratio, selectedModel, analysisResult, count]);

  const handleDownload = useCallback(async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `handheld_${Date.now()}.png`; a.click(); URL.revokeObjectURL(a.href); } catch {}
  }, []);

  const Picker = ({ label, value, options, onSelect, id }: { label: string; value: string; options: { value: string; label: string }[]; onSelect: (v: string) => void; id: string }) => (
    <div>
      <label className="text-xs font-semibold text-gray-500 mb-2 block">{label}</label>
      <button onClick={() => setSheet(id)} className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 text-sm">
        <span className="text-[#171717]">{options.find(o => o.value === value)?.label || value}</span>
        <ChevronDown size={16} className="text-gray-400" />
      </button>
      {sheet === id && (
        <div className="fixed inset-0 z-[100] flex items-end" onClick={() => setSheet(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full bg-white rounded-t-3xl pb-[calc(16px+env(safe-area-inset-bottom))] animate-mobile-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-200">
              <h3 className="text-base font-bold text-[#171717]">{label}</h3>
              <button onClick={() => setSheet(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100"><X size={16} className="text-gray-500" /></button>
            </div>
            <div className="max-h-[40vh] overflow-y-auto px-3 py-2">
              {options.map(o => (
                <button key={o.value} onClick={() => { onSelect(o.value); setSheet(null); }} className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl my-0.5 ${value === o.value ? 'bg-gray-100 font-semibold' : 'hover:bg-gray-50'}`}>
                  <span className={`text-sm ${value === o.value ? 'text-[#171717]' : 'text-gray-500'}`}>{o.label}</span>
                  {value === o.value && <Check size={18} className="text-[#171717]" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const ChipGroup = ({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) => (
    <div>
      <label className="text-xs font-semibold text-gray-500 mb-2 block">{label}</label>
      <div className="mobile-scroll-x -mx-1"><div className="flex gap-2 px-1">
        {options.map(o => <button key={o} onClick={() => onChange(o)} className={`mobile-tap flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${value === o ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>{o}</button>)}
      </div></div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 mobile-tap"><X size={16} className="text-gray-500" /></button>
        <h1 className="text-base font-bold text-[#171717]">手持产品</h1>
        {isAuthenticated && user && <div className="ml-auto flex items-center gap-1 bg-blue-500/10 px-2.5 py-1 rounded-full"><Coins size={12} className="text-blue-400" /><span className="text-xs font-semibold text-blue-400">{Number(user.credits || 0).toFixed(1)}</span></div>}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-32 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-2 block">上传产品图 <span className="text-red-400">*</span></label>
            <div className="flex gap-2.5 flex-wrap">
              {images.map((url, i) => <div key={i} className="relative w-[80px] h-[80px] rounded-2xl overflow-hidden bg-gray-50 border border-gray-200"><img src={url} className="w-full h-full object-cover" /><button onClick={() => setImages(p => p.filter((_, j) => j !== i))} className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center"><X size={10} className="text-white" /></button></div>)}
              {images.length < 3 && <button onClick={() => fileRef.current?.click()} className="w-[80px] h-[80px] rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center bg-gray-50"><Plus size={22} className="text-gray-400" /><span className="text-[9px] text-gray-400">上传</span></button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleUpload} />
          </div>

          <Picker label="性别" value={gender} options={GENDERS} onSelect={setGender} id="gender" />
          <Picker label="人种" value={ethnicity} options={ETHNICITIES} onSelect={setEthnicity} id="ethnicity" />
          <Picker label="佩戴方式" value={wearType} options={WEAR_TYPES} onSelect={setWearType} id="wear" />

          {models.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-2 block">模型</label>
              <button onClick={() => setSheet('model')} className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 text-sm">
                <span className="text-[#171717]">{models.find(m => m.value === selectedModel)?.label}</span>
                <ChevronDown size={16} className="text-gray-400" />
              </button>
              {sheet === 'model' && (
                <div className="fixed inset-0 z-[100] flex items-end" onClick={() => setSheet(null)}>
                  <div className="absolute inset-0 bg-black/60" />
                  <div className="relative w-full bg-white rounded-t-3xl pb-[calc(16px+env(safe-area-inset-bottom))] animate-mobile-slide-up" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-200">
                      <h3 className="text-base font-bold text-[#171717]">选择模型</h3>
                      <button onClick={() => setSheet(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} className="text-gray-500" /></button>
                    </div>
                    <div className="px-3 py-2">{models.map(m => (
                      <button key={m.value} onClick={() => { setSelectedModel(m.value); setSheet(null); }} className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl my-0.5 ${selectedModel === m.value ? 'bg-gray-100 font-semibold' : ''}`}>
                        <span className="text-sm text-[#171717]">{m.label}</span>
                        {selectedModel === m.value && <Check size={18} className="text-[#171717]" />}
                      </button>
                    ))}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">比例</label>
            <RatioPicker options={RATIOS} selected={ratio} onChange={setRatio} />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">生成张数</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setCount(p => Math.max(1, p - 1))}
                className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-lg font-medium text-[#171717]">-</button>
              <span className="w-10 text-center text-base font-semibold text-[#171717]">{count}</span>
              <button onClick={() => setCount(p => Math.min(6, p + 1))}
                className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-lg font-medium text-[#171717]">+</button>
            </div>
          </div>

          <button onClick={handleAnalyzeAndGenerate} disabled={!images.length || isAnalyzing || isGenerating}
            className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-sm font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white active:from-blue-600 active:to-blue-700 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-40">
            {isAnalyzing ? <><Loader2 size={16} className="animate-spin" /> AI 分析中...</> : isGenerating ? <><Loader2 size={16} className="animate-spin" /> 生成中...</> : <><Sparkles size={16} /> AI 生成{count > 1 ? ` ${count}张` : ''} ({(price * count).toFixed(1)}积分)</>}
          </button>

          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3"><p className="text-xs text-red-400">{error}</p></div>}

          {results.length > 0 && <div>
            <div className="flex items-center gap-2 mb-3"><ImageIcon size={16} className="text-[#171717]" /><h2 className="text-sm font-bold text-[#171717]">生成结果</h2></div>
            <div className="grid grid-cols-2 gap-3">{results.map((url, i) => (
              <div key={i} className="mobile-card overflow-hidden">
                <div className="aspect-square bg-gray-50"><img src={url} className="w-full h-full object-contain cursor-pointer" onClick={() => setExpandedImage(url)} loading="lazy" /></div>
                <div className="flex px-3 py-2.5 border-t border-gray-100"><button onClick={() => handleDownload(url)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-100 text-xs font-medium text-gray-500"><Download size={14} /> 下载</button></div>
              </div>
            ))}</div>
          </div>}
        </div>
      </div>
      {expandedImage && <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center" onClick={() => setExpandedImage(null)}>
        <img src={expandedImage} className="max-w-[95%] max-h-[85%] object-contain" /><button className="absolute top-4 right-4 w-10 h-10 bg-white/15 rounded-full flex items-center justify-center"><X size={20} className="text-white" /></button>
        <button onClick={(e) => { e.stopPropagation(); handleDownload(expandedImage); }} className="absolute bottom-10 left-1/2 -translate-x-1/2 px-6 py-3 bg-white rounded-full text-sm font-semibold shadow-lg flex items-center gap-2"><Download size={16} /> 下载</button>
      </div>}
    </div>
  );
};

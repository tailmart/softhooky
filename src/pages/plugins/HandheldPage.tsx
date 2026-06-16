import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, Images, Hand, Download, Check, Wand2, ChevronDown } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { analyzeMultipleImages } from '../../services/aiChatService';
import { requireAuth } from '../../utils/authCheck';
import { getAvailableModels } from '../../services/modelService';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import { LoadingAnimation } from '../../components/LoadingAnimation';
import { LANGUAGES, getSavedLanguage, saveLanguage } from '../../constants/languages';

const ASPECT_RATIOS = [
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '9:16', label: '9:16' },
];

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

const DISPLAY_MODES = [
  { value: 'model', label: '模特手持' },
  { value: 'handOnly', label: '只展示手持' },
];

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
      <label className="text-xs font-medium text-gray-400 mb-1.5 block">{label}</label>
      <div onClick={() => setOpen(!open)}
        className="w-full bg-white px-3 py-2.5 rounded-xl text-sm flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors border border-gray-200">
        <span className={selected ? 'text-[#171717] font-medium' : 'text-gray-400'}>{selected?.label || '请选择'}</span>
        <svg className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 12 8"><path d="M1 1.5l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      {open && (
        <div className="absolute z-10 top-full mt-1 w-full bg-white rounded-xl shadow-lg border border-gray-200 py-1 max-h-48 overflow-y-auto">
          {options.map(opt => (
            <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-gray-50 flex items-center justify-between ${value === opt.value ? 'text-[#171717] font-semibold bg-gray-50' : 'text-gray-500'}`}>
              {opt.label}
              {value === opt.value && <Check size={14} className="text-blue-500" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface Card {
  wearType?: string;
  title: string;
  desc: string;
}

export const HandheldPage: React.FC = () => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getAvailableModels().then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) setSelectedModel(sorted[0].model_id);
    });
  }, []);
  const [productImages, setProductImages] = useState<{ file: File; preview: string }[]>([]);
  const [countPerProduct, setCountPerProduct] = useState(2);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [selectedModel, setSelectedModel] = useState('');
  const [gender, setGender] = useState('female');
  const [ethnicity, setEthnicity] = useState('chinese');
  const [displayMode, setDisplayMode] = useState('model');
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [quality, setQuality] = useState('2K');
  const [progress, setProgress] = useState('');
  const [analysisResult, setAnalysisResult] = useState<Card[]>([]);
  const [results, setResults] = useState<{ url: string; idx: number }[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);
  const [language, setLanguage] = useState(getSavedLanguage());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    const newItems = files.filter(f => f.type.startsWith('image/')).map(f => ({ file: f, preview: '' }));
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
    setProgress('AI正在分析产品，规划展示方案...');

    try {
      const b64s = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 600)));
      const totalCount = productImages.length * countPerProduct;
      const ethnicityMap: Record<string, string> = { chinese: '中国人', korean: '韩国人', japanese: '日本人', western: '欧美人' };
      const prompt = `你是一位产品展示摄影师。分析产品图片，根据产品类型自动判断展示方式（手表手环等适合手腕佩戴，其他产品适合手持展示），为每张图设计方案。

每张图需要：
1. "wearType": "handheld"（手持）或 "wrist"（手腕佩戴）——根据产品特征自动判断
2. "title": 场景标题
3. "desc": 详细拍摄描述（人物姿态、手部动作、背景、光线、氛围等）

输出JSON数组[{"wearType":"handheld/wrist","title":"场景标题","desc":"详细描述"}]

原则：
- 共${totalCount}张，每张场景和展示方式各不相同
${displayMode === 'model' ? `- 人物：${ethnicityMap[ethnicity]}${gender === 'female' ? '女性' : '男性'}，25岁左右
- 人物正脸出镜，展示完整人物形象，脸部五官真实自然，皮肤纹理细节清晰可见（毛孔、肤质），真实人像照片质感，像手机人像模式拍的真人实拍，无AI感、无塑料假面、无过度磨皮、无对称假脸` : '- 仅展示手部与产品，不出现人脸和人物全身'}
- 描述包含：握持/佩戴方式、手部姿态、背景、光线
- 每张图握持/佩戴方式和场景各不相同`;

      const raw = await analyzeMultipleImages(b64s, prompt, { model: 'gemini-3.5-flash', maxTokens: 8000 });
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('AI返回格式异常');
      const parsed = JSON.parse(jsonMatch[0]) as Card[];
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('方案为空');
      const cards = parsed.slice(0, totalCount);

      // 分析完成，直接开始生成
      setAnalyzing(false);
      setGenerating(true);
      setProgress('');

      const urls = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1536)));
      const ethnicityLabelMap: Record<string, string> = { chinese: '中国', korean: '韩国', japanese: '日本', western: '欧美' };
      const showPerson = displayMode === 'model';

      setProgress(`生成中 (0/${cards.length})...`);
      let doneCount = 0;
      let globalIdx = 0;

      await Promise.all(cards.map(async (card, idx) => {
        const refUrl = urls[idx % urls.length];
        const wearStr = card.wearType === 'wrist' ? '手腕佩戴' : '手持';
        const personPart = showPerson
          ? `人物设定：${ethnicityLabelMap[ethnicity]}${gender === 'female' ? '女性' : '男性'}，25岁左右
展示方式：${wearStr}

要求：
- ${card.wearType === 'wrist' ? '产品戴在手腕上展示，手部自然摆放，突出佩戴效果' : '手握住产品展示，握持自然真实'}
- **产品图片必须保持不变**：产品不变形、大小不变、形状不变、产品上的文字图案不变、产品必须高清
- 人物正脸出镜，脸部五官真实自然，皮肤纹理细节清晰可见（毛孔、肤质），真实人像照片质感，像手机实拍照片，无AI感、无塑料假面、无过度磨皮、无对称假脸
- 手部皮肤纹理真实自然
- **自然窗光/柔光板散射光，非影棚人工补光，无AI光感，光影过渡真实自然**，拒绝AI感、磨皮过度、卡通化、畸形`
          : `展示方式：${wearStr}

要求：
- ${card.wearType === 'wrist' ? '产品戴在手腕上展示' : '手握住产品展示'}
- **仅展示手部和产品**，不出现人脸和人物全身
- 手部皮肤纹理真实自然，手指自然不畸形
- **产品不变形、大小不变、形状不变、产品上的文字图案不变、产品必须高清**
- **自然窗光/柔光板散射光，非影棚人工补光，无AI光感**，拒绝AI感`;
        const genPrompt = `${card.title} - ${card.desc}

${personPart}
- 照片级真实感，高分辨率
- 无文字、无文案、无标签`;
        try {
          const resp = await editImage({ prompt: genPrompt, images: [refUrl], aspectRatio, resolution: quality, model: selectedModel });
          const imgUrl = resp.data?.[0]?.url || resp.image_url || resp.url || '';
          if (imgUrl) {
            const itemIdx = ++globalIdx;
            setResults(prev => [{ url: imgUrl, idx: itemIdx }, ...prev]);
            imageLibraryService.saveToLibrary({ image_url: imgUrl, prompt: genPrompt, model: String(selectedModel || 'nanobann2'), aspect_ratio: String(aspectRatio), resolution: String(quality || '2K'), type: 'edited' });
          }
        } catch (err: any) { console.error('生成失败:', err?.message || err); }
        doneCount++;
        setProgress(`生成中 (${doneCount}/${cards.length})...`);
      }));
    } catch (err: any) {
      console.error('分析/生成失败:', err);
      alert('操作失败: ' + (err.message || '请稍后重试'));
    } finally {
      setGenerating(false);
      setAnalyzing(false);
      setProgress('');
    }
  };

  const handleDownload = async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `handheld-${Date.now()}.png`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-gray-200 flex-shrink-0 bg-gray-50">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center"><Hand size={16} className="text-white" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[#171717]">人物手持产品</h1>
          <p className="text-[10px] text-gray-400 leading-tight">AI分析产品 → 生成多场景人物手持/佩戴展示图</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[380px] border-r border-gray-200 overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-gray-50">
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Images size={16} className="text-blue-500" />
              <div><h3 className="text-sm font-semibold text-[#171717]">产品图片</h3><p className="text-xs text-gray-400">上传产品图</p></div>
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

          {/* 展示模式 */}
          <div className="bg-white rounded-2xl p-5 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Hand size={16} className="text-blue-500" />
              <h3 className="text-sm font-semibold text-[#171717]">展示方式</h3>
            </div>
            <div className="flex gap-3">
              {DISPLAY_MODES.map(m => (
                <button key={m.value} onClick={() => setDisplayMode(m.value)}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${displayMode === m.value ? 'bg-blue-500 text-white shadow-sm' : 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'}`}>{m.label}</button>
              ))}
            </div>
          </div>

          {/* 人物设置（仅模特手持模式） */}
          {displayMode === 'model' && (
            <div className="bg-white rounded-2xl p-5 border border-[#E5E5E5] shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <Hand size={16} className="text-blue-500" />
                <h3 className="text-sm font-semibold text-[#171717]">人物设置</h3>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-medium text-[#A3A3A3] mb-2 block">性别</label>
                  <div className="flex gap-3">
                    {GENDERS.map(g => (
                      <button key={g.value} onClick={() => setGender(g.value)}
                        className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${gender === g.value ? 'bg-blue-500 text-white shadow-sm' : 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'}`}>{g.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#A3A3A3] mb-2 block">人种</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ETHNICITIES.map(e => (
                      <button key={e.value} onClick={() => setEthnicity(e.value)}
                        className={`py-3 rounded-xl text-sm font-medium transition-all ${ethnicity === e.value ? 'bg-blue-500 text-white shadow-sm' : 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'}`}>{e.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

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
            <div className="flex items-center gap-2 mb-3"><Images size={14} className="text-blue-500" /><span className="text-sm font-semibold text-[#171717]">比例</span></div>
            <div className="grid grid-cols-3 gap-2">{ASPECT_RATIOS.map(r => {
              const sel = aspectRatio === r.value;
              return <button key={r.value} onClick={() => setAspectRatio(r.value)} className={`py-2 rounded-xl text-xs font-medium transition-all ${sel ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{r.label}</button>;
            })}</div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">语言</span>
            </div>
            <select value={language} onChange={(e) => { setLanguage(e.target.value); saveLanguage(e.target.value); }}
              className="w-full bg-gray-100 px-3 py-2.5 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer">
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3"><Images size={14} className="text-blue-500" /><span className="text-sm font-semibold text-[#171717]">每产品张数</span></div>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map(n => (
                <button key={n} onClick={() => setCountPerProduct(n)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${countPerProduct === n ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{n}张</button>
              ))}
            </div>
          </div>

          {!analyzing && !generating && (
            <button onClick={handleAnalyzeAndGenerate} disabled={productImages.length === 0}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-gray-200 disabled:text-gray-400 shadow-sm">
              <Sparkles size={18} /> AI分析并生成展示图 ({productImages.length * countPerProduct}张)
            </button>
          )}
          {(analyzing || generating) && (
            <div className="text-center text-xs text-gray-400 bg-gray-100 rounded-xl py-3 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              {generating ? (progress || '生成中...') : 'AI分析中...'}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
          {!analyzing && !generating && results.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 mx-auto mb-5 bg-gray-100 rounded-2xl flex items-center justify-center"><Hand size={32} className="text-gray-300" /></div>
                <h2 className="text-lg font-semibold text-[#171717] mb-2">人物手持产品</h2>
                <p className="text-sm text-gray-400 leading-relaxed">上传产品图 → 设置人物参数 → 一键生成手持/佩戴展示图</p>
              </div>
            </div>
          ) : (
            <div className="p-6">
              {/* 分析中的进度指示 */}
              {analyzing && results.length === 0 && (
                <LoadingAnimation
                  title="AI 正在分析产品"
                  description={progress || '规划展示方案...'}
                  progress={progress || undefined}
                  thumbnails={productImages.map(item => item.preview)}
                />
              )}
              {/* 生成中的进度指示（还没有结果时） */}
              {generating && results.length === 0 && !analyzing && (
                <LoadingAnimation
                  title="正在生成展示图"
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
                      {generating && <span className="text-xs text-[#A3A3A3] font-normal ml-2">生成中...</span>}
                    </h2>
                    {generating && (
                      <div className="flex items-center gap-2 text-xs text-[#A3A3A3] bg-[#F5F5F5] rounded-xl px-3 py-1.5">
                        <Loader2 size={12} className="animate-spin text-violet-500" />
                        {progress}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {results.sort((a, b) => a.idx - b.idx).map((item) => (
                      <div key={item.idx} className="group relative bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
                        <div className="cursor-pointer" onClick={() => setPreviewImage(item.url)}><img src={item.url} alt="" className="w-full object-cover" /></div>
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-600">场景 #{item.idx}</span>
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
        aspectRatio={aspectRatio}
        model={selectedModel}
        resolution={quality}
        onClose={() => setReEditImage(null)}
        onReplaced={(oldUrl, newUrl) => setResults(prev => prev.map(item => item.url === oldUrl ? {...item, url: newUrl} : item))}
      />
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { Upload, Sparkles, Image as ImageIcon, X, Loader2, Check, ChevronDown, Download, Film, Globe } from 'lucide-react';
import { analyzeMultipleImages, chatCompletion } from '../../services/aiChatService';
import { editImage } from '../../services/imageService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { requireAuth } from '../../utils/authCheck';
import { getAvailableModels } from '../../services/modelService';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import { ModelSpeedNote } from '../../components/ModelSpeedNote';
import { LoadingAnimation } from '../../components/LoadingAnimation';

interface Shot {
  id: number;
  画面: string;
  动作: string;
  台词: string;
  景别: string;
  机位: string;
  时长: number;
}

interface AnalysisResult {
  character: string;
  environment: string;
  lighting: string;
  mood: string;
  sound: string;
  props: string;
  shots: Shot[];
}

const DEFAULT_SHOTS: Shot[] = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1,
  画面: '',
  动作: '',
  台词: '',
  景别: '',
  机位: '',
  时长: 2,
}));

const parseAnalysis = (text: string): AnalysisResult => {
  try {
    const json = text.match(/\{[\s\S]*\}/);
    if (!json) return { character: '', environment: '', lighting: '', mood: '', sound: '', props: '', shots: DEFAULT_SHOTS.map(s => ({ ...s })) };
    const s = JSON.parse(json[0]);
    return {
      character: s.character || '',
      environment: s.environment || '',
      lighting: s.lighting || '',
      mood: s.mood || '',
      sound: s.sound || '',
      props: s.props || '',
      shots: (s.shots || []).map((shot: any, i: number) => ({
        id: i + 1,
        画面: shot.画面 || '',
        动作: shot.动作 || '',
        台词: shot.台词 || '',
        景别: shot.景别 || '',
        机位: shot.机位 || '',
        时长: Math.max(1, Math.min(3, Number(shot.时长) || 2)),
      })),
    };
  } catch {
    return { character: '', environment: '', lighting: '', mood: '', sound: '', props: '', shots: DEFAULT_SHOTS.map(s => ({ ...s })) };
  }
};

function buildPrompt(duration: number, langLabel: string, script: string, shotCount: number): string {
  return `你是一个专业影视故事板分析师。请根据提供的参考图片和剧本文案，生成一份完整的故事板分析。
请严格按以下JSON格式返回，不要包含其他文字：

{
  "character": "主要角色造型设定描述",
  "environment": "核心场景环境描述",
  "lighting": "光影氛围描述",
  "mood": "情绪关键词（逗号分隔）",
  "sound": "音效/节奏描述",
  "props": "道具细节描述",
  "shots": [
    {
      "画面": "镜头画面描述",
      "动作": "人物动作",
      "台词": "台词或旁白",
      "景别": "远景/全景/中景/近景/特写",
      "机位": "固定/推/拉/摇/移/跟",
      "时长": 2
    }
  ]
}

要求：
- 总时长严格${duration}秒
- 严格${shotCount}个镜头，每个1-3秒
- 镜头需有连续剧情感
- 所有内容使用目标语言：${langLabel}

目标语言：${langLabel}
剧本文案：${script}`;
}

const LANGUAGES = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'ru', label: '俄语' },
  { value: 'th', label: '泰语' },
  { value: 'ms', label: '马来语' },
  { value: 'vi', label: '越南语' },
];

export const StoryboardPage: React.FC = () => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getAvailableModels().then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) setModel('gpt-image-2');
    });
  }, []);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [script, setScript] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [model, setModel] = useState('');
  const [language, setLanguage] = useState('zh');
  const [duration, setDuration] = useState(15);
  const [shotCount, setShotCount] = useState(6);
  const [quality, setQuality] = useState('2K');
  const [batchCount, setBatchCount] = useState(1);
  const [storyboardImages, setStoryboardImages] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [reEditImage, setReEditImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    const oversized = files.find(f => f.size > MAX_FILE_SIZE);
    if (oversized) {
      alert(`图片"${oversized.name}"超过 20MB，请压缩后重新上传`);
      e.target.value = '';
      return;
    }
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setUploadedImages(prev => [...prev, ev.target.result as string]);
        }
      };
      reader.onerror = () => console.error('图片加载失败:', file.name);
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (idx: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAnalyze = async () => {
    if (!requireAuth()) return;
    if (uploadedImages.length === 0 || !script.trim()) return;
    setAnalyzing(true);
    try {
      const langLabel = LANGUAGES.find(l => l.value === language)?.label || '中文';
      const prompt = buildPrompt(duration, langLabel, script, shotCount);
      const text = await analyzeMultipleImages(uploadedImages, prompt, { model: 'gemini-3.5-flash', maxTokens: 4096 });
      if (!text) { alert('AI返回为空，请重试'); setAnalyzing(false); return; }
      const parsed = parseAnalysis(text);
      if (!parsed.shots || parsed.shots.length === 0) {
        parsed.shots = Array.from({ length: shotCount }, (_, i) => ({
          id: i + 1, 画面: `镜头${i+1}画面`, 动作: '', 台词: '', 景别: '中景', 机位: '固定', 时长: 2
        }));
      }
      if (parsed.shots.length < 6) {
        while (parsed.shots.length < 6) {
          parsed.shots.push({ id: parsed.shots.length + 1, 画面: '', 动作: '', 台词: '', 景别: '', 机位: '', 时长: 2 });
        }
      }
      setResult(parsed);
      // 分析完成后自动开始生成
      setAnalyzing(false);
      setTimeout(() => handleGenerate(true), 200);
    } catch (err: any) {
      alert(err.message || '分析失败');
      setAnalyzing(false);
    }
  };

  const optimizeScript = async () => {
    if (!script.trim()) return;
    setOptimizing(true);
    try {
      const res = await chatCompletion([
        { role: 'system', content: '你是一个专业剧本优化师。请优化用户提供的剧本文案，增强画面感、节奏感和影视表现力。保留原始剧情结构，优化语言表达，使其更适合生成故事板分镜。直接返回优化后的剧本，不要额外解释。' },
        { role: 'user', content: script },
      ]);
      if (res) setScript(res);
    } catch {}
    setOptimizing(false);
  };

  const totalDuration = result?.shots.reduce((sum, s) => sum + (s.时长 || 0), 0) || 0;

  const handleGenerate = async (skipCheck?: boolean) => {
    if (!skipCheck && (!result || uploadedImages.length === 0)) return;
    setGenerating(true);
    setStoryboardImages([]);

    const shotsDesc = result.shots
      .filter(s => s.画面)
      .map((s, i) => `【镜头${i + 1}】画面：${s.画面}，动作：${s.动作}，台词：${s.台词}，景别：${s.景别}，机位：${s.机位}，时长：${s.时长}秒`)
      .join('\n');

    const langLabel = LANGUAGES.find(l => l.value === language)?.label || '中文';
    const basePrompt = `【重要】严格遵循参考图，产品/人物外观完全保持不变。

电影故事板，16:9横版，真实电影质感。

设定：角色「${result.character}」，场景「${result.environment}」，光影「${result.lighting}」，氛围「${result.mood}」

分镜：
${shotsDesc}

【光线场景要求】自然真实光影，暗部有真实阴影层次，场景像实拍电影画面而非CG渲染，光线柔和自然不刻意，整体有真实摄影质感。

语言：${langLabel}。`;

    try {
      const allUrls: string[] = [];
      for (let b = 0; b < batchCount; b++) {
        const prompt = batchCount > 1 ? `${basePrompt}\n\n第${b + 1}版，请使用不同的构图布局和画面风格，不能与前版雷同。` : basePrompt;
        const res = await editImage({ prompt, images: uploadedImages, model, resolution: quality, aspectRatio: '16:9' });
        const url = res.data?.[0]?.url || res.image_url || res.url || '';
        if (url) {
          allUrls.push(url);
          setStoryboardImages([...allUrls]);
          imageLibraryService.saveToLibrary({ image_url: url, prompt, model: String(model || 'nanobann2'), aspect_ratio: String('16:9'), resolution: String(quality || '2K'), type: 'edited' });
        }
      }
      if (allUrls.length === 0) throw new Error('生成返回为空');
    } catch (err: any) {
      console.error('Storyboard generation failed:', err);
      alert('生成失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  const shotInputs = result?.shots || DEFAULT_SHOTS.map(s => ({ ...s }));
  const shots = result ? result.shots : DEFAULT_SHOTS.map(s => ({ ...s }));

  const updateShot = (idx: number, field: keyof Shot, value: any) => {
    if (!result) return;
    const updated = { ...result };
    updated.shots = updated.shots.map((s, i) => i === idx ? { ...s, [field]: value } : s);
    setResult(updated);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F8FAFE] min-w-0 overflow-hidden">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-gray-200 flex-shrink-0 bg-gray-50">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center">
          <Film size={16} className="text-white" />
        </div>
        <h1 className="text-base font-semibold text-[#171717]">故事板</h1>
        <span className="px-2 py-0.5 text-xs text-white bg-[#171717] rounded-xl">AI生成</span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[380px] border-r border-gray-200 overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-gray-50">
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <ImageIcon size={16} className="text-blue-500" />
              <div><h3 className="text-sm font-semibold text-[#171717]">参考图片</h3><p className="text-xs text-gray-400">上传剧照或参考图</p></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {uploadedImages.map((img, idx) => (
                <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden bg-gray-100 border border-gray-200">
                  <img src={img} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removeImage(idx)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100"><X size={14} className="text-white" /></button>
                </div>
              ))}
              {uploadedImages.length < 6 && (
                <button onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 hover:border-gray-400 transition-colors bg-white">
                  <Upload size={16} className="text-gray-400" /><span className="text-[10px] text-gray-400">上传</span>
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">剧本文案 <span className="text-red-500">*</span></span>
              <button onClick={optimizeScript} disabled={!script.trim() || optimizing}
                className="ml-auto text-[10px] px-2 py-1 bg-[#171717] text-white rounded-xl hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 transition-colors">
                {optimizing ? '优化中...' : 'AI优化'}
              </button>
            </div>
            <textarea value={script} onChange={e => setScript(e.target.value)} placeholder="输入剧本文案或故事描述..."
              className="w-full bg-gray-100 rounded-xl p-3 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none min-h-[120px] text-[#333333] placeholder:text-gray-400" />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Globe size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">目标语言</span>
            </div>
            <select value={language} onChange={e => setLanguage(e.target.value)}
              className="w-full bg-gray-100 px-3 py-2.5 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer">
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3"><Sparkles size={14} className="text-blue-500" /><span className="text-sm font-semibold text-[#171717]">模型</span></div>
            <div className="relative">
              <select value={model} onChange={e => setModel(e.target.value)}
                className="w-full bg-gray-100 px-3 py-2.5 pr-8 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer">
                {models.length > 0 ? models.map(m => <option key={m.value} value={m.value}>{m.label}</option>) : <option value="">请选择</option>}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <ModelSpeedNote />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3"><Film size={14} className="text-blue-500" /><span className="text-sm font-semibold text-[#171717]">时长</span></div>
            <div className="grid grid-cols-4 gap-2">
              {[8, 10, 12, 15].map(s => (
                <button key={s} onClick={() => {
                  setDuration(s);
                  // 时长变更时自动调整可用镜头数
                  if (s <= 10 && shotCount > 8) setShotCount(8);
                  if (s === 8 && shotCount > 8) setShotCount(6);
                }}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${duration === s ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{s}秒</button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3"><Film size={14} className="text-blue-500" /><span className="text-sm font-semibold text-[#171717]">镜头数</span></div>
            <div className="grid grid-cols-4 gap-2">
              {[6, 8, 10, 12].map(n => {
                const disabled = (n === 12 && duration < 15) || (n === 10 && duration < 12);
                return (
                <button key={n} disabled={disabled}
                  onClick={() => setShotCount(n)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${shotCount === n ? 'bg-blue-500 text-white' : disabled ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{n}个</button>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3"><Sparkles size={14} className="text-blue-500" /><span className="text-sm font-semibold text-[#171717]">清晰度</span></div>
            <div className="flex gap-2">
              {['2K', '4K'].map(q => (
                <button key={q} onClick={() => setQuality(q)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${quality === q ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{q}</button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3"><Sparkles size={14} className="text-blue-500" /><span className="text-sm font-semibold text-[#171717]">生成张数</span></div>
            <div className="relative">
              <select value={batchCount} onChange={e => setBatchCount(Number(e.target.value))}
                className="w-full bg-[#F5F5F5] px-3 py-2.5 pr-8 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 appearance-none cursor-pointer">
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}张</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <button onClick={handleAnalyze} disabled={uploadedImages.length === 0 || !script.trim() || analyzing}
            className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-gray-800 transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed shadow-sm">
            {analyzing ? <><Loader2 size={18} className="animate-spin" /> AI分析中...</> : <><Sparkles size={18} /> AI分析并生成分镜</>}
          </button>

          {generating && (
            <LoadingAnimation title="生成故事板图片中" description="AI正在根据分析结果生成故事板图片，请稍候..." />
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
          {!result && !generating && storyboardImages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 mx-auto mb-5 bg-gray-100 rounded-2xl flex items-center justify-center">
                  <Film size={32} className="text-gray-300" />
                </div>
                <h2 className="text-lg font-semibold text-[#171717] mb-2">AI故事板</h2>
                <p className="text-sm text-gray-400 leading-relaxed">上传参考图 → 输入剧本 → AI分析 → 生成专业级电影故事板</p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {result && !generating && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
                    <h2 className="text-sm font-semibold text-[#171717]">AI分析 - 故事板方案</h2>
                    <p className="text-xs text-gray-400 mt-0.5">共 {result.shots.length} 镜头 · 总时长 {totalDuration}秒</p>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: '角色', field: 'character' as const },
                        { label: '场景', field: 'environment' as const },
                        { label: '光影', field: 'lighting' as const },
                        { label: '情绪', field: 'mood' as const },
                      ].map(item => (
                        <div key={item.field} className="bg-gray-50 rounded-xl p-3">
                          <span className="text-[10px] text-gray-400 block mb-0.5">{item.label}</span>
                          <textarea value={result[item.field] as string} onChange={e => {
                            setResult({ ...result, [item.field]: e.target.value });
                          }} rows={1}
                            className="w-full bg-transparent text-xs text-[#171717] border-0 focus:outline-none focus:ring-0 resize-none overflow-hidden p-0"
                            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                            ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
                        </div>
                      ))}
                    </div>
                    <div>
                      {shots.map((shot, idx) => (
                        <div key={idx} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                          <span className="w-6 h-6 bg-[#171717] text-white rounded-xl flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="space-y-3">
                              <div><span className="text-[10px] text-gray-400 block mb-1">画面</span><textarea value={shot.画面} onChange={e => { updateShot(idx, '画面', e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} rows={2} className="w-full bg-gray-50 rounded-xl px-3 py-2 text-xs border-0 focus:ring-2 focus:ring-blue-500/20 resize-none overflow-hidden text-[#171717]" ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} /></div>
                              <div className="grid grid-cols-2 gap-3">
                                <div><span className="text-[10px] text-gray-400 block mb-1">动作</span><textarea value={shot.动作} onChange={e => { updateShot(idx, '动作', e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} rows={1} className="w-full bg-gray-50 rounded-xl px-3 py-2 text-xs border-0 focus:ring-2 focus:ring-blue-500/20 resize-none overflow-hidden text-[#171717]" ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} /></div>
                                <div><span className="text-[10px] text-gray-400 block mb-1">台词</span><textarea value={shot.台词} onChange={e => { updateShot(idx, '台词', e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} rows={1} className="w-full bg-gray-50 rounded-xl px-3 py-2 text-xs border-0 focus:ring-2 focus:ring-blue-500/20 resize-none overflow-hidden text-[#171717]" ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} /></div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2"><span className="text-[10px] text-gray-400">景别</span>
                                  <select value={shot.景别} onChange={e => updateShot(idx, '景别', e.target.value)} className="bg-gray-50 rounded-xl px-2 py-1 text-xs border-0 focus:ring-2 focus:ring-blue-500/20 text-[#171717]">
                                    {['远景', '全景', '中景', '近景', '特写'].map(o => <option key={o}>{o}</option>)}
                                  </select>
                                </div>
                                <div className="flex items-center gap-2"><span className="text-[10px] text-gray-400">机位</span>
                                  <select value={shot.机位} onChange={e => updateShot(idx, '机位', e.target.value)} className="bg-gray-50 rounded-xl px-2 py-1 text-xs border-0 focus:ring-2 focus:ring-blue-500/20 text-[#171717]">
                                    {['固定', '推', '拉', '摇', '移', '跟'].map(o => <option key={o}>{o}</option>)}
                                  </select>
                                </div>
                                <div className="flex items-center gap-2"><span className="text-[10px] text-gray-400">时长</span>
                                  <select value={shot.时长} onChange={e => updateShot(idx, '时长', Number(e.target.value))} className="bg-gray-50 rounded-xl px-2 py-1 text-xs border-0 focus:ring-2 focus:ring-blue-500/20 text-[#171717]">
                                    {[1, 2, 3].map(s => <option key={s} value={s}>{s}秒</option>)}
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {storyboardImages.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[#171717]">生成结果 ({storyboardImages.length})</h2>
                  </div>
                  <div className="p-5 grid grid-cols-2 gap-4">
                    {storyboardImages.map((url, idx) => (
                      <div key={idx} className="group relative">
                        <img src={url} alt={`故事板${idx + 1}`} className="w-full rounded-xl border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setShowPreview(true)} />
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/50 text-white text-[10px] rounded-xl">#{(idx + 1)}</div>
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setReEditImage(url)} className="w-7 h-7 bg-black/50 rounded-xl flex items-center justify-center"><Sparkles size={12} className="text-white" /></button>
                          <button onClick={() => window.open(url, '_blank')} className="w-7 h-7 bg-black/50 rounded-xl flex items-center justify-center"><Download size={12} className="text-white" /></button>
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
      <ImagePreviewModal isOpen={showPreview} onClose={() => setShowPreview(false)} imageUrl={storyboardImages[0] || ''} />
      <ReEditModal
        isOpen={!!reEditImage}
        imageUrl={reEditImage || ''}
        aspectRatio="16:9"
        model={model}
        resolution={quality}
        onClose={() => setReEditImage(null)}
        onReplaced={(oldUrl, newUrl) => setStoryboardImages(prev => prev.map(u => u === oldUrl ? newUrl : u))}
      />
    </div>
  );
};

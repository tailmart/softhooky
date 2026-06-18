import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, Wand2, Download, Video, Clapperboard, ChevronDown, Copy, Check } from 'lucide-react';
import { fileToDataUrl } from '../../../services/r2Service';
import { editImage } from '../../../services/imageService';
import { analyzeMultipleImages } from '../../../services/aiChatService';
import { imageLibraryService } from '../../../services/imageLibraryService';
import { requireAuth } from '../../../utils/authCheck';
import { getAvailableModels } from '../../../services/modelService';
import { ImagePreviewModal } from '../../../components/ImagePreviewModal';
import { ModelSpeedNote } from '../../../components/ModelSpeedNote';

const SCRIPTS = [
  { id: 'template1', title: '痛点场景', label: '痛点场景', structure: ['钩子/痛点放大', '痛点解决/产品卖点', '行动号召'] },
  { id: 'template2', title: '问题推荐', label: '问题推荐', structure: ['问题场景钩子', '解决方案/产品推荐', '行动号召'] },
  { id: 'template3', title: '好物推荐', label: '好物推荐', structure: ['观点钩子', '产品推荐+卖点', '行动号召'] },
  { id: 'template4', title: '避坑展示', label: '避坑展示', structure: ['展示缺陷/痛点', '解决方案'] },
  { id: 'template5', title: '建议推荐', label: '建议推荐', structure: ['建议钩子', '推荐理由'] },
  { id: 'template6', title: '反串抓马', label: '反串抓马', structure: ['黄金3秒开篇', '冲突爆点', '爽点反转', '高频混剪', '收尾转化'] },
  { id: 'template7', title: '反差对比', label: '反差对比', structure: ['痛苦现状', '优质对比', '极致爽感', '情绪反馈'] },
  { id: 'template8', title: '故事带入', label: '故事带入', structure: ['真实经历开头', '情绪渲染', '剧情反转', '价值启发'] },
  { id: 'template9', title: '清单分享', label: '清单分享', structure: ['标题钩子', '分点干货', '互动引导'] },
  { id: 'template10', title: '热点借势', label: '热点借势', structure: ['热点引入', '产品关联', '行动号召'] },
];

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

type SubMode = 'tk' | 'storyboard';

interface SceneData { scene: number; visualPrompt: string; caption: string; }
interface TkAnalysis { templateId: string; templateLabel: string; data: { title: string; copy: string; scenes: SceneData[] } }
interface Shot { id: number; 画面: string; 动作: string; 台词: string; 景别: string; 机位: string; 时长: number; }
interface StoryboardResult { character: string; environment: string; lighting: string; mood: string; shots: Shot[] }

const DEFAULT_SHOTS: Shot[] = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, 画面: '', 动作: '', 台词: '', 景别: '中景', 机位: '固定', 时长: 2 }));

export const ScriptTab: React.FC = () => {
  const [subMode, setSubMode] = useState<SubMode>('tk');
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState('gpt-image-2');
  const [productImages, setProductImages] = useState<{ file: File; preview: string }[]>([]);
  const [productName, setProductName] = useState('');
  const [productDesc, setProductDesc] = useState('');
  const [language, setLanguage] = useState('zh');
  const [sceneCount, setSceneCount] = useState(6);
  const [selectedScripts, setSelectedScripts] = useState<string[]>([SCRIPTS[0].id]);
  const [analyzing, setAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // TK mode state
  const [tkAnalyses, setTkAnalyses] = useState<TkAnalysis[]>([]);
  const [tkResults, setTkResults] = useState<string[]>([]);

  // Storyboard mode state
  const [script, setScript] = useState('');
  const [sbResult, setSbResult] = useState<StoryboardResult | null>(null);
  const [sbImages, setSbImages] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAvailableModels().then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) setSelectedModel('gpt-image-2');
    });
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    const oversized = files.find(f => f.size > MAX_FILE_SIZE);
    if (oversized) { alert(`图片"${oversized.name}"超过 20MB，请压缩后重新上传`); e.target.value = ''; return; }
    const newItems = files.map(f => ({ file: f, preview: '' }));
    Promise.all(newItems.map(item => new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => { item.preview = reader.result as string; resolve(); };
      reader.onerror = reject;
      reader.readAsDataURL(item.file);
    }))).then(() => setProductImages(prev => [...prev, ...newItems].slice(0, 10))).catch(() => alert('部分图片处理失败'));
  };

  const removeImage = (idx: number) => setProductImages(prev => prev.filter((_, i) => i !== idx));

  const handleAnalyze = async () => {
    if (!requireAuth()) return;
    if (productImages.length === 0) { alert('请上传产品图片'); return; }
    setAnalyzing(true);
    setTkAnalyses([]); setTkResults([]); setSbResult(null); setSbImages([]);

    try {
      const b64s = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1200)));
      const langInfo = LANGUAGES.find(l => l.value === language) || LANGUAGES[0];

      if (subMode === 'tk') {
        const activeTemplates = SCRIPTS.filter(s => selectedScripts.includes(s.id));
        if (activeTemplates.length === 0) { alert('请至少选择一个脚本模板'); setAnalyzing(false); return; }
        const results = await Promise.all(activeTemplates.map(async (tmpl) => {
          const structureText = tmpl.structure.map((s, i) => `镜头${i + 1}: ${s}`).join('\n');
          const prompt = `你是一个TikTok短视频脚本专家。根据产品图片和脚本模板，创作视频脚本。
产品名称: ${productName || '产品'}，描述: ${productDesc || '无'}
语言: ${langInfo.label}，模板: ${tmpl.title}
结构: ${structureText}
共${sceneCount}个镜头。每个镜头包含scene(序号), visualPrompt(画面描述), caption(旁白)。
产品外观必须与参考图一致，人物真实自然。
返回JSON: {"title":"标题","copy":"完整文案","scenes":[{"scene":1,"visualPrompt":"...","caption":"..."}]}`;
          const raw = await analyzeMultipleImages(b64s, prompt, { model: 'gemini-3.5-flash', maxTokens: 8000 });
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (!jsonMatch) return null;
          return { templateId: tmpl.id, templateLabel: tmpl.label, data: JSON.parse(jsonMatch[0]) };
        }));
        const valid = results.filter(Boolean) as TkAnalysis[];
        if (valid.length === 0) alert('分析失败，请重试');
        else setTkAnalyses(valid);
      } else {
        if (!script.trim()) { alert('请输入剧本文案'); setAnalyzing(false); return; }
        const prompt = `你是专业影视故事板分析师。根据参考图和剧本生成故事板分析。
语言: ${langInfo.label}，总时长15秒，${sceneCount}个镜头。
返回JSON: {"character":"角色设定","environment":"场景","lighting":"光影","mood":"情绪","shots":[{"画面":"...","动作":"...","台词":"...","景别":"中景","机位":"固定","时长":2}]}
剧本: ${script}`;
        const raw = await analyzeMultipleImages(b64s, prompt, { model: 'gemini-3.5-flash', maxTokens: 4096 });
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          parsed.shots = (parsed.shots || []).map((s: any, i: number) => ({
            id: i + 1, 画面: s.画面 || '', 动作: s.动作 || '', 台词: s.台词 || '',
            景别: s.景别 || '中景', 机位: s.机位 || '固定', 时长: Math.min(3, Math.max(1, Number(s.时长) || 2)),
          }));
          if (parsed.shots.length < sceneCount) {
            while (parsed.shots.length < sceneCount) parsed.shots.push({ ...DEFAULT_SHOTS[0], id: parsed.shots.length + 1 });
          }
          setSbResult(parsed);
          // auto-generate for storyboard
          setTimeout(() => handleGenerate(true), 200);
        } else { alert('分析失败，请重试'); }
      }
    } catch (err: any) {
      alert('分析失败: ' + err.message);
    }
    setAnalyzing(false);
  };

  const handleGenerate = async (skipCheck?: boolean) => {
    if (!requireAuth()) return;
    if (!skipCheck && subMode === 'tk' && tkAnalyses.length === 0) return;
    if (!skipCheck && subMode === 'storyboard' && !sbResult) return;
    setIsGenerating(true);
    if (subMode === 'tk') setTkResults([]); else setSbImages([]);

    try {
      const b64s = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1536)));

      if (subMode === 'tk') {
        const genTasks: { prompt: string; label: string }[] = [];
        for (const item of tkAnalyses) {
          const cols = sceneCount >= 10 ? 4 : 3;
          const rows = Math.ceil(item.data.scenes.length / cols);
          const scenesDesc = item.data.scenes.map(s => `图${s.scene}(第${Math.ceil(s.scene / cols)}行第${((s.scene - 1) % cols) + 1}列): ${s.visualPrompt}`).join('\n');
          genTasks.push({
            prompt: `生成16:9视频分镜合成图，${item.templateLabel}模板，${rows}行×${cols}列网格布局。\n${scenesDesc}\n产品外观与参考图一致，每图左上角白色编号，人物真实自然。`,
            label: item.templateLabel,
          });
        }
        const total = genTasks.length;
        for (let i = 0; i < total; i++) {
          setProgress(`生成中 (${i + 1}/${total})...`);
          try {
            const resp = await editImage({ prompt: genTasks[i].prompt, images: b64s, aspectRatio: '16:9', resolution: '2K', model: selectedModel });
            const url = resp.data?.[0]?.url || resp.image_url || resp.url || '';
            if (url) {
              setTkResults(prev => [url, ...prev]);
              imageLibraryService.saveToLibrary({ image_url: url, prompt: genTasks[i].prompt, model: selectedModel, aspect_ratio: '16:9', resolution: '2K', type: 'edited' });
            }
          } catch (e) { console.error('生成失败:', e); }
        }
      } else {
        if (!sbResult) return;
        const shotsDesc = sbResult.shots.filter(s => s.画面).map((s, i) => `镜头${i + 1}: ${s.画面}，${s.动作}，${s.台词}，${s.景别}，${s.机位}`).join('\n');
        const prompt = `电影故事板16:9，角色「${sbResult.character}」，场景「${sbResult.environment}」，光影「${sbResult.lighting}」。\n分镜:\n${shotsDesc}\n产品/人物外观与参考图完全一致，真实电影质感光影。`;
        const resp = await editImage({ prompt, images: b64s, model: selectedModel, resolution: '2K', aspectRatio: '16:9' });
        const url = resp.data?.[0]?.url || resp.image_url || resp.url || '';
        if (url) {
          setSbImages([url]);
          imageLibraryService.saveToLibrary({ image_url: url, prompt, model: selectedModel, aspect_ratio: '16:9', resolution: '2K', type: 'edited' });
        }
      }
    } catch (err: any) {
      console.error('生成失败:', err);
    }
    setIsGenerating(false);
    setProgress('');
  };

  const handleDownload = async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `script-${Date.now()}.png`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => { setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 2000); });
  };

  const hasResults = subMode === 'tk' ? (tkAnalyses.length > 0 || tkResults.length > 0) : (sbResult !== null || sbImages.length > 0);

  return (
    <div className="h-full flex flex-col min-w-0" style={{ background: '#F8FAFC' }}>
      <div className="h-full flex">
        {/* LEFT CONTROLS */}
        <div className="w-[400px] shrink-0 h-full overflow-y-auto p-5 pb-24 space-y-4" style={{ background: '#FFFFFF', borderRight: '1px solid #E2E8F0', scrollbarWidth: 'thin', scrollbarColor: '#CBD5E1 #FFFFFF' }}>
          {/* Sub-mode toggle */}
          <div className="flex rounded-2xl p-1" style={{ background: '#F1F5F9' }}>
            {([['tk', 'TK脚本图', Video], ['storyboard', '故事板', Clapperboard]] as [SubMode, string, any][]).map(([mode, label, Icon]) => (
              <button key={mode} onClick={() => setSubMode(mode)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={subMode === mode ? { background: '#FFFFFF', color: '#2563EB', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { color: '#64748B' }}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {/* Upload */}
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
            <div className="flex items-center gap-3 mb-4">
              <Plus size={16} style={{ color: '#2563EB' }} />
              <div><h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>产品图片</h3><p className="text-xs" style={{ color: '#64748B' }}>多角度产品图</p></div>
              <span className="ml-auto text-xs px-2 py-1 rounded-xl" style={{ color: '#64748B', background: '#F1F5F9' }}>{productImages.length}/10</span>
            </div>
            {productImages.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mb-3">{productImages.map((item, idx) => (
                <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden" style={{ background: '#F1F5F9' }}>
                  <img src={item.preview} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removeImage(idx)} className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100" style={{ background: 'rgba(0,0,0,0.6)' }}><X size={14} className="text-white" /></button>
                </div>
              ))}</div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleUpload} multiple accept="image/*" className="hidden" />
            <div onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed p-3 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all rounded-xl"
              style={{ borderColor: '#CBD5E1', background: '#F8FAFC' }}>
              <Plus size={18} style={{ color: '#64748B' }} /><span className="text-xs" style={{ color: '#64748B' }}>上传产品图片</span>
            </div>
          </div>

          {/* TK-specific controls */}
          {subMode === 'tk' && (
            <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} style={{ color: '#2563EB' }} />
                <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>脚本模板</span>
                <span className="ml-auto text-xs" style={{ color: '#64748B' }}>{selectedScripts.length}个已选</span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {SCRIPTS.map(s => {
                  const sel = selectedScripts.includes(s.id);
                  return (
                    <button key={s.id} onClick={() => {
                      if (selectedScripts.length === 1 && sel) return;
                      setSelectedScripts(prev => sel ? prev.filter(v => v !== s.id) : [...prev, s.id]);
                    }} className="w-full text-left px-3 py-2 rounded-xl text-sm transition-all"
                      style={{ background: sel ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${sel ? '#BFDBFE' : 'transparent'}`, color: sel ? '#2563EB' : '#64748B' }}>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
                          style={{ borderColor: sel ? '#2563EB' : '#CBD5E1', background: sel ? '#2563EB' : 'transparent' }}>
                          {sel && <Check size={10} className="text-white" />}
                        </div>
                        <span className="text-xs font-medium">{s.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Storyboard-specific controls */}
          {subMode === 'storyboard' && (
            <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} style={{ color: '#2563EB' }} />
                <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>剧本文案 <span style={{ color: '#ef4444' }}>*</span></span>
              </div>
              <textarea value={script} onChange={e => setScript(e.target.value)} placeholder="输入剧本文案或故事描述..."
                className="w-full rounded-xl p-3 text-sm resize-none min-h-[100px]"
                style={{ background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0', outline: 'none' }} />
              <button disabled={!script.trim()}
                className="mt-3 text-xs px-3 py-1.5 rounded-xl transition-all"
                style={{ background: 'rgba(37,99,235,0.15)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.3)' }}>
                AI优化剧本
              </button>
            </div>
          )}

          {/* Language */}
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
            <label className="text-xs mb-2 block" style={{ color: '#64748B' }}>语言</label>
            <select value={language} onChange={e => setLanguage(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm appearance-none cursor-pointer"
              style={{ background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0', outline: 'none' }}>
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          {/* Scene count */}
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
            <label className="text-xs mb-2 block" style={{ color: '#64748B' }}>镜头数</label>
            <div className="grid grid-cols-4 gap-2">
              {[6, 8, 10, 12].map(n => (
                <button key={n} onClick={() => setSceneCount(n)}
                  className="py-2 rounded-xl text-xs font-medium transition-all"
                  style={sceneCount === n ? { background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#fff' } : { background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>
                  {n}个
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
            <label className="text-xs mb-2 block" style={{ color: '#64748B' }}>模型</label>
            <div className="relative">
              <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2.5 pr-8 rounded-xl text-sm appearance-none cursor-pointer"
                style={{ background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0', outline: 'none' }}>
                {models.length > 0 ? models.map(m => <option key={m.value} value={m.value}>{m.label}</option>) : <option value="gpt-image-2">GPT Image 2</option>}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#64748B' }} />
            </div>
            <ModelSpeedNote />
          </div>

          {/* Action buttons */}
          {!analyzing && !isGenerating && (
            <button onClick={handleAnalyze}
              disabled={productImages.length === 0}
              className="w-full py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
              style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#fff', boxShadow: '0 8px 32px rgba(37,99,235,0.3)', opacity: productImages.length === 0 ? 0.4 : 1 }}>
              <Sparkles size={18} /> {subMode === 'tk' ? '分析脚本' : 'AI分析并生成分镜'}
            </button>
          )}
          {subMode === 'tk' && tkAnalyses.length > 0 && !isGenerating && (
            <button onClick={() => handleGenerate()}
              className="w-full py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
              style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#fff', boxShadow: '0 8px 32px rgba(37,99,235,0.3)' }}>
              <Wand2 size={18} /> 生成视频分镜 ({tkAnalyses.length}张)
            </button>
          )}
          {(analyzing || isGenerating) && (
            <div className="flex items-center gap-3 py-3 justify-center">
              <Loader2 size={18} className="animate-spin" style={{ color: '#2563EB' }} />
              <span className="text-sm" style={{ color: '#0F172A' }}>{progress || (analyzing ? 'AI分析中...' : '生成中...')}</span>
            </div>
          )}
        </div>

        {/* RIGHT RESULTS */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto" style={{ background: '#F8FAFC' }}>
          {!hasResults && !analyzing && !isGenerating ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 mx-auto mb-5 rounded-3xl flex items-center justify-center" style={{ background: '#EFF6FF' }}>
                  {subMode === 'tk' ? <Video size={32} style={{ color: '#2563EB' }} /> : <Clapperboard size={32} style={{ color: '#2563EB' }} />}
                </div>
                <h2 className="text-lg font-semibold mb-2" style={{ color: '#0F172A' }}>{subMode === 'tk' ? 'TK 视频脚本' : 'AI 故事板'}</h2>
                <p className="text-sm leading-relaxed" style={{ color: '#64748B' }}>
                  {subMode === 'tk' ? '上传产品图 → 选择脚本模板 → AI 分析生成视频分镜' : '上传参考图 → 输入剧本 → AI 分析 → 生成专业故事板'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Progress */}
              {isGenerating && (
                <div className="sticky top-0 z-10 px-6 py-3 flex-shrink-0" style={{ background: 'rgba(248,250,252,0.9)', borderBottom: '1px solid #E2E8F0', backdropFilter: 'blur(8px)' }}>
                  <div className="flex items-center gap-3">
                    <Loader2 size={16} className="animate-spin" style={{ color: '#2563EB' }} />
                    <span className="text-sm font-medium" style={{ color: '#0F172A' }}>{progress}</span>
                    <span className="text-xs ml-auto" style={{ color: '#64748B' }}>
                      已生成 {subMode === 'tk' ? tkResults.length : sbImages.length} 张
                    </span>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* TK Results */}
                {subMode === 'tk' && tkResults.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>视频分镜合成图 ({tkResults.length})</h2>
                    <div className="grid grid-cols-2 gap-4">
                      {tkResults.map((url, idx) => (
                        <div key={idx} className="group relative rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                          <div className="cursor-pointer" onClick={() => setPreviewImage(url)}><img src={url} alt="" className="w-full h-auto" /></div>
                          <div className="p-3 flex items-center justify-between">
                            <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>分镜 #{idx + 1}</span>
                            <div className="flex gap-1">
                              <button onClick={() => handleDownload(url)} className="w-7 h-7 flex items-center justify-center rounded-xl" style={{ color: '#64748B' }}><Download size={14} /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TK Script analyses */}
                {subMode === 'tk' && tkAnalyses.length > 0 && tkAnalyses.map((item, ai) => (
                  <div key={ai} className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-0.5 text-[10px] rounded-lg" style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#fff' }}>{item.templateLabel}</span>
                      <button onClick={() => handleCopy(JSON.stringify(item.data, null, 2), ai)} className="ml-auto w-7 h-7 flex items-center justify-center rounded-xl" style={{ color: '#64748B' }}>
                        {copiedIdx === ai ? <Check size={14} style={{ color: '#2563EB' }} /> : <Copy size={14} />}
                      </button>
                    </div>
                    <h3 className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>{item.data.title}</h3>
                    <p className="text-sm whitespace-pre-wrap mb-4" style={{ color: '#94a3b8' }}>{item.data.copy}</p>
                    <div className="space-y-2">
                      {item.data.scenes.map(s => (
                        <div key={s.scene} className="rounded-xl p-3" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                          <div className="text-xs font-bold mb-1" style={{ color: '#2563EB' }}>镜头 #{s.scene}</div>
                          <div className="text-xs mb-1" style={{ color: '#94a3b8' }}><span style={{ color: '#0F172A' }}>画面:</span> {s.visualPrompt}</div>
                          <div className="text-xs" style={{ color: '#94a3b8' }}><span style={{ color: '#0F172A' }}>旁白:</span> {s.caption}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Storyboard images */}
                {subMode === 'storyboard' && sbImages.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>故事板图片 ({sbImages.length})</h2>
                    <div className="grid grid-cols-2 gap-4">
                      {sbImages.map((url, idx) => (
                        <div key={idx} className="group relative rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                          <div className="cursor-pointer" onClick={() => setPreviewImage(url)}>
                            <img src={url} alt="" className="w-full h-auto" />
                            <div className="absolute top-2 left-2 px-2 py-0.5 text-white text-[10px] rounded-lg" style={{ background: 'rgba(0,0,0,0.6)' }}>#{idx + 1}</div>
                          </div>
                          <div className="p-3 flex items-center justify-end gap-1">
                            <button onClick={() => handleDownload(url)} className="w-7 h-7 flex items-center justify-center rounded-xl" style={{ color: '#64748B' }}><Download size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Storyboard analysis result */}
                {subMode === 'storyboard' && sbResult && (
                  <div className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                    <div className="px-5 py-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>AI分析 - 故事板方案</h2>
                      <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>共 {sbResult.shots.length} 镜头</p>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        {[{ label: '角色', val: sbResult.character }, { label: '场景', val: sbResult.environment }, { label: '光影', val: sbResult.lighting }, { label: '情绪', val: sbResult.mood }].map(item => (
                          <div key={item.label} className="rounded-xl p-3" style={{ background: '#F8FAFC' }}>
                            <span className="text-[10px] block mb-0.5" style={{ color: '#64748B' }}>{item.label}</span>
                            <span className="text-xs" style={{ color: '#0F172A' }}>{item.val}</span>
                          </div>
                        ))}
                      </div>
                      {sbResult.shots.map((shot, idx) => (
                        <div key={idx} className="flex items-start gap-3 py-2" style={{ borderBottom: idx < sbResult.shots.length - 1 ? '1px solid #E2E8F0' : 'none' }}>
                          <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                            style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#fff' }}>{idx + 1}</span>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="text-xs" style={{ color: '#0F172A' }}><span style={{ color: '#2563EB' }}>画面:</span> <span style={{ color: '#94a3b8' }}>{shot.画面}</span></div>
                            <div className="text-xs" style={{ color: '#0F172A' }}><span style={{ color: '#2563EB' }}>动作:</span> <span style={{ color: '#94a3b8' }}>{shot.动作}</span></div>
                            <div className="text-xs" style={{ color: '#0F172A' }}><span style={{ color: '#2563EB' }}>台词:</span> <span style={{ color: '#94a3b8' }}>{shot.台词}</span></div>
                            <div className="flex items-center gap-3 text-[10px]" style={{ color: '#64748B' }}>
                              <span>{shot.景别}</span><span>·</span><span>{shot.机位}</span><span>·</span><span>{shot.时长}秒</span>
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
    </div>
  );
};

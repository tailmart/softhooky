import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, FileImage, Wand2, Download, Eye, Check, Copy, Globe, Share2, ChevronDown } from 'lucide-react';
import { fileToDataUrl } from '../../../services/r2Service';
import { editImage } from '../../../services/imageService';
import { analyzeMultipleImages } from '../../../services/aiChatService';
import { uploadFileToCos } from '../../../services/cosService';
import { imageLibraryService } from '../../../services/imageLibraryService';
import { requireAuth } from '../../../utils/authCheck';
import { getAvailableModels } from '../../../services/modelService';
import { createConcurrencyLimit } from '../../../utils/concurrency';
import { ImagePreviewModal } from '../../../components/ImagePreviewModal';
import { ModelSpeedNote } from '../../../components/ModelSpeedNote';

const LANGUAGES = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
];

const ASPECT_RATIOS = [
  { value: '1:1', label: '1:1', platform: 'Ins' },
  { value: '9:16', label: '9:16', platform: 'TikTok' },
  { value: '4:5', label: '4:5', platform: 'FB' },
  { value: '2:3', label: '2:3', platform: 'Pinterest' },
];

const XHS_IMAGE_TYPES = ['封面图', '主图', '细节图', '对比图', '使用场景图'];

type SubMode = 'xhs' | 'social';
interface SocialCard { title: string; description: string; pov: string; ratio: string; }
interface GenResult { url: string; title: string; ratio: string; idx: number; }

export const SocialTab: React.FC = () => {
  const [subMode, setSubMode] = useState<SubMode>('xhs');
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState('nanobann2');
  const [productImages, setProductImages] = useState<{ file: File; preview: string }[]>([]);
  const [productName, setProductName] = useState('');
  const [productDesc, setProductDesc] = useState('');
  const [language, setLanguage] = useState('zh');
  const [quality, setQuality] = useState('2K');
  const [analyzing, setAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState('');

  // XHS mode
  const [xhsDescriptions, setXhsDescriptions] = useState<string[]>(Array(5).fill(''));
  const [xhsCopywriting, setXhsCopywriting] = useState('');
  const [xhsCoverCN, setXhsCoverCN] = useState('');
  const [xhsCoverEN, setXhsCoverEN] = useState('');
  const [xhsResults, setXhsResults] = useState<string[]>([]);

  // Social mode
  const [selectedRatios, setSelectedRatios] = useState<string[]>(['1:1']);
  const [socialCards, setSocialCards] = useState<SocialCard[]>([]);
  const [socialResults, setSocialResults] = useState<GenResult[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAvailableModels().then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) setSelectedModel('nanobann2');
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
  const toggleRatio = (v: string) => setSelectedRatios(p => p.includes(v) ? p.filter(r => r !== v) : [...p, v]);

  const handleAnalyze = async () => {
    if (!requireAuth() || productImages.length === 0) { if (productImages.length === 0) alert('请上传产品图片'); return; }
    setAnalyzing(true);
    setXhsDescriptions(Array(5).fill('')); setXhsCopywriting(''); setXhsCoverCN(''); setXhsCoverEN(''); setXhsResults([]);
    setSocialCards([]); setSocialResults([]);
    try {
      const b64s = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1200)));
      const langLabel = LANGUAGES.find(l => l.value === language)?.label || '中文';
      if (subMode === 'xhs') {
        const prompt = `分析产品图片，为小红书帖子生成营销内容。
产品名称: ${productName || '产品'}，描述: ${productDesc || '无'}
语言: ${langLabel}，比例: 3:4
返回JSON: {"coverKeywordsCN":"中文封面关键词","coverKeywordsEN":"English cover keywords","imageDescriptions":["封面图描述","主图描述","细节图描述","对比图描述","使用场景图描述"],"copywriting":"小红书文案"}
5张图描述必须各有侧重，互不重复。`;
        const raw = await analyzeMultipleImages(b64s, prompt, { model: 'gemini-3.5-flash', maxTokens: 8000 });
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.coverKeywordsCN) setXhsCoverCN(parsed.coverKeywordsCN);
          if (parsed.coverKeywordsEN) setXhsCoverEN(parsed.coverKeywordsEN);
          if (Array.isArray(parsed.imageDescriptions) && parsed.imageDescriptions.length === 5) setXhsDescriptions(parsed.imageDescriptions);
          if (parsed.copywriting) setXhsCopywriting(parsed.copywriting);
        }
      } else {
        const prompt = `你是社媒营销专家。分析产品图片，为每个比例生成POV宣传方案。
语言: ${langLabel}，可选比例: ${selectedRatios.join(', ')}，每个比例3张。
返回JSON数组: [{"title":"社媒文案标题","description":"图片生成提示词(含POV、光线、构图)","pov":"视角类型","ratio":"比例"}]
所有视角必须是第一人称POV。title和description使用目标语言。`;
        const raw = await analyzeMultipleImages(b64s, prompt, { model: 'gemini-3.5-flash', maxTokens: 8000 });
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as SocialCard[];
          if (Array.isArray(parsed) && parsed.length > 0) setSocialCards(parsed);
          else alert('AI未能生成有效方案，请重试');
        } else { alert('AI分析失败，请重试'); }
      }
    } catch (err: any) {
      alert('分析失败: ' + err.message);
    }
    setAnalyzing(false);
  };

  const handleGenerate = async () => {
    if (!requireAuth()) return;
    setIsGenerating(true);
    try {
      const b64s = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1536)));
      if (subMode === 'xhs') {
        if (xhsDescriptions.filter(d => d.trim()).length === 0) { alert('请先分析'); setIsGenerating(false); return; }
        const langLabel = LANGUAGES.find(l => l.value === language)?.label || '中文';
        const limit = createConcurrencyLimit(3);
        let completed = 0;
        const total = xhsDescriptions.filter(d => d.trim()).length;
        for (let i = 0; i < productImages.length; i++) { try { await uploadFileToCos(productImages[i].file); } catch {} }
        imageLibraryService.clearSavedUrlsCache?.();
        const tasks = xhsDescriptions.map((desc, i) => {
          if (!desc?.trim()) return Promise.resolve();
          return limit(async () => {
            setProgress(`生成中 ${completed + 1}/${total} ${XHS_IMAGE_TYPES[i]}...`);
            const prompt = `小红书帖子${XHS_IMAGE_TYPES[i]}，3:4比例。
产品: ${productName || '产品'}，卖点: ${desc}
产品描述: ${productDesc || 'AI创意'}，封面风格: ${xhsCoverCN}
光线充足，构图精美，符合小红书审美。文字使用${langLabel}。`;
            try {
              const resp = await editImage({ prompt, images: b64s, aspectRatio: '3:4', resolution: quality, model: selectedModel });
              const url = resp.data?.[0]?.url || resp.image_url || resp.url || '';
              if (url) {
                setXhsResults(prev => [url, ...prev]);
                imageLibraryService.saveToLibrary({ image_url: url, prompt, model: selectedModel, aspect_ratio: '3:4', resolution: quality, type: 'edited' });
              }
            } catch {}
            completed++;
            setProgress(`生成中 ${completed}/${total}...`);
          });
        });
        await Promise.all(tasks);
      } else {
        if (socialCards.length === 0) { alert('请先分析'); setIsGenerating(false); return; }
        const total = socialCards.length;
        setProgress(`生成中 (0/${total})...`);
        let done = 0;
        const tasks = socialCards.map(async (card, idx) => {
          const prompt = `社媒宣传图，第一人称POV视角，比例${card.ratio}。
${card.description}
产品外观与参考图一致，禁止出现文字。自然光，UGC风格。`;
          try {
            const resp = await editImage({ prompt, images: b64s, aspectRatio: card.ratio, resolution: quality, model: selectedModel });
            const url = resp.data?.[0]?.url || resp.image_url || resp.url || '';
            if (url) {
              const item: GenResult = { url, title: card.title, ratio: card.ratio, idx: idx + 1 };
              setSocialResults(prev => [...prev, item]);
              imageLibraryService.saveToLibrary({ image_url: url, prompt, model: selectedModel, aspect_ratio: card.ratio, resolution: quality, type: 'edited' });
            }
          } catch {}
          done++;
          setProgress(`生成中 (${done}/${total})...`);
        });
        await Promise.all(tasks);
      }
    } catch (err: any) {
      console.error('生成失败:', err);
    }
    setIsGenerating(false);
    setProgress('');
  };

  const handleDownload = async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `social-${Date.now()}.png`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
  };
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopiedField(key); setTimeout(() => setCopiedField(''), 2000); });
  };
  const hasResults = subMode === 'xhs' ? (xhsCoverCN || xhsCoverEN || xhsResults.length > 0) : (socialCards.length > 0 || socialResults.length > 0);

  return (
    <div className="h-full flex flex-col min-w-0" style={{ background: '#F8FAFC' }}>
      <div className="h-full flex">
        {/* LEFT CONTROLS */}
        <div className="w-[400px] shrink-0 h-full overflow-y-auto p-5 pb-24 space-y-4" style={{ background: '#FFFFFF', borderRight: '1px solid #E2E8F0', scrollbarWidth: 'thin', scrollbarColor: '#CBD5E1 #FFFFFF' }}>
          {/* Sub-mode toggle */}
          <div className="flex rounded-2xl p-1" style={{ background: '#F1F5F9' }}>
            {([['xhs', '小红书种草', FileImage], ['social', '社媒POV', Share2]] as [SubMode, string, any][]).map(([mode, label, Icon]) => (
              <button key={mode} onClick={() => setSubMode(mode)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={subMode === mode ? { background: '#FFFFFF', color: '#2563EB', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { color: '#64748B' }}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
            <div className="flex items-center gap-3 mb-4">
              <Plus size={16} style={{ color: '#2563EB' }} />
              <div><h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>产品图片</h3><p className="text-xs" style={{ color: '#64748B' }}>AI自行选择设计</p></div>
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

          {/* Product Info */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
            <div className="flex items-center gap-2">
              <Sparkles size={14} style={{ color: '#2563EB' }} />
              <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>产品信息</span>
            </div>
            <textarea value={productName} onChange={e => { setProductName(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
              placeholder="产品名称（AI可自动分析）" className="w-full rounded-xl px-3 py-2.5 text-sm resize-none overflow-hidden"
              style={{ background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0', outline: 'none' }} rows={1} />
            <textarea value={productDesc} onChange={e => { setProductDesc(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
              placeholder="产品描述（可选）" className="w-full rounded-xl px-3 py-2.5 text-sm resize-none overflow-hidden"
              style={{ background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0', outline: 'none' }} rows={1} />
          </div>

          {/* Language */}
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
            <div className="flex items-center gap-2 mb-3">
              <Globe size={14} style={{ color: '#2563EB' }} />
              <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>语言</span>
            </div>
            <select value={language} onChange={e => setLanguage(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm appearance-none cursor-pointer"
              style={{ background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0', outline: 'none' }}>
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          {/* Aspect Ratio */}
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
            <div className="flex items-center gap-2 mb-3">
              <Share2 size={14} style={{ color: '#2563EB' }} />
              <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>图片比例</span>
            </div>
            {subMode === 'xhs' ? (
              <div className="flex items-center gap-2 rounded-xl px-4 py-2.5" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <span className="text-sm font-medium" style={{ color: '#0F172A' }}>3:4</span>
                <span className="text-[10px]" style={{ color: '#64748B' }}>小红书帖子标准比例</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {ASPECT_RATIOS.map(r => {
                  const sel = selectedRatios.includes(r.value);
                  return (
                    <button key={r.value} onClick={() => toggleRatio(r.value)}
                      className="py-2 rounded-xl text-xs font-medium transition-all"
                      style={sel ? { background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' } : { background: '#F8FAFC', color: '#64748B', border: '1px solid transparent' }}>
                      {r.label}<span className="block text-[9px]" style={{ color: '#94A3B8' }}>{r.platform}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Model + Resolution */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
            <div>
              <label className="text-xs mb-2 block" style={{ color: '#64748B' }}>模型</label>
              <div className="relative">
                <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                  className="w-full px-3 py-2.5 pr-8 rounded-xl text-sm appearance-none cursor-pointer"
                  style={{ background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0', outline: 'none' }}>
                  {models.length > 0 ? models.map(m => <option key={m.value} value={m.value}>{m.label}</option>) : <option value="nanobann2">Nanobann2</option>}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#64748B' }} />
              </div>
              <ModelSpeedNote />
            </div>
            <div>
              <label className="text-xs mb-2 block" style={{ color: '#64748B' }}>分辨率</label>
              <div className="grid grid-cols-2 gap-2">
                {['2K', '4K'].map(q => (
                  <button key={q} onClick={() => setQuality(q)}
                    className="py-2 rounded-xl text-xs font-medium transition-all"
                    style={quality === q ? { background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' } : { background: '#F8FAFC', color: '#64748B', border: '1px solid transparent' }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {!analyzing && !isGenerating && !hasResults && (
            <button onClick={handleAnalyze} disabled={productImages.length === 0}
              className="w-full py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
              style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#fff', opacity: productImages.length === 0 ? 0.4 : 1 }}>
              <Sparkles size={18} /> {subMode === 'xhs' ? 'AI分析并规划帖子' : 'AI分析并规划社媒方案'}
            </button>
          )}
          {hasResults && !isGenerating && (<div className="space-y-2">
            <button onClick={() => { setXhsCoverCN(''); setXhsCoverEN(''); setXhsCopywriting(''); setXhsDescriptions(Array(5).fill('')); setXhsResults([]); setSocialCards([]); setSocialResults([]); }}
              className="w-full py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
              style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.2)' }}>
              <Sparkles size={18} /> 重新分析
            </button>
            <button onClick={handleGenerate}
              className="w-full py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
              style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#fff', boxShadow: '0 8px 32px rgba(37,99,235,0.3)' }}>
              <Wand2 size={18} /> {subMode === 'xhs' ? '生成小红书帖子' : `生成社媒宣传图 (${socialCards.length}张)`}
            </button>
          </div>)}
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
                <div className="w-20 h-20 mx-auto mb-5 rounded-3xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.1), rgba(59,130,246,0.1))' }}>
                  {subMode === 'xhs' ? <FileImage size={32} style={{ color: '#2563EB' }} /> : <Share2 size={32} style={{ color: '#2563EB' }} />}
                </div>
                <h2 className="text-lg font-semibold mb-2" style={{ color: '#0F172A' }}>{subMode === 'xhs' ? '小红书种草图文' : '海外社媒POV出图'}</h2>
                <p className="text-sm" style={{ color: '#64748B' }}>{subMode === 'xhs' ? '上传产品图 → AI分析 → 5张配图 + 文案' : '上传产品图 → AI分析 → 多比例POV出图'}</p>
              </div>
            </div>
          ) : (<div className="flex-1 flex flex-col min-h-0">
            {isGenerating && (
              <div className="sticky top-0 z-10 px-6 py-3 flex-shrink-0" style={{ background: 'rgba(248,250,252,0.9)', borderBottom: '1px solid #E2E8F0', backdropFilter: 'blur(8px)' }}>
                <div className="flex items-center gap-3">
                  <Loader2 size={16} className="animate-spin" style={{ color: '#2563EB' }} />
                  <span className="text-sm font-medium" style={{ color: '#0F172A' }}>{progress}</span>
                  <span className="text-xs ml-auto" style={{ color: '#64748B' }}>已生成 {subMode === 'xhs' ? xhsResults.length : socialResults.length} 张</span>
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">

                {/* XHS Results */}
                {subMode === 'xhs' && (xhsCoverCN || xhsCoverEN) && (
                  <>
                    {/* Cover keywords */}
                    <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                      <h3 className="text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>封面关键词</h3>
                      <div className="space-y-3">
                        {([['中文', xhsCoverCN, setXhsCoverCN, 'ccn'], ['英文', xhsCoverEN, setXhsCoverEN, 'cen']] as const).map(([label, val, setter, key]) => (
                          <div key={key}>
                            <label className="text-xs mb-1.5 block" style={{ color: '#64748B' }}>{label}</label>
                            <div className="flex gap-2">
                              <textarea value={val} onChange={e => setter(e.target.value)}
                                className="flex-1 rounded-xl px-3 py-2 text-sm resize-none min-h-[50px]"
                                style={{ background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0', outline: 'none' }} />
                              <button onClick={() => handleCopy(val, key)} className="w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0" style={{ color: '#64748B' }}>
                                {copiedField === key ? <Check size={14} style={{ color: '#2563EB' }} /> : <Copy size={14} />}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 5 image descriptions */}
                    <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                      <h3 className="text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>5张图片配图方案</h3>
                      <div className="space-y-3">{XHS_IMAGE_TYPES.map((type, idx) => (
                        <div key={idx} className="rounded-xl p-3" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-bold" style={{ background: '#EFF6FF', color: '#2563EB' }}>{idx + 1}</span>
                              <span className="text-xs font-semibold" style={{ color: '#0F172A' }}>{type}</span>
                            </div>
                            <button onClick={() => handleCopy(xhsDescriptions[idx] || '', `d${idx}`)} className="text-[10px] flex items-center gap-1" style={{ color: '#64748B' }}>
                              {copiedField === `d${idx}` ? <Check size={10} style={{ color: '#2563EB' }} /> : <Copy size={10} />} 复制
                            </button>
                          </div>
                          <textarea value={xhsDescriptions[idx] || ''} onChange={e => { const u = [...xhsDescriptions]; u[idx] = e.target.value; setXhsDescriptions(u); }}
                            className="w-full rounded-xl px-3 py-2 text-sm min-h-[50px] resize-none"
                            style={{ background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0', outline: 'none' }} />
                        </div>
                      ))}</div>
                    </div>

                    {/* Copywriting */}
                    <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>小红书文案正文</h3>
                        <button onClick={() => handleCopy(xhsCopywriting, 'copy')} className="text-xs flex items-center gap-1" style={{ color: '#2563EB' }}>
                          {copiedField === 'copy' ? <Check size={12} /> : <Copy size={12} />} 复制
                        </button>
                      </div>
                      <textarea value={xhsCopywriting} onChange={e => setXhsCopywriting(e.target.value)}
                        className="w-full rounded-xl p-4 text-sm min-h-[140px] resize-none"
                        style={{ background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0', outline: 'none' }} />
                    </div>
                    {xhsResults.length > 0 && (<>
                      <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>生成结果 ({xhsResults.length})</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {xhsResults.map((url, idx) => (
                          <div key={idx} className="group relative rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                            <div className="cursor-pointer" onClick={() => setPreviewImage(url)}><img src={url} alt="" className="w-full object-cover" style={{ aspectRatio: '3/4' }} /></div>
                            <div className="p-3 flex items-center justify-between">
                              <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>{XHS_IMAGE_TYPES[idx % XHS_IMAGE_TYPES.length]}</span>
                              <div className="flex items-center gap-1">
                                <button onClick={() => setPreviewImage(url)} className="w-7 h-7 flex items-center justify-center rounded-xl" style={{ color: '#64748B' }}><Eye size={14} /></button>
                                <button onClick={() => handleDownload(url)} className="w-7 h-7 flex items-center justify-center rounded-xl" style={{ color: '#64748B' }}><Download size={14} /></button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>)}
                  </>
                )}

                {/* Social Results */}
                {subMode === 'social' && socialCards.length > 0 && (
                  <>
                    <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>AI社媒方案 ({socialCards.length}张)</h2>
                    <div className="space-y-4">
                      {socialCards.map((card, idx) => {
                        const gen = socialResults.find(r => r.idx === idx + 1);
                        const updateCard = (field: 'title' | 'description', val: string) => { const next = [...socialCards]; next[idx] = { ...next[idx], [field]: val }; setSocialCards(next); };
                        return (
                          <div key={idx} className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                            <div className="px-5 py-3" style={{ borderBottom: '1px solid #E2E8F0' }}>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                                  style={{ background: '#EFF6FF', color: '#2563EB' }}>{idx + 1}</span>
                                <span className="text-xs font-medium" style={{ color: '#64748B' }}>社媒文案</span>
                                <span className="ml-auto px-1.5 py-0.5 text-[10px] rounded" style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB' }}>{card.ratio}</span>
                                <span className="text-[10px]" style={{ color: '#64748B' }}>{card.pov}</span>
                              </div>
                              <textarea value={card.title} onChange={e => updateCard('title', e.target.value)}
                                className="w-full px-3 py-2 rounded-xl text-sm font-semibold resize-none overflow-hidden"
                                style={{ background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0', outline: 'none' }} rows={1} />
                              <textarea value={card.description} onChange={e => updateCard('description', e.target.value)}
                                className="w-full mt-2 rounded-xl p-3 text-sm resize-none overflow-hidden"
                                style={{ background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0', outline: 'none' }} rows={2} />
                            </div>
                            {gen && <div className="p-4"><div className="w-[120px] rounded-xl overflow-hidden cursor-pointer" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }} onClick={() => setPreviewImage(gen.url)}>
                              <img src={gen.url} alt="" className="w-full h-full object-cover" />
                            </div></div>}
                          </div>
                        );
                      })}
                    </div>
                    {socialResults.length > 0 && (<div>
                      <h2 className="text-sm font-semibold mb-4" style={{ color: '#0F172A' }}>已生成图片 ({socialResults.length})</h2>
                      <div className="grid grid-cols-2 gap-4">
                        {socialResults.map((item, idx) => (
                          <div key={idx} className="group relative rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                            <div className="cursor-pointer" onClick={() => setPreviewImage(item.url)}>
                              <img src={item.url} alt="" className="w-full object-cover" style={{ aspectRatio: item.ratio.replace(':', '/') }} />
                            </div>
                            <div className="p-3 flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-medium truncate" style={{ color: '#94a3b8' }}>{item.title}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB' }}>{item.ratio}</span>
                              </div>
                              <button onClick={() => handleDownload(item.url)} className="w-7 h-7 flex items-center justify-center rounded-xl flex-shrink-0" style={{ color: '#64748B' }}><Download size={14} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>)}
                  </>
                )}
              </div>
          </div>)}
        </div>
      </div>

      <ImagePreviewModal isOpen={!!previewImage} onClose={() => setPreviewImage(null)} imageUrl={previewImage || ''} />
    </div>
  );
};

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Loader2, Sparkles, Plus, ChevronDown, Check, Coins, AlertTriangle, Download, Image as ImageIcon, Film, Clock } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { getAuthToken } from '../../services/authService';
import { useAuth } from '../../contexts/AuthContext';
import { RatioPicker } from '../components/RatioPicker';
import { API_URL } from '../../services/api';

interface VideoGenConfig {
  title: string;
  description: string;
  apiEndpoint: string;
  statusEndpoint: string;
  defaultModel: string;
  models?: { value: string; label: string }[];
  durations?: { value: number; label: string }[];
  pricingKey: string;
  defaultPrice: number;
}

const RATIOS = [
  { value: '9:16', label: '9:16 竖屏' },
  { value: '16:9', label: '16:9 横屏' },
  { value: '1:1', label: '1:1 方形' },
];

interface MobileVideoGenProps { config: VideoGenConfig; onBack: () => void; }

export const MobileVideoGen: React.FC<MobileVideoGenProps> = ({ config, onBack }) => {
  const { isAuthenticated, user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(config.defaultModel);
  const [ratio, setRatio] = useState('9:16');
  const [duration, setDuration] = useState(config.durations?.[0]?.value || 4);
  const [quantity, setQuantity] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [price, setPrice] = useState(config.defaultPrice);
  const [sheet, setSheet] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/pricing`).then(r => r.json()).then(d => {
      if (d.data?.[config.pricingKey]) setPrice(Number(d.data[config.pricingKey]));
    }).catch(() => {});
  }, [config.pricingKey]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const urls = await Promise.all(Array.from(files).slice(0, 3 - images.length).map(f => fileToDataUrl(f)));
    setImages(prev => [...prev, ...urls].slice(0, 3));
    if (e.target) e.target.value = '';
  }, [images.length]);

  // Poll for video status
  useEffect(() => {
    if (!taskId) return;
    setIsPolling(true);
    const token = getAuthToken();
    const poll = async () => {
      try {
        const r = await fetch(`${API_URL}${config.statusEndpoint}/${taskId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const d = await r.json();
        if (d.status === 'completed' || d.status === 'success') {
          const url = d.data?.url || d.url || d.data?.video_url || '';
          if (url) setResults(prev => [url, ...prev]);
          setTaskId(null);
          setIsPolling(false);
        } else if (d.status === 'failed') {
          setError('视频生成失败，请重试');
          setTaskId(null);
          setIsPolling(false);
        } else {
          setTimeout(poll, 3000);
        }
      } catch { setTimeout(poll, 3000); }
    };
    poll();
    return () => { setIsPolling(false); };
  }, [taskId, config.statusEndpoint]);

  const handleGenerate = useCallback(async () => {
    if (!isAuthenticated) return;
    if (!images.length && !prompt.trim()) return;
    setIsGenerating(true); setError('');
    const token = getAuthToken();
    try {
      const r = await fetch(`${API_URL}${config.apiEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          prompt: prompt.trim() || '产品展示视频',
          model,
          aspectRatio: ratio,
          seconds: config.durations ? duration : undefined,
          images: images.length > 0 ? images : undefined,
          quantity,
        }),
      });
      const d = await r.json();
      if (d.taskId || d.data?.taskId) {
        setTaskId(d.taskId || d.data.taskId);
        setIsGenerating(false);
      } else if (d.url || d.data?.url) {
        setResults(prev => [d.url || d.data.url, ...prev]);
        setIsGenerating(false);
      } else {
        setError(d.message || '提交失败');
        setIsGenerating(false);
      }
    } catch (err: any) { setError(err.message || '提交失败'); setIsGenerating(false); }
  }, [isAuthenticated, images, prompt, model, ratio, duration, quantity, config]);

  const handleDownload = useCallback(async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `video_${Date.now()}.mp4`; a.click(); URL.revokeObjectURL(a.href); } catch {}
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-[#0a0a0a] flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] mobile-tap"><X size={16} className="text-white/40" /></button>
        <h1 className="text-base font-bold text-white">{config.title}</h1>
        {isAuthenticated && user && <div className="ml-auto flex items-center gap-1 bg-blue-500/10 px-2.5 py-1 rounded-full"><Coins size={12} className="text-blue-400" /><span className="text-xs font-semibold text-blue-400">{Number(user.credits || 0).toFixed(1)}</span></div>}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-32 space-y-4">
          {config.description && <p className="text-xs text-white/30">{config.description}</p>}

          {/* Upload */}
          <div>
            <label className="text-xs font-semibold text-white/40 mb-2 block">上传参考图 <span className="text-white/20">（可选）</span></label>
            <div className="flex gap-2.5 flex-wrap">
              {images.map((url, i) => <div key={i} className="relative w-[72px] h-[72px] rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.06]"><img src={url} className="w-full h-full object-cover" /><button onClick={() => setImages(p => p.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"><X size={10} className="text-white" /></button></div>)}
              {images.length < 3 && <button onClick={() => fileRef.current?.click()} className="w-[72px] h-[72px] rounded-xl border-2 border-dashed border-white/[0.1] flex flex-col items-center justify-center bg-white/[0.02]"><Plus size={20} className="text-white/20" /><span className="text-[9px] text-white/20">上传</span></button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleUpload} />
          </div>

          {/* Model selector */}
          {config.models && config.models.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-white/40 mb-2 block">模型</label>
              <button onClick={() => setSheet('model')} className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.04] rounded-xl border border-white/[0.06] text-sm">
                <span className="text-white">{config.models.find(m => m.value === model)?.label}</span>
                <ChevronDown size={16} className="text-white/30" />
              </button>
              {sheet === 'model' && (
                <div className="fixed inset-0 z-[100] flex items-end" onClick={() => setSheet(null)}>
                  <div className="absolute inset-0 bg-black/60" />
                  <div className="relative w-full bg-[#141414] rounded-t-3xl pb-[calc(16px+env(safe-area-inset-bottom))] animate-mobile-slide-up" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.06]">
                      <h3 className="text-base font-bold text-white">选择模型</h3>
                      <button onClick={() => setSheet(null)} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center"><X size={16} className="text-white/40" /></button>
                    </div>
                    <div className="px-3 py-2">{config.models.map(m => (
                      <button key={m.value} onClick={() => { setModel(m.value); setSheet(null); }} className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl my-0.5 ${model === m.value ? 'bg-white/[0.06]' : ''}`}>
                        <span className="text-sm text-white/50">{m.label}</span>
                        {model === m.value && <Check size={18} className="text-blue-400" />}
                      </button>
                    ))}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Aspect Ratio */}
          <div>
            <label className="text-xs font-semibold text-white/40 mb-2 block">比例</label>
            <RatioPicker options={RATIOS} selected={ratio} onChange={setRatio} />
          </div>

          {/* Duration */}
          {config.durations && (
            <div>
              <label className="text-xs font-semibold text-white/40 mb-2 block">时长</label>
              <div className="mobile-scroll-x -mx-1"><div className="flex gap-2 px-1">
                {config.durations.map(d => <button key={d.value} onClick={() => setDuration(d.value)} className={`mobile-tap flex-shrink-0 px-5 py-2.5 rounded-xl text-xs font-medium transition-all ${duration === d.value ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/25' : 'bg-white/[0.04] text-white/40 border border-white/[0.06]'}`}>{d.label}</button>)}
              </div></div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="text-xs font-semibold text-white/40 mb-2 block">数量</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setQuantity(p => Math.max(1, p - 1))} className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-lg font-medium text-white/40">-</button>
              <span className="w-10 text-center text-base font-semibold text-white">{quantity}</span>
              <button onClick={() => setQuantity(p => Math.min(3, p + 1))} className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-lg font-medium text-white/40">+</button>
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="text-xs font-semibold text-white/40 mb-2 block">描述</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="描述视频内容..." rows={3} className="w-full px-4 py-3 bg-white/[0.04] rounded-xl border border-white/[0.06] text-sm text-white placeholder-white/20 resize-none outline-none focus:border-blue-500/30 transition-colors" />
          </div>

          {/* Generate */}
          {(isPolling || taskId) && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-4 flex items-center gap-3">
              <Loader2 size={18} className="text-amber-400 animate-spin" />
              <div><p className="text-sm font-medium text-amber-300">视频生成中</p><p className="text-xs text-amber-400/50">通常需要1-3分钟，请耐心等待...</p></div>
            </div>
          )}

          <button onClick={isAuthenticated ? handleGenerate : () => window.dispatchEvent(new Event('mobile-auth-required'))} disabled={isGenerating || isPolling || !!taskId} className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-sm font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white active:from-blue-600 active:to-blue-700 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-40">
            {!isAuthenticated ? <><AlertTriangle size={16} /> 登录后使用</> : isPolling ? <><Loader2 size={16} className="animate-spin" /> 等待生成...</> : isGenerating ? <><Loader2 size={16} className="animate-spin" /> 提交中...</> : <><Sparkles size={16} /> 生成视频 ({price}积分/个)</>}
          </button>
          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3"><p className="text-xs text-red-400">{error}</p></div>}

          {/* Results */}
          {results.length > 0 && <div>
            <div className="flex items-center gap-2 mb-3"><Film size={16} className="text-white/50" /><h2 className="text-sm font-bold text-white/60">生成视频</h2></div>
            <div className="space-y-3">{results.map((url, i) => (
              <div key={i} className="mobile-card overflow-hidden rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="aspect-[9/16] bg-black flex items-center justify-center">
                  <video src={url} controls className="w-full h-full object-contain" />
                </div>
                <div className="flex px-3 py-2.5 border-t border-white/[0.04]">
                  <button onClick={() => handleDownload(url)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/[0.04] text-white/40 text-xs font-medium"><Download size={14} /> 下载</button>
                </div>
              </div>
            ))}</div>
          </div>}
        </div>
      </div>
    </div>
  );
};

export { GEMINI_CONFIG };

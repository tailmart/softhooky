import React, { useState, useCallback, useEffect } from 'react';
import { X, Loader2, Sparkles, Coins, AlertTriangle, Download, Image as ImageIcon, Film } from 'lucide-react';
import { editImage, generateImage } from '../../services/imageService';
import { chatCompletion } from '../../services/aiChatService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { useAuth } from '../../contexts/AuthContext';
import { getGeneratePrice } from '../../services/pricingService';
import { getAuthToken } from '../../services/authService';

const SHOT_COUNTS = [4, 6, 8, 10];

interface MobileStoryboardProps { onBack: () => void; }

export const MobileStoryboard: React.FC<MobileStoryboardProps> = ({ onBack }) => {
  const { isAuthenticated, user } = useAuth();
  const [script, setScript] = useState('');
  const [shotCount, setShotCount] = useState(6);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [analysis, setAnalysis] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [price, setPrice] = useState(0.3);
  const [error, setError] = useState('');
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  useEffect(() => { getGeneratePrice().then(setPrice); }, []);

  const handleAnalyze = useCallback(async () => {
    if (!script.trim()) return;
    setIsAnalyzing(true); setError('');
    try {
      const prompt = `你是一个专业的影视故事板编剧。根据以下剧本，生成${shotCount}个分镜头的画面描述。
每个分镜包含：镜头编号、画面描述、景别（远景/中景/特写）、角度。

剧本：${script}

以JSON数组格式输出：[{ "shot": 1, "description": "...", "scale": "...", "angle": "..." }]`;
      const result = await chatCompletion([{ role: 'user', content: prompt }]);
      setAnalysis(result);
    } catch (err: any) { setError(err.message || '分析失败'); }
    finally { setIsAnalyzing(false); }
  }, [script, shotCount]);

  const handleGenerate = useCallback(async () => {
    if (!isAuthenticated || !analysis) return;
    setIsGenerating(true); setError('');
    try {
      const result = await generateImage({ prompt: `故事板分镜：${analysis.substring(0, 1000)}`, model: 'nanobann2', aspectRatio: '16:9' });
      const urls = (Array.isArray(result.data) ? result.data : [result]).map((i: any) => i.url || i.image_url || '').filter(Boolean);
      for (const url of urls) { try { await imageLibraryService.saveToLibrary({ image_url: url, prompt: '故事板生成', model: 'nanobann2', aspect_ratio: '16:9', resolution: 'auto', type: 'generated' }); } catch {} }
      setResults(prev => [...urls, ...prev]);
      window.dispatchEvent(new Event('credits-updated'));
      // 同步到 PC 画布
      try { const t = getAuthToken(); if (t) { const g = await fetch('/api/canvas/plugin-state?pluginId=nanogen_history', { headers: { Authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(3000) }); const d = g.ok ? (await g.json()) : null; const existing = d?.data?.generatedImages || d?.generatedImages || []; const ni = urls.map((u, i) => ({ url: u, position: { x: 40 + (i % 3) * 220, y: 40 + Math.floor(i / 3) * 220 }, width: 200, height: 200 })); const merged = [...ni, ...existing].slice(0, 50); await fetch('/api/canvas/plugin-state', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ pluginId: 'nanogen_history', stateData: { generatedImages: merged } }), signal: AbortSignal.timeout(3000) }); } } catch {}
    } catch (err: any) { setError(err.message || '生成失败'); }
    finally { setIsGenerating(false); }
  }, [isAuthenticated, analysis]);

  const handleDownload = useCallback(async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `storyboard_${Date.now()}.png`; a.click(); URL.revokeObjectURL(a.href); } catch {}
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-[#0a0a0a] flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] mobile-tap"><X size={16} className="text-white/40" /></button>
        <h1 className="text-base font-bold text-white">故事板</h1>
        {isAuthenticated && user && <div className="ml-auto flex items-center gap-1 bg-blue-500/10 px-2.5 py-1 rounded-full"><Coins size={12} className="text-blue-400" /><span className="text-xs font-semibold text-blue-400">{Number(user.credits || 0).toFixed(1)}</span></div>}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-32 space-y-4">
          <p className="text-xs text-white/30">输入剧本或创意描述，AI 将生成故事板分镜画面</p>

          <div>
            <label className="text-xs font-semibold text-white/40 mb-2 block">剧本 / 创意描述 <span className="text-red-400">*</span></label>
            <textarea value={script} onChange={e => setScript(e.target.value)} placeholder="输入剧本内容或创意描述...&#10;例如：一个年轻人在城市中奔跑，穿越街道、公园，最终到达海边..." rows={6} className="w-full px-4 py-3 bg-white/[0.04] rounded-xl border border-white/[0.06] text-sm text-white placeholder-white/20 resize-none outline-none leading-relaxed focus:border-blue-500/30 transition-colors" />
          </div>

          <div>
            <label className="text-xs font-semibold text-white/40 mb-2 block">分镜数量</label>
            <div className="flex gap-2">{SHOT_COUNTS.map(n => <button key={n} onClick={() => setShotCount(n)} className={`mobile-tap flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${shotCount === n ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/25' : 'bg-white/[0.04] text-white/40 border border-white/[0.06]'}`}>{n}镜</button>)}</div>
          </div>

          <button onClick={handleAnalyze} disabled={!script.trim() || isAnalyzing} className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-sm font-semibold transition-all bg-white/[0.06] text-white border border-white/[0.08] active:bg-white/[0.1] disabled:opacity-30">
            {isAnalyzing ? <><Loader2 size={16} className="animate-spin" /> AI 分析中...</> : <><Sparkles size={16} /> AI 分析剧本</>}
          </button>

          {analysis && <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-4">
            <div className="flex items-center gap-2 mb-2"><Sparkles size={14} className="text-blue-400" /><span className="text-xs font-semibold text-white/60">分镜方案</span></div>
            <p className="text-sm text-white/40 leading-relaxed whitespace-pre-wrap">{analysis}</p>
            <button onClick={handleGenerate} disabled={isGenerating || !isAuthenticated} className="mt-3 w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-sm font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white active:from-blue-600 active:to-blue-700 transition-all shadow-lg shadow-blue-500/25">
              {!isAuthenticated ? <><AlertTriangle size={16} /> 登录后生成</> : isGenerating ? <><Loader2 size={16} className="animate-spin" /> 生成分镜中...</> : <><Film size={16} /> 生成分镜图 ({price}积分/张)</>}
            </button>
          </div>}

          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3"><p className="text-xs text-red-400">{error}</p></div>}

          {results.length > 0 && <div>
            <div className="flex items-center gap-2 mb-3"><ImageIcon size={16} className="text-white/50" /><h2 className="text-sm font-bold text-white/60">分镜结果</h2></div>
            <div className="grid grid-cols-2 gap-3">{results.map((url, i) => (
              <div key={i} className="mobile-card overflow-hidden rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="aspect-video bg-white/[0.02]"><img src={url} className="w-full h-full object-contain cursor-pointer" onClick={() => setExpandedImage(url)} loading="lazy" /></div>
                <div className="flex px-3 py-2.5 border-t border-white/[0.04]"><button onClick={() => handleDownload(url)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/[0.04] text-white/40 text-xs font-medium"><Download size={14} /> 下载</button></div>
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

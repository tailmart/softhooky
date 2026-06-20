import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Loader2, Sparkles, Plus, Check, Coins, AlertTriangle, Download, Image as ImageIcon } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { analyzeImage } from '../../services/aiChatService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { useAuth } from '../../contexts/AuthContext';
import { getGeneratePrice } from '../../services/pricingService';
import { getAuthToken } from '../../services/authService';
import { getAvailableModels } from '../../services/modelService';
import { RatioPicker } from '../components/RatioPicker';
import { API_URL } from '../../services/api';

const DEFAULT_SCENES = ['人物佩戴近景图', '室内摄影棚', '户外场景', '街头场景', '咖啡厅', '森林背景', '工作室场景'];

interface SceneData {
  recommended: string[];
  selected: string[];
  wearable?: boolean;
}

interface MobileProductFusionProps { onBack: () => void; }

export const MobileProductFusion: React.FC<MobileProductFusionProps> = ({ onBack }) => {
  const { isAuthenticated, user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<string[]>([]);
  const [sceneData, setSceneData] = useState<SceneData[]>([]);
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState('nanobann2');
  const [ratio, setRatio] = useState('1:1');
  const [batchCount, setBatchCount] = useState(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [price, setPrice] = useState(0.3);
  const [error, setError] = useState('');
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

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
    const urls = await Promise.all(Array.from(files).slice(0, 10 - images.length).map(f => fileToDataUrl(f)));
    setImages(prev => [...prev, ...urls].slice(0, 10));
    if (e.target) e.target.value = '';
  }, [images.length]);

  const removeImage = useCallback((idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
    setSceneData(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!images.length) return;
    setIsAnalyzing(true); setError('');
    const newSceneData: SceneData[] = [];
    for (let i = 0; i < images.length; i++) {
      try {
        const prompt = `请分析这张产品图片。判断该产品是否适合被人佩戴或穿戴（如手表、首饰、耳机、眼镜、帽子、领带、围巾、鞋、包等）。返回JSON格式：{"wearable":true/false,"scenes":["场景1","场景2","场景3","场景4","场景5","场景6"]}。如果wearable为true，则scenes中务必包含"人物佩戴近景图"；如果wearable为false，则推荐6个常规场景类型。`;
        const resp = await analyzeImage(images[i], prompt, { maxTokens: 1500 });
        const m = resp.match(/\{[\s\S]*\}/);
        if (m) {
          const parsed = JSON.parse(m[0]);
          const scenes = parsed.scenes || DEFAULT_SCENES;
          const wearable = parsed.wearable === true;
          if (wearable && !scenes.includes('人物佩戴近景图')) scenes.unshift('人物佩戴近景图');
          newSceneData.push({ recommended: scenes, selected: [], wearable });
        } else {
          newSceneData.push({ recommended: DEFAULT_SCENES, selected: [], wearable: undefined });
        }
      } catch {
        newSceneData.push({ recommended: DEFAULT_SCENES, selected: [], wearable: undefined });
      }
    }
    setSceneData(newSceneData);
  }, [images]);

  const toggleScene = useCallback((productIdx: number, scene: string) => {
    setSceneData(prev => prev.map((sd, i) => {
      if (i !== productIdx) return sd;
      const selected = sd.selected.includes(scene)
        ? sd.selected.filter(s => s !== scene)
        : [...sd.selected, scene];
      return { ...sd, selected };
    }));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!isAuthenticated || !images.length) return;
    const hasSelection = sceneData.some(s => s.selected.length > 0);
    if (!hasSelection) { setError('请至少选择一个场景'); return; }
    setIsGenerating(true); setError('');

    try {
      let allUrls: string[] = [];
      for (let p = 0; p < images.length; p++) {
        const scenes = sceneData[p]?.selected || [];
        for (const scene of scenes) {
          for (let b = 0; b < batchCount; b++) {
            const isWearableScene = scene === '人物佩戴近景图';
            const prompt = isWearableScene
              ? `人物佩戴该产品的人物近景写真，产品清晰展示，模特脸部真实自然像真人实拍，皮肤纹理毛孔清晰可见，专业摄影棚柔和光线，商业人像摄影，背景虚化，突出产品佩戴效果`
              : `将产品融入${scene}场景中，保持产品清晰，突出场景氛围，专业摄影棚光线，产品主色保留，高品质商业摄影，精确边缘识别`;
            const result = await editImage({ prompt, images: [images[p]], model: selectedModel, aspectRatio: ratio });
            const urls = (Array.isArray(result.data) ? result.data : [result]).map((i: any) => i.url || i.image_url || '').filter(Boolean);
            allUrls = [...allUrls, ...urls];
            if (urls.length > 0) setResults(prev => [...urls, ...prev]); // 出一张显示一张
            for (const url of urls) {
              try { await imageLibraryService.saveToLibrary({ image_url: url, prompt: `产品融图-${scene}`, model: selectedModel, aspect_ratio: ratio, type: 'generated' }); } catch {}
            }
          }
        }
      }
      // 出一张显示一张（已在循环内逐张添加）
      // 同步到 PC 画布
      try { const t = getAuthToken(); if (t) { const g = await fetch(`${API_URL}/api/canvas/plugin-state?pluginId=nanogen_history`, { headers: { Authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(3000) }); const d = g.ok ? (await g.json()) : null; const existing = d?.data?.generatedImages || d?.generatedImages || []; const ni = allUrls.map((u, i) => ({ url: u, position: { x: 40 + (i % 3) * 220, y: 40 + Math.floor(i / 3) * 220 }, width: 200, height: 200 })); const merged = [...ni, ...existing].slice(0, 50); await fetch(`${API_URL}/api/canvas/plugin-state`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ pluginId: 'nanogen_history', stateData: { generatedImages: merged } }), signal: AbortSignal.timeout(3000) }); } } catch {}
      window.dispatchEvent(new Event('credits-updated'));
    } catch (err: any) { setError(err.message || '生成失败'); }
    finally { setIsGenerating(false); }
  }, [isAuthenticated, images, sceneData, selectedModel, ratio, batchCount]);

  const handleDownload = useCallback(async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `fusion_${Date.now()}.png`; a.click(); URL.revokeObjectURL(a.href); } catch {}
  }, []);

  const hasSceneSelection = sceneData.some(s => s.selected.length > 0);

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 mobile-tap"><X size={16} className="text-gray-500" /></button>
        <h1 className="text-base font-bold text-[#171717]">产品融图</h1>
        {isAuthenticated && user && <div className="ml-auto flex items-center gap-1 bg-blue-500/10 px-2.5 py-1 rounded-full"><Coins size={12} className="text-blue-400" /><span className="text-xs font-semibold text-blue-400">{Number(user.credits || 0).toFixed(1)}</span></div>}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-32 space-y-4">
          {/* Upload */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-2 block">上传产品图 <span className="text-red-400">*</span></label>
            <div className="flex gap-2.5 flex-wrap">
              {images.map((url, i) => <div key={i} className="relative w-[80px] h-[80px] rounded-2xl overflow-hidden bg-gray-50 border border-gray-200"><img src={url} className="w-full h-full object-cover" /><button onClick={() => removeImage(i)} className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center"><X size={10} className="text-white" /></button></div>)}
              {images.length < 10 && <button onClick={() => fileRef.current?.click()} className="w-[80px] h-[80px] rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center bg-gray-50"><Plus size={22} className="text-gray-400" /><span className="text-[9px] text-gray-400">上传</span></button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleUpload} />
          </div>

          {/* 分析按钮 — 有图才显示 */}
          {images.length > 0 && sceneData.length === 0 && (
            <button onClick={handleAnalyze} disabled={isAnalyzing}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-sm font-semibold bg-gray-50 text-[#171717] border border-gray-200 active:bg-gray-100 transition-all disabled:opacity-40">
              {isAnalyzing ? <><Loader2 size={16} className="animate-spin" /> AI 分析产品场景...</> : <><Sparkles size={16} /> AI 分析推荐场景</>}
            </button>
          )}

          {/* 场景选择 — 分析完成后显示 */}
          {sceneData.length > 0 && (
            <div className="space-y-4">
              {sceneData.map((sd, pIdx) => (
                <div key={pIdx} className="bg-gray-50 rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                      <img src={images[pIdx]} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#171717]">产品 {pIdx + 1}</p>
                      <p className="text-xs text-gray-400">已选 {sd.selected.length}/{sd.recommended.length} 个场景{sd.wearable ? ' · 可佩戴' : ''}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sd.recommended.map(scene => {
                      const isSelected = sd.selected.includes(scene);
                      return (
                        <button key={scene} onClick={() => toggleScene(pIdx, scene)}
                          className={`mobile-tap flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium border transition-all ${
                            isSelected ? 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/25' : 'bg-gray-50 text-gray-500 border-gray-200'
                          }`}>
                          {isSelected && <Check size={12} />}
                          {scene}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 模型选择 */}
          {sceneData.length > 0 && models.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-2 block">模型</label>
              <div className="mobile-scroll-x -mx-1"><div className="flex gap-2 px-1">
                {models.map(m => (
                  <button key={m.value} onClick={() => setSelectedModel(m.value)}
                    className={`mobile-tap flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${
                      selectedModel === m.value ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25' : 'bg-gray-50 text-gray-500 border border-gray-200'
                    }`}>{m.label}</button>
                ))}
              </div></div>
            </div>
          )}

          {/* 比例选择 */}
          {sceneData.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-2 block">比例</label>
              <RatioPicker options={[
                { value: '1:1', label: '1:1 方形' },
                { value: '3:4', label: '3:4 竖版' },
                { value: '4:3', label: '4:3 横版' },
                { value: '9:16', label: '9:16 手机' },
                { value: '16:9', label: '16:9 宽屏' },
              ]} selected={ratio} onChange={setRatio} />
            </div>
          )}

          {/* 批量数量 */}
          {sceneData.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-2 block">每场景生成</label>
              <div className="flex items-center gap-3">
                <button onClick={() => setBatchCount(p => Math.max(1, p - 1))} className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-lg font-medium text-[#171717]">-</button>
                <span className="w-10 text-center text-base font-semibold text-[#171717]">{batchCount}</span>
                <button onClick={() => setBatchCount(p => Math.min(6, p + 1))} className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-lg font-medium text-[#171717]">+</button>
              </div>
            </div>
          )}

          {/* 生成按钮 — 选择场景后显示 */}
          {sceneData.length > 0 && (
            <button onClick={isAuthenticated ? handleGenerate : () => window.dispatchEvent(new Event('mobile-auth-required'))}
              disabled={isGenerating || !hasSceneSelection}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-sm font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white active:from-blue-600 active:to-blue-700 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-40">
              {!isAuthenticated ? <><AlertTriangle size={16} /> 登录后使用</> : isGenerating ? <><Loader2 size={16} className="animate-spin" /> 生成中...</> : <><Sparkles size={16} /> 生成已选场景 ({price}积分/张)</>}
            </button>
          )}

          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3"><p className="text-xs text-red-400">{error}</p></div>}

          {/* Results */}
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

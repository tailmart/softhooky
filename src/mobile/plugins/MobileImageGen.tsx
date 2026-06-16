import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X, Loader2, Sparkles, Plus, Image as ImageIcon,
  Check, Download, Coins, ChevronDown, AlertTriangle
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fileToDataUrl } from '../../services/r2Service';
import { generateImage, editImage } from '../../services/imageService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { getGeneratePrice } from '../../services/pricingService';
import { getAvailableModels } from '../../services/modelService';
import { getAuthToken } from '../../services/authService';
import { RatioPicker } from '../components/RatioPicker';

interface MobileImageGenProps {
  onBack: () => void;
}

const FALLBACK_MODELS = [
  { value: 'nanobann2', label: 'Nano 智能生图' },
  { value: 'gpt-image-2', label: 'GPT 图像生成' },
];

const RATIOS = [
  { value: '1:1', label: '1:1 方形' },
  { value: '3:4', label: '3:4 竖版' },
  { value: '4:3', label: '4:3 横版' },
  { value: '16:9', label: '16:9 宽屏' },
  { value: '9:16', label: '9:16 手机' },
];

export const MobileImageGen: React.FC<MobileImageGenProps> = ({ onBack }) => {
  const { isAuthenticated, user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('nanobann2');
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [ratio, setRatio] = useState('1:1');
  const [showModelSheet, setShowModelSheet] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [price, setPrice] = useState(0.3);
  const [error, setError] = useState('');
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  useEffect(() => {
    getGeneratePrice().then(setPrice);
    getAvailableModels().then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      if (sorted.length > 0) {
        const mapped = sorted.map(x => ({ value: x.model_id, label: x.label }));
        setModels(mapped);
        setModel(sorted[0].model_id);
      }
    });
    // 加载历史生成记录（从数据库读取 COS 地址，确保图片可访问）
    const token = getAuthToken();
    if (token) {
      fetch('/api/chat/images', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(res => {
          if (res.success && Array.isArray(res.data)) {
            const urls = res.data.map((img: any) => img.image_url || img.imageUrl || img.url).filter(Boolean);
            setResults(urls);
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const urls: string[] = [];
    for (let i = 0; i < Math.min(files.length, 5 - images.length); i++) {
      try {
        urls.push(await fileToDataUrl(files[i]));
      } catch {}
    }
    setImages(prev => [...prev, ...urls].slice(0, 5));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [images.length]);

  const removeImage = useCallback((idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!isAuthenticated) return;
    if (!prompt.trim() && images.length === 0) return;

    setIsGenerating(true);
    setError('');

    try {
      let resultUrls: string[] = [];

      if (images.length > 0) {
        const result = await editImage({
          prompt: prompt.trim() || '优化这张产品图片',
          images,
          model,
          aspectRatio: ratio,
        });
        resultUrls = (Array.isArray(result.data) ? result.data : [result])
          .map((item: any) => item.url || item.image_url || '')
          .filter(Boolean);
      } else {
        const result = await generateImage({
          prompt: prompt.trim(),
          model,
          aspectRatio: ratio,
        });
        resultUrls = (Array.isArray(result.data) ? result.data : [result])
          .map((item: any) => item.url || item.image_url || '')
          .filter(Boolean);
      }

      // 1) 保存到图库
      for (const url of resultUrls) {
        try {
          await imageLibraryService.saveToLibrary({
            image_url: url,
            prompt: prompt.trim() || '创意生图',
            model,
            aspect_ratio: ratio,
            type: 'generated',
          });
        } catch {}
      }

      // 2) 同步到 PC 画布（通过 plugin-state，PC 始终会加载并合并）
      if (resultUrls.length > 0) {
        try {
          const token = getAuthToken();
          if (token) {
            // 读取现有 nanogen_history 数据
            const getRes = await fetch('/api/canvas/plugin-state?pluginId=nanogen_history', {
              headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000),
            });
            const d = getRes.ok ? (await getRes.json()) : null;
            const existing = d?.data?.generatedImages || d?.generatedImages || [];
            const newImages = resultUrls.map((url, i) => ({
              url, position: { x: 40 + (i % 3) * 220, y: 40 + Math.floor(i / 3) * 220 }, width: 200, height: 200,
            }));
            const merged = [...newImages, ...existing].slice(0, 50);
            await fetch('/api/canvas/plugin-state', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ pluginId: 'nanogen_history', stateData: { generatedImages: merged } }),
              signal: AbortSignal.timeout(3000),
            });
          }
        } catch {}
      }

      setResults(prev => [...resultUrls, ...prev]);
      window.dispatchEvent(new Event('credits-updated'));
    } catch (err: any) {
      setError(err.message || '生成失败');
    } finally {
      setIsGenerating(false);
    }
  }, [isAuthenticated, prompt, images, model, ratio]);

  const handleDownload = useCallback(async (url: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `softhooky_${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {}
  }, []);

  const canGenerate = prompt.trim().length > 0 || images.length > 0;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-[#0a0a0a] flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] mobile-tap">
          <X size={16} className="text-white/40" />
        </button>
        <h1 className="text-base font-bold text-white">TK带货图片</h1>
        {isAuthenticated && user && (
          <div className="ml-auto flex items-center gap-1 bg-blue-500/10 px-2.5 py-1 rounded-full">
            <Coins size={12} className="text-blue-400" />
            <span className="text-xs font-semibold text-blue-400">{Number(user.credits || 0).toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-32 space-y-5">
          {/* Upload */}
          <div>
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2.5 block">
              参考图片 <span className="text-white/20 normal-case">（可选）</span>
            </label>
            <div className="flex gap-2.5 flex-wrap">
              {images.map((url, idx) => (
                <div key={idx} className="relative w-[80px] h-[80px] rounded-2xl overflow-hidden bg-white/[0.04] border border-white/[0.06]">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removeImage(idx)} className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center">
                    <X size={10} className="text-white" />
                  </button>
                </div>
              ))}
              {images.length < 5 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-[80px] h-[80px] rounded-2xl border-2 border-dashed border-white/[0.1] flex flex-col items-center justify-center gap-1 bg-white/[0.02]"
                >
                  <Plus size={22} className="text-white/20" />
                  <span className="text-[9px] text-white/20">上传</span>
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleUpload} />
          </div>

          {/* Model Selector */}
          <div>
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 block">模型</label>
            <button
              onClick={() => setShowModelSheet(true)}
              className="w-full flex items-center justify-between px-4 py-3.5 bg-white/[0.04] rounded-2xl border border-white/[0.06] text-sm"
            >
              <span className="text-white font-medium">{models.find(m => m.value === model)?.label}</span>
              <ChevronDown size={16} className="text-white/30" />
            </button>
          </div>

          {/* Model Bottom Sheet */}
          {showModelSheet && (
            <div className="fixed inset-0 z-[100] flex items-end" onClick={() => setShowModelSheet(false)}>
              <div className="absolute inset-0 bg-black/60" />
              <div className="relative w-full bg-[#141414] rounded-t-3xl pb-[calc(16px+env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.06]">
                  <h3 className="text-base font-bold text-white">选择模型</h3>
                  <button onClick={() => setShowModelSheet(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06]">
                    <X size={16} className="text-white/40" />
                  </button>
                </div>
                <div className="px-3 py-2">
                  {models.map(m => (
                    <button
                      key={m.value}
                      onClick={() => { setModel(m.value); setShowModelSheet(false); }}
                      className={`w-full flex items-center justify-between px-4 py-4 rounded-xl my-0.5 ${
                        model === m.value ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <span className={`text-sm ${model === m.value ? 'font-semibold text-white' : 'text-white/50'}`}>{m.label}</span>
                      {model === m.value && <Check size={18} className="text-blue-400" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Aspect Ratio */}
          <div>
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 block">比例</label>
            <RatioPicker options={RATIOS} selected={ratio} onChange={setRatio} />
          </div>

          {/* Prompt */}
          <div>
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 block">
              描述 <span className="text-red-400">*</span>
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="描述你想要生成的图片内容...&#10;例如：一款白色陶瓷咖啡杯，极简风格，木桌背景，自然光"
              rows={4}
              className="w-full px-4 py-3.5 bg-white/[0.04] rounded-2xl border border-white/[0.06] text-sm text-white placeholder-white/20 resize-none outline-none focus:border-blue-500/30 transition-colors leading-relaxed"
            />
          </div>

          {/* Generate Button */}
          <button
            onClick={isAuthenticated ? handleGenerate : () => window.dispatchEvent(new Event('mobile-auth-required'))}
            disabled={isGenerating}
            className={`w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-sm font-bold transition-all shadow-lg shadow-blue-500/25 ${
              isAuthenticated && !isGenerating && canGenerate
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white active:from-blue-600 active:to-blue-700'
                : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
            } ${!canGenerate && isAuthenticated ? 'opacity-50' : ''}`}
          >
            {!isAuthenticated ? (
              <><AlertTriangle size={16} /> 登录后使用</>
            ) : isGenerating ? (
              <><Loader2 size={16} className="animate-spin" /> 生成中...</>
            ) : (
              <><Sparkles size={16} /> 生成 ({price}积分/张)</>
            )}
          </button>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ImageIcon size={16} className="text-white/50" />
                <h2 className="text-sm font-bold text-white/60">生成结果</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {results.map((url, idx) => (
                  <div key={`${url}-${idx}`} className="mobile-card overflow-hidden rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="aspect-square bg-white/[0.02]">
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-contain cursor-pointer"
                        onClick={() => setExpandedImage(url)}
                        loading="lazy"
                      />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2.5 border-t border-white/[0.04]">
                      <button
                        onClick={() => handleDownload(url)}
                        className="mobile-tap flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/[0.04] text-white/40 text-xs font-medium"
                      >
                        <Download size={14} /> 下载
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Preview */}
      {expandedImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center" onClick={() => setExpandedImage(null)}>
          <img src={expandedImage} alt="" className="max-w-[95%] max-h-[90%] object-contain" />
          <button className="absolute top-4 right-4 w-10 h-10 bg-white/15 rounded-full flex items-center justify-center mobile-tap">
            <X size={20} className="text-white" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDownload(expandedImage); }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 bg-white rounded-full text-sm font-semibold text-[#171717] shadow-lg mobile-tap flex items-center gap-2"
          >
            <Download size={16} /> 下载图片
          </button>
        </div>
      )}
    </div>
  );
};

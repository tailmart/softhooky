import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Loader2, Film, Video, Image, Upload, Clock, CheckCircle, Download, AlertCircle, ImagePlus, Layers } from 'lucide-react';
import { getAuthToken } from '../../services/authService';
import { uploadImageToCos } from '../../services/cosService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { requireAuth } from '../../utils/authCheck';
import axios from 'axios';
import { getAvailableModels } from '../../services/modelService';
import { ModelSpeedNote } from '../../components/ModelSpeedNote';
import { LoadingAnimation } from '../../components/LoadingAnimation';

const ASPECT_RATIOS = [
  { value: '16:9', label: '横屏 16:9' },
  { value: '9:16', label: '竖屏 9:16' },
];

const MODELS = [
  { value: 'veo-3.1', label: 'Veo 3.1', apiModel: 'veo-3.1-generate-preview' },
  { value: 'veo-3.1-fast', label: 'Veo 3.1 Fast', apiModel: 'veo-3.1-fast-generate-preview' },
];

interface TrackedTask {
  taskId: string;
  status: string;
  progress: number;
  url?: string;
  error?: string;
}

const veoSubmit = async (params: { prompt: string; model: string; aspectRatio: string; resolution: string; size?: string; images?: string[]; quantity?: number; seconds?: number; imgMode?: string }) => {
  const token = getAuthToken();
  const r = await fetch('/api/video/seedance', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(params),
  });
  const d = await r.json();
  if (!d.taskIds && d.error) throw new Error(d.error);
  return d;
};

const veoPollStatus = async (taskId: string) => {
  const token = getAuthToken();
  const r = await fetch(`/api/video/seedance/status/${taskId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return r.json();
};

export const Veo31VideoPage: React.FC<{ hideHeader?: boolean }> = ({ hideHeader }) => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getAvailableModels(['seedream']).then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
    });
  }, []);
  const [pricing, setPricing] = useState<Record<string, number>>({});
  useEffect(() => {
    fetch('/api/pricing').then(r => r.json()).then(d => { if (d.data) setPricing(d.data); }).catch(() => {});
  }, []);

  // 页面加载时读取已保存的视频任务
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    fetch('/api/video/tasks', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          const tasks: TrackedTask[] = res.data.map((row: any) => ({
            taskId: row.task_id,
            status: row.status || 'pending',
            progress: 0,
            url: row.image_url || undefined,
          }));
          setTrackedTasks(tasks);
          // 对未完成的任务重新开始轮询
          tasks.forEach(t => {
            if (!t.url && t.status !== 'failed' && t.status !== 'completed') {
              const timer = setInterval(() => pollTask(t.taskId), 3000);
              pollTimers.current.set(t.taskId, timer);
              pollTask(t.taskId);
            }
          });
        }
      })
      .catch(() => {});
  }, []);
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [selectedModel, setSelectedModel] = useState('veo-3.1');
  const [quantity, setQuantity] = useState(1);
  const [imageFiles, setImageFiles] = useState<Array<{ file: File; preview: string }>>([]);
  const [imgMode, setImgMode] = useState<'reference' | 'first_last'>('reference');
  const [isGenerating, setIsGenerating] = useState(false);
  const [trackedTasks, setTrackedTasks] = useState<TrackedTask[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const firstFrameRef = useRef<HTMLInputElement>(null);
  const lastFrameRef = useRef<HTMLInputElement>(null);
  const pollTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const savedToLibrary = useRef<Set<string>>(new Set());

  const [queryTaskId, setQueryTaskId] = useState('');
  const [queryResult, setQueryResult] = useState<{ url?: string; status: string; progress: number; error?: string } | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const [resolution, setResolution] = useState('1080p');

  const RESOLUTIONS = [
    { value: '1080p', label: '1080p' },
    { value: '4k', label: '4K' },
  ];

  const unitPrice = selectedModel === 'veo-3.1-fast'
    ? (resolution === '4k' ? (pricing['veo31_video_fast_4k'] || pricing['veo31_video_fast'] || 2) : (pricing['veo31_video_fast'] || pricing['veo31_video'] || 1))
    : (resolution === '4k' ? (pricing['veo31_video_4k'] || pricing['veo31_video'] || 2) : (pricing['veo31_video'] || pricing['veo31'] || 1));
  const totalPrice = unitPrice * quantity;

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.readAsDataURL(file); });

  const maxImages = imgMode === 'reference' ? 3 : 2;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, slot?: number) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    const file = files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (slot !== undefined) {
        setImageFiles(prev => { const next = [...prev]; next[slot] = { file, preview: reader.result as string }; return next; });
      } else {
        const remaining = maxImages - imageFiles.length;
        files.slice(0, remaining).forEach(f => {
          const r = new FileReader();
          r.onload = () => setImageFiles(prev => [...prev, { file: f, preview: r.result as string }]);
          r.readAsDataURL(f);
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeImage = (index: number) => setImageFiles(prev => prev.filter((_, i) => i !== index));

  const saveTaskToServer = useCallback(async (taskId: string, data: any) => {
    try {
      await fetch('/api/video/tasks/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ taskId, ...data }),
      });
    } catch {}
  }, []);

  const pollTask = useCallback(async (taskId: string) => {
    try {
      const result = await veoPollStatus(taskId);
      const errMsg = result.error ? (typeof result.error === 'string' ? result.error : result.error.message || result.error.fail_msg) : undefined;
      setTrackedTasks(prev => prev.map(t => t.taskId === taskId ? {
        ...t, status: result.status, progress: result.progress, url: result.url || t.url, error: errMsg,
      } : t));

      // 更新服务端任务状态
      saveTaskToServer(taskId, {
        status: result.status,
        progress: result.progress,
        videoUrl: result.url || '',
      });

      if (result.url && !savedToLibrary.current.has(taskId)) {
        savedToLibrary.current.add(taskId);
        try {
          const cosUrl = await uploadImageToCos(result.url);
          await imageLibraryService.saveToLibrary({
            image_url: cosUrl || result.url,
            prompt: `Veo3.1视频-${prompt.substring(0, 30)}`,
            model: selectedModel,
            aspect_ratio: aspectRatio,
            resolution: '1080p',
            type: 'generated',
          });
        } catch {}
      }

      if (['completed', 'succeeded', 'failed'].includes(result.status)) {
        if (pollTimers.current.has(taskId)) {
          clearInterval(pollTimers.current.get(taskId)!);
          pollTimers.current.delete(taskId);
        }
      }
    } catch {}
  }, [prompt, selectedModel, aspectRatio]);

  const startPolling = (taskId: string, savedPrompt?: string, savedModel?: string, savedRatio?: string) => {
    setTrackedTasks(prev => [...prev, { taskId, status: 'pending', progress: 0 }]);
    // 保存到服务端
    saveTaskToServer(taskId, {
      prompt: savedPrompt || prompt,
      model: savedModel || selectedModel,
      aspectRatio: savedRatio || aspectRatio,
      status: 'pending',
    });
    pollTask(taskId);
    const timer = setInterval(() => pollTask(taskId), 3000);
    pollTimers.current.set(taskId, timer);
  };

  const getApiModel = () => {
    const m = MODELS.find(m => m.value === selectedModel);
    return m ? m.apiModel : 'veo-3.1-generate-preview';
  };

  const handleGenerate = async () => {
    if (!requireAuth()) return;
    if (!prompt.trim() || isGenerating) return;
    // 立即添加一个提交中的占位任务，右侧面板不再空
    const submitId = 'submitting-' + Date.now();
    setTrackedTasks(prev => [...prev, { taskId: submitId, status: 'submitting', progress: 0 }]);
    setIsGenerating(true);
    try {
      const imageData = imageFiles.length > 0 ? await Promise.all(imageFiles.map(f => fileToDataUrl(f.file))) : undefined;
      const sizeMap: Record<string, string> = { '1080p': '1920x1080', '4k': '3840x2160' };
      const res = await veoSubmit({
        prompt: prompt.trim(),
        model: getApiModel(),
        aspectRatio,
        resolution,
        size: sizeMap[resolution] || '1920x1080',
        images: imageData,
        quantity,
        seconds: 8,
        imgMode,
      });
      // 移除占位任务，加入真实任务
      setTrackedTasks(prev => prev.filter(t => t.taskId !== submitId));
      if (res.taskIds && res.taskIds.length > 0) {
        res.taskIds.forEach(tid => startPolling(tid));
      }
      setPrompt('');
      setImageFiles([]);
      setQuantity(1);
    } catch (error: any) {
      setTrackedTasks(prev => prev.map(t => t.taskId === submitId ? { ...t, status: 'failed', error: error.message } : t));
      alert(`视频生成失败: ${error.response?.data?.error || error.response?.data?.message || error.message || '生成失败'}`);
    }
    setIsGenerating(false);
  };

  const handleQueryTask = async (taskId?: string) => {
    const id = taskId || queryTaskId.trim();
    if (!id) return;
    setIsQuerying(true);
    setQueryResult(null);
    if (taskId) setQueryTaskId(taskId);
    try {
      const result = await veoPollStatus(id);
      setQueryResult(result);
      if (result.url) {
        setTrackedTasks(prev => prev.map(t => t.taskId === id ? { ...t, url: result.url!, status: result.status, progress: result.progress } : t));
      }
    } catch (err: any) {
      setQueryResult({ status: 'error', progress: 0, error: err.response?.data?.error || err.response?.data?.message || err.message || '查询失败' });
    }
    setIsQuerying(false);
  };

  const handleDownload = async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `video-${Date.now()}.mp4`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
  };

  useEffect(() => {
    return () => {
      pollTimers.current.forEach(timer => clearInterval(timer));
      pollTimers.current.clear();
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      {!hideHeader && (
        <div className="flex items-center gap-3 px-6 h-14 border-b border-[#E5E5E5] flex-shrink-0 bg-[#F7F7F7]">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center">
            <Film size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-[#171717]">Veo3.1 视频生成</h1>
            <p className="text-[10px] text-[#A3A3A3] leading-tight">Google Veo 3.1 AI视频生成，固定8秒·1080p</p>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[380px] border-r border-[#E5E5E5] overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-[#FAFAFA]">
          {/* Model */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 flex items-center justify-center"><Sparkles size={14} className="text-blue-500" /></div>
              <span className="text-sm font-semibold text-[#171717]">模型</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MODELS.map(m => (
                <button key={m.value} onClick={() => setSelectedModel(m.value)}
                  className={`p-3 rounded-xl text-center transition-all ${selectedModel === m.value ? 'bg-[#171717] text-white shadow-sm ring-2 ring-black/10' : 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'}`}>
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className={`text-[9px] mt-1 leading-tight ${selectedModel === m.value ? 'text-white/70' : 'text-[#A3A3A3]'}`}>
                    {m.value === 'veo-3.1' ? '追求极致画质·4K成片' : '快速出片·高性价比'}
                  </div>
                </button>
              ))}
            </div>
            <ModelSpeedNote />
          </div>

          {/* Prompt */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 flex items-center justify-center"><Video size={14} className="text-blue-500" /></div>
              <span className="text-sm font-semibold text-[#171717]">视频描述</span>
            </div>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder="描述你想生成的视频内容..."
              className="w-full bg-[#F5F5F5] rounded-xl p-3 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none h-20 text-[#333333] placeholder:text-[#BDBDBD]" />
          </div>

          {/* Image Mode Toggle */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 flex items-center justify-center"><Layers size={14} className="text-blue-500" /></div>
              <span className="text-sm font-semibold text-[#171717]">图片模式</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setImgMode('reference'); setImageFiles([]); }}
                className={`p-3 rounded-xl text-center transition-all ${imgMode === 'reference' ? 'bg-blue-500 text-white shadow-sm' : 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'}`}>
                <ImagePlus size={16} className="mx-auto mb-1" />
                <div className="text-xs font-medium">参考图</div>
              </button>
              <button onClick={() => { setImgMode('first_last'); setImageFiles([]); }}
                className={`p-3 rounded-xl text-center transition-all ${imgMode === 'first_last' ? 'bg-blue-500 text-white shadow-sm' : 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'}`}>
                <Layers size={16} className="mx-auto mb-1" />
                <div className="text-xs font-medium">首尾帧</div>
              </button>
            </div>
            <p className="text-[10px] text-[#A3A3A3] mt-2">{imgMode === 'reference' ? '上传多张参考图引导视频风格' : '上传首帧和尾帧图片，生成过渡视频'}</p>
          </div>

          {/* Images Upload */}
          {imgMode === 'reference' ? (
            <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 flex items-center justify-center"><Image size={14} className="text-blue-500" /></div>
                  <span className="text-sm font-semibold text-[#171717]">参考图（可选）</span>
                </div>
                <span className="text-xs text-[#A3A3A3]">{imageFiles.length}/{maxImages}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {imageFiles.map((img, idx) => (
                  <div key={idx} className="relative aspect-video rounded-xl overflow-hidden group bg-[#F5F5F5]">
                    <img src={img.preview} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeImage(idx)} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X size={16} className="text-white" /></button>
                    <span className="absolute top-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">参考{idx + 1}</span>
                  </div>
                ))}
                {imageFiles.length < maxImages && (
                  <>
                    <input type="file" ref={imageInputRef} onChange={e => handleImageUpload(e)} accept="image/*" multiple className="hidden" />
                    <div onClick={() => imageInputRef.current?.click()} className="border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA]  aspect-video flex flex-col items-center justify-center gap-1 hover:border-[#171717]/30 hover:bg-[#F5F5F5] transition-all cursor-pointer bg-white">
                      <Upload size={16} className="text-[#A3A3A3]" /><span className="text-[10px] text-[#A3A3A3]">上传</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 flex items-center justify-center"><Layers size={14} className="text-blue-500" /></div>
                <span className="text-sm font-semibold text-[#171717]">首尾帧（必传）</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-[#737373] font-medium mb-1">首帧</div>
                  {imageFiles[0] ? (
                    <div className="relative aspect-video rounded-xl overflow-hidden group bg-[#F5F5F5]">
                      <img src={imageFiles[0].preview} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => removeImage(0)} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X size={16} className="text-white" /></button>
                    </div>
                  ) : (
                    <>
                      <input type="file" ref={firstFrameRef} onChange={e => handleImageUpload(e, 0)} accept="image/*" className="hidden" />
                      <div onClick={() => firstFrameRef.current?.click()} className="border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA]  aspect-video flex flex-col items-center justify-center gap-1 hover:border-[#171717]/30 hover:bg-[#F5F5F5] transition-all cursor-pointer bg-white">
                        <Upload size={16} className="text-[#A3A3A3]" /><span className="text-[10px] text-[#A3A3A3]">上传首帧</span>
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <div className="text-xs text-[#737373] font-medium mb-1">尾帧</div>
                  {imageFiles[1] ? (
                    <div className="relative aspect-video rounded-xl overflow-hidden group bg-[#F5F5F5]">
                      <img src={imageFiles[1].preview} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => removeImage(1)} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X size={16} className="text-white" /></button>
                    </div>
                  ) : (
                    <>
                      <input type="file" ref={lastFrameRef} onChange={e => handleImageUpload(e, 1)} accept="image/*" className="hidden" />
                      <div onClick={() => lastFrameRef.current?.click()} className="border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA]  aspect-video flex flex-col items-center justify-center gap-1 hover:border-[#171717]/30 hover:bg-[#F5F5F5] transition-all cursor-pointer bg-white">
                        <Upload size={16} className="text-[#A3A3A3]" /><span className="text-[10px] text-[#A3A3A3]">上传尾帧</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Aspect Ratio */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 flex items-center justify-center"><Film size={14} className="text-blue-500" /></div>
              <span className="text-sm font-semibold text-[#171717]">视频比例</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ASPECT_RATIOS.map(r => (
                <button key={r.value} onClick={() => setAspectRatio(r.value)}
                  className={`p-3 rounded-xl text-center transition-all ${aspectRatio === r.value ? 'bg-blue-500 text-white shadow-sm' : 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'}`}>
                  <div className="text-sm font-medium">{r.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Duration - fixed display */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 flex items-center justify-center"><Clock size={14} className="text-blue-500" /></div>
              <span className="text-sm font-semibold text-[#171717]">视频时长</span>
            </div>
            <div className="text-sm text-[#737373]">8秒（固定）<span className="ml-2 text-amber-600 font-semibold">{unitPrice} 积分/条</span></div>
          </div>

          {/* Resolution */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 flex items-center justify-center"><Film size={14} className="text-blue-500" /></div>
              <span className="text-sm font-semibold text-[#171717]">分辨率</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {RESOLUTIONS.map(r => (
                <button key={r.value} onClick={() => setResolution(r.value)}
                  className={`p-3 rounded-xl text-center transition-all ${resolution === r.value ? 'bg-blue-500 text-white shadow-sm' : 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'}`}>
                  <div className="text-sm font-medium">{r.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 flex items-center justify-center"><Sparkles size={14} className="text-blue-500" /></div>
              <span className="text-sm font-semibold text-[#171717]">生成数量</span>
            </div>
            <div className="flex gap-2">
              {[1, 2, 3, 5, 10].map(n => (
                <button key={n} onClick={() => setQuantity(n)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${quantity === n ? 'bg-blue-500 text-white' : 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'}`}>{n}</button>
              ))}
            </div>
            {unitPrice > 0 && (
              <div className="mt-2 text-xs text-[#A3A3A3]">单价 {unitPrice} 积分 × {quantity} = <span className="font-semibold text-amber-600">{totalPrice} 积分</span></div>
            )}
          </div>

          {/* Generate Button */}
          <button onClick={handleGenerate} disabled={!prompt.trim() || isGenerating}
            className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-[#E5E5E5] disabled:text-[#A3A3A3] disabled:cursor-not-allowed shadow-sm">
            {isGenerating ? <><Loader2 size={18} className="animate-spin" /><span>提交中...</span></> : <><Sparkles size={18} /><span>生成视频{quantity > 1 ? ` (×${quantity})` : ''}</span></>}
          </button>

          {/* Query Existing Task */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 flex items-center justify-center"><Film size={14} className="text-blue-500" /></div>
              <span className="text-sm font-semibold text-[#171717]">查询已有任务</span>
            </div>
            <div className="flex gap-2 mb-2">
              <input value={queryTaskId} onChange={e => setQueryTaskId(e.target.value)}
                placeholder="输入 task_id 查询"
                className="flex-1 bg-[#F5F5F5] rounded-xl px-3 py-2 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[#333333] placeholder:text-[#BDBDBD]"
                onKeyDown={e => e.key === 'Enter' && handleQueryTask()} />
              <button onClick={() => handleQueryTask()} disabled={isQuerying || !queryTaskId.trim()}
                className="px-4 py-2 bg-[#171717] text-white text-sm rounded-xl font-medium disabled:bg-[#E5E5E5] disabled:text-[#A3A3A3] hover:bg-[#27272A] transition-all">查询</button>
            </div>
            {queryResult && (
              <div className="bg-[#F5F5F5] rounded-xl p-3">
                {queryResult.url ? (
                  <div className="space-y-1">
                    <span className="text-xs text-green-600 font-medium block">已完成</span>
                    <div className="flex gap-2 mt-1">
                      <input readOnly value={queryResult.url} className="flex-1 bg-white rounded-xl px-2 py-1.5 text-[10px] text-[#737373] truncate" />
                      <button onClick={() => { handleDownload(queryResult.url!); }} className="px-2 py-1 bg-[#171717] text-white text-[10px] rounded-xl whitespace-nowrap">下载</button>
                    </div>
                  </div>
                ) : ['completed', 'succeeded'].includes(queryResult.status) ? (
                  <span className="text-xs text-green-600 font-medium">已完成（URL未返回，请重试查询）</span>
                ) : queryResult.status === 'failed' || queryResult.status === 'error' ? (
                  <span className="text-xs text-red-500">{queryResult.error || '生成失败'}</span>
                ) : (
                  <span className="text-xs text-[#737373]">进度: {queryResult.progress}% (状态: {queryResult.status})</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Progress */}
        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto p-6">
          {trackedTasks.filter(t => t.status !== 'submitting').length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-sm">
                <div className="w-20 h-20 mx-auto mb-5 bg-[#F5F5F5] rounded-2xl flex items-center justify-center">
                  <Film size={32} className="text-[#D4D4D4]" />
                </div>
                <h2 className="text-lg font-semibold text-[#171717] mb-2">Veo3.1 视频生成</h2>
                <p className="text-sm text-[#A3A3A3] leading-relaxed">选择模型 → 输入描述 → 一键生成 AI 视频</p>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-sm font-semibold text-[#171717] mb-4">生成进度 ({trackedTasks.length})</h2>
              <div className="space-y-3">
                {trackedTasks.map((tt, idx) => (
                  <div key={tt.taskId} className={`rounded-xl px-4 py-3 border ${tt.url ? 'bg-green-50 border-green-200' : tt.status === 'failed' ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {tt.status === 'submitting' ? <Clock size={16} className="text-amber-500" /> : tt.url ? <CheckCircle size={16} className="text-green-500" /> : tt.status === 'failed' ? <AlertCircle size={16} className="text-red-500" /> : <Loader2 size={16} className="animate-spin text-[#171717]" />}
                        <span className="text-xs font-mono text-[#737373]">#{idx + 1}</span>
                        <span className="text-[10px] text-gray-400 font-mono truncate max-w-[120px]">{tt.taskId}</span>
                      </div>
                      <span className={`text-xs font-medium ${tt.url ? 'text-green-600' : tt.status === 'failed' ? 'text-red-500' : tt.status === 'submitting' ? 'text-amber-500' : 'text-[#171717]'}`}>
                        {tt.url ? '已完成' : tt.status === 'failed' ? '失败' : tt.status === 'submitting' ? '提交中...' : `${tt.progress}%`}
                      </span>
                    </div>
                    {!tt.url && tt.status !== 'failed' && tt.status !== 'submitting' && (
                      <div className="w-full bg-gray-200 rounded-xl h-1.5">
                        <div className="bg-[#171717] h-1.5 rounded-xl transition-all duration-500" style={{ width: `${tt.progress}%` }} />
                      </div>
                    )}
                    {tt.url && (
                      <div className="flex gap-2 mt-1">
                        <input readOnly value={tt.url} className="flex-1 bg-white rounded-xl px-2 py-1 text-[10px] text-[#737373] border border-green-200 truncate" />
                        <button onClick={() => handleDownload(tt.url!)} className="px-3 py-1 bg-[#171717] text-white text-[10px] rounded-xl whitespace-nowrap flex items-center gap-1"><Download size={10} />下载</button>
                      </div>
                    )}
                    {tt.error && <p className="text-[10px] text-red-500 mt-1">{tt.error}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Loader2, Film, Video, Image, Upload, Clock, CheckCircle, Download, AlertCircle, Play, Coins } from 'lucide-react';
import { getAuthToken } from '../../services/authService';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../services/api';

// COS/外部视频走后端代理，解决 CORS 问题
const cosProxyUrl = (url: string) => {
  if (url && (url.includes('cos.ap-beijing.myqcloud.com') || url.includes('soruxgpt.com') || url.includes('agnes-ai.space') || url.includes('xgapi.top'))) {
    return `/api/cos-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
};

const VIDEO_MODEL_LIST = [
  { value: 'grok-video-1.5-pro', label: 'Grok Video 1.5 Pro', pricingKey: 'grok_video_15_pro', desc: '快速出片·高性价比' },
  { value: 'grok-video-1.5-max', label: 'Grok Video 1.5 Max', pricingKey: 'grok_video_15_max', desc: '旗舰画质·物理模拟更精准' },
];

const ASPECT_RATIOS = [
  { value: '9:16', label: '竖屏 9:16' },
  { value: '16:9', label: '横屏 16:9' },
];

const DURATIONS = [
  { value: 10, label: '10秒' },
  { value: 15, label: '15秒' },
];

const QUANTITIES = [1, 2, 3];

interface TrackedTask {
  taskId: string;
  status: string;
  progress: number;
  url?: string;
  thumbnailUrl?: string;
  error?: string;
  prompt?: string;
}

export const MobileVideoPage: React.FC = () => {
  const { isAuthenticated, user, refreshUser } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [duration, setDuration] = useState(10);
  const [selectedModel, setSelectedModel] = useState(VIDEO_MODEL_LIST[0].value);
  const [quantity, setQuantity] = useState(1);
  const [imageFiles, setImageFiles] = useState<Array<{ file: File; preview: string }>>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [trackedTasks, setTrackedTasks] = useState<TrackedTask[]>([]);
  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);
  const [pricingData, setPricingData] = useState<Record<string, number>>({});
  const [sheet, setSheet] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const pollTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pollStartTimes = useRef<Map<string, number>>(new Map());

  // 获取定价数据
  useEffect(() => {
    fetch(`${API_URL}/api/pricing`)
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data) {
          setPricingData(res.data);
        }
      })
      .catch(() => {});
  }, []);

  // 加载历史任务
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    fetch(`${API_URL}/api/video/tasks`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          const tasks: TrackedTask[] = res.data.map((row: any) => ({
            taskId: String(row.id),
            status: row.status || 'pending',
            progress: row.status === 'completed' ? 100 : 0,
            url: row.image_url || undefined,
            thumbnailUrl: row.thumbnail_url || undefined,
            prompt: row.prompt || '',
          }));
          setTrackedTasks(tasks);
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

  // 清理定时器
  useEffect(() => {
    return () => {
      pollTimers.current.forEach(timer => clearInterval(timer));
      pollTimers.current.clear();
    };
  }, []);

  const maxImages = 3;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files as FileList | null;
    const files = Array.from(fileList || []).filter((f: File) => f.type.startsWith('image/'));
    if (!files[0]) return;
    const remaining = maxImages - imageFiles.length;
    files.slice(0, remaining).forEach((f: File) => {
      const r = new FileReader();
      r.onload = () => setImageFiles(prev => [...prev, { file: f, preview: r.result as string }]);
      r.readAsDataURL(f);
    });
    e.target.value = '';
  };

  const removeImage = (index: number) => setImageFiles(prev => prev.filter((_, i) => i !== index));

  const pollTask = useCallback(async (taskId: string) => {
    try {
      const token = getAuthToken();
      if (!token) return;
      const startTime = pollStartTimes.current.get(taskId) || Date.now();
      if (Date.now() - startTime > 5 * 60 * 1000) {
        const timer = pollTimers.current.get(taskId);
        if (timer) { clearInterval(timer); pollTimers.current.delete(taskId); }
        pollStartTimes.current.delete(taskId);
        setTrackedTasks(prev => prev.map(t => t.taskId === String(taskId) ? { ...t, status: 'failed', error: '超时未完成', progress: 0 } : t));
        return;
      }
      const res = await fetch(`${API_URL}/api/video/query/${taskId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success && data.data) {
        const d = data.data;
        const status = d.status || 'pending';
        const url = d.video_url || undefined;
        const thumbnailUrl = d.thumbnail_url || undefined;
        const progress = d.progress || (status === 'completed' ? 100 : 0);
        const error = status === 'failed' ? '视频生成失败' : undefined;
        setTrackedTasks(prev => prev.map(t => t.taskId === String(taskId) ? {
          ...t, status, url, thumbnailUrl: thumbnailUrl || t.thumbnailUrl, error, progress,
        } : t));
        if (status === 'completed' || status === 'failed') {
          const timer = pollTimers.current.get(String(taskId));
          if (timer) { clearInterval(timer); pollTimers.current.delete(String(taskId)); }
          pollStartTimes.current.delete(String(taskId));
        }
      }
    } catch {}
  }, []);

  const handleGenerate = async () => {
    if (!isAuthenticated) {
      window.dispatchEvent(new Event('mobile-auth-required'));
      return;
    }
    if (!prompt.trim()) return;

    const count = quantity;
    setIsGenerating(true);

    try {
      const token = getAuthToken();
      let imageUrl = '';
      if (imageFiles.length > 0) {
        imageUrl = imageFiles[0].preview;
      }

      for (let i = 0; i < count; i++) {
        const body: any = {
          model: selectedModel,
          prompt: prompt.trim(),
          imageUrl: imageUrl || undefined,
          aspectRatio,
          duration,
        };
        const response = await fetch(`${API_URL}/api/video/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });

        const result = await response.json();
        if (result.success) {
          refreshUser();
          const backendTaskId = String(result.taskId);
          setTrackedTasks(prev => [{
            taskId: backendTaskId,
            status: result.videoUrl ? 'completed' : 'pending',
            progress: result.videoUrl ? 100 : 0,
            url: result.videoUrl || undefined,
            prompt: prompt.trim(),
          }, ...prev]);
          if (!result.videoUrl) {
            pollTask(backendTaskId);
            const timer = setInterval(() => pollTask(backendTaskId), 3000);
            pollTimers.current.set(backendTaskId, timer);
          }
        } else {
          alert(result.message || '生成失败');
          break;
        }
      }
      setPrompt('');
    } catch (error: any) {
      console.error('视频生成失败:', error);
      alert('生成失败: ' + (error.message || '网络错误'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (url: string) => {
    try {
      const r = await fetch(url);
      const b = await r.blob();
      const u = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = u; a.download = `video-${Date.now()}.mp4`; a.click();
      URL.revokeObjectURL(u);
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleRemoveTask = (taskId: string) => {
    const timer = pollTimers.current.get(taskId);
    if (timer) { clearInterval(timer); pollTimers.current.delete(taskId); }
    pollStartTimes.current.delete(taskId);
    setTrackedTasks(prev => prev.filter(t => t.taskId !== taskId));
  };

  const getPrice = (pricingKey: string) => {
    return pricingData[pricingKey] !== undefined ? pricingData[pricingKey] : 0.8;
  };

  const selectedModelData = VIDEO_MODEL_LIST.find(m => m.value === selectedModel);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-32 space-y-4">
          {/* 模型选择 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-2 block">模型</label>
            <button onClick={() => setSheet('model')} className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-[#171717]">{selectedModelData?.label}</span>
                <span className="text-[10px] text-gray-400">{selectedModelData?.desc}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-blue-400">{getPrice(selectedModelData?.pricingKey || '')} 积分</span>
                <Sparkles size={14} className="text-gray-400" />
              </div>
            </button>
            {sheet === 'model' && (
              <div className="fixed inset-0 z-[100] flex items-end" onClick={() => setSheet(null)}>
                <div className="absolute inset-0 bg-black/60" />
                <div className="relative w-full bg-white rounded-t-3xl pb-[calc(16px+env(safe-area-inset-bottom))] animate-mobile-slide-up" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-200">
                    <h3 className="text-base font-bold text-[#171717]">选择模型</h3>
                    <button onClick={() => setSheet(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} className="text-gray-500" /></button>
                  </div>
                  <div className="px-3 py-2">
                    {VIDEO_MODEL_LIST.map(m => (
                      <button key={m.value} onClick={() => { setSelectedModel(m.value); setSheet(null); }} className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl my-0.5 ${selectedModel === m.value ? 'bg-gray-100' : ''}`}>
                        <div>
                          <span className="text-sm text-gray-500 block">{m.label}</span>
                          <span className="text-[10px] text-gray-400">{m.desc}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-blue-400">{getPrice(m.pricingKey)} 积分</span>
                          {selectedModel === m.value && <CheckCircle size={18} className="text-blue-400" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 视频描述 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-2 block">视频描述</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="描述你想生成的视频内容..."
              rows={3}
              className="w-full px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 text-sm text-[#171717] placeholder-gray-300 resize-none outline-none focus:border-blue-500/30 transition-colors"
            />
          </div>

          {/* 参考图上传 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-2 block">参考图（可选）</label>
            <div className="flex gap-2.5 flex-wrap">
              {imageFiles.map((img, i) => (
                <div key={i} className="relative w-[72px] h-[72px] rounded-xl overflow-hidden bg-gray-50 border border-gray-200">
                  <img src={img.preview} className="w-full h-full object-cover" />
                  <button onClick={() => removeImage(i)} className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center">
                    <X size={10} className="text-[#171717]" />
                  </button>
                </div>
              ))}
              {imageFiles.length < maxImages && (
                <button onClick={() => imageInputRef.current?.click()} className="w-[72px] h-[72px] rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center bg-gray-50">
                  <Upload size={20} className="text-gray-300" />
                  <span className="text-[9px] text-gray-300">上传</span>
                </button>
              )}
            </div>
            <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
          </div>

          {/* 视频比例 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-2 block">视频比例</label>
            <div className="grid grid-cols-2 gap-2">
              {ASPECT_RATIOS.map(r => (
                <button key={r.value} onClick={() => setAspectRatio(r.value)} className={`px-4 py-3 rounded-xl text-xs font-medium transition-all ${aspectRatio === r.value ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/25' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* 视频时长 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-2 block">视频时长</label>
            <div className="grid grid-cols-2 gap-2">
              {DURATIONS.map(d => (
                <button key={d.value} onClick={() => setDuration(d.value)} className={`px-4 py-3 rounded-xl text-xs font-medium transition-all ${duration === d.value ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/25' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* 生成数量 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-2 block">生成数量</label>
            <div className="flex gap-2">
              {QUANTITIES.map(n => (
                <button key={n} onClick={() => setQuantity(n)} className={`flex-1 py-3 rounded-xl text-xs font-medium transition-all ${quantity === n ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/25' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* 生成按钮 */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-sm font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white active:from-blue-600 active:to-blue-700 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-40"
          >
            {!isAuthenticated ? (
              <><AlertCircle size={16} /> 登录后使用</>
            ) : isGenerating ? (
              <><Loader2 size={16} className="animate-spin" /> 提交中...</>
            ) : (
              <><Sparkles size={16} /> 生成视频 ({getPrice(selectedModelData?.pricingKey || '')}积分/个)</>
            )}
          </button>

          {/* 提示信息 */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl px-4 py-3">
            <p className="text-xs text-blue-400 leading-relaxed">
              视频生成需要 120-200 秒，请耐心等候。若提示生成失败则不扣费。
            </p>
          </div>

          {/* 生成结果 */}
          {trackedTasks.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Film size={16} className="text-gray-500" />
                  <h2 className="text-sm font-bold text-gray-600">生成结果 ({trackedTasks.length})</h2>
                </div>
                {trackedTasks.some(t => t.status === 'failed') && (
                  <button onClick={() => {
                    const failedIds = trackedTasks.filter(t => t.status === 'failed').map(t => t.taskId);
                    failedIds.forEach(id => handleRemoveTask(id));
                  }} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                    清空失败
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {trackedTasks.map((tt) => {
                  const isActive = !tt.url && !['failed', 'completed', 'succeeded', 'submitting'].includes(tt.status);
                  const isDone = !!tt.url || ['completed', 'succeeded'].includes(tt.status);
                  const isFailed = tt.status === 'failed';
                  return (
                    <div key={tt.taskId} className="mobile-card overflow-hidden rounded-xl bg-gray-50 border border-gray-200">
                      {/* 视频缩略图区域 */}
                      <div className={`relative aspect-[9/16] ${isDone ? 'bg-slate-900' : isFailed ? 'bg-red-900/20' : 'bg-gray-50'}`}>
                        {isDone && (tt.thumbnailUrl || tt.url) ? (
                          <>
                            {tt.thumbnailUrl ? (
                              <img src={tt.thumbnailUrl} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <video src={cosProxyUrl(tt.url!)} crossOrigin="anonymous" className="w-full h-full object-cover" preload="metadata" muted />
                            )}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                                <Play size={16} className="text-slate-900 ml-0.5" />
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            {tt.status === 'submitting'
                              ? <Clock size={24} className="text-amber-400" />
                              : isFailed
                                ? <AlertCircle size={24} className="text-red-400" />
                                : <Loader2 size={24} className="animate-spin text-blue-400" />}
                          </div>
                        )}
                        {/* 删除按钮 */}
                        <button onClick={(e) => { e.stopPropagation(); handleRemoveTask(tt.taskId); }}
                          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                          <X size={12} className="text-white" />
                        </button>
                      </div>
                      {/* 底部信息 */}
                      <div className="px-3 py-2.5">
                        {isActive && (
                          <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden mb-2">
                            <div className="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-blue-500 to-blue-600"
                              style={{ width: `${tt.progress}%` }} />
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-medium ${isDone ? 'text-emerald-400' : isFailed ? 'text-red-400' : 'text-blue-400'}`}>
                            {isDone ? '已完成' : isFailed ? '失败' : `${tt.progress}%`}
                          </span>
                        </div>
                        {tt.error && <p className="text-[10px] text-red-400 mt-1">{tt.error}</p>}
                        {isDone && tt.url && (
                          <button onClick={() => handleDownload(tt.url!)} className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-50 text-gray-500 text-xs font-medium">
                            <Download size={14} /> 下载
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 视频播放弹窗 */}
      {videoModalUrl && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4" onClick={() => setVideoModalUrl(null)}>
          <div className="relative flex flex-col items-center max-h-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setVideoModalUrl(null)} className="absolute -top-10 right-0 text-gray-500 hover:text-[#171717] transition-colors">
              <X size={24} />
            </button>
            <video src={cosProxyUrl(videoModalUrl)} controls autoPlay className="max-h-[80vh] max-w-[90vw] rounded-2xl shadow-2xl object-contain" />
            <div className="flex justify-center mt-4 gap-3">
              <button onClick={() => handleDownload(videoModalUrl)} className="px-6 py-2.5 bg-white text-slate-900 rounded-xl text-sm font-medium hover:bg-slate-100 transition-colors flex items-center gap-2">
                <Download size={16} />下载视频
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

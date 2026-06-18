import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Loader2, Film, Video, Image, Upload, Clock, CheckCircle, Download, AlertCircle, Search, RotateCcw, Play } from 'lucide-react';
import { getAuthToken } from '../../../services/authService';
import { requireAuth } from '../../../utils/authCheck';
import { getVideoModels } from '../../../services/modelService';
import { API_URL } from '../../../services/api';

// COS/外部视频走后端代理，解决 CORS 问题
const cosProxyUrl = (url: string) => {
  if (url && (url.includes('cos.ap-beijing.myqcloud.com') || url.includes('soruxgpt.com') || url.includes('agnes-ai.space') || url.includes('xgapi.top'))) {
    return `/api/cos-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
};

const VIDEO_MODEL_LIST = [
  { value: 'grok-video-1.5-pro', label: 'Grok Video 1.5 Pro', pricingKey: 'grok_video_15_pro' },
  { value: 'grok-video-1.5-max', label: 'Grok Video 1.5 Max', pricingKey: 'grok_video_15_max' },
];

const ASPECT_RATIOS = [
  { value: '16:9', label: '横屏 16:9' },
  { value: '9:16', label: '竖屏 9:16' },
];
const DURATIONS = [
  { value: 10, label: '10秒' },
  { value: 15, label: '15秒' },
];
const QUANTITIES = [1, 2, 3, 5, 10];

interface TrackedTask {
  taskId: string;
  status: string;
  progress: number;
  url?: string;
  error?: string;
}

interface VideoTask {
  taskId: string;
  status: string;
  progress: number;
  url?: string;
  thumbnailUrl?: string;
  error?: string;
  prompt?: string;
  createdAt?: number;
}

interface VideoTabProps {
  onTaskCountChange?: (count: number) => void;
  onTasksChange?: (tasks: VideoTask[]) => void;
  onCreditsChange?: () => void;
}

export const VideoTab: React.FC<VideoTabProps> = ({ onTaskCountChange, onTasksChange, onCreditsChange }) => {
  const [models, setModels] = useState<{ value: string; label: string; pricingKey?: string }[]>([]);
  const [pricingData, setPricingData] = useState<Record<string, number>>({});
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [duration, setDuration] = useState(10);
  const [selectedModel, setSelectedModel] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [imageFiles, setImageFiles] = useState<Array<{ file: File; preview: string }>>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [trackedTasks, setTrackedTasks] = useState<TrackedTask[]>([]);
  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);
  const [queryTaskId, setQueryTaskId] = useState('');
  const [queryResult, setQueryResult] = useState<{ url?: string; status: string; progress: number; error?: string; prompt?: string; model?: string } | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const pollTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pollStartTimes = useRef<Map<string, number>>(new Map());
  const savedToLibrary = useRef<Set<string>>(new Set());

  useEffect(() => {
    const active = trackedTasks.filter(t => !['completed', 'succeeded', 'failed'].includes(t.status)).length;
    onTaskCountChange?.(active);
    onTasksChange?.(trackedTasks.map(t => ({
      taskId: t.taskId, status: t.status, progress: t.progress,
      url: t.url, error: t.error,
    })));
  }, [trackedTasks, onTaskCountChange, onTasksChange]);

  useEffect(() => {
    // 直接使用硬编码的视频模型列表
    setModels(VIDEO_MODEL_LIST);
    if (!selectedModel && VIDEO_MODEL_LIST.length > 0) setSelectedModel(VIDEO_MODEL_LIST[0].value);

    // 同时尝试从API获取最新列表
    getVideoModels().then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      if (sorted.length > 0) {
        const mapped = sorted.map(x => {
            const preset = VIDEO_MODEL_LIST.find(v => v.value === x.model_id);
            return { value: x.model_id, label: x.label, pricingKey: preset?.pricingKey };
          });
        setModels(mapped);
        if (!selectedModel && mapped.length > 0) setSelectedModel(mapped[0].value);
      }
    }).catch(() => {});

    // 获取动态定价
    fetch(`${API_URL}/api/pricing`)
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data) {
          setPricingData(res.data);
        }
      })
      .catch(() => {});
  }, []);

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

  useEffect(() => {
    return () => {
      pollTimers.current.forEach(timer => clearInterval(timer));
      pollTimers.current.clear();
    };
  }, []);

  const maxImages = 5;

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.readAsDataURL(file); });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, slot?: number) => {
    const fileList = e.target.files as FileList | null;
    const files = Array.from(fileList || []).filter((f: File) => f.type.startsWith('image/'));
    if (!files[0]) return;
    if (slot !== undefined) {
      const reader = new FileReader();
      reader.onload = () => setImageFiles(prev => { const next = [...prev]; next[slot] = { file: files[0], preview: reader.result as string }; return next; });
      reader.readAsDataURL(files[0]);
    } else {
      const remaining = maxImages - imageFiles.length;
      files.slice(0, remaining).forEach((f: File) => {
        const r = new FileReader();
        r.onload = () => setImageFiles(prev => [...prev, { file: f, preview: r.result as string }]);
        r.readAsDataURL(f);
      });
    }
    e.target.value = '';
  };

  const removeImage = (index: number) => setImageFiles(prev => prev.filter((_, i) => i !== index));

  const saveTaskToServer = useCallback(async (taskId: string, data: any) => {
    // 视频任务保存功能已下线
  }, []);

  const pollTask = useCallback(async (taskId: string) => {
    try {
      const token = getAuthToken();
      if (!token) return;
      // 5分钟超时
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

  const startPolling = (taskId: string, savedPrompt?: string, savedModel?: string) => {
    setTrackedTasks(prev => [{ taskId, status: 'pending', progress: 0 }, ...prev]);
    saveTaskToServer(taskId, { prompt: savedPrompt || prompt, model: savedModel || selectedModel, aspectRatio, status: 'pending' });
    pollStartTimes.current.set(taskId, Date.now());
    pollTask(taskId);
    const timer = setInterval(() => pollTask(taskId), 3000);
    pollTimers.current.set(taskId, timer);
  };

  const handleGenerate = async () => {
    if (!requireAuth()) return;
    if (!prompt.trim()) return;

    // 支持批量：按 quantity 数量依次提交
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
          onCreditsChange?.();
          const backendTaskId = String(result.taskId);
          if (result.duplicate) {
            if (!trackedTasks.find(t => t.taskId === backendTaskId)) {
              setTrackedTasks(prev => [{
                taskId: backendTaskId,
                status: result.videoUrl ? 'completed' : 'pending',
                progress: result.videoUrl ? 100 : 0,
                url: result.videoUrl || undefined,
                prompt: prompt.trim(),
              }, ...prev]);
            }
            if (!result.videoUrl) {
              pollTask(backendTaskId);
              const timer = setInterval(() => pollTask(backendTaskId), 3000);
              pollTimers.current.set(backendTaskId, timer);
            }
          } else {
            setTrackedTasks(prev => [{
              taskId: backendTaskId,
              status: 'pending',
              progress: 0,
              prompt: prompt.trim(),
            }, ...prev]);
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

  const handleQueryTask = async (taskId?: string) => {
    const id = taskId || queryTaskId.trim();
    if (!id) return;
    setIsQuerying(true);
    setQueryResult(null);
    if (taskId) setQueryTaskId(id);
    try {
      const token = getAuthToken();
      if (!token) { setIsQuerying(false); return; }
      const res = await fetch(`${API_URL}/api/video/query/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success && data.data) {
        const d = data.data;
        setQueryResult({
          status: d.status,
          url: d.video_url || undefined,
          progress: d.status === 'completed' ? 100 : 0,
        });
        // 如果还在生成中，自动轮询
        if (d.status === 'pending') {
          const timer = setInterval(async () => {
            try {
              const pollRes = await fetch(`${API_URL}/api/video/query/${id}`, { headers: { Authorization: `Bearer ${token}` } });
              const pollData = await pollRes.json();
              if (pollData.success && pollData.data) {
                const pd = pollData.data;
                setQueryResult({
                  status: pd.status,
                  url: pd.video_url || undefined,
                  progress: pd.status === 'completed' ? 100 : 0,
                });
                if (pd.status === 'completed' || pd.status === 'failed') {
                  clearInterval(timer);
                }
              }
            } catch {}
          }, 5000);
        }
      } else {
        alert(data.message || '未找到该任务');
      }
    } catch (err: any) {
      console.error('查询失败详情:', err, 'taskId:', id);
      alert('查询失败: ' + (err.message || '网络错误'));
    }
    setIsQuerying(false);
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
    // 后端删除记录
    const token = getAuthToken();
    if (token) {
      fetch(`${API_URL}/api/images/library/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  };

  const hasActiveTasks = trackedTasks.filter(t => t.status !== 'submitting').length > 0;

  const card = 'bg-white rounded-2xl p-4 border border-slate-200 hover:border-blue-200 transition-all duration-300';
  const cardTitle = (icon: React.ReactNode, title: string) => (
    <div className="flex items-center gap-2 mb-3">{icon}<span className="text-sm font-semibold text-slate-900">{title}</span></div>
  );

  return (
    <div className="h-full flex bg-slate-50">
      {/* LEFT: Controls */}
      <div className="w-[380px] shrink-0 h-full overflow-y-auto overflow-x-hidden p-5 pb-24 space-y-4 bg-white border-r border-slate-200"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#CBD5E1 #FFFFFF' }}>

        {/* Model Selector */}
        <div className={card}>
          {cardTitle(<div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><Sparkles size={13} className="text-blue-600" /></div>, '模型')}
          <div className="grid grid-cols-2 gap-2">
            {models.map(m => {
              const price = m.pricingKey && pricingData[m.pricingKey] !== undefined
                ? pricingData[m.pricingKey]
                : null;
              return (
                <button key={m.value} onClick={() => setSelectedModel(m.value)}
                  className={`p-3 rounded-xl text-center transition-all duration-200 ${
                    selectedModel === m.value
                      ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-sm'
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                  }`}>
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className={`text-[9px] mt-1 leading-tight ${selectedModel === m.value ? 'text-blue-400' : 'text-slate-400'}`}>
                    {m.value === 'grok-video-1.5-max' ? '旗舰画质·物理模拟更精准'
                      : '快速出片·高性价比'}
                  </div>
                  <div className={`text-[9px] mt-0.5 font-medium ${selectedModel === m.value ? 'text-blue-500' : 'text-slate-400'}`}>
                    {price !== null ? `${price} 积分/次` : '0.8 积分/次'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Prompt */}
        <div className={card}>
          {cardTitle(<div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><Video size={13} className="text-blue-600" /></div>, '视频描述')}
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder="描述你想生成的视频内容..."
            className="w-full bg-slate-50 rounded-xl p-3 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none h-20 text-slate-900 placeholder:text-slate-400 transition-all" />
        </div>

        {/* 参考图上传 */}
        <div className={card}>
          <div className="flex items-center justify-between mb-3">
            {cardTitle(<div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><Image size={13} className="text-blue-600" /></div>, '参考图（可选）')}
            <span className="text-xs text-slate-400">{imageFiles.length}/{maxImages}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {imageFiles.map((img, idx) => (
              <div key={idx} className="relative aspect-video rounded-xl overflow-hidden group bg-slate-100">
                {img.preview && <img src={img.preview} alt="" className="w-full h-full object-cover" />}
                <button onClick={() => removeImage(idx)}
                  className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <X size={16} className="text-white" />
                </button>
                <span className="absolute top-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">参考{idx + 1}</span>
              </div>
            ))}
            {imageFiles.length < maxImages && (
              <>
                <input type="file" ref={imageInputRef} onChange={e => handleImageUpload(e)} accept="image/*" multiple className="hidden" />
                <div onClick={() => imageInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 aspect-video flex flex-col items-center justify-center gap-1 hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer rounded-xl">
                  <Upload size={16} className="text-slate-400" /><span className="text-[10px] text-slate-400">上传</span>
                </div>
              </>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-2">上传多张参考图引导视频风格</p>
        </div>

        {/* Aspect Ratio */}
        <div className={card}>
          {cardTitle(<div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><Film size={13} className="text-blue-600" /></div>, '视频比例')}
          <div className="grid grid-cols-2 gap-2">
            {ASPECT_RATIOS.map(r => (
              <button key={r.value} onClick={() => setAspectRatio(r.value)}
                className={`p-3 rounded-xl text-center transition-all duration-200 ${
                  aspectRatio === r.value
                    ? 'bg-blue-50 text-blue-600 border border-blue-200'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-transparent'
                }`}>
                <div className="text-sm font-medium">{r.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className={card}>
          {cardTitle(<div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><Clock size={13} className="text-blue-600" /></div>, '视频时长')}
          <div className="grid grid-cols-3 gap-2">
            {DURATIONS.map(d => (
              <button key={d.value} onClick={() => setDuration(d.value)}
                className={`p-3 rounded-xl text-center transition-all duration-200 ${
                  duration === d.value
                    ? 'bg-blue-50 text-blue-600 border border-blue-200'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-transparent'
                }`}>
                <div className="text-sm font-medium">{d.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Quantity */}
        <div className={card}>
          {cardTitle(<div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><Sparkles size={13} className="text-blue-600" /></div>, '生成数量')}
          <div className="flex gap-2">
            {QUANTITIES.map(n => (
              <button key={n} onClick={() => setQuantity(n)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  quantity === n
                    ? 'bg-blue-50 text-blue-600 border border-blue-200'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-transparent'
                }`}>{n}</button>
            ))}
          </div>
        </div>

        {/* Generate Button */}
        <button onClick={handleGenerate} disabled={!prompt.trim()}
          className={`w-full py-4 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2.5 transition-all duration-200 ${
            !prompt.trim()
              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 text-white shadow-[0_4px_20px_rgba(37,99,235,0.35)] hover:shadow-[0_6px_28px_rgba(37,99,235,0.45)] hover:scale-[1.01] active:scale-[0.98] cursor-pointer'
          }`}>
          {isGenerating
            ? <><Loader2 size={18} className="animate-spin" /><span>提交中{quantity > 1 ? ` (${quantity}条)` : '...'}</span></>
            : <><Sparkles size={18} /><span>生成视频{quantity > 1 ? ` ×${quantity}` : ''}</span></>}
        </button>

        {/* 提示信息 */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-600 leading-relaxed flex items-start gap-2">
          <span className="shrink-0 mt-0.5">💡</span>
          <span>视频生成需要 120-200 秒，请耐心等候。若提示生成失败则不扣费。</span>
        </div>

        {/* Task ID Query */}
        <div className={card}>
          {cardTitle(<div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><Search size={13} className="text-blue-600" /></div>, '查询已有任务')}
          <div className="flex gap-2 mb-2">
            <input value={queryTaskId} onChange={e => setQueryTaskId(e.target.value)} placeholder="输入 task_id 查询"
              className="flex-1 bg-slate-50 rounded-xl px-3 py-2 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-900 placeholder:text-slate-400"
              onKeyDown={e => e.key === 'Enter' && handleQueryTask()} />
            <button onClick={() => handleQueryTask()} disabled={isQuerying || !queryTaskId.trim()}
              className="px-4 py-2 bg-gradient-to-br from-[#2563EB] to-[#3B82F6] text-white text-sm rounded-xl font-medium disabled:opacity-40 hover:shadow-lg hover:shadow-blue-500/20 transition-all">
              {isQuerying ? <Loader2 size={14} className="animate-spin" /> : '查询'}
            </button>
          </div>
          {queryResult && (
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
              {queryResult.url ? (
                <div className="space-y-1">
                  <span className="text-xs text-emerald-600 font-medium block">已完成</span>
                  <div className="flex gap-2 mt-1">
                    <input readOnly value={queryResult.url} className="flex-1 bg-white rounded-lg px-2 py-1.5 text-[10px] text-slate-500 truncate border border-slate-200" />
                    <button onClick={() => handleDownload(queryResult.url!)} className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] rounded-lg whitespace-nowrap border border-emerald-200">下载</button>
                  </div>
                </div>
              ) : ['completed', 'succeeded'].includes(queryResult.status) ? (
                <span className="text-xs text-emerald-600 font-medium">已完成（URL未返回，请重试查询）</span>
              ) : queryResult.status === 'failed' || queryResult.status === 'error' ? (
                <span className="text-xs text-red-500">{queryResult.error || '生成失败'}</span>
              ) : (
                <span className="text-xs text-slate-500">进度: {queryResult.progress}% (状态: {queryResult.status})</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Results / Progress */}
      <div className="flex-1 h-full flex flex-col min-w-0 overflow-y-auto p-6 bg-slate-50">
        {!hasActiveTasks ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="w-24 h-24 mx-auto mb-6 rounded-3xl flex items-center justify-center bg-blue-50">
                <Film size={40} className="text-blue-400" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">Video Studio</h2>
              <p className="text-sm text-slate-500 leading-relaxed">选择模型 → 输入描述 → 一键生成 AI 视频</p>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-900">生成结果 ({trackedTasks.length})</h2>
              {trackedTasks.some(t => t.status === 'failed') && (
                <button onClick={() => {
                  const failedIds = trackedTasks.filter(t => t.status === 'failed').map(t => t.taskId);
                  failedIds.forEach(id => handleRemoveTask(id));
                }} className="text-xs text-red-500 hover:text-red-600 transition-colors px-3 py-1 rounded-lg hover:bg-red-50">
                  清空失败
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-4">
              {trackedTasks.map((tt, idx) => {
                const isActive = !tt.url && !['failed', 'completed', 'succeeded', 'submitting'].includes(tt.status);
                const isDone = !!tt.url || ['completed', 'succeeded'].includes(tt.status);
                const isFailed = tt.status === 'failed';
                return (
                  <div key={tt.taskId}
                    className={`rounded-2xl overflow-hidden border transition-all duration-300 ${
                      isDone ? 'bg-white border-emerald-200 hover:border-emerald-400 hover:shadow-lg cursor-pointer' :
                      isFailed ? 'bg-red-50 border-red-200' :
                      'bg-white border-slate-200'
                    }`}
                    onClick={() => isDone && tt.url && setVideoModalUrl(tt.url!)}>
                    {/* 视频缩略图区域 */}
                    <div className={`relative aspect-[9/16] ${isDone ? 'bg-slate-900' : isFailed ? 'bg-red-100' : 'bg-slate-100'}`}>
                      {isDone && (tt.thumbnailUrl || tt.url) ? (
                        <>
                          {tt.thumbnailUrl ? (
                            <img src={tt.thumbnailUrl} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <video src={cosProxyUrl(tt.url)} crossOrigin="anonymous" className="w-full h-full object-cover" preload="metadata" muted />
                          )}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
                            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                              <Play size={20} className="text-slate-900 ml-0.5" />
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
                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <X size={12} className="text-white" />
                      </button>
                    </div>
                    {/* 底部信息 */}
                    <div className="px-3 py-2.5">
                      {isActive && (
                        <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden mb-2">
                          <div className="h-full rounded-full transition-all duration-700 ease-out"
                            style={{
                              width: `${tt.progress}%`,
                              background: 'linear-gradient(90deg, #3B82F6, #2563EB)',
                            }} />
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-medium ${
                          isDone ? 'text-emerald-600' : isFailed ? 'text-red-500' : 'text-blue-600'
                        }`}>
                          {isDone ? '已完成' : isFailed ? '失败' : `${tt.progress}%`}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">#{idx + 1}</span>
                      </div>
                      {tt.error && <p className="text-[10px] text-red-500 mt-1">{tt.error}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 视频播放弹窗 */}
      {videoModalUrl && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-8" onClick={() => setVideoModalUrl(null)}>
          <div className="relative flex flex-col items-center max-h-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setVideoModalUrl(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors">
              <X size={24} />
            </button>
            <video src={cosProxyUrl(videoModalUrl)} controls autoPlay
              className="max-h-[80vh] max-w-[90vw] rounded-2xl shadow-2xl object-contain" />
            <div className="flex justify-center mt-4 gap-3">
              <a href={videoModalUrl} target="_blank" rel="noopener noreferrer"
                className="px-6 py-2.5 bg-white text-slate-900 rounded-xl text-sm font-medium hover:bg-slate-100 transition-colors flex items-center gap-2">
                <Download size={16} />下载视频
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

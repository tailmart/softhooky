import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Loader2, Film, Video, Image, Upload, Clock, CheckCircle, Download, AlertCircle, Search, RotateCcw, Play, Zap } from 'lucide-react';
import { getAuthToken } from '../../../services/authService';
import { requireAuth } from '../../../utils/authCheck';
import { getVideoModels } from '../../../services/modelService';
import { API_URL } from '../../../services/api';

// COS/外部视频走后端代理，解决 CORS 问题
const cosProxyUrl = (url: string) => {
  if (url && (url.includes('cos.ap-beijing.myqcloud.com') || url.includes('soruxgpt.com') || url.includes('agnes-ai.space') || url.includes('xgapi.top') || url.includes('oaibox.xyz'))) {
    return `/api/cos-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
};

const VIDEO_MODEL_LIST = [
  { value: 'grok-video-1.5-pro', label: 'Grok Video 1.5 Pro', pricingKey: 'grok_video_15_pro' },
  { value: 'grok-video-1.5-max', label: 'Grok Video 1.5 Max', pricingKey: 'grok_video_15_max' },
  { value: 'omni-fast', label: 'Omni Fast', pricingKey: 'omni_fast' },
];

// 模型视觉元数据
const MODEL_META: Record<string, {
  icon: typeof Sparkles;
  badge?: string;
  badgeStyle: string;
  selectedBg: string;
  selectedBorder: string;
  iconBg: string;
  iconColor: string;
  priceColor: string;
  checkBg: string;
}> = {
  'grok-video-1.5-pro': {
    icon: Video,
    badge: '推荐',
    badgeStyle: 'bg-blue-100 text-blue-600',
    selectedBg: 'from-blue-50/80 to-indigo-50/40',
    selectedBorder: 'border-blue-200',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    priceColor: 'text-blue-600',
    checkBg: 'from-blue-500 to-blue-600',
  },
  'grok-video-1.5-max': {
    icon: Sparkles,
    badge: '旗舰',
    badgeStyle: 'bg-amber-100 text-amber-700',
    selectedBg: 'from-amber-50/80 to-orange-50/40',
    selectedBorder: 'border-amber-200',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    priceColor: 'text-amber-600',
    checkBg: 'from-amber-500 to-orange-500',
  },
  'omni-fast': {
    icon: Zap,
    badge: '极速',
    badgeStyle: 'bg-emerald-100 text-emerald-600',
    selectedBg: 'from-emerald-50/80 to-teal-50/40',
    selectedBorder: 'border-emerald-200',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    priceColor: 'text-emerald-600',
    checkBg: 'from-emerald-500 to-teal-500',
  },
  default: {
    icon: Film,
    badge: '',
    badgeStyle: '',
    selectedBg: 'from-blue-50/80 to-indigo-50/40',
    selectedBorder: 'border-blue-200',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    priceColor: 'text-blue-600',
    checkBg: 'from-blue-500 to-blue-600',
  },
};

const ASPECT_RATIOS = [
  { value: '16:9', label: '横屏 16:9' },
  { value: '9:16', label: '竖屏 9:16' },
];
const DURATIONS = [
  { value: 10, label: '10秒' },
  { value: 15, label: '15秒' },
];
const OMNI_FAST_DURATIONS = [
  { value: 4, label: '4秒' },
  { value: 8, label: '8秒' },
  { value: 10, label: '10秒' },
];
const QUANTITIES = [1, 2, 3, 5, 10];

interface TrackedTask {
  taskId: string;
  status: string;
  progress: number;
  url?: string;
  thumbnailUrl?: string;
  error?: string;
  prompt?: string;
  aspectRatio?: string;
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
  aspectRatio?: string;
}

interface VideoTabProps {
  onTaskCountChange?: (count: number) => void;
  onTasksChange?: (tasks: VideoTask[]) => void;
  onCreditsChange?: () => void;
  initialPrompt?: string;
  initialImages?: string[];
}

export const VideoTab: React.FC<VideoTabProps> = ({ onTaskCountChange, onTasksChange, onCreditsChange, initialPrompt, initialImages }) => {
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
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 12;

  const imageInputRef = useRef<HTMLInputElement>(null);
  const pollTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pollStartTimes = useRef<Map<string, number>>(new Map());
  const savedToLibrary = useRef<Set<string>>(new Set());

  useEffect(() => {
    const active = trackedTasks.filter(t => !['completed', 'succeeded', 'failed'].includes(t.status)).length;
    onTaskCountChange?.(active);
    onTasksChange?.(trackedTasks.map(t => ({
      taskId: t.taskId, status: t.status, progress: t.progress,
      url: t.url, error: t.error, thumbnailUrl: t.thumbnailUrl,
      prompt: t.prompt, aspectRatio: t.aspectRatio,
    })));
  }, [trackedTasks, onTaskCountChange, onTasksChange]);

  useEffect(() => {
    // 直接使用硬编码的视频模型列表
    setModels(VIDEO_MODEL_LIST);
    if (!selectedModel && VIDEO_MODEL_LIST.length > 0) setSelectedModel(VIDEO_MODEL_LIST[0].value);

    // 同时尝试从API获取最新列表，合并硬编码列表确保 omni-fast 始终存在
    getVideoModels().then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      if (sorted.length > 0) {
        const mapped = sorted.map(x => {
            const preset = VIDEO_MODEL_LIST.find(v => v.value === x.model_id);
            return { value: x.model_id, label: x.label, pricingKey: preset?.pricingKey };
          });
        // 合并：API列表 + 硬编码中不在API列表的模型（如 omni-fast）
        const merged = [...mapped];
        for (const preset of VIDEO_MODEL_LIST) {
          if (!merged.find(x => x.value === preset.value)) {
            merged.push(preset);
          }
        }
        setModels(merged);
        if (!selectedModel && merged.length > 0) setSelectedModel(merged[0].value);
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

  // 接收从脚本分镜传过来的 prompt 和图片
  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
    if (initialImages && initialImages.length > 0) {
      // 将 base64/dataURL 转为 File 对象
      const files = initialImages.map((dataUrl, idx) => {
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        const file = new File([u8arr], `script-ref-${idx + 1}.png`, { type: mime });
        return { file, preview: dataUrl };
      });
      setImageFiles(files);
    }
  }, [initialPrompt, initialImages]);

  // 切换模型时自动调整时长
  useEffect(() => {
    if (selectedModel === 'omni-fast') {
      const validDurations = OMNI_FAST_DURATIONS.map(d => d.value);
      if (!validDurations.includes(duration)) {
        setDuration(10);
      }
    } else {
      const validDurations = DURATIONS.map(d => d.value);
      if (!validDurations.includes(duration)) {
        setDuration(10);
      }
    }
  }, [selectedModel]);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    fetch(`${API_URL}/api/video/tasks`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          const tasks: TrackedTask[] = res.data
            .filter((row: any) => row.status !== 'failed' && row.id != null)
            .map((row: any) => {
              const url = row.image_url || undefined;
              const status = row.status || 'pending';
              // completed 但没有 URL → 视频已过期，标记为跳过
              if (status === 'completed' && !url) return null;
              return {
                taskId: String(row.id),
                status,
                progress: status === 'completed' ? 100 : 0,
                url,
                thumbnailUrl: row.thumbnail_url || undefined,
                prompt: row.prompt || '',
                aspectRatio: row.aspect_ratio || '9:16',
              };
            })
            .filter((t: TrackedTask | null): t is TrackedTask => t != null)
            .filter((t: TrackedTask, i: number, arr: TrackedTask[]) =>
              arr.findIndex(x => x.taskId === t.taskId) === i
            );
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

  const maxImages = selectedModel === 'omni-fast' ? 3 : selectedModel.startsWith('grok-video') ? 9 : 5;

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
    if (!taskId || taskId === 'undefined' || taskId === 'null') return;
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
        // completed 但没有 URL → 视频丢失，标记为失败
        const finalStatus = status === 'completed' && !url ? 'failed' : status;
        const error = finalStatus === 'failed' ? (d.error || '视频生成失败或已过期') : undefined;
        setTrackedTasks(prev => prev.map(t => t.taskId === String(taskId) ? {
          ...t, status: finalStatus, url, thumbnailUrl: thumbnailUrl || t.thumbnailUrl, error, progress,
        } : t));
        if (finalStatus === 'completed' || finalStatus === 'failed') {
          const timer = pollTimers.current.get(String(taskId));
          if (timer) { clearInterval(timer); pollTimers.current.delete(String(taskId)); }
          pollStartTimes.current.delete(String(taskId));
        }
      }
    } catch {}
  }, []);

  const startPolling = (taskId: string, savedPrompt?: string, savedModel?: string) => {
    setTrackedTasks(prev => [{ taskId, status: 'pending', progress: 0, prompt: savedPrompt || prompt, aspectRatio }, ...prev]);
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
      const imageUrls = imageFiles.map(f => f.preview);

      for (let i = 0; i < count; i++) {
        const body: any = {
          model: selectedModel,
          prompt: prompt.trim(),
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          imageUrl: imageUrls[0] || undefined,
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
                aspectRatio,
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
              aspectRatio,
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
      const proxyUrl = cosProxyUrl(url);
      const r = await fetch(proxyUrl);
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
          {cardTitle(<div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><Sparkles size={13} className="text-blue-600" /></div>, '选择模型')}
          <div className="flex flex-col gap-2">
            {models.map(m => {
              const price = m.pricingKey && pricingData[m.pricingKey] !== undefined
                ? pricingData[m.pricingKey]
                : null;
              const isSelected = selectedModel === m.value;
              const meta = MODEL_META[m.value] || MODEL_META['default'];
              return (
                <button key={m.value} onClick={() => setSelectedModel(m.value)}
                  className={`relative w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200 ${
                    isSelected
                      ? `bg-gradient-to-r ${meta.selectedBg} border ${meta.selectedBorder} shadow-sm`
                      : 'bg-slate-50 hover:bg-slate-100 border border-transparent hover:border-slate-200'
                  }`}>
                  {/* 模型图标 */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isSelected ? meta.iconBg : 'bg-slate-100'
                  }`}>
                    <meta.icon size={18} className={isSelected ? meta.iconColor : 'text-slate-400'} />
                  </div>
                  {/* 信息区 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[13px] font-semibold ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>{m.label}</span>
                      {meta.badge && (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold leading-none ${meta.badgeStyle}`}>
                          {meta.badge}
                        </span>
                      )}
                    </div>
                    <p className={`text-[11px] mt-0.5 ${isSelected ? 'text-slate-500' : 'text-slate-400'}`}>
                      {m.value === 'grok-video-1.5-max' ? '旗舰画质 · 物理模拟更精准'
                        : m.value === 'omni-fast' ? '极速生成 · 最高10s · 1080P'
                        : '快速出片 · 高性价比'}
                    </p>
                  </div>
                  {/* 价格 */}
                  <div className="text-right shrink-0">
                    <div className={`text-[13px] font-bold ${isSelected ? meta.priceColor : 'text-slate-400'}`}>
                      {price !== null ? price : '0.8'}
                    </div>
                    <div className="text-[9px] text-slate-400">积分/次</div>
                  </div>
                  {/* 选中指示器 */}
                  {isSelected && (
                    <div className={`absolute right-2 top-2 w-4 h-4 rounded-full bg-gradient-to-br ${meta.checkBg} flex items-center justify-center`}>
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  )}
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
            {(selectedModel === 'omni-fast' ? OMNI_FAST_DURATIONS : DURATIONS).map(d => (
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
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-slate-900">生成结果</h2>
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{trackedTasks.length} 个</span>
              </div>
              {trackedTasks.some(t => t.status === 'failed') && (
                <button onClick={() => {
                  const failedIds = trackedTasks.filter(t => t.status === 'failed').map(t => t.taskId);
                  failedIds.forEach(id => handleRemoveTask(id));
                }} className="text-xs text-red-500 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50 border border-red-100">
                  清空失败
                </button>
              )}
            </div>

            {/* Video Grid */}
            {(() => {
              const totalPages = Math.ceil(trackedTasks.length / PAGE_SIZE);
              const pageTasks = trackedTasks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

              return (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {pageTasks.map((tt, pageIdx) => {
                      const idx = (currentPage - 1) * PAGE_SIZE + pageIdx;
                      const isActive = !tt.url && !['failed', 'completed', 'succeeded', 'submitting'].includes(tt.status);
                      const isDone = !!tt.url && ['completed', 'succeeded'].includes(tt.status);
                      const isFailed = tt.status === 'failed' || (['completed', 'succeeded'].includes(tt.status) && !tt.url);
                      const isLandscape = tt.aspectRatio === '16:9';

                      // 清理 prompt：移除 [xxs] 和 [ext:task_xxx] 等标记
                      const cleanPrompt = (tt.prompt || '')
                        .replace(/\s*\[\d+s\]/g, '')
                        .replace(/\s*\[ext:[^\]]*\]/g, '')
                        .replace(/\s*\[video:[^\]]*\]/g, '')
                        .trim();

                      return (
                        <div key={tt.taskId || `task-${idx}`}
                          className={`group flex flex-col rounded-xl overflow-hidden border transition-all duration-300 ${
                            isDone ? 'bg-white border-slate-200/80 hover:border-blue-300 hover:shadow-lg cursor-pointer' :
                            isFailed ? 'bg-white border-red-200/60' :
                            'bg-white border-slate-200'
                          }`}
                          onClick={() => isDone && tt.url && setVideoModalUrl(tt.url!)}>

                          {/* 统一缩略图区域 - 固定 4:3 比例 */}
                          <div className={`relative aspect-[4/3] overflow-hidden ${
                            isDone ? 'bg-gradient-to-br from-slate-800 to-slate-900' : isFailed ? 'bg-red-50' : 'bg-slate-100'
                          }`}>
                            {isDone && tt.url ? (
                              <>
                                {/* 优先用封面图（快），没有则用视频第一帧（慢） */}
                                {tt.thumbnailUrl ? (
                                  <img
                                    src={cosProxyUrl(tt.thumbnailUrl)}
                                    className="absolute inset-0 w-full h-full object-cover"
                                    alt=""
                                    loading="lazy"
                                    onError={(e) => {
                                      // 封面图加载失败，替换为 video 标签
                                      const parent = e.currentTarget.parentElement!;
                                      e.currentTarget.remove();
                                      const v = document.createElement('video');
                                      v.src = cosProxyUrl(tt.url!);
                                      v.crossOrigin = 'anonymous';
                                      v.className = 'absolute inset-0 w-full h-full object-cover';
                                      v.muted = true;
                                      v.preload = 'metadata';
                                      parent.prepend(v);
                                    }}
                                  />
                                ) : (
                                  <video
                                    src={cosProxyUrl(tt.url)}
                                    crossOrigin="anonymous"
                                    className="absolute inset-0 w-full h-full object-cover"
                                    muted
                                    autoPlay
                                    onPlay={(e) => { try { e.currentTarget.pause(); } catch {} }}
                                  />
                                )}
                                {/* 播放按钮 overlay */}
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200">
                                  <div className="absolute inset-0 bg-black/20" />
                                  <div className="relative w-12 h-12 rounded-full bg-white/95 flex items-center justify-center shadow-xl">
                                    <Play size={20} className="text-slate-900 ml-0.5" />
                                  </div>
                                </div>
                                {/* 角标：比例 */}
                                <div className="absolute top-2 left-2 flex items-center gap-1">
                                  <span className="px-1.5 py-0.5 rounded bg-black/50 backdrop-blur-sm text-[10px] text-white font-medium">
                                    {tt.aspectRatio || '9:16'}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                {isFailed ? (
                                  <>
                                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                                      <AlertCircle size={18} className="text-red-400" />
                                    </div>
                                    <span className="text-[11px] text-red-400 font-medium">生成失败</span>
                                  </>
                                ) : (
                                  <>
                                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                                      <Loader2 size={18} className="animate-spin text-blue-500" />
                                    </div>
                                    <span className="text-[11px] text-slate-400">生成中 {tt.progress}%</span>
                                    <div className="w-24 bg-slate-200 rounded-full h-1 overflow-hidden">
                                      <div className="h-full rounded-full transition-all duration-700 ease-out"
                                        style={{
                                          width: `${tt.progress}%`,
                                          background: 'linear-gradient(90deg, #3B82F6, #6366F1)',
                                        }} />
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                            {/* 删除按钮 */}
                            <button onClick={(e) => { e.stopPropagation(); handleRemoveTask(tt.taskId); }}
                              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-red-500">
                              <X size={12} className="text-white" />
                            </button>
                          </div>

                          {/* 底部信息区 */}
                          <div className="px-3 py-2.5 flex-1 flex flex-col justify-between min-h-[52px]">
                            {/* Prompt */}
                            {cleanPrompt ? (
                              <p className="text-[11px] text-slate-500 leading-snug line-clamp-2 mb-1.5">{cleanPrompt}</p>
                            ) : (
                              <div />
                            )}
                            {/* 底栏 */}
                            <div className="flex items-center justify-between">
                              <span className={`text-[10px] font-medium ${
                                isDone ? 'text-emerald-500' : isFailed ? 'text-red-400' : 'text-blue-500'
                              }`}>
                                {isDone ? '已完成' : isFailed ? '失败' : '生成中'}
                              </span>
                              <span className="text-[10px] text-slate-300">#{idx + 1}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 分页 */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-6">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        上一页
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`w-8 h-8 text-xs rounded-lg font-medium transition-all ${
                              page === currentPage
                                ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                                : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {page}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        下一页
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
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
              <button onClick={() => handleDownload(videoModalUrl)}
                className="px-6 py-2.5 bg-white text-slate-900 rounded-xl text-sm font-medium hover:bg-slate-100 transition-colors flex items-center gap-2">
                <Download size={16} />下载视频
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

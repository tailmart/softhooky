import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Film, Video, Image, Upload, ChevronLeft, ChevronRight, Clock, CheckCircle, Download } from 'lucide-react';
import { requireAuth } from '../../utils/authCheck';
import { getAuthToken } from '../../services/authService';

type VideoSeconds = 4 | 8 | 10;
type VideoSize = '1280x720' | '720x1280';

const DURATIONS = [4, 8, 10] as VideoSeconds[];
const PRICING_KEYS: Record<number, string> = { 4: 'gemini_video_4s', 8: 'gemini_video_8s', 10: 'gemini_video_10s' };
const DEFAULT_PRICES: Record<number, number> = { 4: 3, 8: 3, 10: 3 };
const SIZES: { value: VideoSize; label: string }[] = [
  { value: '1280x720', label: '横屏 16:9' },
  { value: '720x1280', label: '竖屏 9:16' },
];

interface PricingMap { [key: string]: number; }
interface TaskRecord { id: number; image_url: string; prompt: string; model: string; task_id: string; created_at: string; type: string; }

const fetchPricing = async (): Promise<PricingMap> => {
  try { const r = await fetch('/api/pricing'); const d = await r.json(); return d.data || {}; } catch { return {}; }
};

const submitVideo = async (params: { prompt: string; seconds: number; size: string; images?: string[]; quantity?: number }) => {
  const token = getAuthToken();
  const r = await fetch('/api/video/gemini', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(params),
  });
  const d = await r.json();
  if (!d.taskIds && d.error) throw new Error(d.error);
  return d;
};

const pollStatus = async (taskId: string) => {
  const token = getAuthToken();
  const r = await fetch(`/api/video/gemini/status/${taskId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return r.json();
};

const fetchTasks = async (page: number, pageSize: number = 20) => {
  const token = getAuthToken();
  const r = await fetch(`/api/video/gemini/tasks?page=${page}&pageSize=${pageSize}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return r.json();
};

export const GeminiVideoPage: React.FC<{ hideHeader?: boolean }> = ({ hideHeader }) => {
  const [prompt, setPrompt] = useState('');
  const [seconds, setSeconds] = useState<VideoSeconds>(4);
  const [size, setSize] = useState<VideoSize>('1280x720');
  const [quantity, setQuantity] = useState(1);
  const [imageFile, setImageFile] = useState<{ file: File; preview: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pricing, setPricing] = useState<PricingMap>({});
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [taskPage, setTaskPage] = useState(1);
  const [taskTotalPages, setTaskTotalPages] = useState(1);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [queryTaskId, setQueryTaskId] = useState('');
  const [queryResult, setQueryResult] = useState<{ url?: string; status: string; progress: number; error?: string } | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);

  useEffect(() => {
    fetchPricing().then(setPricing);
    loadTasks(1);
  }, []);

  const loadTasks = async (page: number) => {
    setTasksLoading(true);
    try { const res = await fetchTasks(page, 20); setTasks((res.data || []).filter((t: any) => t.task_id)); setTaskPage(res.pagination?.page || 1); setTaskTotalPages(res.pagination?.totalPages || 1); } catch {}
    setTasksLoading(false);
  };

  const unitPrice = pricing[PRICING_KEYS[seconds]] || DEFAULT_PRICES[seconds] || 3;
  const totalPrice = unitPrice * quantity;

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.readAsDataURL(file); });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const file = files.find(f => f.type.startsWith('image/'));
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageFile({ file, preview: reader.result as string });
    reader.readAsDataURL(file);
  };

  const removeImage = () => setImageFile(null);

  const handleQueryTask = async () => {
    if (!queryTaskId.trim()) return;
    setIsQuerying(true); setQueryResult(null);
    try { const result = await pollStatus(queryTaskId.trim()); setQueryResult(result); }
    catch (err: any) { setQueryResult({ status: 'error', progress: 0, error: err.message || '查询失败' }); }
    setIsQuerying(false);
  };

  const handleGenerate = async () => {
    if (!requireAuth()) return;
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      const imageData = imageFile ? await fileToDataUrl(imageFile.file) : undefined;
      const res = await submitVideo({ prompt: prompt.trim(), seconds, size, images: imageData ? [imageData] : undefined, quantity });
      setResults(prev => [...(res.taskIds || []), ...prev]);
      setPrompt(''); setImageFile(null); setQuantity(1);
      loadTasks(1);
    } catch (error: any) { alert(error.message || '生成失败'); }
    setIsGenerating(false);
  };

  const handleCheckTask = async (taskId: string) => {
    try {
      const result = await pollStatus(taskId);
      if (result.url && (result.status === 'completed' || result.status === 'succeeded')) { setResults(prev => [result.url!, ...prev]); loadTasks(taskPage); }
      else if (result.status === 'failed') { alert(`任务失败: ${result.error || '未知错误'}`); }
      else { alert(`任务状态: ${result.status}，进度: ${result.progress}%`); }
    } catch (err: any) { alert(`查询失败: ${err.message}`); }
  };

  const handleDownload = async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `video-${Date.now()}.mp4`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
  };

  const statusIcon = (task: TaskRecord) => {
    if (task.image_url) return <CheckCircle size={14} className="text-green-500" />;
    return <Clock size={14} className="text-yellow-500" />;
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      {!hideHeader && (
        <div className="flex items-center gap-3 px-6 h-14 border-b border-[#E5E5E5] flex-shrink-0 bg-[#F7F7F7]">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center">
            <Film size={16} className="text-white" />
          </div>
          <h1 className="text-base font-semibold text-[#171717]">Gemini Omini 视频</h1>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[380px] border-r border-[#E5E5E5] overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-[#FAFAFA]">
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

          {/* Reference Image */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 flex items-center justify-center"><Image size={14} className="text-blue-500" /></div>
                <span className="text-sm font-semibold text-[#171717]">参考图片（可选）</span>
              </div>
              <span className="text-xs text-[#A3A3A3]">{imageFile ? '1/1' : '0/1'}</span>
            </div>
            {imageFile && (
              <div className="mb-3">
                <div className="relative aspect-video rounded-xl overflow-hidden group bg-[#F5F5F5]">
                  <img src={imageFile.preview} alt="" className="w-full h-full object-cover" />
                  <button onClick={removeImage} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X size={16} className="text-white" /></button>
                </div>
              </div>
            )}
            {!imageFile && (
              <>
                <input type="file" ref={imageInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                <div onClick={() => imageInputRef.current?.click()} className="border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA]  p-4 flex flex-col items-center justify-center gap-1.5 hover:border-[#171717]/30 hover:bg-[#F5F5F5] transition-all cursor-pointer bg-white">
                  <Upload size={18} className="text-[#A3A3A3]" /><span className="text-xs text-[#A3A3A3]">上传参考图片（可选）</span>
                </div>
              </>
            )}
          </div>

          {/* Duration */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 flex items-center justify-center"><Sparkles size={14} className="text-blue-500" /></div>
              <span className="text-sm font-semibold text-[#171717]">视频时长</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {DURATIONS.map(d => (
                <button key={d} onClick={() => setSeconds(d)}
                  className={`p-3 rounded-xl text-center transition-all ${seconds === d ? 'bg-blue-500 text-white shadow-sm' : 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'}`}>
                  <div className="text-sm font-medium">{d}s</div>
                  <div className={`text-[10px] mt-1 ${seconds === d ? 'text-white/60' : 'text-[#A3A3A3]'}`}>{unitPrice} 积分</div>
                </button>
              ))}
            </div>
          </div>

          {/* Size */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 flex items-center justify-center"><Film size={14} className="text-blue-500" /></div>
              <span className="text-sm font-semibold text-[#171717]">视频比例</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {SIZES.map(opt => (
                <button key={opt.value} onClick={() => setSize(opt.value)}
                  className={`p-4 rounded-xl text-center transition-all ${size === opt.value ? 'bg-blue-500 text-white shadow-sm' : 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'}`}>
                  <div className="flex items-center justify-center mb-2">
                    <div className={`${opt.value === '1280x720' ? 'w-12 h-8' : 'w-8 h-12'} rounded border-2 ${size === opt.value ? 'border-white' : 'border-[#D4D4D4]'}`} />
                  </div>
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className={`text-[10px] mt-0.5 ${size === opt.value ? 'text-white/50' : 'text-[#A3A3A3]'}`}>{opt.value}</div>
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
              <button onClick={handleQueryTask} disabled={isQuerying || !queryTaskId.trim()}
                className="px-4 py-2 bg-[#171717] text-white text-sm rounded-xl font-medium disabled:bg-[#E5E5E5] disabled:text-[#A3A3A3] hover:bg-[#27272A] transition-all">查询</button>
            </div>
            {queryResult && (
              <div className="bg-[#F5F5F5] rounded-xl p-3">
                {queryResult.url ? (
                  <div className="space-y-2">
                    <span className="text-xs text-green-600 font-medium">已完成</span>
                    <div className="flex gap-2">
                      <input readOnly value={queryResult.url} className="flex-1 bg-white rounded-xl px-2 py-1.5 text-[10px] text-[#737373] truncate" />
                      <button onClick={() => { setResults(prev => [queryResult.url!, ...prev]); setQueryResult(null); }} className="px-2 py-1 bg-[#171717] text-white text-[10px] rounded-xl whitespace-nowrap">保存</button>
                    </div>
                  </div>
                ) : queryResult.status === 'failed' || queryResult.status === 'error' ? (
                  <span className="text-xs text-red-500">{queryResult.error || '生成失败'}</span>
                ) : (
                  <span className="text-xs text-[#737373]">进度: {queryResult.progress}% (状态: {queryResult.status})</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Results / Tasks */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {results.length === 0 && tasks.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-sm">
                <div className="w-20 h-20 mx-auto mb-5 bg-[#F5F5F5] rounded-2xl flex items-center justify-center">
                  <Film size={32} className="text-[#D4D4D4]" />
                </div>
                <h2 className="text-lg font-semibold text-[#171717] mb-2">Gemini Omini 视频</h2>
                <p className="text-sm text-[#A3A3A3] leading-relaxed">输入视频描述，AI自动生成高清视频</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[#171717]">历史任务</h2>
                <button onClick={() => loadTasks(taskPage)} className="text-xs text-[#A3A3A3] hover:text-[#171717] transition-colors">刷新</button>
              </div>
              <div className="space-y-2">
                {tasks.map(t => (
                  <div key={t.id} className="flex items-center gap-3 bg-[#FAFAFA] rounded-xl px-4 py-3 border border-[#E5E5E5]">
                    {statusIcon(t)}
                    <span className="text-xs font-mono text-[#737373] flex-1 truncate">{t.task_id?.replace('gemini:', '') || String(t.id)}</span>
                    <span className="text-[10px] text-[#A3A3A3]">{new Date(t.created_at).toLocaleTimeString()}</span>
                    {t.image_url ? (
                      <button onClick={() => handleDownload(t.image_url!)} className="text-xs text-[#171717] font-medium whitespace-nowrap flex items-center gap-1"><Download size={12} />下载</button>
                    ) : (
                      <button onClick={() => handleCheckTask(t.task_id)} className="text-xs text-[#737373] font-medium whitespace-nowrap">查看</button>
                    )}
                  </div>
                ))}
              </div>
              {taskTotalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4">
                  <button disabled={taskPage <= 1} onClick={() => loadTasks(taskPage - 1)} className="p-1.5 rounded-xl hover:bg-[#F5F5F5] disabled:opacity-30 transition-colors"><ChevronLeft size={16} className="text-[#737373]" /></button>
                  <span className="text-xs text-[#A3A3A3]">{taskPage}/{taskTotalPages}</span>
                  <button disabled={taskPage >= taskTotalPages} onClick={() => loadTasks(taskPage + 1)} className="p-1.5 rounded-xl hover:bg-[#F5F5F5] disabled:opacity-30 transition-colors"><ChevronRight size={16} className="text-[#737373]" /></button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

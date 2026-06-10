import React, { useState, useRef, useEffect } from 'react';
import {
  X, Loader2, Plus, Send, Sparkles, Coins,
  Calendar, Clock, Trash2, ZoomIn, ChevronDown, CornerDownRight, Download, Layers,
  Image as ImageIcon
} from 'lucide-react';
import { motion } from 'framer-motion';
import { generateImage, editImage } from '../../services/imageService';
import { getCurrentUser } from '../../services/authService';
import { fileToDataUrl, uploadImageToCos } from '../../services/cosService';
import { getPricing } from '../../services/pricingService';
import { CreditCheckModal } from '../../components/CreditCheckModal';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { SettingsPanel } from '../../components/canvas/SettingsPanel';
import { imageLibraryService } from '../../services/imageLibraryService';
import { getAvailableModels } from '../../services/modelService';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { convertImageToPsd } from '../../utils/psdConverter';

interface ChatImage {
  url: string;
  prompt?: string;
  model?: string;
  aspectRatio?: string;
  createdAt: number;
  type: 'generated' | 'chat';
}

const STORAGE_KEY = 'chatgen_history';

const getTodayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatDayLabel = (dateStr: string) => {
  const today = getTodayKey();
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  if (dateStr === today) return '今天';
  if (dateStr === yesterday) return '昨天';
  const parts = dateStr.split('-');
  return `${parts[1]}月${parts[2]}日`;
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const groupByDay = (images: ChatImage[]) => {
  const groups: Record<string, ChatImage[]> = {};
  for (const img of images) {
    const d = new Date(img.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(img);
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
};

export const ChatGenPage: React.FC = () => {
  const getSavedSettings = () => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_settings`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  };

  const savedSettings = getSavedSettings();
  const [images, setImages] = useState<ChatImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);

  // 从数据库加载图片（唯一数据源）
  const loadImagesFromDB = async () => {
    try {
      const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
      if (!token) {
        setLoadingImages(false);
        return;
      }
      const res = await axios.get('/api/chat/images', {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000
      });
      if (res.data?.success && Array.isArray(res.data?.data)) {
        const serverImages: ChatImage[] = res.data.data.map((img: any) => ({
          url: img.image_url || img.imageUrl || img.url || '',
          prompt: img.prompt || undefined,
          model: img.model || undefined,
          aspectRatio: img.aspect_ratio || undefined,
          createdAt: new Date(img.created_at).getTime(),
          type: 'generated' as const,
        }));
        setImages(serverImages);
      }
    } catch (e) {
      console.error('[chatgen] 从数据库加载图片失败:', e);
    } finally {
      setLoadingImages(false);
    }
  };

  // 页面加载时从数据库获取图片
  useEffect(() => {
    loadImagesFromDB();
  }, []);
  const [prompt, setPrompt] = useState('');
  const [uploadedImages, setUploadedImages] = useState<{ url: string; id: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [psdLoading, setPsdLoading] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [selectedModel, setSelectedModel] = useState('nanobann2');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState(savedSettings.aspectRatio || '1:1');
  const [resolution, setResolution] = useState(savedSettings.resolution || '2K');
  const [generateCount, setGenerateCount] = useState(savedSettings.generateCount || 1);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [generatePrice, setGeneratePrice] = useState(0.3);
  const [enableOptimization, setEnableOptimization] = useState(savedSettings.enableOptimization ?? false);
  const [isOptimized, setIsOptimized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [availableModels, setAvailableModels] = useState<{ value: string; label: string }[]>([
    { value: 'gpt-image-2', label: 'GPT Image 2' },
    { value: 'nanobann2', label: 'Nanobann2' },
  ]);
  const { user } = useAuth();

  const todayKey = getTodayKey();
  const displayImages = user ? images : [];
  const generatedImages = displayImages.filter(img => img.type === 'generated');
  let groupedGenerated = groupByDay(generatedImages);
  // 如果今天有pending但没有已生成的图片，添加一个空的今天分组
  if (pendingCount > 0 && !groupedGenerated.some(([key]) => key === todayKey)) {
    groupedGenerated = [[todayKey, []], ...groupedGenerated];
  }
  const todayGenCount = generatedImages.filter(img => {
    const d = new Date(img.createdAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === todayKey;
  }).length;

  useEffect(() => {
    getAvailableModels().then(m => setAvailableModels(m.map(x => ({ value: x.model_id, label: x.label }))));
  }, []);

  useEffect(() => {
    getPricing().then(p => {
      if (selectedModel === 'gpt-image-2') {
        setGeneratePrice(p.gpt_image2_generation || 0.3);
      } else {
        setGeneratePrice(p.nanobann2_generation || 0.3);
      }
    });
  }, [selectedModel]);

  useEffect(() => {
    const handleImagesDeleted = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.urls?.length) return;
      setImages(prev => prev.filter(img => !detail.urls.some((delUrl: string) => img.url.includes(delUrl) || delUrl.includes(img.url))));
    };
    window.addEventListener('images-deleted', handleImagesDeleted);
    return () => window.removeEventListener('images-deleted', handleImagesDeleted);
  }, []);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_settings`, JSON.stringify({
      model: selectedModel,
      aspectRatio: selectedAspectRatio,
      resolution,
      generateCount,
      enableOptimization
    }));
  }, [selectedModel, selectedAspectRatio, resolution, generateCount, enableOptimization]);

  const autoResize = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  };

  useEffect(() => { autoResize(); }, [prompt]);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  const optimizePrompt = async (text: string, imageUrls?: string[]): Promise<string> => {
    const API_TOKEN = 'sk-r5Clizar6aV39YsxLbHR3rW209LqmnYa5fLT1iePRBtfZT47';
    let imageDescriptions = '';
    if (imageUrls && imageUrls.length > 0) {
      const results = await Promise.all(imageUrls.map(async (url) => {
        try {
          const visionRes = await fetch('https://api.xgapi.top/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${API_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gemini-3.5-flash',
              messages: [
                { role: 'user', content: [{ type: 'text', text: '请用中文详细描述这张图片中的主体(人物性别/年龄/外貌/服装/姿势)、背景、物品、光线、构图等所有视觉元素' }, { type: 'image_url', image_url: { url } }] }
              ],
              max_tokens: 500,
              temperature: 0.1
            })
          });
          const visionResult = await visionRes.json();
          return visionResult.choices?.[0]?.message?.content || '';
        } catch { return ''; }
      }));
      imageDescriptions = results.filter(Boolean).map(d => `\n【参考图分析】\n${d}\n`).join('');
    }
    const data = {
      messages: [
        {
          role: "system",
          content: `你是一个专业的 AI 绘画提示词优化专家。${imageDescriptions ? '以下是用户上传的参考图分析结果，请基于这些真实描述来优化提示词，不要虚构图片中不存在的内容。' : ''}请将用户输入的简短描述优化为详细、高质量的中文提示词。优化后的提示词应包含主体、环境、光照、风格、构图、色彩等细节，并输出为纯文本，不要包含任何解释性文字。`
        },
        {
          role: "user",
          content: imageDescriptions ? `【参考图分析】\n${imageDescriptions}\n\n【用户需求】\n${text}` : text
        }
      ],
      model: "gemini-3.5-flash",
      temperature: 0.1,
      top_p: 1,
      stream: false
    };
    try {
      const response = await fetch('https://api.xgapi.top/v1/chat/completions', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (result.error) return text;
      if (result.choices?.[0]?.message?.content) return result.choices[0].message.content;
      return text;
    } catch { return text; }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const filesArray = Array.from(files) as File[];
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
    const oversized = filesArray.find(f => f.size > MAX_FILE_SIZE);
    if (oversized) {
      alert(`图片"${oversized.name}"超过 20MB，请压缩后重新上传`);
      e.target.value = '';
      return;
    }
    const filesToAdd = filesArray.slice(0, 4 - uploadedImages.length);
    const newImages: { url: string; id: string }[] = [];
    for (const file of filesToAdd) {
      const fileId = `${file.name}-${file.size}-${file.lastModified}`;
      if (!uploadedImages.some(img => img.id === fileId)) {
        try {
          const url = await fileToDataUrl(file, 1200);
          newImages.push({ url, id: fileId });
        } catch (err) {
          console.error('图片处理失败:', err);
          alert(`图片"${file.name}"处理失败，请尝试使用更小的图片`);
        }
      }
    }
    setUploadedImages(prev => [...prev, ...newImages]);
  };

  const removeUploadedImage = (idx: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== idx));
  };

  const handleGenerate = () => {
    const hasPrompt = prompt.trim().length > 0;
    const hasImages = uploadedImages.length > 0;
    if (!hasPrompt && !hasImages) return;

    const user = getCurrentUser();
    if (!user) {
      window.dispatchEvent(new CustomEvent('show-auth-modal'));
      return;
    }
    if ((user?.credits || 0) < generatePrice) {
      setShowCreditModal(true);
      return;
    }

    // AI 优化：优化后自动重新触发生成
    if (enableOptimization && hasPrompt && !isOptimized) {
      setOptimizing(true);
      optimizePrompt(prompt, uploadedImages.map(img => img.url))
        .then(optimized => {
          setPrompt(optimized);
          setIsOptimized(true);
          setOptimizing(false);
          // 优化完成后自动提交生成
          setTimeout(() => handleGenerate(), 100);
        })
        .catch(() => setOptimizing(false));
      return;
    }

    // 记录当前输入的快照
    const currentPrompt = prompt;
    const currentImages = uploadedImages.map(img => img.url);
    const currentCount = generateCount;

    setLoading(true);
    // 异步执行生成，不阻塞UI
    (async () => {
      let result: any;
      try {
        if (hasImages && currentPrompt) {
          result = await editImage({ prompt: currentPrompt, images: currentImages, model: selectedModel, aspectRatio: selectedAspectRatio, resolution });
        } else {
          result = await generateImage({ prompt: currentPrompt, model: selectedModel, aspectRatio: selectedAspectRatio, resolution, n: currentCount });
        }

        const newGenImages: ChatImage[] = (result.data || []).map((item: any) => ({
          url: item.url,
          prompt: currentPrompt,
          model: selectedModel,
          aspectRatio: selectedAspectRatio,
          createdAt: Date.now(),
          type: 'generated' as const,
        }));
        setImages(prev => [...newGenImages, ...prev]);

        const savePromises = (result.data || []).map((item: any) =>
          imageLibraryService.saveToLibrary({
            image_url: item.url,
            prompt: currentPrompt || '',
            model: selectedModel,
            aspect_ratio: selectedAspectRatio,
            resolution,
            type: 'chatgen'
          })
        );
        await Promise.all(savePromises);
        await loadImagesFromDB();

        setPrompt('');
        setUploadedImages([]);
        setIsOptimized(false);
        scrollToBottom();
      } catch (e: any) {
        console.error('[chatgen] 生成失败:', e);
        const hasImages = result && Array.isArray(result.data) && result.data.length > 0;
        if (!hasImages) {
          const rawError = e.response?.data?.error;
          const errorMsg = typeof rawError === 'string' ? rawError : rawError?.message || e.message || '生成失败，请重试';
          alert(`生成失败: ${errorMsg}`);
        }
      } finally {
        setLoading(false);
      }
    })();
  };

  const handleDownloadImage = async (url: string) => {
    try {
      const r = await fetch(url);
      const blob = await r.blob();
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u;
      a.download = `chatgen-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(u);
    } catch {
      window.open(url, '_blank');
    }
  };

  const handlePsdConversion = async (url: string) => {
    setPsdLoading(url);
    try {
      await convertImageToPsd(url);
    } catch (err: any) {
      console.error('PSD导出失败:', err);
      alert(`PSD导出失败: ${err.message || '请检查图片并重试'}`);
    } finally {
      setPsdLoading(null);
    }
  };

  const handleDeleteImage = async (url: string) => {
    // 先从UI中移除
    setImages(prev => prev.filter(img => img.url !== url));
    // 从数据库中删除
    try {
      const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
      if (token) {
        // 查找图片ID并删除
        const res = await axios.get('/api/images/library', {
          headers: { Authorization: `Bearer ${token}` },
          params: { page: 1, pageSize: 500, filter: 'mine' }
        });
        if (res.data?.success && Array.isArray(res.data?.data)) {
          const imgToDelete = res.data.data.find((img: any) => img.image_url === url);
          if (imgToDelete) {
            await axios.delete(`/api/images/library/${imgToDelete.id}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
          }
        }
      }
    } catch (e) {
      console.error('[chatgen] 删除图片失败:', e);
    }
    imageLibraryService.trackDeletedImageUrl(url);
  };

  const handleUseAsReference = (url: string) => {
    if (uploadedImages.length >= 4) return;
    if (uploadedImages.some(img => img.url === url)) return;
    setUploadedImages(prev => [...prev, { url, id: `ref-${url}-${Date.now()}` }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const MODEL_LABELS: Record<string, string> = {
    nanobann2: 'Nano',
    'gpt-image-2': 'GPT'
  };

  return (
    <div className="flex-1 flex h-full bg-[#fafafa]">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Header */}
        <div className="flex-shrink-0 py-2.5 bg-white border-b border-gray-100 px-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shadow-sm">
              <ImageIcon size={15} className="text-white" />
            </div>
            <h1 className="text-sm font-bold text-[#171717]">创意生图</h1>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => loadImagesFromDB()}
                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                title="刷新图片"
              >
                <span className="text-xs font-semibold text-gray-600">刷新</span>
              </button>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 rounded-full">
                <Coins size={12} className="text-amber-500" />
                <span className="text-xs font-semibold text-amber-600">
                  {Number(Math.max(0, user?.credits || 0)).toFixed(1)}
                </span>
              </div>
              <div className="px-2.5 py-1 bg-blue-50 rounded-full">
                <span className="text-xs font-semibold text-blue-600">今日 {todayGenCount} 张</span>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Gallery */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 pt-4">
          {/* Loading State */}
          {loadingImages && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-20 h-20 rounded-[2rem] bg-white border border-gray-200 shadow-sm flex items-center justify-center mb-4">
                <Loader2 size={32} className="text-gray-400 animate-spin" />
              </div>
              <p className="text-sm font-medium text-gray-400 mb-1">加载中...</p>
              <p className="text-xs text-gray-300">正在从数据库加载图片</p>
            </div>
          )}

          {/* Empty State */}
          {!loadingImages && displayImages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-20 h-20 rounded-[2rem] bg-white border border-gray-200 shadow-sm flex items-center justify-center mb-4">
                <ImageIcon size={32} className="text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-400 mb-1">还没有生成过图片</p>
              <p className="text-xs text-gray-300">在下方输入描述，开始创作</p>
            </div>
          )}

          {/* Section 1: Generated Images by Day */}
          {groupedGenerated.map(([dateKey, dayImages]) => (
            <div key={dateKey} className="space-y-3 px-6">
              {/* Day Header */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-gray-100 shadow-sm">
                  <Calendar size={12} className="text-[#A3A3A3]" />
                  <span className="text-xs font-semibold text-[#525252]">{formatDayLabel(dateKey)}</span>
                  <span className="text-[10px] text-[#A3A3A3] bg-gray-100 px-1.5 py-0.5 rounded-full">{dayImages.length} 张</span>
                </div>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Images Grid */}
              <div className="grid grid-cols-3 lg:grid-cols-5 xl:grid-cols-5 gap-2 lg:gap-3">
                {/* Loading placeholders at top of today's group */}
                {loading && dateKey === todayKey && Array.from({ length: generateCount }).map((_, i) => (
                  <div key={`gen-loading-${i}`} className="relative bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                    <div className="relative aspect-[4/3]">
                      <div className="absolute inset-0 bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 animate-pulse" />
                      <div className="absolute inset-0 rounded-2xl border-2 border-blue-400/30 animate-pulse shadow-[0_0_12px_rgba(59,130,246,0.15)]" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-200 shadow-md flex items-center justify-center">
                          <Loader2 size={20} className="text-blue-500 animate-spin" />
                        </div>
                      </div>
                    </div>
                    <div className="px-3 py-2.5 flex items-center justify-between">
                      <div className="w-12 h-3 bg-gray-200 rounded-full animate-pulse" />
                      <div className="w-8 h-3.5 bg-gray-100 rounded-full animate-pulse" />
                    </div>
                  </div>
                ))}
                {dayImages.map((img) => (
                  <motion.div
                    key={img.url}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="group relative bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-200"
                  >
                    {/* Image - 3/4 */}
                    <div className="relative aspect-[4/3]">
                      <img
                        src={img.url}
                        alt=""
                        className="w-full h-full object-contain cursor-pointer bg-[#FAFAFA]"
                        onClick={() => setPreviewImage(img.url)}
                        onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23d4d4d4%22 stroke-width=%222%22%3E%3Crect x=%223%22 y=%223%22 width=%2218%22 height=%2218%22 rx=%222%22/%3E%3Ccircle cx=%228.5%22 cy=%228.5%22 r=%221.5%22/%3E%3Cpolyline points=%2221 15 16 10 5 21%22/%3E%3C/svg%3E'; }}
                      />
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); setPreviewImage(img.url); }}
                        className="w-9 h-9 bg-white/90 rounded-xl flex items-center justify-center shadow-md hover:bg-white transition-colors"
                      >
                        <ZoomIn size={16} className="text-[#171717]" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUseAsReference(img.url); }}
                        className="w-9 h-9 bg-white/90 rounded-xl flex items-center justify-center shadow-md hover:bg-emerald-500 hover:text-white transition-all"
                        title="作为参考图"
                      >
                        <CornerDownRight size={14} className="text-[#171717]" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePsdConversion(img.url); }}
                        disabled={psdLoading === img.url}
                        className="w-9 h-9 bg-white/90 rounded-xl flex items-center justify-center shadow-md hover:bg-purple-500 hover:text-white transition-all disabled:opacity-50"
                        title="导出为PSD分层文件"
                      >
                        {psdLoading === img.url ? (
                          <Loader2 size={14} className="animate-spin text-purple-500" />
                        ) : (
                          <Layers size={16} className="text-[#171717]" />
                        )}
                      </button>
                      </div>
                      {/* Delete button */}
                      <button
                        onClick={() => handleDeleteImage(img.url)}
                        className="absolute top-2 right-2 w-7 h-7 bg-black/40 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100 backdrop-blur-sm"
                      >
                        <Trash2 size={12} className="text-white" />
                      </button>
                    </div>
                    {/* Time - 1/4 */}
                    <div className="px-3 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Clock size={10} className="text-[#A3A3A3] flex-shrink-0" />
                        <span className="text-[10px] text-[#A3A3A3]">{formatTime(img.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePsdConversion(img.url); }}
                          disabled={psdLoading === img.url}
                          className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-purple-50 hover:text-purple-600 transition-colors disabled:opacity-40"
                          title="导出为PSD分层文件"
                        >
                          {psdLoading === img.url ? (
                            <Loader2 size={10} className="animate-spin text-purple-500" />
                          ) : (
                            <Layers size={10} className="text-[#A3A3A3]" />
                          )}
                        </button>
                        {img.model && (
                          <span className="text-[9px] text-[#A3A3A3] bg-gray-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                            {MODEL_LABELS[img.model] || img.model}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}

          {/* Bottom padding for input area */}
          <div className="h-4 px-6" />
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 bg-white border-t border-[#E5E5E5] px-4 py-3">
          <div className="w-full">
            {/* Uploaded Images Row */}
            {uploadedImages.length > 0 && (
              <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
                {uploadedImages.map((img, idx) => (
                  <div key={img.id} className="relative group flex-shrink-0">
                    <div className="w-16 h-16 rounded-xl overflow-visible">
                      <img
                        src={img.url}
                        alt=""
                        className="w-full h-full object-cover rounded-xl border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setPreviewImage(img.url)}
                      />
                    </div>
                    <button
                      onClick={() => removeUploadedImage(idx)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-black/60 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors z-10"
                    >
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                ))}
                {uploadedImages.length < 4 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-400 flex items-center justify-center flex-shrink-0 transition-all text-gray-400 hover:text-gray-600"
                  >
                    <Plus size={18} />
                  </button>
                )}
              </div>
            )}

            {/* Input Row */}
            <div className="flex items-end gap-2 bg-[#F5F5F5] rounded-2xl px-3 py-2">
              {/* Left: Upload button */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleUpload}
                accept="image/*"
                multiple
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadedImages.length >= 4}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-200 transition-colors flex-shrink-0 disabled:opacity-30"
                title="上传参考图"
              >
                <ImageIcon size={16} className="text-[#A3A3A3]" />
              </button>

              {/* Input */}
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => { setPrompt(e.target.value); setIsOptimized(false); autoResize(); }}
                onKeyDown={handleKeyDown}
                placeholder="描述你想要生成的图片..."
                className="flex-1 bg-transparent text-sm text-[#171717] placeholder:text-[#BDBDBD] resize-none outline-none max-h-[150px] py-1"
                rows={1}
              />

              {/* Right: Optimize toggle + Model + Send */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => setEnableOptimization(!enableOptimization)}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                    enableOptimization ? 'bg-violet-100 text-violet-600' : 'hover:bg-gray-200 text-[#A3A3A3]'
                  }`}
                  title={enableOptimization ? 'AI优化已开启' : 'AI优化已关闭'}
                >
                  <Sparkles size={14} />
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="h-8 px-2.5 rounded-xl flex items-center gap-1.5 hover:bg-gray-200 transition-colors"
                  title="生成设置"
                >
                  <span className="text-xs font-medium text-gray-600">
                    {availableModels.find(m => m.value === selectedModel)?.label || 'Nano'}
                  </span>
                  <ChevronDown size={10} className="text-gray-400" />
                </button>

                <button
                  onClick={handleGenerate}
                  disabled={loading || optimizing || (!prompt.trim() && uploadedImages.length === 0)}
                  className={`h-8 px-4 rounded-xl flex items-center gap-1.5 transition-all ${
                    loading || optimizing
                      ? 'bg-gray-300 cursor-wait'
                      : 'bg-[#171717] text-white hover:bg-[#333] disabled:bg-[#D4D4D4] disabled:text-[#A3A3A3] disabled:cursor-not-allowed'
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span className="text-xs font-medium">生成中...</span>
                    </>
                  ) : optimizing ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span className="text-xs font-medium">优化中...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xs font-medium">生成</span>
                      <Send size={13} />
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Modals */}
      <CreditCheckModal isOpen={showCreditModal} onClose={() => setShowCreditModal(false)} />
      <ImagePreviewModal isOpen={!!previewImage} onClose={() => setPreviewImage(null)} imageUrl={previewImage || ''} />
      <SettingsPanel
        show={showSettings}
        resolution={resolution}
        aspectRatio={selectedAspectRatio}
        generateCount={generateCount}
        model={selectedModel}
        onResolutionChange={setResolution}
        onAspectRatioChange={setSelectedAspectRatio}
        onGenerateCountChange={setGenerateCount}
        onModelChange={setSelectedModel}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
};

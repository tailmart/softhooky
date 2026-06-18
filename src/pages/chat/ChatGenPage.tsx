import React, { useState, useRef, useEffect } from 'react';
import {
  X, Loader2, Plus, Send, Sparkles, Coins,
  Clock, Trash2, CornerDownRight, Download,
  Image as ImageIcon, RefreshCw,
  Wand2, Monitor, Crop, ImagePlus, Zap, Crown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateImage, editImage } from '../../services/imageService';
import { getCurrentUser } from '../../services/authService';
import { fileToDataUrl } from '../../services/cosService';
import { getPricing } from '../../services/pricingService';
import { CreditCheckModal } from '../../components/CreditCheckModal';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { imageLibraryService } from '../../services/imageLibraryService';
import { getAvailableModels } from '../../services/modelService';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

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

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const ASPECT_RATIOS = [
  { label: '智能', value: '智能', icon: 'A' },
  { label: '1:1', value: '1:1', icon: '1:1' },
  { label: '3:4', value: '3:4', icon: '3:4' },
  { label: '4:3', value: '4:3', icon: '4:3' },
  { label: '9:16', value: '9:16', icon: '9:16' },
  { label: '16:9', value: '16:9', icon: '16:9' },
  { label: '21:9', value: '21:9', icon: '21:9' },
];

const getRatioStyle = (value: string) => {
  const map: Record<string, string> = {
    '智能': 'w-4 h-4',
    '1:1': 'w-3.5 h-3.5',
    '3:4': 'w-3 h-4',
    '9:16': 'w-2.5 h-5',
    '4:3': 'w-4 h-3',
    '16:9': 'w-5 h-2.5',
    '21:9': 'w-6 h-2',
  };
  return map[value] || 'w-4 h-4';
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
  const [prompt, setPrompt] = useState('');
  const [uploadedImages, setUploadedImages] = useState<{ url: string; id: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [selectedModel, setSelectedModel] = useState('nanobann2');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState(savedSettings.aspectRatio || '1:1');
  const [resolution, setResolution] = useState(savedSettings.resolution || '2K');
  const [generateCount, setGenerateCount] = useState(savedSettings.generateCount || 1);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [generatePrice, setGeneratePrice] = useState(0.3);
  const [enableOptimization, setEnableOptimization] = useState(savedSettings.enableOptimization ?? false);
  const [isOptimized, setIsOptimized] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  const displayImages = user ? images : [];
  const generatedImages = displayImages.filter(img => img.type === 'generated');
  const todayKey = getTodayKey();
  const todayGenCount = generatedImages.filter(img => {
    const d = new Date(img.createdAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === todayKey;
  }).length;

  const loadImagesFromDB = async () => {
    try {
      const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
      if (!token) {
        setLoadingImages(false);
        return;
      }
      const res = await api.get('/api/chat/images', {
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

  useEffect(() => {
    loadImagesFromDB();
  }, []);

  useEffect(() => {
    getPricing().then(p => {
      if (selectedModel === 'gpt-image-2') {
        setGeneratePrice(p.gpt_image2_generation || 0.3);
      } else if (selectedModel === 'agnes-image-2.1-flash') {
        setGeneratePrice(p.agnes_image_generation || 0.3);
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
      el.style.height = Math.min(el.scrollHeight, 100) + 'px';
    }
  };

  useEffect(() => { autoResize(); }, [prompt]);

  const optimizePrompt = async (text: string, imageUrls?: string[]): Promise<string> => {
    const user = getCurrentUser();
    if (!user) {
      window.dispatchEvent(new CustomEvent('show-auth-modal'));
      throw new Error('请先登录');
    }
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
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
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

    if (enableOptimization && hasPrompt && !isOptimized) {
      setOptimizing(true);
      optimizePrompt(prompt, uploadedImages.map(img => img.url))
        .then(optimized => {
          setPrompt(optimized);
          setIsOptimized(true);
          setOptimizing(false);
          setTimeout(() => handleGenerate(), 100);
        })
        .catch(() => setOptimizing(false));
      return;
    }

    const currentPrompt = prompt;
    const currentImages = uploadedImages.map(img => img.url);
    const currentCount = generateCount;

    setLoading(true);
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

        (result.data || []).forEach((item: any) => {
          imageLibraryService.saveToLibrary({
            image_url: item.url,
            prompt: currentPrompt || '',
            model: selectedModel,
            aspect_ratio: selectedAspectRatio,
            resolution,
            type: 'chatgen'
          }).catch(err => console.error('[chatgen] 保存图片失败:', err));
        });

        setPrompt('');
        setUploadedImages([]);
        setIsOptimized(false);
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

  const handleDeleteImage = async (url: string) => {
    setImages(prev => prev.filter(img => img.url !== url));
    try {
      const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
      if (token) {
        await api.post('/api/images/delete-by-url',
          { url },
          { headers: { Authorization: `Bearer ${token}` } }
        );
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
    nanobann2: 'NanoBanana2',
    'gpt-image-2': 'GPT-Image2',
    'agnes-image-2.1-flash': 'Agnes Image 2.1 Flash'
  };

  const examplePrompts = [
    '一只戴着墨镜的柴犬坐在迈阿密海滩边的敞篷跑车里，复古胶片摄影风格',
    '赛博朋克城市的霓虹雨夜，一个穿着长风衣的人站在天台',
    '一杯冒着热气的拿铁咖啡放在窗台上，窗外是秋天的红叶',
  ];



  // 真正的瀑布流：根据图片URL生成稳定的伪随机高度
  const getRandomHeight = (url: string) => {
    // 用URL的charCode之和作为种子，保证同一张图高度稳定
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      hash = ((hash << 5) - hash) + url.charCodeAt(i);
      hash |= 0;
    }
    const ratio = Math.abs(hash % 5);
    const heights = ['aspect-[3/4]', 'aspect-square', 'aspect-[4/5]', 'aspect-[2/3]', 'aspect-[5/6]'];
    return heights[ratio];
  };

  // 纯瀑布流布局，无网格模式
  const masonryClass = 'columns-2 md:columns-3 lg:columns-4 gap-5 space-y-5';

  return (
    <div className="min-h-0 flex-1 flex flex-col bg-gray-50">
      {/* 顶部导航栏 */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
                <Wand2 size={16} className="text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">创意生图</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadImagesFromDB()}
              className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
            >
              <RefreshCw size={18} />
            </button>
            <div className="flex items-center gap-2 bg-amber-50 px-3 py-2 rounded-lg">
              <Coins size={16} className="text-amber-500" />
              <span className="text-sm font-medium text-amber-700">
                {Number(Math.max(0, user?.credits || 0)).toFixed(1)}
              </span>
            </div>
            <div className="text-sm text-gray-500">
              今日生成: <span className="font-semibold text-blue-600">{todayGenCount}</span> 张
            </div>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：图片展示区 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
          {loadingImages && (
            <div className="flex items-center justify-center h-64">
              <Loader2 size={32} className="text-blue-500 animate-spin" />
            </div>
          )}

          {!loadingImages && generatedImages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
              <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-6">
                <Wand2 size={40} className="text-blue-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">开始创作</h2>
              <p className="text-gray-500 mb-8">选择功能，AI 为你生成精美内容</p>



              {/* 示例描述 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl w-full">
                {examplePrompts.map((ep, i) => (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 + 0.5 }}
                    onClick={() => { setPrompt(ep); setIsOptimized(false); }}
                    className="p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all text-left"
                  >
                    <p className="text-sm text-gray-600 line-clamp-3">{ep}</p>
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {(!loadingImages && (generatedImages.length > 0 || loading)) && (
            <div className={masonryClass}>
              {/* Loading占位框 - 在瀑布流最前面 */}
              {loading && Array.from({ length: Math.min(generateCount, 1) }).map((_, i) => (
                <motion.div
                  key={`loading-placeholder-${i}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="aspect-square rounded-xl bg-white border-2 border-blue-500 border-dashed flex flex-col items-center justify-center break-inside-avoid"
                >
                  <Loader2 size={28} className="text-blue-500 animate-spin mb-2" />
                  <span className="text-xs text-blue-500 font-medium">生成中...</span>
                </motion.div>
              ))}

              {generatedImages.map((img, idx) => (
                <motion.div
                  key={img.url}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`group relative break-inside-avoid cursor-pointer ${getRandomHeight(img.url)} rounded-xl overflow-hidden bg-white transition-all duration-300`}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => setPreviewImage(img.url)}
                >
                  <img
                    src={img.url}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  
                  <AnimatePresence>
                    {hoveredIndex === idx && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
                      >
                        <div className="absolute bottom-0 left-0 right-0 p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Clock size={12} className="text-white/80" />
                              <span className="text-xs text-white/80">{formatTime(img.createdAt)}</span>
                            </div>
                            {img.model && (
                              <span className="text-xs px-2 py-1 bg-white/20 rounded-full text-white">
                                {MODEL_LABELS[img.model] || img.model}
                              </span>
                            )}
                          </div>
                          {img.prompt && (
                            <p className="text-xs text-white/60 mt-2 line-clamp-2">{img.prompt}</p>
                          )}
                        </div>
                        
                        <div className="absolute top-3 right-3 flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownloadImage(img.url); }}
                            className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center hover:bg-white/40 transition-colors"
                          >
                            <Download size={14} className="text-white" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleUseAsReference(img.url); }}
                            className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center hover:bg-white/40 transition-colors"
                            title="作为参考图"
                          >
                            <CornerDownRight size={14} className="text-white" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteImage(img.url); }}
                            className="w-8 h-8 bg-red-500/80 backdrop-blur-sm rounded-lg flex items-center justify-center hover:bg-red-600 transition-colors"
                          >
                            <Trash2 size={14} className="text-white" />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          )}

        </div>

        {/* 右侧：控制面板 */}
        <aside className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
          {/* 标题 */}
          <div className="p-4 border-b border-gray-200 flex-shrink-0">
            <h2 className="font-semibold text-gray-900">创作设置</h2>
          </div>

          {/* 可滚动的设置区域 */}
          <div className="flex-1 overflow-y-auto">
            {/* 上传参考图 */}
            <div className="p-4 border-b border-gray-200">
              <label className="text-sm font-medium text-gray-700 mb-1 block">参考图片</label>
              <p className="text-xs text-gray-500 mb-3">上传同一产品的多个细节图，AI 将综合分析后生成</p>
              <div className="flex flex-wrap gap-2">
                {uploadedImages.map((img, idx) => (
                  <div key={img.id} className="relative group">
                    <div className="w-16 h-16 rounded-lg overflow-hidden border-2 border-gray-200">
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <button
                      onClick={() => removeUploadedImage(idx)}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                ))}
                {uploadedImages.length < 4 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-400 flex items-center justify-center transition-colors"
                  >
                    <Plus size={20} className="text-gray-400" />
                  </button>
                )}
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleUpload}
                accept="image/*"
                multiple
                className="hidden"
              />
            </div>

            {/* 模型选择 */}
            <div className="p-4 pb-6 border-b border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} className="text-blue-500" />
                <span className="text-xs font-medium text-gray-600">生成模型</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setSelectedModel('nanobann2')}
                  className={`flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all ${
                    selectedModel === 'nanobann2'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-xs font-semibold">NanoBanana2</span>
                </button>
                <button
                  onClick={() => setSelectedModel('gpt-image-2')}
                  className={`flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all ${
                    selectedModel === 'gpt-image-2'
                      ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-xs font-semibold">GPT-Image2</span>
                </button>
                <button
                  onClick={() => setSelectedModel('agnes-image-2.1-flash')}
                  className={`flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all ${
                    selectedModel === 'agnes-image-2.1-flash'
                      ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-xs font-semibold">Agnes</span>
                </button>
              </div>
            </div>

            {/* 生图设置 */}
            <div className="p-4 pb-6 border-b border-gray-200 space-y-5">
              {/* 分辨率 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Monitor size={14} className="text-emerald-500" />
                  <span className="text-xs font-medium text-gray-600">分辨率</span>
                </div>
                <div className="flex gap-3">
                  {['2K', '4K'].map((res) => (
                    <button
                      key={res}
                      onClick={() => setResolution(res)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        resolution === res
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </div>

              {/* 图片比例 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Crop size={14} className="text-amber-500" />
                  <span className="text-xs font-medium text-gray-600">图片比例</span>
                </div>
                <div className="grid grid-cols-4 gap-2.5">
                  {ASPECT_RATIOS.map(size => (
                    <button 
                      key={size.value} 
                      onClick={() => setSelectedAspectRatio(size.value)}
                      className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl transition-all ${
                        selectedAspectRatio === size.value
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <div className={`border-[1.5px] rounded-sm ${
                        selectedAspectRatio === size.value ? 'border-white/80' : 'border-gray-400'
                      } ${getRatioStyle(size.value)}`} />
                      <span className="text-[10px] font-medium">{size.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 生成张数 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ImagePlus size={14} className="text-violet-500" />
                  <span className="text-xs font-medium text-gray-600">生成张数</span>
                </div>
                <select
                  value={generateCount}
                  onChange={(e) => setGenerateCount(Number(e.target.value))}
                  className="w-full py-2.5 px-3 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200 outline-none cursor-pointer hover:border-gray-300 focus:border-blue-400 focus:bg-white transition-all"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                    <option key={num} value={num}>{num} 张</option>
                  ))}
                </select>
                <p className="text-[11px] text-amber-500 font-medium mt-2">
                  消耗 {(generatePrice * generateCount).toFixed(1)} 积分
                </p>
              </div>
            </div>

            {/* AI 优化开关 */}
            <div className="p-4 pb-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">AI 优化提示词</label>
                  <p className="text-xs text-gray-500 mt-1">自动优化你的描述</p>
                </div>
                <button
                  onClick={() => setEnableOptimization(!enableOptimization)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    enableOptimization ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                    enableOptimization ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </div>

          </div>

          {/* 底部输入区域 */}
          <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0">
            {uploadedImages.length > 0 && (
              <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                {uploadedImages.map((img, idx) => (
                  <div key={img.id} className="relative flex-shrink-0 group">
                    <img src={img.url} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
                    <button
                      onClick={() => removeUploadedImage(idx)}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={8} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 items-end">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => { setPrompt(e.target.value); setIsOptimized(false); autoResize(); }}
                onKeyDown={handleKeyDown}
                placeholder="描述你想要生成的图片..."
                className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                rows={2}
              />
              <button
                onClick={handleGenerate}
                disabled={loading || optimizing || (!prompt.trim() && uploadedImages.length === 0)}
                className="px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {loading || optimizing ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Send size={20} />
                )}
              </button>
            </div>
            <div className="flex items-center justify-center mt-2">
              <span className="text-[11px] text-gray-400">Enter 发送 · Shift+Enter 换行</span>
            </div>
          </div>
        </aside>
      </div>

      {/* 全屏预览模态框 */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8"
            onClick={() => setPreviewImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-4xl max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <img src={previewImage} alt="" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute top-4 right-4 w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/40 transition-colors"
              >
                <X size={20} className="text-white" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 弹窗 */}
      <CreditCheckModal isOpen={showCreditModal} onClose={() => setShowCreditModal(false)} />
      <ImagePreviewModal isOpen={false} onClose={() => {}} imageUrl="" />
    </div>
  );
};

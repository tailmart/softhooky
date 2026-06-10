import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, Layout, Images, Globe, Wand2, Download, Eye, ChevronDown } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { analyzeMultipleImages } from '../../services/aiChatService';
import { requireAuth } from '../../utils/authCheck';
import { getAvailableModels } from '../../services/modelService';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import { PsdExportButton } from '../../components/PsdExportButton';

const LANGUAGES = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
];

const ASPECT_RATIOS = [
  { value: '智能', label: '智能' },
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '9:16', label: '9:16' },
];

const VARIATIONS = [1, 2, 3, 4];

const ANALYSIS_PROMPT = `你是一位资深的电商视觉设计师。你的任务是：分析用户上传的产品图片和模板参考图，规划一套"设计风格迁移"方案。

## 核心要求
- 分析模板图的**设计语言**：整体风格调性、色彩倾向、字体气质、留白节奏、构图规律、装饰手法
- 基于产品图片的特征（形状、色调、质感），将模板的设计风格"迁移"到产品上
- 每个产品需要生成 {variationCount} 个不同风格的变体方案
- **不是复制坐标布局**，而是理解模板的设计感觉，为产品量身定制最优构图
- 保持产品的视觉特征不变，产品本身不能有任何变化
- 【产品一致性】每个产品的外观、形状、颜色、纹理等所有细节必须保持不变

## 输出格式 - STRICT JSON array:
[{"product_idx":0,"variation":0,"title":"设计标题","desc":"详细画面描述（包含构图布局、场景、光线、配色方案及设计风格说明）","layout_ref":"参考模板图的设计风格特征说明","subtitle":"副标题或补充文案"}]

## 设计原则
- 输出数组的总长度 = 产品数量（{productCount}）× 每产品风格变体数（{variationCount}）
- product_idx 指明对应第几张产品图（从0开始）
- variation 指明是该产品的第几个风格变体（从0开始）
- 每张标题必须突出对应产品的核心卖点，同一产品的各个变体之间要有差异化
- desc 要详细描述构图和设计风格
- 所有文案使用目标语言`;

interface CloneCard {
  product_idx: number;
  variation: number;
  title: string;
  desc: string;
  layout_ref: string;
  subtitle: string;
}

interface ProductImage {
  file: File;
  preview: string;
  title: string;
  desc: string;
}

export const DetailClonePage: React.FC = () => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getAvailableModels(['seedream']).then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) setSelectedModel('gpt-image-2');
    });
  }, []);

  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [templateImages, setTemplateImages] = useState<{ file: File; preview: string }[]>([]);
  const [variations, setVariations] = useState(1);
  const [language, setLanguage] = useState('zh');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [selectedModel, setSelectedModel] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [quality, setQuality] = useState('2K');
  const [progress, setProgress] = useState('');
  const [analysisResult] = useState<CloneCard[]>([]);
  const [results, setResults] = useState<{ url: string; idx: number }[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);
  const productFileRef = useRef<HTMLInputElement>(null);
  const templateFileRef = useRef<HTMLInputElement>(null);

  // --- Product image handlers ---
  const handleProductUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f: File) => f.type.startsWith('image/'));
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    const oversized = files.find(f => f.size > MAX_FILE_SIZE);
    if (oversized) {
      alert(`图片"${oversized.name}"超过 20MB，请压缩后重新上传`);
      e.target.value = '';
      return;
    }
    const newItems: ProductImage[] = files.map((f: File) => ({ file: f, preview: '', title: '', desc: '' }));
    Promise.all(newItems.map(item => new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => { item.preview = reader.result as string; resolve(); };
      reader.onerror = reject;
      reader.readAsDataURL(item.file);
    }))).then(() => {
      setProductImages(prev => [...prev, ...newItems].slice(0, 10));
    }).catch(err => {
      console.error('图片处理失败:', err);
      alert('部分图片处理失败，请尝试使用更小的图片');
    });
  };

  const removeProduct = (idx: number) => setProductImages(prev => prev.filter((_, i) => i !== idx));
  const updateProduct = (idx: number, field: 'title' | 'desc', value: string) => {
    setProductImages(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  // --- Template image handlers ---
  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f: File) => f.type.startsWith('image/'));
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    const oversized = files.find(f => f.size > MAX_FILE_SIZE);
    if (oversized) {
      alert(`图片"${oversized.name}"超过 20MB，请压缩后重新上传`);
      e.target.value = '';
      return;
    }
    const newItems = files.map((f: File) => ({ file: f, preview: '' }));
    Promise.all(newItems.map(item => new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => { item.preview = reader.result as string; resolve(); };
      reader.onerror = reject;
      reader.readAsDataURL(item.file);
    }))).then(() => {
      setTemplateImages(prev => [...prev, ...newItems].slice(0, 10));
    }).catch(err => {
      console.error('图片处理失败:', err);
      alert('部分图片处理失败，请尝试使用更小的图片');
    });
  };

  const removeTemplate = (idx: number) => setTemplateImages(prev => prev.filter((_, i) => i !== idx));

  // 智能检测图片比例
  const detectImageRatio = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const ratio = img.width / img.height;
        if (ratio > 1.3) resolve('16:9');
        else if (ratio < 0.75) resolve('9:16');
        else if (ratio > 0.9 && ratio < 1.1) resolve('1:1');
        else if (ratio >= 0.75 && ratio <= 0.9) resolve('3:4');
        else resolve('4:3');
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => resolve('1:1');
      img.src = URL.createObjectURL(file);
    });
  };

  // --- 一键分析+生成 ---
  const handleAnalyzeAndGenerate = async () => {
    if (!requireAuth()) return;
    if (productImages.length === 0) { alert('请上传产品图片'); return; }
    if (templateImages.length === 0) { alert('请上传模板参考图'); return; }
    setAnalyzing(true);
    setResults([]);
    setProgress('AI分析产品与模板，规划风格迁移方案...');
    try {
      // 分析阶段
      const productB64s = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1200)));
      const templateB64s = await Promise.all(templateImages.map(item => fileToDataUrl(item.file, 1200)));
      const allImages = [...productB64s, ...templateB64s];

      const langLabel = LANGUAGES.find(l => l.value === language)?.label || '中文';
      const productInfo = productImages.map((p, i) =>
        `产品${i + 1}${p.title ? `（${p.title}）` : ''}：${p.desc || '（请AI从图片中自行分析产品特征）'}`
      ).join('\n');

      const promptText = ANALYSIS_PROMPT
        .replace('{productCount}', String(productImages.length))
        .replace('{variationCount}', String(variations));
      const userContent = `${promptText}\n\n=====\n\n## 图片顺序说明
上传的图片中：
- 前 ${productImages.length} 张是【产品图片】（每张产品的视觉特征必须保留）
- 后 ${templateImages.length} 张是【模板参考图】（版式结构来源）

## 产品信息
${productInfo}

## 参数
目标语言：${langLabel}
图片比例：${aspectRatio}
模板图数量：${templateImages.length}
每产品裂变数：${variations}（每个产品生成 ${variations} 个不同版式的方案）

请分析以上产品图片和模板参考图，输出JSON格式的设计风格迁移方案。每张方案须明确说明参考了模板图的哪些设计特征。所有文案使用目标语言。`;

      const raw = await analyzeMultipleImages(allImages, userContent, { model: 'gemini-3.5-flash', maxTokens: 8000 });
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('AI返回格式异常，请重试');
      const parsed = JSON.parse(jsonMatch[0]) as CloneCard[];
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('AI未能生成有效的方案，请重试');
      const cards = parsed;

      // 分析完成，直接生成
      setAnalyzing(false);
      setIsProcessing(true);
      setProgress('');

      const productUrls = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1536)));
      const templateUrls = await Promise.all(templateImages.map(item => fileToDataUrl(item.file, 1536)));

      let resolvedRatio = aspectRatio;
      if (aspectRatio === '智能' && templateImages.length > 0) {
        resolvedRatio = await detectImageRatio(templateImages[0].file);
      }

      setProgress(`生成中 (0/${cards.length})...`);
      let doneCount = 0;

      for (const card of cards) {
        const imageUrls = [
          productUrls[card.product_idx ?? doneCount],
          ...templateUrls,
        ];
        const prompt = `电商设计风格迁移，第${doneCount + 1}张\n比例：${resolvedRatio}\n语言：${langLabel}\n\n标题：${card.title}\n${card.subtitle ? `副标题：${card.subtitle}` : ''}\n画面描述：${card.desc}\n${card.layout_ref ? `设计风格参考：${card.layout_ref}` : ''}\n\n要求：\n- 【最重要】保持产品图片的一致性：该产品的外观、形状、颜色、纹理、包装、标签等所有细节必须与提供的产品图完全一致，不得改变产品的任何视觉特征\n- 分析模板参考图的设计风格（色调、字体气质、留白节奏、装饰手法、整体调性），将其设计语言迁移应用到当前画面\n- **不要硬套模板的坐标布局**，而是根据产品的形状、大小、色调特征，对构图做适配优化\n- 产品在画面中突出显示，占据视觉中心\n- 文字排版清晰，使用目标语言，层级分明\n- 整体设计品质高端，细节精致，具有电商商业感`;
        try {
          const resp = await editImage({ prompt, images: imageUrls, aspectRatio: resolvedRatio, resolution: quality, model: selectedModel });
          if (resp.data?.[0]?.url) {
            setResults(prev => [{ url: resp.data[0].url, idx: doneCount + 1 }, ...prev]);
          }
        } catch (err) {
          console.error(`生成第${doneCount + 1}张失败:`, err);
        }
        doneCount++;
        setProgress(`生成中 (${doneCount}/${cards.length})...`);
      }
    } catch (err: any) {
      console.error('分析/生成失败:', err);
      alert('操作失败: ' + (err.message || '请稍后重试'));
    } finally {
      setAnalyzing(false);
      setIsProcessing(false);
      setProgress('');
    }
  };

  const handleDownload = async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `clone-${Date.now()}.png`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };



  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-gray-200 flex-shrink-0 bg-gray-50">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center"><Layout size={16} className="text-white" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[#171717]">设计风格迁移</h1>
          <p className="text-[10px] text-gray-400 leading-tight">上传产品图 + 模板参考图 → AI提取设计语言 → 风格迁移适配出图</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-[400px] border-r border-gray-200 overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-gray-50">
          {/* Product Images */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Images size={16} className="text-blue-500" />
              <div><h3 className="text-sm font-semibold text-[#171717]">产品图片</h3><p className="text-xs text-gray-400">每张可填写标题+描述</p></div>
              <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-xl">{productImages.length}/10</span>
            </div>
            {productImages.length > 0 && (
              <div className="space-y-3 mb-3">
                {productImages.map((item, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-2xl p-3 border border-gray-200">
                    <div className="flex gap-3">
                      <div className="relative group w-16 h-16 rounded-xl overflow-hidden bg-gray-200 flex-shrink-0">
                        <img src={item.preview} alt="" className="w-full h-full object-cover" />
                        <button onClick={() => removeProduct(idx)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100"><X size={14} className="text-white" /></button>
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <input value={item.title} onChange={e => updateProduct(idx, 'title', e.target.value)} placeholder="产品标题/名称" className="w-full bg-white px-2.5 py-1.5 rounded-lg text-xs border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[#333] placeholder:text-gray-400" />
                        <textarea value={item.desc} onChange={e => updateProduct(idx, 'desc', e.target.value)} placeholder="产品描述/卖点..." rows={2} className="w-full bg-white px-2.5 py-1.5 rounded-lg text-xs border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none text-[#333] placeholder:text-gray-400" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <input type="file" ref={productFileRef} onChange={handleProductUpload} multiple accept="image/*" className="hidden" />
            <div onClick={() => productFileRef.current?.click()} className="border-2 border-dashed border-[#E5E5E5] p-3 flex flex-col items-center justify-center gap-1 hover:border-gray-400 hover:bg-gray-50 transition-all cursor-pointer bg-[#FAFAFA] rounded-xl">
              <Plus size={18} className="text-gray-400" /><span className="text-xs text-gray-400">上传产品图</span>
            </div>
          </div>

          {/* Template Images */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Layout size={16} className="text-blue-500" />
              <div><h3 className="text-sm font-semibold text-[#171717]">模板参考图</h3><p className="text-xs text-gray-400">AI将参考这些版式结构</p></div>
              <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-xl">{templateImages.length}/10</span>
            </div>
            {templateImages.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mb-3">
                {templateImages.map((item, idx) => (
                  <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden bg-gray-100">
                    <img src={item.preview} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeTemplate(idx)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100"><X size={14} className="text-white" /></button>
                  </div>
                ))}
              </div>
            )}
            <input type="file" ref={templateFileRef} onChange={handleTemplateUpload} multiple accept="image/*" className="hidden" />
            <div onClick={() => templateFileRef.current?.click()} className="border-2 border-dashed border-[#E5E5E5] p-3 flex flex-col items-center justify-center gap-1 hover:border-gray-400 hover:bg-gray-50 transition-all cursor-pointer bg-[#FAFAFA] rounded-xl">
              <Plus size={18} className="text-gray-400" /><span className="text-xs text-gray-400">上传模板图</span>
            </div>
          </div>

          {/* Language */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3"><Globe size={14} className="text-blue-500" /><span className="text-sm font-semibold text-[#171717]">语言</span></div>
            <select value={language} onChange={e => setLanguage(e.target.value)}
              className="w-full bg-gray-100 px-3 py-2.5 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer">
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          {/* Model */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3"><Wand2 size={14} className="text-blue-500" /><span className="text-sm font-semibold text-[#171717]">模型</span></div>
            <div className="relative">
              <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                className="w-full bg-gray-100 px-3 py-2.5 pr-8 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer">
                {models.length > 0 ? models.map(m => <option key={m.value} value={m.value}>{m.label}</option>) : <option value="">加载中...</option>}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Resolution */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">分辨率</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {['2K', '4K'].map(q => (
                <button key={q} onClick={() => setQuality(q)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${quality === q ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{q}</button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3"><Images size={14} className="text-blue-500" /><span className="text-sm font-semibold text-[#171717]">比例</span></div>
            <div className="grid grid-cols-4 gap-2">
              {ASPECT_RATIOS.map(r => {
                const sel = aspectRatio === r.value;
                return (<button key={r.value} onClick={() => setAspectRatio(r.value)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${sel ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{r.label}</button>);
              })}
            </div>
          </div>

          {/* Variations Per Product */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3"><Images size={14} className="text-blue-500" /><span className="text-sm font-semibold text-[#171717]">每产品裂变数</span></div>
            <div className="grid grid-cols-4 gap-2">
              {VARIATIONS.map(n => (
                <button key={n} onClick={() => setVariations(n)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${variations === n ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{n}种</button>
              ))}
            </div>
          </div>

          {/* 一键生成按钮 */}
          {!analyzing && !isProcessing && (
            <button onClick={handleAnalyzeAndGenerate} disabled={productImages.length === 0 || templateImages.length === 0}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-gray-200 disabled:text-gray-400 shadow-sm">
              <Sparkles size={18} /> AI分析并生成 ({productImages.length}产品 × {variations}种 = {productImages.length * variations}张)
            </button>
          )}
          {(analyzing || isProcessing) && (
            <div className="text-center text-xs text-gray-400 bg-gray-100 rounded-xl py-3 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              {progress || (analyzing ? 'AI分析中...' : '生成中...')}
            </div>
          )}
        </div>

        {/* Right Results */}
        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
          {!analyzing && !isProcessing && results.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 mx-auto mb-5 bg-gray-100 rounded-2xl flex items-center justify-center"><Layout size={32} className="text-gray-300" /></div>
                <h2 className="text-lg font-semibold text-[#171717] mb-2">设计风格迁移</h2>
                <p className="text-sm text-gray-400 leading-relaxed">上传产品图 + 模板参考图 → 一键生成设计风格迁移图</p>
              </div>
            </div>
          ) : (
            <div className="p-6">
              {/* 分析中的进度指示 */}
              {analyzing && results.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-full blur-3xl animate-pulse" />
                    <div className="relative w-24 h-24 rounded-full border-4 border-[#E5E5E5] border-t-blue-500 border-r-blue-400 animate-spin" />
                  </div>
                  <div className="flex flex-col items-center gap-2 mb-6">
                    <h3 className="text-lg font-semibold text-[#171717]">AI 正在分析</h3>
                    <p className="text-sm text-[#A3A3A3]">{progress || '分析产品与模板设计风格...'}</p>
                  </div>
                  <div className="flex gap-1.5 mt-6">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              {/* 生成中的进度指示（还没有结果时） */}
              {isProcessing && !analyzing && results.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 to-pink-500/10 rounded-full blur-3xl animate-pulse" />
                    <div className="relative w-24 h-24 rounded-full border-4 border-[#E5E5E5] border-t-violet-500 border-r-pink-400 animate-spin" />
                  </div>
                  <div className="flex flex-col items-center gap-2 mb-6">
                    <h3 className="text-lg font-semibold text-[#171717]">正在生成</h3>
                    <p className="text-sm text-[#A3A3A3]">{progress || '正在生成风格迁移图...'}</p>
                  </div>
                  <div className="w-48 h-2 bg-[#F5F5F5] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                  </div>
                  <div className="flex gap-1.5 mt-6">
                    <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-violet-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              {/* 生成结果 - 出图即显示 */}
              {results.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-[#171717]">
                      已生成 ({results.length})
                      {isProcessing && <span className="text-xs text-[#A3A3A3] font-normal ml-2">生成中...</span>}
                    </h2>
                    {isProcessing && (
                      <div className="flex items-center gap-2 text-xs text-[#A3A3A3] bg-[#F5F5F5] rounded-xl px-3 py-1.5">
                        <Loader2 size={12} className="animate-spin text-violet-500" />
                        {progress}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {results.sort((a, b) => a.idx - b.idx).map((item) => (
                      <div key={item.idx} className="group relative bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
                        <div className="cursor-pointer overflow-hidden" onClick={() => setPreviewImage(item.url)}>
                          <img src={item.url} alt="" className="w-full object-cover"
                            style={{ maxHeight: '320px' }} />
                        </div>
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-600">裂变 #{item.idx}</span>
                          <div className="flex gap-1">
                            <button onClick={() => setReEditImage(item.url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#171717]"><Wand2 size={14} /></button>
                            <button onClick={() => handleDownload(item.url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#171717]"><Download size={14} /></button>
                            <PsdExportButton imageUrl={item.url} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ImagePreviewModal isOpen={!!previewImage} onClose={() => setPreviewImage(null)} imageUrl={previewImage || ''} />
      <ReEditModal
        isOpen={!!reEditImage}
        imageUrl={reEditImage || ''}
        aspectRatio={aspectRatio}
        model={selectedModel}
        resolution={quality}
        onClose={() => setReEditImage(null)}
        onReplaced={(oldUrl, newUrl) => setResults(prev => prev.map(item => item.url === oldUrl ? {...item, url: newUrl} : item))}
      />
    </div>
  );
};

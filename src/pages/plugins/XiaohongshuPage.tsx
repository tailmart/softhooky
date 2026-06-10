import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, FileImage, Wand2, Download, Eye, Check, Copy, Globe, ChevronDown } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { analyzeMultipleImages } from '../../services/aiChatService';
import { uploadFileToCos } from '../../services/cosService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { requireAuth } from '../../utils/authCheck';
import { getAvailableModels } from '../../services/modelService';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import { ModelSpeedNote } from '../../components/ModelSpeedNote';
import { LoadingAnimation } from '../../components/LoadingAnimation';
import { PsdExportButton } from '../../components/PsdExportButton';

const LANGUAGES: { value: string; label: string }[] = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
];
const ASPECT_RATIOS = [
  { value: '3:4', label: '3:4' },
];
const IMAGE_TYPES = ['封面图', '主图', '细节图', '对比图', '使用场景图'];

export const XiaohongshuPage: React.FC = () => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getAvailableModels(['seedream']).then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) setSelectedModel('nanobann2');
    });
  }, []);
  const [productImages, setProductImages] = useState<{ file: File; preview: string }[]>([]);
  const [productName, setProductName] = useState('');
  const [productDesc, setProductDesc] = useState('');
  const deepAnalysisRef = useRef('');
  const productNameRef = useRef<HTMLTextAreaElement>(null);
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };
  useEffect(() => {
    if (productNameRef.current) autoResize(productNameRef.current);
  }, [productName]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [selectedModel, setSelectedModel] = useState('nanobann2');
  const [quality, setQuality] = useState('2K');
  const [language, setLanguage] = useState('zh');
  const [aspectRatio, setAspectRatio] = useState('3:4');
  const [results, setResults] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);
  const [showCopyTip, setShowCopyTip] = useState('');

  // AI分析结果
  const [coverKeywordsCN, setCoverKeywordsCN] = useState('');
  const [coverKeywordsEN, setCoverKeywordsEN] = useState('');
  const [imageDescriptions, setImageDescriptions] = useState<string[]>(Array(5).fill(''));
  const [copywriting, setCopywriting] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f: File) => f.type.startsWith('image/'));
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    const oversized = files.find(f => f.size > MAX_FILE_SIZE);
    if (oversized) {
      alert(`图片"${oversized.name}"超过 20MB，请压缩后重新上传`);
      e.target.value = '';
      return;
    }
    const newItems = files.map(f => ({ file: f, preview: '' }));
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

  const removeImage = (idx: number) => setProductImages(prev => prev.filter((_, i) => i !== idx));

  const handleAnalyze = async () => {
    if (!requireAuth()) return;
    if (productImages.length === 0) { alert('请上传产品图片'); return; }
    setIsAnalyzing(true);
    setUploadProgress('AI正在深度分析产品...');

    try {
      const b64s = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1200)));
      const langLabel = LANGUAGES.find(l => l.value === language)?.label || '中文';
      const descInfo = productDesc ? `\n产品描述：${productDesc}` : '';

      // 深度分析
      let analysisContext = '';
      setUploadProgress('AI正在分析产品特征...');
      const deepRaw = await analyzeMultipleImages(b64s,
        `分析所有上传的图片中的产品，返回JSON：{"title":"产品名称","brand":"品牌","category":"品类","specs":"规格","sellingPoints":"卖点(逗号分隔)","targetAudience":"目标人群"}。仅输出JSON。`,
        { model: 'gemini-3.5-flash', maxTokens: 2000 }
      );
      const deepMatch = deepRaw.match(/\{[\s\S]*\}/);
      if (deepMatch) {
        const d = JSON.parse(deepMatch[0]) as Record<string, string>;
        if (!productName.trim() && d.title) { setProductName(d.title); }
        if (!productDesc.trim() && d.description) { setProductDesc(d.description); }
        analysisContext = `\n## AI深度分析产品信息\n品牌：${d.brand || ''}\n品类：${d.category || ''}\n规格：${d.specs || ''}\n卖点：${d.sellingPoints || ''}\n目标人群：${d.targetAudience || ''}`;
      }

      setUploadProgress('AI正在生成小红书内容...');
      deepAnalysisRef.current = analysisContext;
      const prompt = `分析这些产品图片，为小红书帖子生成营销内容。${analysisContext}
产品名称: ${productName || '美妆产品'}${descInfo}
图片比例: ${aspectRatio}
目标语言: ${langLabel}

请以JSON格式返回以下内容{
  "coverKeywordsCN": "中文封面关键词，${aspectRatio}竖版，吸引眼球的描述",
  "coverKeywordsEN": "English cover keywords, ${aspectRatio} ratio, Xiaohongshu viral cover",
  "imageDescriptions": [
    "封面图描述，${aspectRatio}",
    "主图描述，产品展示${aspectRatio}",
    "细节图描述，材质工艺${aspectRatio}",
    "对比图描述，使用效果${aspectRatio}",
    "使用场景图描述，生活场景${aspectRatio}"
  ],
  "copywriting": "小红书文案，引人入胜的开头，中间的产品介绍，结尾的互动引导${langLabel}"
}

## 重要：文案差异化要求
- 5张图的描述必须**各有侧重，不能重复**
- 封面图放核心卖点大标题
- 中间图分别从不同角度切入（功能卖点、使用场景、用户痛点、材质工艺、对比优势等）
- 避免所有配图都用相同的句式来描述产品
- 即使提供了产品描述，也要**创造性扩展**，不要照搬用户描述
- 文案正文需加入适当的emoji表情符号，风格自然`;
      const response = await analyzeMultipleImages(b64s, prompt, { model: 'gemini-3.5-flash', maxTokens: 8000 });
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.coverKeywordsCN) setCoverKeywordsCN(parsed.coverKeywordsCN);
        if (parsed.coverKeywordsEN) setCoverKeywordsEN(parsed.coverKeywordsEN);
        if (Array.isArray(parsed.imageDescriptions) && parsed.imageDescriptions.length === 5) {
          setImageDescriptions(parsed.imageDescriptions);
        }
        if (parsed.copywriting) setCopywriting(parsed.copywriting);
      }
    } catch (error) {
      console.error('AI分析失败:', error);
    } finally {
      setIsAnalyzing(false);
      setUploadProgress('');
    }
  };

  const handleGenerate = async () => {
    if (!requireAuth()) return;
    if (productImages.length === 0) { alert('请上传产品图片'); return; }
    if (!coverKeywordsCN.trim() && !coverKeywordsEN.trim()) {
      alert('请先点击"AI分析并规划帖子"进行分析');
      return;
    }

    setIsGenerating(true);
    setUploadProgress('');
    let useDescriptions = imageDescriptions;
    let useCoverCN = coverKeywordsCN;
    setResults([]);

    try {
      const urls = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1536)));
      let genCount = 0;
      const totalCount = useDescriptions.filter(d => d.trim()).length;

      if (totalCount === 0) {
        alert('AI分析未生成有效的图片描述，请重试');
        setIsGenerating(false);
        setUploadProgress('');
        return;
      }

      setUploadProgress(`生成图片中(0/${totalCount})...`);
      for (let i = 0; i < productImages.length; i++) {
        try {
          const cosUrl = await uploadFileToCos(productImages[i].file);
          await imageLibraryService.saveToLibrary({ image_url: cosUrl, prompt: `小红书素材产品图 #${i + 1}`, model: selectedModel, aspect_ratio: aspectRatio, resolution: quality, type: 'edited' });
        } catch {}
      }

      imageLibraryService.clearSavedUrlsCache();

      for (let i = 0; i < Math.min(useDescriptions.length, IMAGE_TYPES.length); i++) {
        const desc = useDescriptions[i]?.trim();
        if (!desc) continue;

        setUploadProgress(`生成中${i + 1}/${totalCount} ${IMAGE_TYPES[i]}...`);
        const langLabel = LANGUAGES.find(l => l.value === language)?.label || '中文';
        const prompt = `小红书帖子图片${IMAGE_TYPES[i]}，${aspectRatio}比例，要求: ${langLabel}生成
产品名称: ${productName || '美妆产品'}
产品卖点: ${desc}
产品描述参考: ${productDesc || '（AI自主创意）'}${deepAnalysisRef.current}

封面风格: ${useCoverCN}

图片要求:
1. 产品的造型、颜色、材质等视觉特征必须与参考图一致，产品原图上已有的文字/标志/标签保持原样
2. 每张图的文案必须独特有创意，与该图类型（封面图/主图/细节图/对比图/场景图）相匹配，不同图之间各有侧重互不重复
3. 产品为主，背景简洁大方
3. 光线充足，质感高级
4. 构图精美，符合小红书审美
5. 色彩搭配协调，视觉冲击力强

重要：图片上所有文字必须使用${langLabel}，禁止使用其他语言。`;

        try {
          const resp = await editImage({ prompt, images: urls, aspectRatio, resolution: quality, model: selectedModel });
          if (resp.data?.[0]?.url) {
            const finalUrl = resp.data[0].url;
            imageLibraryService.saveToLibrary({ image_url: finalUrl, prompt: `小红书帖子${IMAGE_TYPES[i]}`, model: selectedModel, aspect_ratio: aspectRatio, resolution: quality, type: 'generated' }).catch(() => {});
            genCount++;
            setResults(prev => [finalUrl, ...prev]);
          }
        } catch { /* 生成失败 */ }
      }

      if (genCount === 0) alert('生成失败，请重试');
    } catch (error: any) {
      console.error('生成失败:', error);
    } finally {
      setIsGenerating(false);
      setUploadProgress('');
    }
  };

  const handleDownload = async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `xiaohongshu-${Date.now()}.png`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => { setShowCopyTip(label); setTimeout(() => setShowCopyTip(''), 2000); });
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-[#E5E5E5] flex-shrink-0 bg-[#F7F7F7]">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center">
          <FileImage size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[#171717]">小红书种草图文</h1>
          <p className="text-[10px] text-[#A3A3A3] leading-tight">AI分析产品图 → 生成封面关键词、文案正文 + 5张配图</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Settings */}
        <div className="w-[380px] border-r border-[#E5E5E5] overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-[#FAFAFA]">
          {/* Product Images */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <FileImage size={16} className="text-blue-500" />
              <div><h3 className="text-sm font-semibold text-[#171717]">产品图片</h3><p className="text-xs text-[#A3A3A3]">AI会通过提供参考图自行选择设计</p></div>
              <span className="ml-auto text-xs text-[#A3A3A3] bg-[#F5F5F5] px-2 py-1 rounded-xl">{productImages.length}/10</span>
            </div>
            {productImages.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mb-3">
                {productImages.map((item, idx) => (
                  <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden bg-[#F5F5F5]">
                    <img src={item.preview} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeImage(idx)} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100"><X size={12} className="text-white" /></button>
                  </div>
                ))}
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleUpload} multiple accept="image/*" className="hidden" />
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA] p-3 flex flex-col items-center justify-center gap-1 hover:border-[#171717]/30 hover:bg-[#F5F5F5] transition-all cursor-pointer bg-[#FAFAFA]">
              <Plus size={18} className="text-[#A3A3A3]" /><span className="text-xs text-[#A3A3A3]">上传产品图片</span>
            </div>
          </div>

          {/* Product Name */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">产品名称</span>
            </div>
            <textarea value={productName} onChange={e => { setProductName(e.target.value); autoResize(e.target); }} placeholder="请输入产品名称或品牌"
              className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-[#171717]/20 text-[#171717] placeholder:text-[#BDBDBD] resize-none overflow-hidden"
              rows={1} ref={productNameRef} />
          </div>

          {/* Product Description */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">产品描述（可选）</span>
            </div>
            <textarea value={productDesc} onChange={e => { setProductDesc(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder="产品卖点、功能、材质、使用场景..."
              className="w-full bg-[#F5F5F5] rounded-xl p-3 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-[#171717]/20 resize-none text-[#171717] placeholder:text-[#BDBDBD] overflow-hidden" rows={1}
              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
          </div>

          {/* Image Settings */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <h3 className="text-sm font-semibold text-[#171717] mb-3">生成设置</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[#A3A3A3] mb-1.5 block">语言</label>
                <select value={language} onChange={e => setLanguage(e.target.value)}
                  className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-[#171717]/20 appearance-none cursor-pointer">
                  {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#A3A3A3] mb-1.5 block">图片比例</label>
                <div className="flex items-center gap-2 bg-[#F5F5F5] rounded-xl px-4 py-2.5">
                  <span className="text-sm font-medium text-[#171717]">3:4</span>
                  <span className="text-[10px] text-[#A3A3A3]">小红书帖子标准比例</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[#A3A3A3] mb-1.5 block">模型</label>
                <div className="relative">
                  <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                    className="w-full bg-[#F5F5F5] px-3 py-2.5 pr-8 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-[#171717]/20 appearance-none cursor-pointer">
                    {models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                <ModelSpeedNote />
              </div>
              <div className="mt-4">
                <label className="text-xs font-medium text-[#A3A3A3] mb-1.5 block">分辨率</label>
                <div className="grid grid-cols-2 gap-2">
                  {['2K', '4K'].map(q => (
                    <button key={q} onClick={() => setQuality(q)}
                      className={`py-2 rounded-xl text-xs font-medium transition-all ${quality === q ? 'bg-blue-500 text-white' : 'bg-[#F5F5F5] text-gray-500 hover:bg-gray-200'}`}>{q}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Analyze Button */}
          {!coverKeywordsCN && !coverKeywordsEN && !isAnalyzing && (
            <button onClick={handleAnalyze} disabled={productImages.length === 0 || isAnalyzing}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-[#E5E5E5] disabled:text-[#A3A3A3] disabled:cursor-not-allowed shadow-sm">
              <Sparkles size={18} /> AI分析并规划帖子
            </button>
          )}

          {/* Re-analyze Button */}
          {(coverKeywordsCN || coverKeywordsEN) && !isGenerating && (
            <button onClick={() => { setCoverKeywordsCN(''); setCoverKeywordsEN(''); setCopywriting(''); setImageDescriptions(Array(5).fill('')); setResults([]); }}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all shadow-sm">
              <Sparkles size={18} /> 重新分析
            </button>
          )}

          {/* Generate Button */}
          {(coverKeywordsCN || coverKeywordsEN) && !isGenerating && (
            <button onClick={handleGenerate} disabled={isGenerating}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all shadow-sm">
              <Wand2 size={18} /> 生成小红书帖子
            </button>
          )}

          {(isAnalyzing || isGenerating) && (
            <LoadingAnimation
              title={isAnalyzing ? 'AI正在分析产品...' : 'AI正在生成图片...'}
              description={uploadProgress || (isAnalyzing ? '正在深度分析产品特征并规划小红书帖子' : '正在根据分析结果生成小红书帖子图片')}
            />
          )}
        </div>

        {/* Right: Results */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {!coverKeywordsCN && !coverKeywordsEN && results.length === 0 && !isGenerating ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-[#171717]/10 to-[#404040]/5 rounded-2xl flex items-center justify-center">
                  <FileImage size={32} className="text-[#171717]" />
                </div>
                <h2 className="text-lg font-semibold text-[#171717] mb-2">小红书种草图文</h2>
                <p className="text-sm text-[#A3A3A3] leading-relaxed">上传产品图 → AI分析 → 生成专业笔记</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Progress bar during generation */}
              {isGenerating && (
                <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm px-6 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <Loader2 size={16} className="animate-spin text-[#171717]" />
                    <span className="text-sm font-medium text-[#171717]">{uploadProgress || '生成中...'}</span>
                    <span className="text-xs text-gray-400 ml-auto">已生成 {results.length} 张</span>
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* 封面关键词 */}
              <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[#171717]">封面关键词</h3>
                  {showCopyTip === 'cover' && <span className="text-xs text-green-600">已复制</span>}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-[#A3A3A3] mb-1.5 block">中文</label>
                    <div className="flex gap-2">
                      <textarea value={coverKeywordsCN} onChange={e => setCoverKeywordsCN(e.target.value)}
                        className="flex-1 bg-[#F5F5F5] rounded-xl px-3 py-2 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-[#171717]/20 text-[#171717] placeholder:text-[#BDBDBD] min-h-[60px] resize-none" />
                      <button onClick={() => handleCopy(coverKeywordsCN, 'cover')} className="w-8 h-8 flex items-center justify-center rounded-xl text-[#A3A3A3] hover:bg-[#F0F0F0] hover:text-[#171717] flex-shrink-0"><Copy size={14} /></button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#A3A3A3] mb-1.5 block">英文</label>
                    <div className="flex gap-2">
                      <textarea value={coverKeywordsEN} onChange={e => setCoverKeywordsEN(e.target.value)}
                        className="flex-1 bg-[#F5F5F5] rounded-xl px-3 py-2 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-[#171717]/20 text-[#171717] placeholder:text-[#BDBDBD] min-h-[60px] resize-none" />
                      <button onClick={() => handleCopy(coverKeywordsEN, 'cover')} className="w-8 h-8 flex items-center justify-center rounded-xl text-[#A3A3A3] hover:bg-[#F0F0F0] hover:text-[#171717] flex-shrink-0"><Copy size={14} /></button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 图片描述 */}
              <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
                <h3 className="text-sm font-semibold text-[#171717] mb-3">5张图片配图方案</h3>
                <div className="space-y-3">
                  {IMAGE_TYPES.map((type, idx) => (
                    <div key={idx} className="bg-[#FAFAFA] rounded-xl p-4 border border-[#E5E5E5]">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 bg-[#171717] text-white rounded-xl flex items-center justify-center text-[10px] font-bold">{idx + 1}</span>
                          <label className="text-xs font-semibold text-[#171717]">{type}</label>
                        </div>
                        <button onClick={() => handleCopy(imageDescriptions[idx] || '', `desc${idx}`)} className="text-[10px] text-[#A3A3A3] hover:text-[#737373] flex items-center gap-1">
                          <Copy size={10} /> 复制
                        </button>
                      </div>
                      <textarea value={imageDescriptions[idx] || ''} onChange={e => {
                        const updated = [...imageDescriptions]; updated[idx] = e.target.value; setImageDescriptions(updated);
                      }} className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-[#E5E5E5] focus:outline-none focus:ring-2 focus:ring-[#171717]/20 text-[#171717] min-h-[60px] resize-none" />
                    </div>
                  ))}
                </div>
              </div>

              {/* 文案 */}
              <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[#171717]">小红书文案正文</h3>
                  <div className="flex items-center gap-2">
                    {showCopyTip === 'copy' && <span className="text-xs text-green-600">已复制</span>}
                     <button onClick={() => handleCopy(copywriting, 'copy')} className="text-xs text-[#171717] hover:text-[#404040] flex items-center gap-1"><Copy size={12} /> 复制文案</button>
                  </div>
                </div>
                <textarea value={copywriting} onChange={e => setCopywriting(e.target.value)}
                  className="w-full bg-[#F5F5F5] rounded-xl p-4 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-[#171717]/20 text-[#171717] placeholder:text-[#BDBDBD] min-h-[200px] resize-none" />
              </div>

              {/* 生成结果 */}
              {results.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#171717]">生成结果 ({results.length})</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {results.map((url, idx) => (
                      <div key={idx} className="group relative bg-[#FAFAFA] rounded-2xl overflow-hidden border border-[#E5E5E5]">
                        <div className="cursor-pointer" onClick={() => setPreviewImage(url)}><img src={url} alt="" className="w-full h-full object-cover" style={{ aspectRatio: '3/4' }} /></div>
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-[#525252]">{IMAGE_TYPES[idx % IMAGE_TYPES.length] || `图片 #${idx + 1}`}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setPreviewImage(url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-[#A3A3A3] hover:bg-[#F0F0F0] hover:text-[#171717]" title="预览"><Eye size={14} /></button>
                            <button onClick={() => setReEditImage(url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-[#A3A3A3] hover:bg-[#F0F0F0] hover:text-[#171717]" title="微调"><Wand2 size={14} /></button>
                            <button onClick={() => handleDownload(url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-[#A3A3A3] hover:bg-[#F0F0F0] hover:text-[#171717]" title="下载"><Download size={14} /></button>
                            <PsdExportButton imageUrl={url} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
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
        onReplaced={(oldUrl, newUrl) => setResults(prev => prev.map(item => item === oldUrl ? newUrl : item))}
      />
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Loader2, Plus, Layers, Image as ImageIcon, Download, Eye, Wand2, ChevronDown } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { analyzeImage } from '../../services/aiChatService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { requireAuth } from '../../utils/authCheck';
import { getAvailableModels } from '../../services/modelService';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import { ModelSpeedNote } from '../../components/ModelSpeedNote';

const RATIOS = ['自动', '1:1', '3:4', '9:16', '16:9'];
const QUALITIES = ['2K', '4K'];
const BATCH_COUNTS = [1, 2, 3, 4, 5, 6];

export const ProductRefinePage: React.FC = () => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getAvailableModels(['seedream']).then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) setSelectedModel(sorted[0].model_id);
    });
  }, []);
  const [productFiles, setProductFiles] = useState<{ file: File; preview: string }[]>([]);
  const [aspectRatio, setAspectRatio] = useState('自动');
  const [quality, setQuality] = useState('2K');
  const [batchCount, setBatchCount] = useState(1);
  const [selectedModel, setSelectedModel] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    const oversized = files.find(f => f.size > MAX_FILE_SIZE);
    if (oversized) {
      alert(`图片"${oversized.name}"超过 20MB，请压缩后重新上传`);
      e.target.value = '';
      return;
    }

    const availableSlots = 10 - productFiles.length;
    if (availableSlots <= 0) {
      alert('最多只能上传10张图片');
      return;
    }

    const filesToAdd = files.slice(0, availableSlots);
    const newItems = filesToAdd.map(f => ({ file: f, preview: '' }));

    Promise.all(newItems.map(item => new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => { item.preview = reader.result as string; resolve(); };
      reader.onerror = reject;
      reader.readAsDataURL(item.file);
    }))).then(() => {
      setProductFiles(prev => [...prev, ...newItems].slice(0, 10));
    }).catch(err => {
      console.error('图片处理失败:', err);
      alert('部分图片处理失败，请尝试使用更小的图片');
    });

    e.target.value = '';
  };

  const removeProduct = (index: number) => {
    setProductFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!requireAuth()) return;
    if (productFiles.length === 0) return;

    // 第一步：Gemini 分析产品
    setIsAnalyzing(true);
    setIsProcessing(true);
    setUploadProgress('正在分析产品...');
    try {
      const productUrls = await Promise.all(productFiles.map(item => fileToDataUrl(item.file, 1536)));
      const productAnalyses: string[] = [];

      for (let i = 0; i < productUrls.length; i++) {
        setUploadProgress(`正在分析产品 ${i + 1}/${productUrls.length}...`);
        try {
          const analysis = await analyzeImage(
            productUrls[i],
            '分析这张产品图片，用一句话描述它是什么产品（如：一款银色金属表盘的简约手表、一副黑色无线蓝牙耳机）。直接返回产品描述，不要其他内容。',
            { model: 'gemini-3.5-flash', maxTokens: 300 }
          );
          productAnalyses.push(analysis.trim());
        } catch {
          productAnalyses.push('产品');
        }
      }

      // 第二步：生成精修图
      setIsAnalyzing(false);
      imageLibraryService.clearSavedUrlsCache();

      const totalCount = productFiles.length * batchCount;
      let currentIndex = 0;

      for (let p = 0; p < productUrls.length; p++) {
        const productDesc = productAnalyses[p] || '产品';
        for (let b = 0; b < batchCount; b++) {
          currentIndex++;
          setUploadProgress(`正在精修 ${currentIndex}/${totalCount}`);
          try {
            const refinePrompt = `产品精修图：${productDesc}。纯白色背景，产品居中展示，产品细节清晰锐利，边缘干净，添加柔和自然的投影，产品表面质感真实，光影过渡细腻，商业产品摄影级别，高分辨率，无任何文字标签，极简干净`;
            const response = await editImage({ prompt: refinePrompt, images: [productUrls[p]], aspectRatio: aspectRatio === '自动' ? '1:1' : aspectRatio, resolution: quality, model: selectedModel });
            if (response.data?.[0]?.url) {
              const finalUrl = response.data[0].url;
              imageLibraryService.saveToLibrary({ image_url: finalUrl, prompt: `产品精修 - ${productDesc}`, model: selectedModel, aspect_ratio: aspectRatio, resolution: quality, type: 'edited' }).catch(e => console.error('保存到图库失败:', e));
              setResults(prev => [finalUrl, ...prev]);
            }
          } catch {}
        }
      }
      setProductFiles([]);
    } catch (error: any) { console.error('生成失败:', error); }
    finally { setIsAnalyzing(false); setIsProcessing(false); setUploadProgress(''); }
  };

  const handleDownload = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = blobUrl; a.download = `refine-${Date.now()}.png`; a.click();
      URL.revokeObjectURL(blobUrl);
    } catch { window.open(url, '_blank'); }
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-14 border-b border-[#E5E5E5] flex-shrink-0 bg-[#F7F7F7]">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center">
          <Sparkles size={16} className="text-white" />
        </div>
        <h1 className="text-base font-semibold text-[#171717]">产品精修</h1>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Settings */}
        <div className="w-[380px] border-r border-[#E5E5E5] overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-[#FAFAFA]">
          {/* Product Upload */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <ImageIcon size={16} className="text-blue-500" />
              <div>
                <h3 className="text-sm font-semibold text-[#171717]">产品图片</h3>
                <p className="text-xs text-[#A3A3A3]">1-10张</p>
              </div>
              <span className="ml-auto text-xs text-[#A3A3A3] bg-[#F5F5F5] px-2 py-1 rounded-xl">{productFiles.length}/10</span>
            </div>
            {productFiles.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mb-3">
                {productFiles.map((item, index) => (
                  <div key={index} className="relative group aspect-square rounded-2xl overflow-hidden bg-[#F5F5F5]">
                    <img src={item.preview} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeProduct(index)} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100"><X size={12} className="text-white" /></button>
                  </div>
                ))}
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple accept="image/*" className="hidden" />
            <div onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA]  p-4 flex flex-col items-center justify-center gap-1.5 hover:border-[#171717]/30 hover:bg-[#F5F5F5] transition-all cursor-pointer bg-white">
              <Plus size={20} className="text-[#A3A3A3]" /> <span className="text-xs text-[#A3A3A3]">点击上传产品图片</span>
              <span className="text-[11px] text-[#BDBDBD]">支持上传多张产品图</span>
            </div>
          </div>

          {/* Settings */}
          <div className="bg-white rounded-2xl p-5 border border-[#E5E5E5] shadow-sm">
            <h3 className="text-sm font-semibold text-[#171717] mb-4">生成设置</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-[#A3A3A3] mb-1.5 block">图片比例</label>
                <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full bg-[#F5F5F5] px-4 py-3 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-[#171717]/10 appearance-none cursor-pointer">
                  {RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#A3A3A3] mb-1.5 block">图片质量</label>
                <div className="flex gap-2">
                  {QUALITIES.map(q => (
                    <button key={q} onClick={() => setQuality(q)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${quality === q ? 'bg-blue-500 text-white' : 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'}`}>{q}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[#A3A3A3] mb-1.5 block">批量数量</label>
                <select value={batchCount} onChange={(e) => setBatchCount(Number(e.target.value))}
                  className="w-full bg-[#F5F5F5] px-4 py-3 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-[#171717]/10 appearance-none cursor-pointer">
                  {BATCH_COUNTS.map(c => <option key={c} value={c}>{c}张</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#A3A3A3] mb-1.5 block">选择模型</label>
                <div className="relative">
                  <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full bg-[#F5F5F5] px-4 py-3 pr-8 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-[#171717]/10 appearance-none cursor-pointer">
                    {models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                <ModelSpeedNote />
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <button onClick={handleGenerate} disabled={productFiles.length === 0 || isProcessing}
            className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-[#E5E5E5] disabled:text-[#A3A3A3] disabled:cursor-not-allowed shadow-sm">
            {isProcessing ? <><Loader2 size={18} className="animate-spin" /> {uploadProgress}</> : <><Sparkles size={18} /> 开始精修</>}
          </button>
        </div>

        {/* Right: Results - 实时显示，出一张显示一张 */}
        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
          {!isProcessing && !isAnalyzing && results.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-xs px-6">
                <div className="w-20 h-20 mx-auto mb-5 bg-[#F5F5F5] rounded-2xl flex items-center justify-center">
                  <Sparkles size={32} className="text-[#D4D4D4]" />
                </div>
                <h2 className="text-lg font-semibold text-[#171717] mb-2">产品精修</h2>
                <p className="text-sm text-[#A3A3A3] mb-4 leading-relaxed">上传产品图片，AI自动识别产品并生成精修图</p>
                <div className="text-left bg-[#FAFAFA] rounded-2xl p-4 space-y-2">
                  <p className="text-xs text-[#737373] leading-relaxed">纯白背景 · 产品居中展示 · 柔和自然投影</p>
                  <p className="text-xs text-[#A3A3A3]">Gemini分析产品特征，生成商业级精修效果</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6">
              {/* 分析中的进度指示 */}
              {isAnalyzing && results.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-full blur-3xl animate-pulse" />
                    <div className="relative w-24 h-24 rounded-full border-4 border-[#E5E5E5] border-t-emerald-500 border-r-teal-400 animate-spin" />
                  </div>
                  <div className="flex flex-col items-center gap-2 mb-6">
                    <h3 className="text-lg font-semibold text-[#171717]">Gemini 正在分析产品</h3>
                    <p className="text-sm text-[#A3A3A3]">{uploadProgress || '识别产品特征并生成精修方案...'}</p>
                  </div>
                  {productFiles.length > 0 && (
                    <div className="flex items-center gap-3">
                      {productFiles.map((item, idx) => (
                        <div key={idx} className="relative">
                          <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-emerald-400/50 shadow-lg shadow-emerald-500/10 animate-pulse">
                            <img src={item.preview} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                            <Loader2 size={10} className="text-white animate-spin" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1.5 mt-6">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-emerald-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              {/* 生成中的进度指示（还没有结果时） */}
              {isProcessing && !isAnalyzing && results.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-full blur-3xl animate-pulse" />
                    <div className="relative w-24 h-24 rounded-full border-4 border-[#E5E5E5] border-t-amber-500 border-r-orange-400 animate-spin" />
                  </div>
                  <div className="flex flex-col items-center gap-2 mb-6">
                    <h3 className="text-lg font-semibold text-[#171717]">正在生成精修图</h3>
                    <p className="text-sm text-[#A3A3A3]">{uploadProgress || 'AI 精修引擎全力运行中...'}</p>
                  </div>
                  <div className="w-48 h-2 bg-[#F5F5F5] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                  </div>
                  <div className="flex gap-1.5 mt-6">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-amber-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              {/* 精修结果 - 出图即显示 */}
              {results.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-[#171717]">
                      精修结果 ({results.length})
                      {isProcessing && <span className="text-xs text-[#A3A3A3] font-normal ml-2">生成中...</span>}
                    </h2>
                    {isProcessing && (
                      <div className="flex items-center gap-2 text-xs text-[#A3A3A3] bg-[#F5F5F5] rounded-xl px-3 py-1.5">
                        <Loader2 size={12} className="animate-spin text-amber-500" />
                        {uploadProgress}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                    {results.map((url, idx) => (
                      <div key={idx} className="group relative bg-[#FAFAFA] rounded-2xl overflow-hidden border border-[#E5E5E5]">
                        <div className="aspect-square cursor-pointer" onClick={() => setPreviewImage(url)}>
                          <img src={url} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-[#525252]">精修 #{idx + 1}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setPreviewImage(url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-[#A3A3A3] hover:bg-[#F0F0F0] hover:text-[#171717] transition-colors" title="预览"><Eye size={14} /></button>
                            <button onClick={() => setReEditImage(url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-[#A3A3A3] hover:bg-[#F0F0F0] hover:text-[#171717] transition-colors" title="微调"><Wand2 size={14} /></button>
                            <button onClick={() => handleDownload(url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-[#A3A3A3] hover:bg-[#F0F0F0] hover:text-[#171717] transition-colors flex-shrink-0" title="下载"><Download size={14} /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {previewImage && (
          <ImagePreviewModal
            isOpen={!!previewImage}
            onClose={() => setPreviewImage(null)}
            imageUrl={previewImage}
          />
        )}
        {reEditImage && (
          <ReEditModal
            isOpen={!!reEditImage}
            imageUrl={reEditImage}
            aspectRatio={aspectRatio === '自动' ? '1:1' : aspectRatio}
            model={selectedModel}
            resolution={quality}
            onClose={() => setReEditImage(null)}
            onReplaced={(oldUrl, newUrl) => setResults(prev => prev.map(item => item === oldUrl ? newUrl : item))}
          />
        )}
      </div>
    </div>
  );
};

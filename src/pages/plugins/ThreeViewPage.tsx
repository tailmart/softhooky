import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, Layout, Images, Download, Wand2, ChevronDown } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { analyzeImage } from '../../services/aiChatService';
import { requireAuth } from '../../utils/authCheck';
import { getAvailableModels } from '../../services/modelService';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import { ModelSpeedNote } from '../../components/ModelSpeedNote';
import { LANGUAGES, getSavedLanguage, saveLanguage } from '../../constants/languages';

export const ThreeViewPage: React.FC = () => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getAvailableModels().then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) setSelectedModel(sorted[0].model_id);
    });
  }, []);
  const [uploadedImages, setUploadedImages] = useState<{ file: File; preview: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [language, setLanguage] = useState(getSavedLanguage());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [quality, setQuality] = useState('2K');
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<{ url: string; idx: number }[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
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
      setUploadedImages(prev => [...prev, ...newItems].slice(0, 3));
    }).catch(err => {
      console.error('图片处理失败:', err);
      alert('部分图片处理失败，请尝试使用更小的图片');
    });
  };

  const removeImage = (idx: number) => setUploadedImages(prev => prev.filter((_, i) => i !== idx));

  const handleGenerate = async () => {
    if (!requireAuth()) return;
    if (uploadedImages.length === 0) { alert('请上传图片'); return; }
    setIsAnalyzing(true);
    setIsProcessing(true);
    setResults([]);
    try {
      setProgress('正在分析图片...');
      const allImageUrls = await Promise.all(
        uploadedImages.map(img => fileToDataUrl(img.file, 1536))
      );

      // Gemini 分析：判断是人物还是产品
      let hasPerson = false;
      try {
        const analysis = await analyzeImage(
          allImageUrls[0],
          '分析这张图片中的主体是人还是产品。如果图中有人物（真人、模特、人物形象）或者该产品适合被人佩戴穿戴（如手表、首饰、耳机、眼镜、帽子等），返回"person"。如果只是普通产品，返回"product"。只返回一个词。',
          { model: 'gemini-3.5-flash', maxTokens: 50 }
        );
        hasPerson = analysis.trim().toLowerCase().includes('person');
      } catch {}

      const viewCount = uploadedImages.length;
      const hint = viewCount === 1 ? '（用户提供：正面）请AI生成侧面和背面'
        : viewCount === 2 ? '（用户提供：正面+侧面/背面）请AI补全第三个视图'
        : '（用户提供：正面+侧面+背面）请参考用户图片直接合成';

      const personPrompt = hasPerson
        ? `三视图展示，16:9横版比例，白色背景。画面分为三个区域左中右排列展示同一人物的正面、侧面、背面三视图，各标注"正面""侧面""背面"文字标签。

${hint}

要求：
- 【重要】三个视图必须完全保持一致性：面部特征（五官形状、位置、脸型）、发型（长度、颜色、纹理）、服装（款式、颜色、材质、图案）、配饰、体型、姿态必须三视图完全统一，仅视角旋转不同，不能有任何变化或差异
- 【重要】侧面图人物不能偷换，背面图不能换人，三张必须是同一个人同套衣服同个造型
- 人物真实自然，真实人像照片质感，皮肤纹理细节清晰可见（毛孔、肤质），无AI感、无塑料假面、无过度磨皮、无对称假脸
- 自然柔和光线，人物清晰高清，边缘锐利，无变形
- 无多余文字、无水印`
        : `三视图展示，16:9横版比例，白色背景。画面分为三个区域左中右排列展示同一产品的正面、侧面、背面三视图，各标注"正面""侧面""背面"文字标签。

${hint}

要求：
- 【重要】三个视图必须完全保持一致性：造型、颜色、材质、纹理、细节、标志、尺寸比例必须三视图完全统一，仅视角旋转不同，不能有任何变化或差异
- 【重要】侧面图不能改变产品外观，背面图不能换产品，三张必须是同一个产品同个角度旋转
- 专业摄影打光，产品清晰高清，边缘锐利，无变形
- 纯白色背景，产品居中，柔和投影
- 无多余文字、无水印`;

      setIsAnalyzing(false);
      setProgress('生成中...');
      try {
        const resp = await editImage({ prompt: personPrompt, images: allImageUrls, aspectRatio: '16:9', resolution: quality, model: selectedModel });
        const imgUrl = resp.data?.[0]?.url || resp.image_url || resp.url || '';
        if (imgUrl) {
          setResults([{ url: imgUrl, idx: 1 }]);
          imageLibraryService.saveToLibrary({ image_url: imgUrl, prompt: personPrompt, model: String(selectedModel || 'nanobann2'), aspect_ratio: String('16:9'), resolution: String(quality || '2K'), type: 'edited' });
        }
      } catch {}
    } catch (err: any) { console.error('生成失败:', err); }
    finally { setIsAnalyzing(false); setIsProcessing(false); setProgress(''); }
  };

  const handleDownload = async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `threeview-${Date.now()}.png`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-gray-200 flex-shrink-0 bg-gray-50">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center"><Layout size={16} className="text-white" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[#171717]">三视图生成</h1>
          <p className="text-[10px] text-gray-400 leading-tight">上传产品/人物图 → 生成正面+侧面+背面三视图</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[380px] border-r border-gray-200 overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-gray-50">
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Images size={16} className="text-blue-500" />
              <div><h3 className="text-sm font-semibold text-[#171717]">上传图片</h3><p className="text-xs text-gray-400">最多3张：正面、侧面、背面各一张</p></div>
              <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-xl">{uploadedImages.length}/3</span>
            </div>
            {uploadedImages.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mb-3">{uploadedImages.map((item, idx) => (
                <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden bg-gray-100">
                  <img src={item.preview} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removeImage(idx)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100"><X size={14} className="text-white" /></button>
                </div>
              ))}</div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleUpload} multiple accept="image/*" className="hidden" />
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA] p-3 flex flex-col items-center justify-center gap-1 hover:border-gray-400 hover:bg-gray-50 transition-all cursor-pointer bg-[#FAFAFA]">
              <Plus size={18} className="text-gray-400" /><span className="text-xs text-gray-400">上传图片</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3"><Sparkles size={14} className="text-blue-500" /><span className="text-sm font-semibold text-[#171717]">模型</span></div>
            <div className="relative">
              <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                className="w-full bg-gray-100 px-3 py-2.5 pr-8 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer">
                {models.length > 0 ? models.map(m => <option key={m.value} value={m.value}>{m.label}</option>) : <option value="nanobann2">Nanobann2</option>}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <ModelSpeedNote />
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

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">语言</span>
            </div>
            <select value={language} onChange={(e) => { setLanguage(e.target.value); saveLanguage(e.target.value); }}
              className="w-full bg-gray-100 px-3 py-2.5 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer">
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          {!isProcessing && (
            <button onClick={handleGenerate} disabled={uploadedImages.length === 0}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-gray-200 disabled:text-gray-400 shadow-sm">
              <Wand2 size={18} /> 生成三视图
            </button>
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
          {!isProcessing && results.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 mx-auto mb-5 bg-gray-100 rounded-2xl flex items-center justify-center"><Layout size={32} className="text-gray-300" /></div>
                <h2 className="text-lg font-semibold text-[#171717] mb-2">三视图生成</h2>
                <p className="text-sm text-gray-400 leading-relaxed">上传产品图或人物图 → 一键生成正面+侧面+背面三视图</p>
              </div>
            </div>
          ) : (
            <div className="p-6">
              {/* 分析/生成中的进度指示 */}
              {isProcessing && results.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-full blur-3xl animate-pulse" />
                    <div className="relative w-24 h-24 rounded-full border-4 border-[#E5E5E5] border-t-blue-500 border-r-blue-400 animate-spin" />
                  </div>
                  <div className="flex flex-col items-center gap-2 mb-6">
                    <h3 className="text-lg font-semibold text-[#171717]">AI 正在处理</h3>
                    <p className="text-sm text-[#A3A3A3]">{progress || (isAnalyzing ? '识别图片主体...' : '正在生成三视图...')}</p>
                  </div>
                  <div className="flex gap-1.5 mt-6">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              {/* 生成结果 - 出图即显示 */}
              {results.length > 0 && (
                <div>
                  {isProcessing && results.length > 0 && (
                    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
                      <Loader2 size={14} className="animate-spin text-blue-500" />
                      <span className="text-sm text-[#A3A3A3]">{progress}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    {results.map((item, idx) => (
                      <div key={idx} className="group relative bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
                        <div className="cursor-pointer aspect-[16/9]" onClick={() => setPreviewImage(item.url)}><img src={item.url} alt="" className="w-full h-full object-cover" /></div>
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-600">三视图合成</span>
                          <div className="flex gap-1">
                            <button onClick={() => setReEditImage(item.url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#171717]"><Wand2 size={14} /></button>
                            <button onClick={() => handleDownload(item.url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#171717]"><Download size={14} /></button>

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
        aspectRatio="16:9"
        model={selectedModel}
        resolution={quality}
        onClose={() => setReEditImage(null)}
        onReplaced={(oldUrl, newUrl) => setResults(prev => prev.map(item => item.url === oldUrl ? {...item, url: newUrl} : item))}
      />
    </div>
  );
};

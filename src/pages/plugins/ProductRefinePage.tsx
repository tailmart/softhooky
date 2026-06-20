import React, { useState, useRef } from 'react';
import { Sparkles, Loader2, Layers } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { analyzeImage } from '../../services/aiChatService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { requireAuth } from '../../utils/authCheck';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import { LoadingAnimation } from '../../components/LoadingAnimation';
import { EcommerceImageUpload, EcommerceSettings, EcommerceResults } from '../../components/ecommerce';
import { LANGUAGES, getSavedLanguage, saveLanguage } from '../../constants/languages';

const RATIOS = [
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
];

export const ProductRefinePage: React.FC = () => {
  const [productImages, setProductImages] = useState<{ file: File; preview: string }[]>([]);
  const [language, setLanguage] = useState(getSavedLanguage());
  const [selectedModel, setSelectedModel] = useState('');
  const [quality, setQuality] = useState('2K');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [batchCount, setBatchCount] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [results, setResults] = useState<{ url: string; label: string }[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!requireAuth()) return;
    if (productImages.length === 0) return;

    setIsAnalyzing(true);
    setIsProcessing(true);
    setUploadProgress('正在分析产品...');

    try {
      const productUrls = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1536)));
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

      setIsAnalyzing(false);
      imageLibraryService.clearSavedUrlsCache();

      const totalCount = productImages.length * batchCount;
      let currentIndex = 0;

      for (let p = 0; p < productUrls.length; p++) {
        const productDesc = productAnalyses[p] || '产品';
        for (let b = 0; b < batchCount; b++) {
          currentIndex++;
          setUploadProgress(`正在精修 ${currentIndex}/${totalCount}`);
          try {
            const refinePrompt = `产品精修图：${productDesc}。纯白色背景，产品居中展示，产品细节清晰锐利，边缘干净，添加柔和自然的投影，产品表面质感真实，光影过渡细腻，商业产品摄影级别，高分辨率，无任何文字标签，极简干净`;
            const response = await editImage({ prompt: refinePrompt, images: [productUrls[p]], aspectRatio, resolution: quality, model: selectedModel, type: 'edited' });
            if (response.data?.[0]?.url) {
              const finalUrl = response.data[0].url;
              setResults(prev => [{ url: finalUrl, label: `精修 #${prev.length + 1}` }, ...prev]);
              imageLibraryService.saveToLibrary({ image_url: finalUrl, prompt: refinePrompt, model: String(selectedModel || 'nanobann2'), aspect_ratio: aspectRatio, resolution: String(quality || '2K'), type: 'edited' });
            }
          } catch {}
        }
      }
      setProductImages([]);
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
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[#171717]">产品精修</h1>
          <p className="text-[10px] text-[#A3A3A3] leading-tight">上传产品图 → AI分析 → 生成商业级精修图</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Settings */}
        <div className="w-[380px] border-r border-[#E5E5E5] overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-[#FAFAFA]">
          {/* Product Upload */}
          <EcommerceImageUpload
            images={productImages}
            onImagesChange={setProductImages}
            title="产品图片"
            subtitle="1-10张，支持批量上传"
            icon="image"
          />

          {/* Settings */}
          <EcommerceSettings
            language={language}
            onLanguageChange={(lang) => { setLanguage(lang); saveLanguage(lang); }}
            languages={LANGUAGES}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            quality={quality}
            onQualityChange={setQuality}
            aspectRatios={RATIOS}
            singleRatio={aspectRatio}
            onSingleRatioChange={setAspectRatio}
            batchCount={batchCount}
            onBatchCountChange={setBatchCount}
            showBatchCount={true}
            languageLabel="语言"
            modelLabel="模型"
            qualityLabel="分辨率"
            ratioLabel="图片比例"
            batchLabel="批量数量"
          />

          {/* Generate Button */}
          <button onClick={handleGenerate} disabled={productImages.length === 0 || isProcessing}
            className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-[#E5E5E5] disabled:text-[#A3A3A3] disabled:cursor-not-allowed shadow-sm">
            {isProcessing ? <><Loader2 size={18} className="animate-spin" /> {uploadProgress}</> : <><Sparkles size={18} /> 开始精修</>}
          </button>
        </div>

        {/* Right: Results */}
        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
          {!isProcessing && !isAnalyzing && results.length === 0 ? (
            <EcommerceResults
              results={[]}
              onPreview={() => {}}
              onDownload={() => {}}
              emptyTitle="产品精修"
              emptyDescription="上传产品图片，AI自动识别产品并生成商业级精修图"
            />
          ) : (
            <div className="p-6">
              {/* 分析中 */}
              {isAnalyzing && results.length === 0 && (
                <LoadingAnimation
                  title="Gemini 正在分析产品"
                  description={uploadProgress || '识别产品特征并生成精修方案...'}
                  thumbnails={productImages.map(item => item.preview)}
                  variant="featured"
                />
              )}
              {/* 生成中 */}
              {isProcessing && !isAnalyzing && results.length === 0 && (
                <LoadingAnimation
                  title="正在生成精修图"
                  description={uploadProgress || 'AI 精修引擎全力运行中...'}
                  variant="featured"
                />
              )}
              {/* 结果 */}
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
                  <EcommerceResults
                    results={results}
                    onPreview={setPreviewImage}
                    onReEdit={setReEditImage}
                    onDownload={handleDownload}
                    aspectRatio={aspectRatio.replace(':', '/')}
                  />
                </>
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
        onReplaced={(oldUrl, newUrl) => setResults(prev => prev.map(item => item.url === oldUrl ? { ...item, url: newUrl } : item))}
      />
    </div>
  );
};

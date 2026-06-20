import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, Layers, Zap, Check } from 'lucide-react';
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
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
];

const DEFAULT_SCENES = ['简约纯色背景', '室内摄影棚', '户外场景', '街头场景', '咖啡厅', '森林背景'];

export const ProductFusionPage: React.FC = () => {
  const [productImages, setProductImages] = useState<{ file: File; preview: string }[]>([]);
  const [productScenes, setProductScenes] = useState<{ recommended: string[]; selected: string[]; productDesc?: string; posterEnabled?: boolean; posterTitle?: string; posterDesc?: string }[]>([]);
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

  const toggleScene = (productIndex: number, scene: string) => {
    setProductScenes(prev => {
      const updated = [...prev];
      if (!updated[productIndex]) return prev;
      const entry = { ...updated[productIndex] };
      if (entry.selected.includes(scene)) {
        entry.selected = entry.selected.filter(s => s !== scene);
      } else {
        entry.selected = [...entry.selected, scene];
      }
      updated[productIndex] = entry;
      return updated;
    });
  };

  const handleImagesChange = (images: { file: File; preview: string }[]) => {
    setProductImages(images);
    setProductScenes(prev => {
      const newScenes = [...prev];
      while (newScenes.length < images.length) {
        newScenes.push({ recommended: [], selected: [] });
      }
      return newScenes.slice(0, images.length);
    });
  };

  const handleAnalyze = async () => {
    if (!requireAuth()) return;
    if (productImages.length === 0) return;
    setIsAnalyzing(true);
    setUploadProgress('正在分析产品...');
    try {
      const newProductScenes = [...productScenes];

      for (let i = 0; i < productImages.length; i++) {
        setUploadProgress(`正在分析产品 ${i + 1}/${productImages.length}...`);
        try {
          const productUrl = await fileToDataUrl(productImages[i].file, 1024);
          const analysisPrompt = `请分析这张产品图片。

第一步：用一句话描述这个产品是什么，包括产品类型、颜色、材质、风格等关键特征（15字以内）。
第二步：推荐6个最适合该产品的融合场景。
- 如果是可穿戴产品，场景可以是穿搭展示、场景搭配等
- 如果是其他产品，场景可以是室内摄影棚、户外场景、街头场景等
- 所有场景名称用中文，每个场景控制在6个字以内

返回JSON格式（不要额外文字）：
{
  "productDesc": "产品一句话描述（包括类型、颜色等关键特征）",
  "scenes": ["场景1","场景2","场景3","场景4","场景5","场景6"]
}`;

          const response = await analyzeImage(productUrl, analysisPrompt, { maxTokens: 1500 });
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const scenes = (parsed.scenes && parsed.scenes.length >= 3) ? parsed.scenes : DEFAULT_SCENES;
            const productDesc = parsed.productDesc || '';
            newProductScenes[i] = { recommended: scenes, selected: [], productDesc };
          } else {
            newProductScenes[i] = { recommended: DEFAULT_SCENES, selected: [] };
          }
        } catch {
          newProductScenes[i] = { recommended: DEFAULT_SCENES, selected: [] };
        }
      }

      setProductScenes(newProductScenes);
    } catch (error) { console.error('分析失败:', error); }
    finally { setIsAnalyzing(false); setUploadProgress(''); }
  };

  const handleGenerate = async () => {
    if (!requireAuth()) return;
    if (productImages.length === 0) return;
    const hasSelection = productScenes.some(s => s.selected.length > 0);
    if (!hasSelection) { alert('请至少选择一个场景'); return; }
    setIsProcessing(true);
    setUploadProgress('');
    try {
      const productUrls = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1536)));
      imageLibraryService.clearSavedUrlsCache();

      const totalCount = productScenes.reduce((sum, s) => sum + s.selected.length * batchCount, 0);
      let currentIndex = 0;

      for (let p = 0; p < productUrls.length; p++) {
        const ps = productScenes[p];
        const scenes = ps?.selected || [];

        for (const scene of scenes) {
          for (let b = 0; b < batchCount; b++) {
            currentIndex++;
            setUploadProgress(`${currentIndex}/${totalCount} 生成中 ${p + 1} ${scene}`);
            try {
              const productDesc = ps?.productDesc ? `${ps.productDesc}，` : '';
              const isSolidBg = scene.includes('纯色背景') || scene.includes('简约背景') || scene.includes('简约纯色');
              const productConsistency = '**产品图片必须严格保持不变**：产品造型、颜色、材质、纹理、尺寸比例、文字图案完全不变，仅更换场景/背景，产品本身不能有任何变形或变化';
              
              let scenePrompt: string;
              if (isSolidBg) {
                scenePrompt = `${productDesc}该产品放在纯白色/浅灰色干净背景上居中展示，产品完整清晰细节纹理可见，自然均匀布光，商业产品摄影，高分辨率。${productConsistency}`;
              } else {
                scenePrompt = `将${productDesc}产品图融入${scene}场景中，保持产品完整清晰细节可见，产品主色100%保留，高品质商业摄影，精准边缘识别，避免摩尔纹。${productConsistency}`;
              }
              
              const response = await editImage({ prompt: scenePrompt, images: [productUrls[p]], aspectRatio, resolution: quality, model: selectedModel, type: 'edited' });
              if (response.data?.[0]?.url) {
                const finalUrl = response.data[0].url;
                setResults(prev => [{ url: finalUrl, label: `融合 #${prev.length + 1} ${scene}` }, ...prev]);
                imageLibraryService.saveToLibrary({ image_url: finalUrl, prompt: scenePrompt, model: String(selectedModel || 'nanobann2'), aspect_ratio: aspectRatio, resolution: String(quality || '2K'), type: 'edited' });
              }
            } catch {}
          }
        }
      }
      setProductImages([]); setProductScenes([]);
    } catch (error: any) { console.error('生成失败:', error); }
    finally { setIsProcessing(false); setUploadProgress(''); }
  };

  const handleDownload = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = blobUrl; a.download = `fusion-${Date.now()}.png`; a.click();
      URL.revokeObjectURL(blobUrl);
    } catch { window.open(url, '_blank'); }
  };

  const hasSelectedScenes = productScenes.some(s => s.selected.length > 0);

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-14 border-b border-[#E5E5E5] flex-shrink-0 bg-[#F7F7F7]">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center">
          <Layers size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[#171717]">场景融合</h1>
          <p className="text-[10px] text-[#A3A3A3] leading-tight">上传产品图 → AI分析 → 选择场景 → 生成融合图</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Settings */}
        <div className="w-[380px] border-r border-[#E5E5E5] overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-[#FAFAFA]">
          {/* Product Upload */}
          <EcommerceImageUpload
            images={productImages}
            onImagesChange={handleImagesChange}
            title="产品图片"
            subtitle="1-10张，支持批量上传"
          />

          {/* AI Analyze */}
          <button onClick={handleAnalyze} disabled={productImages.length === 0 || isAnalyzing || isProcessing}
            className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-[#E5E5E5] disabled:text-[#A3A3A3] disabled:cursor-not-allowed shadow-sm">
            {isAnalyzing ? <><Loader2 size={16} className="animate-spin" /> {uploadProgress}</> : <><Zap size={16} /> AI智能分析场景</>}
          </button>

          {/* Per-Product Scene Selection */}
          {productScenes.some(s => s.recommended.length > 0) && (
            productScenes.map((ps, idx) => (
              productImages[idx] ? (
                <div key={idx} className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-xl overflow-hidden bg-[#F5F5F5] flex-shrink-0">
                      <img src={productImages[idx].preview} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-[#171717] block">产品{idx + 1}</span>
                      <span className="text-xs text-[#A3A3A3]">已选{ps.selected.length}/{ps.recommended.length + 1}个场景</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(() => {
                      const solidScene = '简约纯色背景';
                      const allScenes = [solidScene, ...ps.recommended.filter(s => s !== solidScene)];
                      return allScenes.map(scene => (
                        <button key={scene} onClick={() => toggleScene(idx, scene)}
                          className={`p-2.5 rounded-xl border text-left text-sm font-medium transition-all ${
                            ps.selected.includes(scene) ? 'border-blue-500 bg-blue-500 text-white' : 'border-[#E5E5E5] text-[#737373] hover:border-[#D4D4D4] bg-white'
                          }`}>
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${ps.selected.includes(scene) ? 'border-white bg-white' : 'border-[#D4D4D4]'}`}>
                              {ps.selected.includes(scene) && <Check size={10} className="text-blue-500" />}
                            </div>
                            <span className={scene === solidScene ? 'text-blue-600 font-semibold' : ''}>{scene}</span>
                          </div>
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              ) : null
            ))
          )}

          {/* Settings */}
          {hasSelectedScenes && (
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
            />
          )}

          {/* Generate Button */}
          {hasSelectedScenes && (
            <button onClick={handleGenerate} disabled={isProcessing}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-[#E5E5E5] disabled:text-[#A3A3A3] disabled:cursor-not-allowed shadow-sm">
              {isProcessing ? <><Loader2 size={18} className="animate-spin" /> {uploadProgress}</> : <><Sparkles size={18} /> 开始生成</>}
            </button>
          )}
        </div>

        {/* Right: Results */}
        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
          {!isProcessing && !isAnalyzing && results.length === 0 ? (
            <div className="flex-1 flex items-center justify-center overflow-y-auto px-6">
              <div className="max-w-sm text-center py-8">
                <div className="w-16 h-16 mx-auto mb-5 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-2xl flex items-center justify-center border border-blue-100">
                  <Layers size={28} className="text-blue-500" />
                </div>
                <h2 className="text-xl font-bold text-[#171717] mb-2">场景融合</h2>
                <p className="text-sm text-[#A3A3A3] mb-6">上传产品图片，左侧选择场景，一键生成专业产品视觉</p>
                <div className="mt-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-4 border border-blue-100">
                  <p className="text-xs text-[#737373] leading-relaxed">
                    💡 左侧上传产品图 → 点击 <strong>AI智能分析场景</strong> → 选择场景 → 点击 <strong>开始生成</strong> 即可出图
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6">
              {/* 分析中 */}
              {isAnalyzing && results.length === 0 && (
                <LoadingAnimation
                  title="AI 正在分析产品"
                  description={uploadProgress || '识别产品类型并推荐融合场景...'}
                  thumbnails={productImages.map(item => item.preview)}
                  variant="featured"
                />
              )}
              {/* 生成中 */}
              {isProcessing && !isAnalyzing && results.length === 0 && (
                <LoadingAnimation
                  title="正在生成融合图"
                  description={uploadProgress || 'AI 视觉引擎全力运行中...'}
                  variant="featured"
                />
              )}
              {/* 结果 */}
              {results.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-[#171717]">
                      融合结果 ({results.length})
                      {isProcessing && <span className="text-xs text-[#A3A3A3] font-normal ml-2">生成中...</span>}
                    </h2>
                    {isProcessing && (
                      <div className="flex items-center gap-2 text-xs text-[#A3A3A3] bg-[#F5F5F5] rounded-xl px-3 py-1.5">
                        <Loader2 size={12} className="animate-spin text-violet-500" />
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

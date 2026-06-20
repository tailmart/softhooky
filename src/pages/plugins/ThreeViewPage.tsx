import React, { useState } from 'react';
import { Layout, Loader2, Wand2 } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { analyzeImage } from '../../services/aiChatService';
import { requireAuth } from '../../utils/authCheck';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import { LoadingAnimation } from '../../components/LoadingAnimation';
import { EcommerceImageUpload, EcommerceSettings, EcommerceResults } from '../../components/ecommerce';
import { LANGUAGES, getSavedLanguage, saveLanguage } from '../../constants/languages';

export const ThreeViewPage: React.FC = () => {
  const [uploadedImages, setUploadedImages] = useState<{ file: File; preview: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [language, setLanguage] = useState(getSavedLanguage());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [quality, setQuality] = useState('2K');
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<{ url: string; label: string }[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);

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
        const resp = await editImage({ prompt: personPrompt, images: allImageUrls, aspectRatio: '16:9', resolution: quality, model: selectedModel, type: 'edited' });
        const imgUrl = resp.data?.[0]?.url || resp.image_url || resp.url || '';
        if (imgUrl) {
          setResults([{ url: imgUrl, label: '三视图合成' }]);
          imageLibraryService.saveToLibrary({ image_url: imgUrl, prompt: personPrompt, model: String(selectedModel || 'nanobann2'), aspect_ratio: '16:9', resolution: String(quality || '2K'), type: 'edited' });
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
          {/* 上传图片 */}
          <EcommerceImageUpload
            images={uploadedImages}
            onImagesChange={setUploadedImages}
            maxImages={3}
            title="上传图片"
            subtitle="最多3张：正面、侧面、背面各一张"
          />

          {/* 设置 */}
          <EcommerceSettings
            language={language}
            onLanguageChange={(lang) => { setLanguage(lang); saveLanguage(lang); }}
            languages={LANGUAGES}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            quality={quality}
            onQualityChange={setQuality}
          />

          {/* 生成按钮 */}
          {!isProcessing && (
            <button onClick={handleGenerate} disabled={uploadedImages.length === 0}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-gray-200 disabled:text-gray-400 shadow-sm">
              <Wand2 size={18} /> 生成三视图
            </button>
          )}
        </div>

        {/* 右侧：结果 */}
        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
          {!isProcessing && results.length === 0 ? (
            <EcommerceResults
              results={[]}
              onPreview={() => {}}
              onDownload={() => {}}
              emptyTitle="三视图生成"
              emptyDescription="上传产品图或人物图 → 一键生成正面+侧面+背面三视图"
            />
          ) : (
            <div className="p-6">
              {/* 加载中 */}
              {isProcessing && results.length === 0 && (
                <LoadingAnimation
                  title="AI 正在处理"
                  description={progress || (isAnalyzing ? '识别图片主体...' : '正在生成三视图...')}
                  thumbnails={uploadedImages.map(item => item.preview)}
                  variant="featured"
                />
              )}
              {/* 结果 */}
              {results.length > 0 && (
                <>
                  {isProcessing && results.length > 0 && (
                    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
                      <Loader2 size={14} className="animate-spin text-blue-500" />
                      <span className="text-sm text-[#A3A3A3]">{progress}</span>
                    </div>
                  )}
                  <EcommerceResults
                    results={results}
                    onPreview={setPreviewImage}
                    onReEdit={setReEditImage}
                    onDownload={handleDownload}
                    aspectRatio="16/9"
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
        aspectRatio="16:9"
        model={selectedModel}
        resolution={quality}
        onClose={() => setReEditImage(null)}
        onReplaced={(oldUrl, newUrl) => setResults(prev => prev.map(item => item.url === oldUrl ? {...item, url: newUrl} : item))}
      />
    </div>
  );
};

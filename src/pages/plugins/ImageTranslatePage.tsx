import React, { useState, useRef, useEffect } from 'react';
import {
  X, Languages, Wand2, Download, Sparkles,
  RefreshCw, Check, AlertCircle, PenLine
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { editImage } from '../../services/imageService';
import { analyzeMultipleImages } from '../../services/aiChatService';
import { LANGUAGES, getSavedLanguage, saveLanguage } from '../../constants/languages';
import { getPricing } from '../../services/pricingService';
import { getCurrentUser } from '../../services/authService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { CreditCheckModal } from '../../components/CreditCheckModal';
import { LoadingAnimation } from '../../components/LoadingAnimation';
import { EcommerceImageUpload, EcommerceSettings, EcommerceResults } from '../../components/ecommerce';
import type { AspectRatio } from '../../components/ecommerce';

const ASPECT_RATIOS: AspectRatio[] = [
  { label: '智能', value: '智能' },
  { label: '1:1', value: '1:1' },
  { label: '3:4', value: '3:4' },
  { label: '4:3', value: '4:3' },
  { label: '9:16', value: '9:16' },
  { label: '16:9', value: '16:9' },
  { label: '21:9', value: '21:9' },
];

interface TextBlock {
  id: string;
  imageIndex: number;
  originalText: string;
  translatedText: string;
  style: string;
  position: string;
}

interface ImageItem {
  file: File;
  preview: string;
}

interface ResultImage {
  url: string;
  label: string;
  sourceImageIndex: number;
}

const ANALYSIS_PROMPT = (targetLang: string) => `你是一位专业的平面设计师和多语言翻译专家。请仔细分析这张海报/图片，完成以下任务：

1. **提取所有文案区域**：识别图片中每一个包含文字的区域，包括标题、副标题、正文、按钮文字、标签、水印等所有文字内容。

2. **分析字体风格**：对每个文案区域，描述其视觉风格（如：艺术字、卡通字体、手写体、粗体、衬线体、无衬线体、渐变色、描边、阴影、立体效果等）。

3. **翻译文案**：将每个文案区域的文字翻译为${targetLang}，保持原意的同时考虑目标语言的表达习惯。

## 输出格式 - 严格按以下 JSON 格式输出，不要包含任何其他文字：
{
  "textBlocks": [
    {
      "originalText": "原文案内容",
      "translatedText": "翻译后的文案",
      "style": "字体风格描述（如：白色粗体无衬线字，带黑色描边）",
      "position": "在图片中的位置描述（如：图片顶部居中，约占宽度60%）"
    }
  ]
}

## 注意事项
- 必须提取图片中所有可见文字，不遗漏
- 翻译要自然流畅，适合目标语言的读者
- 字体风格描述要详细，包括颜色、大小、效果等
- 位置描述要具体，便于后续图片编辑
- 如果图片中没有文字，返回空数组：{"textBlocks": []}`;

const GENERATE_PROMPT = (
  blocks: TextBlock[]
) => {
  const blockDescriptions = blocks.map((block, i) => 
    `区域${i + 1}：将"${block.originalText}"替换为"${block.translatedText}"，该区域的字体风格为${block.style}，位置在${block.position}。替换时请保持原有的字体风格、颜色、大小和视觉效果，仅更换文字内容。`
  ).join('\n');

  return `请对这张海报图片进行文字替换编辑，要求如下：

${blockDescriptions}

## 重要要求：
1. 只替换文字内容，保持图片的整体布局、背景、装饰元素、颜色方案完全不变
2. 每个文字区域替换后必须保持原有的字体风格、大小比例、颜色、描边、阴影等所有视觉效果
3. 如果翻译后的文字长度与原文不同，适当调整字号以适应原区域，但不要改变区域的整体范围
4. 确保所有替换文字清晰可读，与图片整体风格协调
5. 不要添加任何原文中没有的新元素`;
};

export const ImageTranslatePage: React.FC = () => {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [targetLanguage, setTargetLanguage] = useState(getSavedLanguage());
  const [selectedModel, setSelectedModel] = useState('nanobann2');
  const [resolution, setResolution] = useState('2K');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState('智能');
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([]);
  const [results, setResults] = useState<ResultImage[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [generatePrice, setGeneratePrice] = useState(0.3);
  const [progress, setProgress] = useState('');
  const [currentAnalyzingIndex, setCurrentAnalyzingIndex] = useState(-1);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

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
    saveLanguage(targetLanguage);
  }, [targetLanguage]);

  const handleImagesChange = (newImages: ImageItem[]) => {
    setImages(newImages);
    setTextBlocks([]);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (images.length === 0) return;

    const user = getCurrentUser();
    if (!user) {
      window.dispatchEvent(new CustomEvent('show-auth-modal'));
      return;
    }

    setAnalyzing(true);
    setTextBlocks([]);
    setError(null);
    setProgress('正在分析图片中的文案...');

    try {
      const allBlocks: TextBlock[] = [];
      const targetLangLabel = LANGUAGES.find(l => l.value === targetLanguage)?.label || 'English';

      for (let i = 0; i < images.length; i++) {
        setCurrentAnalyzingIndex(i);
        setProgress(`正在分析第 ${i + 1}/${images.length} 张图片...`);

        const result = await analyzeMultipleImages(
          [images[i].preview],
          ANALYSIS_PROMPT(targetLangLabel),
          { maxTokens: 4000 }
        );

        // Parse JSON from response
        let parsed: { textBlocks: any[] } = { textBlocks: [] };
        console.log('[translate] AI分析原始响应:', result.substring(0, 500));
        try {
          const jsonMatch = result.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
            console.log('[translate] 解析成功，textBlocks数量:', parsed.textBlocks?.length);
          } else {
            console.warn('[translate] 未找到JSON格式响应');
          }
        } catch (e) {
          console.warn('[translate] JSON解析失败，尝试提取文本块:', e);
          const textBlockMatch = result.match(/"textBlocks"\s*:\s*\[([\s\S]*?)\]/);
          if (textBlockMatch) {
            try {
              parsed = JSON.parse(`{"textBlocks":[${textBlockMatch[1]}]}`);
              console.log('[translate] 备用解析成功，textBlocks数量:', parsed.textBlocks?.length);
            } catch (e2) {
              console.error('[translate] 备用解析也失败:', e2);
            }
          }
        }

        if (parsed.textBlocks && Array.isArray(parsed.textBlocks)) {
          parsed.textBlocks.forEach((block: any, idx: number) => {
            if (block.originalText) {
              allBlocks.push({
                id: `block-${i}-${idx}`,
                imageIndex: i,
                originalText: block.originalText || '',
                translatedText: block.translatedText || '',
                style: block.style || '',
                position: block.position || '',
              });
            }
          });
        }
      }

      if (allBlocks.length === 0) {
        setError('未检测到文案区域，请确认图片中包含文字');
      } else {
        setTextBlocks(allBlocks);
        setProgress(`分析完成，共检测到 ${allBlocks.length} 个文案区域`);
      }
    } catch (e: any) {
      console.error('分析失败:', e);
      setError(e.message || '分析失败，请重试');
    } finally {
      setAnalyzing(false);
      setCurrentAnalyzingIndex(-1);
    }
  };

  const updateTranslatedText = (blockId: string, newText: string) => {
    setTextBlocks(prev => prev.map(block =>
      block.id === blockId ? { ...block, translatedText: newText } : block
    ));
  };

  const handleGenerate = async () => {
    if (images.length === 0 || textBlocks.length === 0) return;

    const user = getCurrentUser();
    if (!user) {
      window.dispatchEvent(new CustomEvent('show-auth-modal'));
      return;
    }

    const totalCost = generatePrice * images.length;
    if ((user?.credits || 0) < totalCost) {
      setShowCreditModal(true);
      return;
    }

    setGenerating(true);
    setResults([]);
    setError(null);

    try {
      const prompt = GENERATE_PROMPT(textBlocks);

      for (let i = 0; i < images.length; i++) {
        setProgress(`正在生成第 ${i + 1}/${images.length} 张翻译图片...`);

        const result = await editImage({
          prompt,
          images: [images[i].preview],
          model: selectedModel,
          resolution,
          aspectRatio: selectedAspectRatio,
          type: 'edited',
        });

        if (result.data && result.data.length > 0) {
          const newResults: ResultImage[] = result.data.map((item: any, idx: number) => ({
            url: item.url,
            label: `翻译图 ${i + 1}${result.data.length > 1 ? `-${idx + 1}` : ''}`,
            sourceImageIndex: i,
          }));
          setResults(prev => [...prev, ...newResults]);

          // Save to library
          result.data.forEach((item: any) => {
            imageLibraryService.saveToLibrary({
              image_url: item.url,
              prompt: `图片翻译 - ${LANGUAGES.find(l => l.value === targetLanguage)?.label || 'English'}`,
              model: selectedModel,
              aspect_ratio: selectedAspectRatio,
              resolution,
              type: 'edited'
            }).catch(err => console.error('[translate] 保存图片失败:', err));
          });
        }
      }

      setProgress('生成完成！');
    } catch (e: any) {
      console.error('生成失败:', e);
      const rawError = e.response?.data?.error;
      const errorMsg = typeof rawError === 'string' ? rawError : rawError?.message || e.message || '生成失败，请重试';
      setError(`生成失败: ${errorMsg}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (url: string) => {
    try {
      const r = await fetch(url);
      const blob = await r.blob();
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u;
      a.download = `translate-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(u);
    } catch {
      window.open(url, '_blank');
    }
  };

  const thumbnailPreviews = images.map(img => img.preview);

  return (
    <div className="min-h-0 flex-1 flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
              <Languages size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">图片转译</h1>
              <p className="text-xs text-gray-500">上传海报图片，AI 自动提取文案并翻译替换</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setImages([]); setTextBlocks([]); setResults([]); setError(null); setProgress(''); }}
              className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
              title="重新开始"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Image Preview & Results */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
          {/* Empty state */}
          {images.length === 0 && results.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                <Languages size={40} className="text-gray-900" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">图片文案转译</h2>
              <p className="text-gray-500 mb-8 text-center max-w-md">
                上传包含文案的海报图片，AI 自动识别文字区域并翻译为目标语言，保持原有字体风格
              </p>
            </div>
          )}

          {/* Uploaded images preview (before analysis) */}
          {images.length > 0 && textBlocks.length === 0 && results.length === 0 && !analyzing && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">待处理图片 ({images.length})</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {images.map((img, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="relative group rounded-xl overflow-hidden bg-white border border-gray-200 shadow-sm"
                  >
                    <img src={img.preview} alt="" className="w-full object-contain max-h-[50vh]" />
                    <div className="absolute top-3 right-3 flex gap-2">
                      <button
                        onClick={() => handleImagesChange(images.filter((_, i) => i !== idx))}
                        className="w-8 h-8 bg-red-500/80 backdrop-blur-sm rounded-lg flex items-center justify-center hover:bg-red-600 transition-colors"
                      >
                        <X size={14} className="text-white" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
              <p className="text-center text-sm text-gray-400 py-4">点击右侧「分析文案」按钮开始</p>
            </div>
          )}

          {/* Analyzing state */}
          {analyzing && (
            <div className="flex flex-col items-center justify-center min-h-[40vh]">
              <LoadingAnimation variant="featured" title="正在分析图片" description={progress} progress={progress} />
            </div>
          )}

          {/* Translation results (after analysis) */}
          {textBlocks.length > 0 && results.length === 0 && !analyzing && (
            <div className="space-y-8">
              {/* Reset button */}
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900">翻译文案</h3>
                <button
                  onClick={() => { setTextBlocks([]); setError(null); setProgress(''); }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  重新上传
                </button>
              </div>

              {/* Grouped by image */}
              {images.map((img, imgIdx) => {
                const imgBlocks = textBlocks.filter(b => b.imageIndex === imgIdx);
                if (imgBlocks.length === 0) return null;
                return (
                  <div key={imgIdx} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                    {/* Image header */}
                    <div
                      className="flex items-center gap-4 p-4 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => setPreviewImage(img.preview)}
                    >
                      <div className="w-16 h-16 rounded-lg overflow-hidden border-2 border-gray-200 flex-shrink-0">
                        <img src={img.preview} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900">图片 {imgIdx + 1}</span>
                          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full font-medium">{imgBlocks.length} 个文案区域</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">点击可查看原图大图</p>
                      </div>
                    </div>

                    {/* Text blocks for this image */}
                    <div className="p-4 space-y-3">
                      {imgBlocks.map((block, idx) => (
                        <motion.div
                          key={block.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className="bg-gray-50 rounded-xl p-3 border border-gray-100"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                              {idx + 1}
                            </span>
                            {block.position && (
                              <span className="text-[11px] text-gray-400 truncate flex-1">{block.position}</span>
                            )}
                            <button
                              onClick={() => setEditingBlockId(editingBlockId === block.id ? null : block.id)}
                              className="text-[11px] text-blue-500 hover:text-blue-600 flex items-center gap-1 flex-shrink-0"
                            >
                              <PenLine size={11} />
                              编辑
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {/* Original */}
                            <div>
                              <label className="text-[10px] text-gray-400 mb-1 block">原文案</label>
                              <div className="text-xs text-gray-700 bg-white rounded-lg px-2.5 py-1.5 border border-gray-100">
                                {block.originalText}
                              </div>
                            </div>
                            {/* Translated */}
                            <div>
                              <label className="text-[10px] text-blue-500 mb-1 block">翻译文案</label>
                              {editingBlockId === block.id ? (
                                <textarea
                                  value={block.translatedText}
                                  onChange={(e) => updateTranslatedText(block.id, e.target.value)}
                                  onBlur={() => setEditingBlockId(null)}
                                  autoFocus
                                  className="w-full text-xs text-gray-700 bg-white rounded-lg px-2.5 py-1.5 border border-blue-300 outline-none resize-none focus:ring-1 focus:ring-blue-400"
                                  rows={2}
                                />
                              ) : (
                                <div className="text-xs text-blue-800 bg-blue-50 rounded-lg px-2.5 py-1.5 border border-blue-100">
                                  {block.translatedText || '(未翻译)'}
                                </div>
                              )}
                            </div>
                          </div>
                          {block.style && (
                            <div className="mt-1.5 pt-1.5 border-t border-gray-100">
                              <span className="text-[10px] text-gray-400">风格: </span>
                              <span className="text-[10px] text-gray-500">{block.style}</span>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Generated results */}
          {results.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">翻译结果 ({results.length})</h3>
              <EcommerceResults
                results={results.map(r => ({ url: r.url, label: r.label }))}
                onPreview={setPreviewImage}
                onDownload={handleDownload}
              />
              <button
                onClick={() => { setResults([]); setTextBlocks([]); }}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors text-sm font-medium"
              >
                重新翻译
              </button>
            </div>
          )}

          {/* Generating state */}
          {generating && (
            <div className="flex flex-col items-center justify-center py-12">
              <LoadingAnimation variant="featured" title="正在生成翻译图片" description={progress} progress={progress} thumbnails={thumbnailPreviews} />
            </div>
          )}
        </div>

        {/* Right: Control Panel */}
        <aside className="w-96 bg-white border-l border-gray-200 flex flex-col overflow-hidden flex-shrink-0">
          {/* Scrollable settings */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Upload section */}
            <EcommerceImageUpload
              images={images}
              onImagesChange={handleImagesChange}
              maxImages={10}
              title="上传海报图片"
              subtitle="支持批量上传，最多10张"
              icon="image"
            />

            {/* Language, Model, Resolution, Aspect Ratio */}
            <EcommerceSettings
              language={targetLanguage}
              onLanguageChange={setTargetLanguage}
              languages={LANGUAGES}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              quality={resolution}
              onQualityChange={setResolution}
              aspectRatios={ASPECT_RATIOS}
              singleRatio={selectedAspectRatio}
              onSingleRatioChange={setSelectedAspectRatio}
              languageLabel="目标语言"
              modelLabel="生成模型"
              qualityLabel="分辨率"
              ratioLabel="图片比例"
            />

            {/* Error display */}
            {error && (
              <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
                <div className="flex items-start gap-2 bg-red-50 rounded-lg p-3">
                  <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              </div>
            )}

            {/* Progress */}
            {progress && !analyzing && !generating && (
              <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
                <div className="flex items-center gap-2 bg-blue-50 rounded-lg p-3">
                  <Check size={14} className="text-blue-500 flex-shrink-0" />
                  <p className="text-xs text-blue-600">{progress}</p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Action Buttons */}
          <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0 space-y-3">
            {/* Analyze button */}
            <button
              onClick={handleAnalyze}
              disabled={images.length === 0 || analyzing}
              className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium text-sm flex items-center justify-center gap-2"
            >
              {analyzing ? (
                <>
                  <Wand2 size={16} className="animate-pulse" />
                  分析中...
                </>
              ) : (
                <>
                  <Wand2 size={16} />
                  分析文案
                </>
              )}
            </button>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={images.length === 0 || textBlocks.length === 0 || generating || analyzing}
              className="w-full py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium text-sm flex items-center justify-center gap-2"
            >
              {generating ? (
                <>
                  <Sparkles size={16} className="animate-pulse" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  生成翻译图
                </>
              )}
            </button>

            {/* Price hint */}
            <div className="text-center">
              <span className="text-[11px] text-gray-400">
                预计消耗: <span className="font-semibold text-amber-500">{(generatePrice * images.length).toFixed(1)}</span> 积分
                {images.length > 1 && ` (${images.length} 张图 x ${generatePrice} 积分)`}
              </span>
            </div>
          </div>
        </aside>
      </div>

      {/* Fullscreen Preview */}
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
              <div className="absolute bottom-4 right-4">
                <button
                  onClick={() => handleDownload(previewImage)}
                  className="px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg text-white text-sm hover:bg-white/40 transition-colors flex items-center gap-2"
                >
                  <Download size={14} />
                  下载
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <CreditCheckModal isOpen={showCreditModal} onClose={() => setShowCreditModal(false)} />
    </div>
  );
};

import React, { useState } from 'react';
import { Sparkles, Loader2, Layout } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { analyzeMultipleImages } from '../../services/aiChatService';
import { requireAuth } from '../../utils/authCheck';
import { createConcurrencyLimit } from '../../utils/concurrency';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import { LANGUAGES, getSavedLanguage, saveLanguage } from '../../constants/languages';
import { EcommerceImageUpload, EcommerceSettings, EcommerceResults } from '../../components/ecommerce';
import { LoadingAnimation } from '../../components/LoadingAnimation';

const ASPECT_RATIOS = [
  { value: '智能', label: '智能' },
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '9:16', label: '9:16' },
];

const ANALYSIS_PROMPT = `你是一位资深的电商视觉设计师。你的任务是：分析用户上传的产品图片和模板参考图，为每个产品-模板组合规划一套"智能设计克隆"方案。

## 核心要求
- 分析每个模板图的**设计语言**：整体风格调性、色彩倾向、字体气质、留白节奏、构图规律、装饰手法
- 基于产品图片的特征（形状、色调、质感），将每个模板的设计风格"迁移"到产品上
- **不是复制坐标布局**，而是理解模板的设计感觉，为产品量身定制最优构图
- 保持产品的视觉特征不变，产品本身不能有任何变化
- 【产品一致性】每个产品的外观、形状、颜色、纹理等所有细节必须保持不变

## 输出格式 - STRICT JSON array:
[{"product_idx":0,"template_idx":0,"title":"设计标题","desc":"详细画面描述（包含构图布局、场景、光线、配色方案及设计风格说明）","layout_ref":"参考模板图的设计风格特征说明","subtitle":"副标题或补充文案"}]

## 设计原则
- 输出数组的总长度 = 产品数量（{productCount}）× 模板数量（{templateCount}）
- product_idx 指明对应第几张产品图（从0开始）
- template_idx 指明参考第几张模板图（从0开始）
- 每个产品需要为每个模板生成一张风格迁移图
- 每张标题必须突出对应产品的核心卖点，同一产品的各个变体之间要有差异化
- desc 要详细描述构图和设计风格
- 所有文案使用目标语言`;

interface CloneCard {
  product_idx: number;
  template_idx: number;
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
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [templateImages, setTemplateImages] = useState<{ file: File; preview: string }[]>([]);
  const [language, setLanguage] = useState(getSavedLanguage());
  const [aspectRatio, setAspectRatio] = useState('智能');
  const [selectedModel, setSelectedModel] = useState('nanobann2');
  const [analyzing, setAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [quality, setQuality] = useState('2K');
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<{ url: string; idx: number }[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);

  // --- Product image change handler (bridges EcommerceImageUpload -> ProductImage[]) ---
  const handleProductImagesChange = (newImages: { file: File; preview: string }[]) => {
    setProductImages(prev => {
      const existingMap = new Map(prev.map(p => [p.file, p]));
      return newImages.map(img => existingMap.get(img.file) || { ...img, title: '', desc: '' });
    });
  };

  const updateProduct = (idx: number, field: 'title' | 'desc', value: string) => {
    setProductImages(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

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

      // 检测每张模板的比例
      const templateRatios = await Promise.all(templateImages.map(item => detectImageRatio(item.file)));
      const templateRatioInfo = templateImages.map((_, i) => `模板${i + 1}：${templateRatios[i]}`).join('\n');

      const promptText = ANALYSIS_PROMPT
        .replace('{productCount}', String(productImages.length))
        .replace('{templateCount}', String(templateImages.length));
      const userContent = `${promptText}\n\n=====\n\n## 图片顺序说明
上传的图片中：
- 前 ${productImages.length} 张是【产品图片】（每张产品的视觉特征必须保留）
- 后 ${templateImages.length} 张是【模板参考图】（版式结构来源）

## 产品信息
${productInfo}

## 模板比例信息（重要！生成时必须严格遵循）
${templateRatioInfo}

## 参数
目标语言：${langLabel}
用户选择比例：${aspectRatio}
产品数量：${productImages.length}
模板数量：${templateImages.length}
生成总数：${productImages.length * templateImages.length}张（每个产品为每个模板生成1张）

请分析以上产品图片和模板参考图，输出JSON格式的智能设计克隆方案。每个方案必须明确说明参考了哪张模板图（template_idx）。所有文案使用目标语言。`;

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

      setProgress(`生成中 (0/${cards.length})...`);
      let doneCount = 0;
      const limit = createConcurrencyLimit(3);

      const tasks = cards.map((card, idx) => {
        const productIdx = card.product_idx ?? 0;
        const templateIdx = (card as any).template_idx ?? 0;
        const imageUrls = [
          productUrls[productIdx],
          templateUrls[templateIdx],
        ];
        // 使用对应模板的比例
        const cardRatio = templateRatios[templateIdx] || '1:1';
        const cardNum = idx + 1;
        const prompt = `电商智能设计克隆，第${cardNum}张\n比例：${cardRatio}\n语言：${langLabel}\n\n标题：${card.title}\n${card.subtitle ? `副标题：${card.subtitle}` : ''}\n画面描述：${card.desc}\n${card.layout_ref ? `设计风格参考：${card.layout_ref}` : ''}\n\n要求：\n- 【最重要】保持产品图片的一致性：该产品的外观、形状、颜色、纹理、包装、标签等所有细节必须与提供的产品图完全一致，不得改变产品的任何视觉特征\n- 【严格遵循比例】生成图片必须使用 ${cardRatio} 比例\n- 分析模板参考图的设计风格（色调、字体气质、留白节奏、装饰手法、整体调性），将其设计语言迁移应用到当前画面\n- **不要硬套模板的坐标布局**，而是根据产品的形状、大小、色调特征，对构图做适配优化\n- 产品在画面中突出显示，占据视觉中心\n- 文字排版清晰，使用目标语言，层级分明\n- 整体设计品质高端，细节精致，具有电商商业感`;
        return limit(async () => {
          try {
            const resp = await editImage({ prompt, images: imageUrls, aspectRatio: cardRatio, resolution: quality, model: selectedModel, type: 'edited' });
            if (resp.data?.[0]?.url) {
              setResults(prev => [{ url: resp.data[0].url, idx: cardNum }, ...prev]);
              imageLibraryService.saveToLibrary({ image_url: resp.data[0].url, prompt, model: String(selectedModel || 'nanobann2'), aspect_ratio: String(cardRatio), resolution: String(quality || '2K'), type: 'edited' });
            }
          } catch (err) {
            console.error(`生成第${cardNum}张失败:`, err);
          }
          doneCount++;
          setProgress(`生成中 (${doneCount}/${cards.length})...`);
        });
      });

      await Promise.all(tasks);
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

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-gray-200 flex-shrink-0 bg-gray-50">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center"><Layout size={16} className="text-white" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[#171717]">智能设计克隆</h1>
          <p className="text-[10px] text-gray-400 leading-tight">上传产品图 + 模板参考图 → AI提取设计语言 → 风格迁移适配出图</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-[400px] border-r border-gray-200 overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-gray-50">
          {/* Product Images */}
          <EcommerceImageUpload
            images={productImages}
            onImagesChange={handleProductImagesChange}
            maxImages={10}
            title="产品图片"
            subtitle="每张可填写标题+描述"
            icon="images"
          />
          {productImages.length > 0 && (
            <div className="space-y-3">
              {productImages.map((item, idx) => (
                <div key={idx} className="bg-white rounded-2xl p-3 border border-gray-200 shadow-sm">
                  <div className="flex gap-3 items-start">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                      <img src={item.preview} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <input value={item.title} onChange={e => updateProduct(idx, 'title', e.target.value)} placeholder="产品标题/名称" className="w-full bg-gray-50 px-2.5 py-1.5 rounded-lg text-xs border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[#333] placeholder:text-gray-400" />
                      <textarea value={item.desc} onChange={e => updateProduct(idx, 'desc', e.target.value)} placeholder="产品描述/卖点..." rows={2} className="w-full bg-gray-50 px-2.5 py-1.5 rounded-lg text-xs border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none text-[#333] placeholder:text-gray-400" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Template Images */}
          <EcommerceImageUpload
            images={templateImages}
            onImagesChange={setTemplateImages}
            maxImages={10}
            title="模板参考图"
            subtitle="AI将参考这些版式结构"
            icon="image"
          />

          {/* Language / Model / Resolution / Aspect Ratio */}
          <EcommerceSettings
            language={language}
            onLanguageChange={(val) => { setLanguage(val); saveLanguage(val); }}
            languages={LANGUAGES}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            quality={quality}
            onQualityChange={setQuality}
            aspectRatios={ASPECT_RATIOS}
            singleRatio={aspectRatio}
            onSingleRatioChange={setAspectRatio}
          />

          {/* 一键生成按钮 */}
          {!analyzing && !isProcessing && (
            <button onClick={handleAnalyzeAndGenerate} disabled={productImages.length === 0 || templateImages.length === 0}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-gray-200 disabled:text-gray-400 shadow-sm">
              <Sparkles size={18} /> AI分析并生成 ({productImages.length}产品 × {templateImages.length}模板 = {productImages.length * templateImages.length}张)
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
            <EcommerceResults
              results={[]}
              onPreview={() => {}}
              onDownload={handleDownload}
              emptyTitle="智能设计克隆"
              emptyDescription="上传产品图 + 模板参考图 → 一键生成智能设计克隆图"
            />
          ) : (
            <div className="p-6">
              {/* 分析中 */}
              {analyzing && results.length === 0 && (
                <LoadingAnimation
                  variant="featured"
                  title="AI 正在分析"
                  description={progress || '分析产品与模板设计风格...'}
                />
              )}
              {/* 生成中（还没有结果时） */}
              {isProcessing && !analyzing && results.length === 0 && (
                <LoadingAnimation
                  variant="featured"
                  title="正在生成"
                  description={progress || '正在生成风格迁移图...'}
                  showProgressBar
                  progressWidth="60%"
                />
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
                  <EcommerceResults
                    results={[...results].sort((a, b) => a.idx - b.idx).map(item => ({
                      url: item.url,
                      label: `裂变 #${item.idx}`,
                      idx: item.idx,
                    }))}
                    onPreview={setPreviewImage}
                    onReEdit={setReEditImage}
                    onDownload={handleDownload}
                  />
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

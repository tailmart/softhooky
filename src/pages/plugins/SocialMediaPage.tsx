import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, Share2, Images, Globe, Wand2, Download, ChevronDown, Copy } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { analyzeMultipleImages } from '../../services/aiChatService';
import { requireAuth } from '../../utils/authCheck';
import { getAvailableModels } from '../../services/modelService';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import { ModelSpeedNote } from '../../components/ModelSpeedNote';
import { LoadingAnimation } from '../../components/LoadingAnimation';
import { ProductImageUpload, ProductInfoForm, GenerationSettings } from '../../components/social';
import type { Language, AspectRatio } from '../../components/social';

const LANGUAGES: Language[] = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'ru', label: '俄语' },
  { value: 'th', label: '泰语' },
  { value: 'ms', label: '马来语' },
  { value: 'vi', label: '越南语' },
];

const ASPECT_RATIOS: AspectRatio[] = [
  { value: '1:1', label: '1:1', platform: 'Ins' },
  { value: '9:16', label: '9:16', platform: 'TikTok' },
  { value: '4:5', label: '4:5', platform: 'FB' },
  { value: '2:3', label: '2:3', platform: 'Pinterest' },
];

const SOCIAL_ANALYSIS_PROMPT = `You are a social media marketing expert. Analyze the product images and create a social media campaign plan.

For each image to be generated, provide:
1. "title": A catchy social media post title/headline in target language — this will be used as the social media post copy
2. "description": A detailed image description for AI image generation (include POV style, lighting, composition, mood)
3. "pov": The POV perspective type (choose from: hands using product, overhead arrangement, eye level lifestyle, close-up detail, outdoor scene, flat lay)
4. "ratio": Aspect ratio (choose from: 1:1, 9:16, 4:5, 2:3)

## Output format - STRICT JSON array:
[{"title":"Post title (social media copy)","description":"Full image generation prompt with POV, lighting, composition, mood, setting details","pov":"hands using product","ratio":"1:1"},...]

## Principles
- For each selected ratio, generate images with different POV perspectives
- Each image in the same ratio should have a different POV and composition
- Cover varied perspectives: hands using product, overhead arrangement, eye level lifestyle, close-up detail, outdoor scene, flat lay
- 【CRITICAL】Every image MUST be first-person POV (user's own hands/eyes perspective), NOT third-person or model shooting
- Titles should be engaging, platform-native, and varied (not repetitive) — these ARE the social media post copies
- Descriptions must include: POV perspective, lighting, composition, mood, setting
- Assign varied ratios across the campaign
- First image should be the hero/product spotlight
- All text (titles and descriptions) must be in the target language
- Each image must have a unique POV perspective`;

interface AnalysisCard {
  title: string;
  description: string;
  pov: string;
  ratio: string;
}

interface GenResult {
  url: string;
  title: string;
  ratio: string;
  idx: number;
}

export const SocialMediaPage: React.FC = () => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getAvailableModels().then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) setSelectedModel(sorted[0].model_id);
    });
  }, []);
  const [productImages, setProductImages] = useState<{ file: File; preview: string }[]>([]);
  const [productName, setProductName] = useState('');
  const [productDesc, setProductDesc] = useState('');
  const [language, setLanguage] = useState('en');
  const [selectedRatios, setSelectedRatios] = useState<string[]>(['1:1']);
  const [imageCount, setImageCount] = useState(0); // 0 = AI自动
  const [selectedModel, setSelectedModel] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [quality, setQuality] = useState('2K');
  const [progress, setProgress] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisCard[]>([]);
  const [results, setResults] = useState<GenResult[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);
  const [showCopyTip, setShowCopyTip] = useState('');

  // 封面关键词
  const [coverKeywordsCN, setCoverKeywordsCN] = useState('');
  const [coverKeywordsEN, setCoverKeywordsEN] = useState('');

  const toggleRatio = (value: string) => {
    setSelectedRatios(prev =>
      prev.includes(value) ? prev.filter(r => r !== value) : [...prev, value]
    );
  };

  const handleAnalyze = async () => {
    if (!requireAuth()) return;
    if (productImages.length === 0) { alert('请至少上传一张产品图片'); return; }

    setAnalyzing(true);
    setAnalysisResult([]);
    setResults([]);
    setProgress('AI正在深度分析产品...');

    try {
      const b64s = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1200)));
      const langLabel = LANGUAGES.find(l => l.value === language)?.label || 'English';
      const perRatio = imageCount > 0 ? imageCount : 3;
      const total = perRatio * selectedRatios.length;
      const countStr = imageCount > 0
        ? `请生成方案，每个选中比例各${imageCount}张，共${total}张。同一比例内视角不能重复。`
        : '请根据产品特点自由决定，每个比例2-4张。';

      // Step 1: Deep product analysis
      let analysisContext = '';
      setProgress('AI正在分析产品特征...');
      const deepRaw = await analyzeMultipleImages(b64s,
        `分析所有上传的图片中的产品，返回JSON：{"title":"产品名称","brand":"品牌","category":"品类","specs":"规格","sellingPoints":"卖点(逗号分隔)","targetAudience":"目标人群"}。仅输出JSON。`,
        { model: 'gemini-3.5-flash', maxTokens: 2000 }
      );
      const deepMatch = deepRaw.match(/\{[\s\S]*\}/);
      if (deepMatch) {
        const d = JSON.parse(deepMatch[0]) as Record<string, string>;
        if (!productName.trim() && d.title) { setProductName(d.title); }
        if (!productDesc.trim() && d.description) { setProductDesc(d.description); }
        analysisContext = `\n## AI深度分析产品信息\n产品名称：${d.title || productName}\n品牌：${d.brand || ''}\n品类：${d.category || ''}\n规格：${d.specs || ''}\n卖点：${d.sellingPoints || ''}\n目标人群：${d.targetAudience || ''}`;
      }

      // Step 2: Generate cover keywords
      setProgress('AI正在生成封面关键词...');
      const coverPrompt = `基于以下产品信息，生成社交媒体封面关键词：
${analysisContext}
目标语言：${langLabel}

请返回JSON格式：
{
  "coverKeywordsCN": "中文封面关键词，吸引眼球的描述",
  "coverKeywordsEN": "English cover keywords, viral social media cover"
}

要求：
- 关键词要简洁有力，适合放在图片上作为封面文字
- 突出产品核心卖点
- 符合社交媒体风格`;
      const coverRaw = await analyzeMultipleImages(b64s, coverPrompt, {
        model: 'gemini-3.5-flash',
        maxTokens: 1000,
      });
      const coverMatch = coverRaw.match(/\{[\s\S]*\}/);
      if (coverMatch) {
        const coverParsed = JSON.parse(coverMatch[0]);
        if (coverParsed.coverKeywordsCN) setCoverKeywordsCN(coverParsed.coverKeywordsCN);
        if (coverParsed.coverKeywordsEN) setCoverKeywordsEN(coverParsed.coverKeywordsEN);
      }

      // Step 3: Social media plan
      setProgress('AI正在规划社媒宣传方案...');
      const userContent = `${SOCIAL_ANALYSIS_PROMPT}

=====
${analysisContext}
目标语言：${langLabel}
可选比例：${selectedRatios.join(', ')}

${countStr}

请基于以上产品分析结果，输出JSON格式的社媒宣传方案。每个比例的图片视角不同。所有title和description内容请使用目标语言。`;

      const raw = await analyzeMultipleImages(b64s, userContent, {
        model: 'gemini-3.5-flash',
        maxTokens: 8000,
      });

      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('AI返回格式异常，请重试');
      const parsed = JSON.parse(jsonMatch[0]) as AnalysisCard[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('AI未能生成有效的方案，请重试');
      }
      setAnalysisResult(parsed);
    } catch (err: any) {
      console.error('分析失败:', err);
      alert('AI分析失败: ' + (err.message || '请稍后重试'));
    } finally {
      setAnalyzing(false);
      setProgress('');
    }
  };

  const handleGenerate = async () => {
    if (!requireAuth()) return;
    if (analysisResult.length === 0) return;
    setIsProcessing(true);
    try {
      const urls = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1536)));
      const total = analysisResult.length;

      setProgress(`生成中 (0/${total})...`);
      let doneCount = 0;
      const allResults: GenResult[] = [];

      const tasks = analysisResult.map(async (card, idx) => {
        const platform = ASPECT_RATIOS.find(r => r.value === card.ratio)?.platform || '';
        const prompt = `Social media promotional image. STRICT first-person POV perspective. Aspect ratio: ${card.ratio} (${platform}).

${card.description}

IMPORTANT:
- The product's shape, color, texture and visual features MUST match the reference image; existing text/logos/labels on original product image remain unchanged
- 【CRITICAL】This image MUST be shot from a TRUE FIRST-PERSON POV — as if the photographer is holding/using the product with their own hands. The viewer sees through the user's eyes.
- NO third-person perspective, NO product on table shot from above, NO model holding product for camera
- Must look like the user took a photo with their phone while using the product
- 【重要】画面中禁止出现任何文字、文案、标语、标签等文字内容
- Authentic user-generated style, NOT commercial product photography, NOT AI-generated look
- If people appear, faces must look like real phone photos — visible skin texture, pores, natural imperfections, no AI plastic face, no over-smoothing
- Natural lighting, candid feel, realistic life场景
- 8K ultra realistic, no watermarks`;

        try {
          const resp = await editImage({ prompt, images: urls, aspectRatio: card.ratio, resolution: quality, model: selectedModel, type: 'edited' });
          const url = resp.data?.[0]?.url || resp.image_url || resp.url || '';
          if (url) {
            const item: GenResult = { url, title: card.title, ratio: card.ratio, idx: idx + 1 };
            allResults.push(item);
            setResults(prev => [...prev, item]);
            imageLibraryService.saveToLibrary({ image_url: url, prompt, model: String(selectedModel || 'nanobann2'), aspect_ratio: String(card.ratio), resolution: String(quality || '2K'), type: 'edited' });
          }
        } catch {}
        doneCount++;
        setProgress(`生成中 (${doneCount}/${total})...`);
      });

      await Promise.all(tasks);
    } catch (err: any) { console.error('生成失败:', err); }
    finally { setIsProcessing(false); setProgress(''); }
  };

  const handleDownload = async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `social-${Date.now()}.png`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => { setShowCopyTip(label); setTimeout(() => setShowCopyTip(''), 2000); });
  };

  const handleNewAnalysis = () => {
    setAnalysisResult([]);
    setResults([]);
    setCoverKeywordsCN('');
    setCoverKeywordsEN('');
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-gray-200 flex-shrink-0 bg-gray-50">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center">
          <Share2 size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[#171717]">海外社媒POV出图</h1>
          <p className="text-[10px] text-gray-400 leading-tight">AI分析产品 → 生成第一视角生活场景图 + 适配多平台比例批量出图</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[380px] border-r border-gray-200 overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-gray-50">
          {/* 产品图片 */}
          <ProductImageUpload
            images={productImages}
            onImagesChange={setProductImages}
          />

          {/* 产品信息 */}
          <ProductInfoForm
            productName={productName}
            onProductNameChange={setProductName}
            productDesc={productDesc}
            onProductDescChange={setProductDesc}
          />

          {/* 生成设置 */}
          <GenerationSettings
            language={language}
            onLanguageChange={setLanguage}
            languages={LANGUAGES}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            quality={quality}
            onQualityChange={setQuality}
            aspectRatios={ASPECT_RATIOS}
            selectedRatios={selectedRatios}
            onRatioToggle={toggleRatio}
            imageCount={imageCount}
            onImageCountChange={setImageCount}
            showImageCount={true}
          />

          {/* Analyze Button */}
          {!analysisResult.length && (
            <button onClick={handleAnalyze} disabled={productImages.length === 0 || analyzing}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed shadow-sm">
              {analyzing ? <><Loader2 size={18} className="animate-spin" /> AI分析中...</> : <><Sparkles size={18} /> AI分析并规划社媒方案</>}
            </button>
          )}

          {/* Re-analyze Button */}
          {analysisResult.length > 0 && (
            <button onClick={handleNewAnalysis}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all shadow-sm">
              <Sparkles size={18} /> 重新分析
            </button>
          )}

          {/* Generate Button */}
          {analysisResult.length > 0 && !isProcessing && (
            <button onClick={handleGenerate}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all shadow-sm">
              <Wand2 size={18} /> 生成社媒宣传图 ({analysisResult.length}张)
            </button>
          )}

        </div>

        {/* Results */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {analyzing && !analysisResult.length ? (
            <div className="flex-1 flex items-center justify-center">
              <LoadingAnimation title="AI分析中..." description={progress || '正在分析产品并规划社媒宣传方案...'} />
            </div>
          ) : !analysisResult.length && results.length === 0 && !isProcessing ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 mx-auto mb-5 bg-gray-100 rounded-2xl flex items-center justify-center">
                  <Share2 size={32} className="text-gray-300" />
                </div>
                <h2 className="text-lg font-semibold text-[#171717] mb-2">海外社媒POV出图</h2>
                <p className="text-sm text-gray-400 leading-relaxed">上传产品图 → AI分析 → 多比例批量出图</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Sticky progress bar during generation */}
              {isProcessing && (
                <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm px-6 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <Loader2 size={16} className="animate-spin text-[#171717]" />
                    <span className="text-sm font-medium text-[#171717]">{progress}</span>
                    <span className="text-xs text-gray-400 ml-auto">已生成 {results.length} 张</span>
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">

              {/* 封面关键词 */}
              {(coverKeywordsCN || coverKeywordsEN) && (
                <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-[#171717]">封面关键词</h3>
                    {showCopyTip === 'cover' && <span className="text-xs text-green-600">已复制</span>}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-400 mb-1.5 block">中文</label>
                      <div className="flex gap-2">
                        <textarea value={coverKeywordsCN} onChange={e => setCoverKeywordsCN(e.target.value)}
                          className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 text-[#171717] placeholder:text-gray-400 min-h-[60px] resize-none" />
                        <button onClick={() => handleCopy(coverKeywordsCN, 'cover')} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#171717] flex-shrink-0"><Copy size={14} /></button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-400 mb-1.5 block">英文</label>
                      <div className="flex gap-2">
                        <textarea value={coverKeywordsEN} onChange={e => setCoverKeywordsEN(e.target.value)}
                          className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 text-[#171717] placeholder:text-gray-400 min-h-[60px] resize-none" />
                        <button onClick={() => handleCopy(coverKeywordsEN, 'cover')} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#171717] flex-shrink-0"><Copy size={14} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Analysis Cards */}
              {analysisResult.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-[#171717] mb-4">AI社媒方案 ({analysisResult.length}张)</h2>
                  <div className="grid grid-cols-1 gap-4">
                    {analysisResult.map((card, idx) => {
                      const gen = results.find(r => r.idx === idx + 1);
                      return (
                        <div key={idx} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="w-6 h-6 bg-[#171717] text-white rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0">{idx + 1}</span>
                              <span className="text-xs font-medium text-gray-400">社媒文案</span>
                              <span className="px-1.5 py-0.5 text-[10px] bg-gray-200 text-gray-500 rounded ml-auto">{card.ratio}</span>
                              <span className="text-[10px] text-gray-400">{card.pov}</span>
                            </div>
                            <div className="space-y-2">
                              <textarea value={card.title} onChange={e => {
                                const next = [...analysisResult];
                                next[idx] = { ...next[idx], title: e.target.value };
                                setAnalysisResult(next);
                                e.target.style.height = 'auto';
                                e.target.style.height = e.target.scrollHeight + 'px';
                              }} placeholder="社媒帖子文案"
                                className="w-full bg-white px-3 py-2 rounded-xl text-sm font-semibold text-[#171717] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 placeholder:text-gray-400 resize-none overflow-hidden"
                                rows={1} />
                              <textarea value={card.description} onChange={e => {
                                const next = [...analysisResult];
                                next[idx] = { ...next[idx], description: e.target.value };
                                setAnalysisResult(next);
                                e.target.style.height = 'auto';
                                e.target.style.height = e.target.scrollHeight + 'px';
                              }} placeholder="配图描述（生图提示词）"
                                className="w-full bg-white rounded-xl p-3 text-sm text-gray-600 leading-relaxed border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none overflow-hidden placeholder:text-gray-400"
                                rows={2} />
                            </div>
                          </div>
                          <div className="p-4">
                            {gen && (
                              <div className="flex gap-4">
                                <div className="w-[120px] flex-shrink-0">
                                  <div className="aspect-[1/1] rounded-xl overflow-hidden bg-gray-100 border border-gray-200 relative group cursor-pointer" onClick={() => setPreviewImage(gen.url)}>
                                    <img src={gen.url} alt="" className="w-full h-full object-cover" />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Generated Images */}
              {results.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-[#171717] mb-4">已生成图片 ({results.length})</h2>
                  <div className="grid grid-cols-2 gap-4">
                    {results.map((item, idx) => (
                      <div key={idx} className="group relative bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
                        <div className="cursor-pointer" onClick={() => setPreviewImage(item.url)}>
                          <img src={item.url} alt="" className="w-full h-full object-cover" style={{ aspectRatio: item.ratio.replace(':', '/') }} />
                        </div>
                        <div className="p-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-600">{item.title}</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded">{item.ratio}</span>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => setReEditImage(item.url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#171717] transition-colors flex-shrink-0" title="微调"><Sparkles size={14} /></button>
                            <button onClick={() => handleDownload(item.url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#171717] transition-colors flex-shrink-0" title="下载"><Download size={14} /></button>

                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
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
        aspectRatio="1:1"
        model={selectedModel}
        resolution={quality}
        onClose={() => setReEditImage(null)}
        onReplaced={(oldUrl, newUrl) => setResults(prev => prev.map(item => item.url === oldUrl ? {...item, url: newUrl} : item))}
      />
    </div>
  );
};

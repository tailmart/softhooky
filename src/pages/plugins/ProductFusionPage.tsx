import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, Layers, Image as ImageIcon, Zap, Check, ChevronDown, Download, Eye, Wand2 } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { analyzeImage } from '../../services/aiChatService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { requireAuth } from '../../utils/authCheck';
import { getAvailableModels } from '../../services/modelService';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import { ModelSpeedNote } from '../../components/ModelSpeedNote';
import { LANGUAGES, getSavedLanguage, saveLanguage } from '../../constants/languages';

const RATIOS = ['自动', '1:1', '3:4', '9:16', '16:9'];
const QUALITIES = ['2K', '4K'];
const BATCH_COUNTS = [1, 2, 3, 4, 5, 6];
const DEFAULT_SCENES = ['简约纯色背景', '室内摄影棚', '户外场景', '街头场景', '咖啡厅', '森林背景'];

export const ProductFusionPage: React.FC = () => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getAvailableModels().then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) setSelectedModel(sorted[0].model_id);
    });
  }, []);
  const [productFiles, setProductFiles] = useState<{ file: File; preview: string }[]>([]);
  const [productScenes, setProductScenes] = useState<{ recommended: string[]; selected: string[]; productDesc?: string; posterEnabled?: boolean; posterTitle?: string; posterDesc?: string }[]>([]);
  const [aspectRatio, setAspectRatio] = useState('自动');
  const [quality, setQuality] = useState('2K');
  const [batchCount, setBatchCount] = useState(1);
  const [selectedModel, setSelectedModel] = useState('');
  const [language, setLanguage] = useState(getSavedLanguage());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const togglePoster = (productIndex: number) => {
    setProductScenes(prev => {
      const updated = [...prev];
      if (!updated[productIndex]) return prev;
      const wasOn = updated[productIndex].posterEnabled;
      updated[productIndex] = { ...updated[productIndex], posterEnabled: !wasOn };
      return updated;
    });
  };

  const updatePosterField = (productIndex: number, key: 'posterTitle' | 'posterDesc', value: string) => {
    setProductScenes(prev => {
      const updated = [...prev];
      if (!updated[productIndex]) return prev;
      updated[productIndex] = { ...updated[productIndex], [key]: value };
      return updated;
    });
  };

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
      setProductScenes(prev => [...prev, ...newItems.map(() => ({ recommended: [], selected: [] }))].slice(0, 10));
    }).catch(err => {
      console.error('图片处理失败:', err);
      alert('部分图片处理失败，请尝试使用更小的图片');
    });

    e.target.value = '';
  };

  const removeProduct = (index: number) => {
    setProductFiles(prev => prev.filter((_, i) => i !== index));
    setProductScenes(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    if (!requireAuth()) return;
    if (productFiles.length === 0) return;
    setIsAnalyzing(true);
    setUploadProgress('正在分析产品...');
    try {
      const newProductScenes = [...productScenes];

      for (let i = 0; i < productFiles.length; i++) {
        setUploadProgress(`正在分析产品 ${i + 1}/${productFiles.length}...`);
        try {
          const productUrl = await fileToDataUrl(productFiles[i].file, 1024);
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
    if (productFiles.length === 0) return;
    const hasSelection = productScenes.some(s => s.selected.length > 0);
    if (!hasSelection) { alert('请至少选择一个场景'); return; }
    setIsProcessing(true);
    setUploadProgress('');
    try {
      const productUrls = await Promise.all(productFiles.map(item => fileToDataUrl(item.file, 1536)));
      imageLibraryService.clearSavedUrlsCache();

      const totalCount = productScenes.reduce((sum, s, p) => sum + s.selected.length * batchCount, 0);
      let currentIndex = 0;

      for (let p = 0; p < productUrls.length; p++) {
        const ps = productScenes[p];
        const scenes = ps?.selected || [];

        // 海报模式：先 AI 分析产品+用户输入，生成优化后的海报文案
        let posterCopy: { title: string; desc: string } | null = null;
        if (ps?.posterEnabled) {
          setUploadProgress(`正在分析产品并优化海报文案...`);
          try {
          const langLabel = LANGUAGES.find(l => l.value === language)?.label || '简体中文';
          const analysisResp = await analyzeImage(
              productUrls[p],
              `你是一位资深的电商海报文案策划师。分析这张产品图片，结合以下用户提供的标题和描述，生成一套全新的、更适合该产品的海报标题和副标题描述。

用户提供的标题：${ps.posterTitle || '（无）'}
用户提供的描述：${ps.posterDesc || '（无）'}
产品AI分析描述：${ps.productDesc || '（无）'}

要求：
- 标题简洁有力，吸引眼球，适合海报主标题（10字以内）
- 副标题/描述：包含产品核心卖点和优势，有说服力（20字以内）
- 风格：电商海报风，符合产品调性
- 如果用户提供了内容，以其为灵感但不要照搬，要优化升级
- 必须结合产品图片特征（颜色、类型、材质等）来创作
- **所有文案使用目标语言：${langLabel}**

只返回JSON格式，不要额外文字：
{"title":"优化后的标题","desc":"优化后的副标题/描述"}`,
              { maxTokens: 1000 }
            );
            const jsonMatch = analysisResp.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              posterCopy = { title: parsed.title || ps.posterTitle || '新品推荐', desc: parsed.desc || ps.posterDesc || '' };
            }
          } catch {}
        }

        for (const scene of scenes) {
          for (let b = 0; b < batchCount; b++) {
            currentIndex++;
            setUploadProgress(`${currentIndex}/${totalCount} 生成中 ${p + 1} ${scene}`);
            try {
              let scenePrompt: string;
              const productDesc = ps?.productDesc ? `${ps.productDesc}，` : '';
              const isSolidBg = scene.includes('纯色背景') || scene.includes('简约背景') || scene.includes('简约纯色');

              // 产品一致性约束
              const productConsistency = '**产品图片必须严格保持不变**：产品造型、颜色、材质、纹理、尺寸比例、文字图案完全不变，仅更换场景/背景，产品本身不能有任何变形或变化；即使语言翻译了，产品本身也不能改变';
              
              // 收集需要生成的prompt列表
              const promptsToGenerate: { prompt: string; ratio: string }[] = [];
              
              // 海报模式
              if (ps?.posterEnabled && posterCopy) {
                const langLabel = LANGUAGES.find(l => l.value === language)?.label || '简体中文';
                const isEnglish = language === 'en';
                const posterPrompt = `商业海报设计。

主标题：${posterCopy.title}
副标题：${posterCopy.desc}
场景：${productDesc}${scene}

🔥 产品质感
突出产品的高级质感表现：精细的材质纹理（磨砂、哑光、光泽、颗粒等不同材质特性）、冷金属光泽感、细腻表面处理；与场景背景的材质（如岩石粗糙纹理、织物柔软质感、木质自然纹理、玻璃通透感等）形成鲜明对比，在光影下材质过渡自然，细节丰富，整体呈现出商业摄影的高级质感。

🔥 构图与光影
电影级构图${isEnglish ? ', strong perspective and layering' : '，强烈的透视层次感'}，前景是场景元素，中景是产品主体，远景是环境背景，层次分明，视觉张力十足；光线采用从侧面和背面照射的明亮自然光，为产品边缘勾勒出明亮的边缘光，产品正面有柔和均匀的填充光，强光与暗部对比强烈，暗部细节丰富，亮部无过度曝光，具有 HDR 效果，采用电影级色彩分级，色彩明亮透明，干净且先进，整体画面明亮而舒缓，具有强烈的电影感。

🔥 文字排版
在图片右上角区域（确保产品主体不受任何遮挡），设置简约的高级字体文字：主标题 "${posterCopy.title}"，副标题 "${posterCopy.desc}"，字体大小适中，风格统一、简洁且高级，${isEnglish ? 'use bold sans-serif typeface' : '使用粗体无衬线字体'}，不会抢夺产品的视觉焦点，符合商业海报规范。

🔥 画质要求
${isEnglish ? '8K ultra-high resolution, commercial advertising photography standard, photorealistic rendering, sharp focus, rich details, accurate color reproduction, no distortion, no deformation, strictly maintain the original product appearance and structure' : '8K 超高清画质，商业广告摄影标准，呈现逼真的照片效果，画面清晰聚焦，细节丰富，色彩还原度高，无失真、无变形，始终保持产品原有的外观和结构'}。
${productConsistency}`;
                promptsToGenerate.push({ prompt: posterPrompt, ratio: '9:16' });
              }
              
              // 背景生成模式
              if (isSolidBg) {
                scenePrompt = `${productDesc}该产品放在纯白色/浅灰色干净背景上居中展示，产品完整清晰细节纹理可见，自然均匀布光，商业产品摄影，高分辨率。${productConsistency}`;
              } else {
                scenePrompt = `将${productDesc}产品图融入${scene}场景中，保持产品清晰完整细节可见，产品主色100%保留，高品质商业摄影，精准边缘识别，避免摩尔纹。${productConsistency}`;
              }
              const normalRatio = aspectRatio === '自动' ? '1:1' : aspectRatio;
              promptsToGenerate.push({ prompt: scenePrompt, ratio: normalRatio });
              
              // 生成所有prompt对应的图片
              for (const { prompt: finalPrompt, ratio: useRatio } of promptsToGenerate) {
                const response = await editImage({ prompt: finalPrompt, images: [productUrls[p]], aspectRatio: useRatio, resolution: quality, model: selectedModel });
                if (response.data?.[0]?.url) {
                  const finalUrl = response.data[0].url;
                  setResults(prev => [finalUrl, ...prev]);
                  imageLibraryService.saveToLibrary({ image_url: finalUrl, prompt: finalPrompt, model: String(selectedModel || 'nanobann2'), aspect_ratio: String(useRatio), resolution: String(quality || '2K'), type: 'edited' });
                }
              }
            } catch {}
          }
        }
      }
      setProductFiles([]); setProductScenes([]);
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

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-14 border-b border-[#E5E5E5] flex-shrink-0 bg-[#F7F7F7]">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center">
          <Layers size={16} className="text-white" />
        </div>
        <h1 className="text-base font-semibold text-[#171717]">场景融合</h1>
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
              <span className="text-[11px] text-[#BDBDBD]">支持上传多张产品图，每张可分别选择场景</span>
            </div>
          </div>

          {/* AI Analyze */}
          <button onClick={handleAnalyze} disabled={productFiles.length === 0 || isAnalyzing || isProcessing}
            className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-[#E5E5E5] disabled:text-[#A3A3A3] disabled:cursor-not-allowed shadow-sm">
            {isAnalyzing ? <><Loader2 size={16} className="animate-spin" /> {uploadProgress}</> : <><Zap size={16} /> AI智能分析场景</>}
          </button>

          {/* Per-Product Scene Selection */}
          {productScenes.some(s => s.recommended.length > 0) && (
            productScenes.map((ps, idx) => (
              productFiles[idx] ? (
                <div key={idx} className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-xl overflow-hidden bg-[#F5F5F5] flex-shrink-0">
                      <img src={productFiles[idx].preview} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-[#171717] block">产品{idx + 1}</span>
                      <span className="text-xs text-[#A3A3A3]">已选{ps.selected.length}/{ps.recommended.length + 1}个场景</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {/* 固定的简约纯色背景选项 */}
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
                  {/* 海报模式开关 */}
                  <div className="mt-3 pt-3 border-t border-[#E5E5E5]">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#525252]">海报模式</span>
                        <span className="text-[10px] text-[#A3A3A3]">{ps.posterEnabled ? '开启后将生成海报' : '关闭'}</span>
                      </div>
                      <button onClick={() => togglePoster(idx)}
                        className={`relative w-9 h-5 rounded-full transition-all ${ps.posterEnabled ? 'bg-blue-500' : 'bg-[#E5E5E5]'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${ps.posterEnabled ? 'left-[18px]' : 'left-0.5'}`} />
                      </button>
                    </div>
                    {ps.posterEnabled && (
                      <div className="space-y-2">
                        <input value={ps.posterTitle || ''} onChange={(e) => updatePosterField(idx, 'posterTitle', e.target.value)}
                          placeholder="输入海报标题（可选，AI会自动优化）"
                          className="w-full bg-[#F5F5F5] px-3 py-2 rounded-xl text-xs text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:text-[#BDBDBD]" />
                        <textarea value={ps.posterDesc || ''} onChange={(e) => updatePosterField(idx, 'posterDesc', e.target.value)}
                          placeholder="输入海报描述/卖点（可选，AI会结合产品分析优化）"
                          className="w-full bg-[#F5F5F5] px-3 py-2 rounded-xl text-xs text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:text-[#BDBDBD] resize-none" rows={2} />
                      </div>
                    )}
                  </div>
                </div>
              ) : null
            ))
          )}

          {/* Settings */}
          {productScenes.some(s => s.selected.length > 0) && (
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
                  <label className="text-xs font-medium text-[#A3A3A3] mb-1.5 block">语言</label>
                  <select value={language} onChange={(e) => { setLanguage(e.target.value); saveLanguage(e.target.value); }}
                    className="w-full bg-[#F5F5F5] px-4 py-3 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-[#171717]/10 appearance-none cursor-pointer">
                    {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
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
          )}

          {/* Generate Button */}
          {productScenes.some(s => s.selected.length > 0) && (
            <button onClick={handleGenerate} disabled={isProcessing}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-[#E5E5E5] disabled:text-[#A3A3A3] disabled:cursor-not-allowed shadow-sm">
              {isProcessing ? <><Loader2 size={18} className="animate-spin" /> {uploadProgress}</> : <><Sparkles size={18} /> 开始生成</>}
            </button>
          )}
        </div>

        {/* Right: Results - 实时显示，出一张显示一张 */}
        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
          {!isProcessing && !isAnalyzing && results.length === 0 ? (
            <div className="flex-1 flex items-center justify-center overflow-y-auto px-6">
              <div className="max-w-sm text-center py-8">
                <div className="w-16 h-16 mx-auto mb-5 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-2xl flex items-center justify-center border border-blue-100">
                  <Layers size={28} className="text-blue-500" />
                </div>
                <h2 className="text-xl font-bold text-[#171717] mb-2">AI 产品视觉</h2>
                <p className="text-sm text-[#A3A3A3] mb-6">上传产品图片，左侧选择场景，一键生成专业产品视觉</p>

                {/* 功能卡片 */}
                <div className="space-y-3 text-left">
                  <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-400 flex items-center justify-center flex-shrink-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 3v18M3 12h18"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-[#171717]">场景融合</h3>
                        <p className="text-xs text-[#A3A3A3]">产品融入各种场景 · 简约纯色背景 · 视觉张力十足</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-400 flex items-center justify-center flex-shrink-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-[#171717]">海报设计</h3>
                        <p className="text-xs text-[#A3A3A3]">AI 智能文案优化 · 专业海报排版 · 多语言支持</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-4 border border-blue-100">
                  <p className="text-xs text-[#737373] leading-relaxed">
                    💡 左侧上传产品图 → 点击 <strong>AI智能分析场景</strong> → 选择场景 →
                    <br />开启 <strong>海报</strong> 模式（可选） →
                    <br />点击 <strong>开始生成</strong> 即可出图
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6">
              {/* 分析中的进度指示 */}
              {isAnalyzing && results.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-blue-500/5 rounded-full blur-3xl animate-pulse" />
                    <div className="relative w-24 h-24 rounded-full border-4 border-[#E5E5E5] border-t-blue-500 border-r-blue-400 animate-spin" />
                  </div>
                  <div className="flex flex-col items-center gap-2 mb-6">
                    <h3 className="text-lg font-semibold text-[#171717]">AI 正在分析产品</h3>
                    <p className="text-sm text-[#A3A3A3]">{uploadProgress || '识别产品类型并推荐融合场景...'}</p>
                  </div>
                  {/* 上传的产品缩略图 */}
                  {productFiles.length > 0 && (
                    <div className="flex items-center gap-3">
                      {productFiles.map((item, idx) => (
                        <div key={idx} className="relative">
                          <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-blue-400/50 shadow-lg shadow-blue-500/10 animate-pulse">
                            <img src={item.preview} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                            <Loader2 size={10} className="text-white animate-spin" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1.5 mt-6">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              {/* 生成中的进度指示（还没有结果时） */}
              {isProcessing && !isAnalyzing && results.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-blue-500/5 rounded-full blur-3xl animate-pulse" />
                    <div className="relative w-24 h-24 rounded-full border-4 border-[#E5E5E5] border-t-blue-500 border-r-blue-400 animate-spin" />
                  </div>
                  <div className="flex flex-col items-center gap-2 mb-6">
                    <h3 className="text-lg font-semibold text-[#171717]">正在生成融合图</h3>
                    <p className="text-sm text-[#A3A3A3]">{uploadProgress || 'AI 视觉引擎全力运行中...'}</p>
                  </div>
                  <div className="w-48 h-2 bg-[#F5F5F5] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full animate-pulse" style={{ width: '60%' }} />
                  </div>
                  <div className="flex gap-1.5 mt-6">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              {/* 融合结果 - 出图即显示 */}
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
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                    {results.map((url, idx) => (
                      <div key={idx} className="group relative bg-[#FAFAFA] rounded-2xl overflow-hidden border border-[#E5E5E5]">
                        <div className="aspect-square cursor-pointer" onClick={() => setPreviewImage(url)}>
                          <img src={url} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-[#525252]">融合 #{idx + 1}</span>
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

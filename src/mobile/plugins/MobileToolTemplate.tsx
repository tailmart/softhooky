import React, { useState, useRef, useCallback } from 'react';
import {
  Upload, X, Loader2, Sparkles, ChevronDown, Check,
  Image as ImageIcon, Plus, AlertTriangle, Download, Coins
} from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { analyzeMultipleImages } from '../../services/aiChatService';
import { editImage, generateImage } from '../../services/imageService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { useAuth } from '../../contexts/AuthContext';
import { getGeneratePrice } from '../../services/pricingService';
import { getAvailableModels } from '../../services/modelService';
import { getAuthToken } from '../../services/authService';
import { RatioPicker } from '../components/RatioPicker';

// ==================== Types ====================

export type { ToolOption, ToolConfig };

export interface ToolOption {
  value: string;
  label: string;
}

export interface ToolConfig {
  id: string;
  title: string;
  description?: string;
  /** 上传类型 */
  uploadType: 'product' | 'reference' | 'both' | 'none';
  maxUploads: number;
  /** 是否需要AI分析步骤 */
  hasAnalysis: boolean;
  analysisPrompt?: string;
  /** 生成配置 */
  defaultModel: string;
  models?: ToolOption[];
  aspectRatios?: ToolOption[];
  defaultAspectRatio?: string;
  /** 文本输入 */
  textInputLabel?: string;
  textInputPlaceholder?: string;
  textInputRequired?: boolean;
  /** 第二文本输入（如产品描述） */
  textInput2Label?: string;
  textInput2Placeholder?: string;
  /** 数量选择 */
  hasCountSelector?: boolean;
  defaultCount?: number;
  maxCount?: number;
  /** 语言选择（支持多语言配置） */
  hasLanguageSelector?: boolean;
  languages?: ToolOption[];
  /** 画质选择 */
  hasQualitySelector?: boolean;
  /** 结果类型 */
  resultType: 'image' | 'video' | 'text';
  /** 扩展提示词后缀（生成时附加到用户输入后） */
  promptSuffix?: string;
  /** 分析完成后是否自动生成（默认 false：展示分析结果后手动点生成） */
  autoGenerate?: boolean;
  /** 隐藏数量选择器（autoGenerate 时配合 defaultCount 使用） */
  hideCountSelector?: boolean;
  /** 比例多选（如社媒POV支持同时选多个比例） */
  multiSelectRatios?: boolean;
}

// ==================== Bottom Sheet Picker ====================

interface BottomSheetProps {
  open: boolean;
  title: string;
  options: ToolOption[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

const BottomSheet: React.FC<BottomSheetProps> = ({ open, title, options, selected, onSelect, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full bg-white rounded-t-3xl pb-[calc(16px+env(safe-area-inset-bottom,0px))] animate-mobile-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#f0f0f0]">
          <h3 className="text-base font-bold text-[#171717]">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f5f5f5]">
            <X size={16} className="text-[#737373]" />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-3 py-2">
          {options.map(opt => {
            const isSelected = selected === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => { onSelect(opt.value); onClose(); }}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl my-0.5 transition-colors ${
                  isSelected ? 'bg-[#f5f5f5] font-semibold' : 'hover:bg-[#fafafa]'
                }`}
              >
                <span className={`text-sm ${isSelected ? 'text-[#171717]' : 'text-[#525252]'}`}>{opt.label}</span>
                {isSelected && <Check size={18} className="text-[#171717]" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ==================== Image Result Card ====================

interface ImageResultProps {
  url: string;
  onDownload?: () => void;
}

const ImageResultCard: React.FC<ImageResultProps> = ({ url, onDownload }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="mobile-card overflow-hidden">
        <div className="relative aspect-square bg-[#fafafa]">
          <img src={url} alt="result" className="w-full h-full object-contain cursor-pointer"
            onClick={() => setExpanded(true)} loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23d4d4d4%22 stroke-width=%222%22%3E%3Crect x=%223%22 y=%223%22 width=%2218%22 height=%2218%22 rx=%222%22/%3E%3Ccircle cx=%228.5%22 cy=%228.5%22 r=%221.5%22/%3E%3Cpolyline points=%2221 15 16 10 5 21%22/%3E%3C/svg%3E'; }} />
        </div>
        <div className="flex items-center justify-center px-3 py-2.5 border-t border-[#f5f5f5]">
          <button onClick={onDownload} className="mobile-tap flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#f5f5f5] text-[#525252] text-xs font-medium w-full">
            <Download size={14} /> 下载
          </button>
        </div>
      </div>

      {expanded && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setExpanded(false)}>
          <img src={url} alt="full" className="max-w-full max-h-full object-contain"
            onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23d4d4d4%22 stroke-width=%222%22%3E%3Crect x=%223%22 y=%223%22 width=%2218%22 height=%2218%22 rx=%222%22/%3E%3Ccircle cx=%228.5%22 cy=%228.5%22 r=%221.5%22/%3E%3Cpolyline points=%2221 15 16 10 5 21%22/%3E%3C/svg%3E'; }} />
          <button className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <X size={20} className="text-white" />
          </button>
        </div>
      )}
    </>
  );
};

// ==================== Main Template ====================

interface MobileToolTemplateProps {
  config: ToolConfig;
  onBack: () => void;
}

export const MobileToolTemplate: React.FC<MobileToolTemplateProps> = ({ config, onBack }) => {
  const { isAuthenticated, user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);

  // Upload
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [templateFiles, setTemplateFiles] = useState<string[]>([]);

  // Options
  const [selectedModel, setSelectedModel] = useState(config.defaultModel);
  const [selectedRatio, setSelectedRatio] = useState(config.defaultAspectRatio || '1:1');
  const [selectedRatios, setSelectedRatios] = useState<string[]>([config.defaultAspectRatio || '1:1']);
  const [selectedLang, setSelectedLang] = useState('zh');
  const [selectedQuality, setSelectedQuality] = useState('2K');
  const [count, setCount] = useState(config.defaultCount || 1);
  const [textInput, setTextInput] = useState('');
  const [textInput2, setTextInput2] = useState('');

  // Bottom sheet state
  const [sheetOpen, setSheetOpen] = useState<string | null>(null);

  // Server-provided models
  const [availableModels, setAvailableModels] = useState<ToolOption[]>(config.models || []);

  // Results
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatePrice, setGeneratePrice] = useState(0.3);
  const [error, setError] = useState('');

  // Load pricing + models from server
  React.useEffect(() => {
    getGeneratePrice().then(setGeneratePrice);
    getAvailableModels().then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      if (sorted.length > 0) {
        setAvailableModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
        if (!config.models || config.models.length === 0) {
          setSelectedModel(sorted[0].model_id);
        }
      }
    });
  }, []);

  // Handle file upload
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const newUrls: string[] = [];
    for (let i = 0; i < Math.min(files.length, config.maxUploads - uploadedFiles.length); i++) {
      try {
        const dataUrl = await fileToDataUrl(files[i]);
        newUrls.push(dataUrl);
      } catch {}
    }
    setUploadedFiles(prev => [...prev, ...newUrls].slice(0, config.maxUploads));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [uploadedFiles.length, config.maxUploads]);

  const removeFile = useCallback((idx: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleTemplateChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const urls: string[] = [];
    for (let i = 0; i < Math.min(files.length, 3 - templateFiles.length); i++) {
      try { urls.push(await fileToDataUrl(files[i])); } catch {}
    }
    setTemplateFiles(prev => [...prev, ...urls].slice(0, 3));
    if (templateInputRef.current) templateInputRef.current.value = '';
  }, [templateFiles.length]);

  const removeTemplateFile = useCallback((idx: number) => {
    setTemplateFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // 生成（供分析流程和独立生成按钮调用）
  const doGenerate = useCallback(async (analysisText?: string) => {
    if (!isAuthenticated || (!uploadedFiles.length && !textInput.trim())) return;
    setIsGenerating(true);
    setError('');

    const descParts = [textInput.trim()];
    if (textInput2.trim()) descParts.push(`产品描述：${textInput2.trim()}`);
    const prompt = [descParts.join('\n'), config.promptSuffix || ''].filter(Boolean).join('\n');
    const analysisInput = analysisText || analysisResult;
    // 追加语言和比例信息到生成提示词
    const langExtra: string[] = [];
    if (config.languages?.length) {
      const langNames: Record<string, string> = { zh: 'Chinese', en: 'English', ja: 'Japanese', ko: 'Korean' };
      const langName = langNames[selectedLang] || selectedLang;
      langExtra.push(`所有文字必须使用${langName}生成，禁止使用其他语言。Target language: ${langName}.`);
    }
    // 多选比例时，每个循环用不同的比例
    const ratioList = config.multiSelectRatios && selectedRatios.length > 0 ? selectedRatios : [selectedRatio];

    try {
      let lastUrls: string[] = [];
      const allImages = [...uploadedFiles, ...templateFiles];
      const hasImages = allImages.length > 0;
      const loopCount = config.hasCountSelector ? count : 1;

      for (let n = 0; n < loopCount; n++) {
        const currentRatio = ratioList[n % ratioList.length];
        // 多张生成时加入序号，避免每张提示词完全一致
        const seqExtra = loopCount > 1 ? `\n---\n这是第 ${n + 1} 张 / ${loopCount} 张，与上一张的构图、角度、展示内容必须有明显区别 ---\n` : '';
        // 分析方案和用户输入合并作为生成提示词
        const genBase = [prompt, analysisInput ? `按照以下方案生成：${analysisInput}` : ''].filter(Boolean).join('\n\n') || '优化这张图片';
        const finalLangExtra = [...langExtra, `图片比例：${currentRatio}`];
        if (hasImages) {
          const finalPrompt = [seqExtra, genBase, ...finalLangExtra].filter(Boolean).join('\n');
          const result = await editImage({ prompt: finalPrompt, images: allImages, model: selectedModel, aspectRatio: currentRatio, resolution: config.hasQualitySelector ? selectedQuality : undefined });
          const urls = (Array.isArray(result.data) ? result.data : [result]).map((item: any) => item.url || item.image_url || '').filter(Boolean);
          if (urls.length > 0) setGeneratedImages(prev => [...urls, ...prev].slice(0, 50));
          lastUrls = [...lastUrls, ...urls];
        } else {
          const result = await generateImage({ prompt: seqExtra + genBase, model: selectedModel, aspectRatio: currentRatio, resolution: config.hasQualitySelector ? selectedQuality : undefined });
          const urls = (Array.isArray(result.data) ? result.data : [result]).map((item: any) => item.url || item.image_url || '').filter(Boolean);
          if (urls.length > 0) setGeneratedImages(prev => [...urls, ...prev].slice(0, 50));
          lastUrls = [...lastUrls, ...urls];
        }
      }
      if (lastUrls.length > 0) window.dispatchEvent(new Event('credits-updated'));
    } catch (err: any) { setError(err.message || '生成失败，请稍后重试'); }
    finally { setIsGenerating(false); }
  }, [isAuthenticated, uploadedFiles, textInput, textInput2, analysisResult, config, selectedModel, selectedRatios, selectedRatio, selectedLang, count]);

  const handleGenerate = useCallback(async () => { doGenerate(); }, [doGenerate]);

  const handleAnalyze = useCallback(async () => {
    if (!uploadedFiles.length || !config.analysisPrompt) return;
    setIsAnalyzing(true);
    setError('');
    try {
      let promptText = config.analysisPrompt
        .replace(/\{variationCount\}/g, String(count))
        .replace(/\{productCount\}/g, String(uploadedFiles.length))
        .replace(/\{count\}/g, String(count));
      const extras = [];
      if (textInput.trim()) extras.push(`产品名称：${textInput.trim()}`);
      if (textInput2.trim()) extras.push(`产品描述：${textInput2.trim()}`);
      const langNames: Record<string, string> = { zh: 'Chinese', en: 'English', ja: 'Japanese', ko: 'Korean' };
      const langName = langNames[selectedLang] || selectedLang;
      extras.push(`目标语言：${langName}，所有文字使用${langName}`);
      if (config.aspectRatios?.length) {
        extras.push(config.multiSelectRatios ? `可选比例：${selectedRatios.join(', ')}` : `图片比例：${selectedRatio}`);
      }
      if (extras.length > 0) promptText += `\n\n=====\n\n${extras.join('\n')}`;
      const result = await analyzeMultipleImages(uploadedFiles, promptText);
      setAnalysisResult(result);
      // autoGenerate = true 时分析后自动生成，不展示分析结果
      if (config.autoGenerate) {
        await doGenerate(result);
      }
    } catch (err: any) { setError(err.message || '分析失败'); }
    finally { setIsAnalyzing(false); }
  }, [uploadedFiles, config.analysisPrompt, count, textInput, textInput2, selectedLang, selectedRatio, selectedRatios, config.autoGenerate, config.multiSelectRatios, doGenerate]);

  // Download image
  const handleDownload = useCallback(async (url: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `softhooky_${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {}
  }, []);

  const needsUpload = config.uploadType !== 'none';
  const hasUploads = uploadedFiles.length > 0 || (config.uploadType === 'both' && templateFiles.length > 0);
  const canAnalyze = !!(needsUpload && uploadedFiles.length > 0 && config.hasAnalysis);
  const canGenerate = !!((!needsUpload || hasUploads) && (textInput.trim() || !config.textInputRequired));

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-[#0a0a0a] flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] mobile-tap">
          <X size={16} className="text-white/40" />
        </button>
        <h1 className="text-base font-bold text-white">{config.title}</h1>
        {isAuthenticated && user && (
          <div className="ml-auto flex items-center gap-1 bg-blue-500/10 px-2.5 py-1 rounded-full">
            <Coins size={12} className="text-blue-400" />
            <span className="text-xs font-semibold text-blue-400">{Number(user.credits || 0).toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-32 space-y-4">
          {config.description && (
            <p className="text-xs text-[#a3a3a3] leading-relaxed">{config.description}</p>
          )}

          {/* Upload Section */}
          {needsUpload && (
            <div>
              <label className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2 block">
                上传产品图片 {config.uploadType === 'both' && ''}
              </label>
              <div className="flex gap-2.5 flex-wrap">
                {uploadedFiles.map((url, idx) => (
                  <div key={idx} className="relative w-[72px] h-[72px] rounded-xl overflow-hidden bg-white border border-[#eee] flex-shrink-0">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeFile(idx)} className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center">
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                ))}
                {uploadedFiles.length < config.maxUploads && (
                  <button onClick={() => fileInputRef.current?.click()} className="mobile-tap w-[72px] h-[72px] rounded-xl border-2 border-dashed border-[#ddd] flex flex-col items-center justify-center gap-1 bg-white/50">
                    <Plus size={20} className="text-[#bbb]" />
                    <span className="text-[9px] text-[#bbb]">上传</span>
                  </button>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleFileChange} />
            </div>
          )}

          {/* Template Upload (for 'both' type) */}
          {config.uploadType === 'both' && (
            <div>
              <label className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2 block">
                上传模板参考图 <span className="text-[#bdbdbd] normal-case">（可选）</span>
              </label>
              <div className="flex gap-2.5 flex-wrap">
                {templateFiles.map((url, idx) => (
                  <div key={idx} className="relative w-[72px] h-[72px] rounded-xl overflow-hidden bg-white border border-[#eee] flex-shrink-0">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeTemplateFile(idx)} className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center">
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                ))}
                {templateFiles.length < 3 && (
                  <button onClick={() => templateInputRef.current?.click()} className="mobile-tap w-[72px] h-[72px] rounded-xl border-2 border-dashed border-[#ddd] flex flex-col items-center justify-center gap-1 bg-white/50">
                    <Plus size={20} className="text-[#bbb]" />
                    <span className="text-[9px] text-[#bbb]">模板</span>
                  </button>
                )}
              </div>
              <input ref={templateInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleTemplateChange} />
            </div>
          )}

          {/* Options Section */}
          <div className="space-y-3">
                      {/* Text Input */}
          {config.textInputLabel && (
            <div>
              <label className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2 block">
                {config.textInputLabel}
                {config.textInputRequired && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              <textarea
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                placeholder={config.textInputPlaceholder || '请输入...'}
                rows={3}
                className="w-full px-4 py-3 bg-white rounded-xl border border-[#eee] text-sm text-[#171717] placeholder-[#bdbdbd] resize-none outline-none focus:border-[#171717] transition-colors"
              />
            </div>
          )}

          {/* 第二文本输入（产品描述等） */}
          {config.textInput2Label && (
            <div>
              <label className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2 block">
                {config.textInput2Label}
              </label>
              <textarea
                value={textInput2}
                onChange={e => setTextInput2(e.target.value)}
                placeholder={config.textInput2Placeholder || '可选'}
                rows={3}
                className="w-full px-4 py-3 bg-white rounded-xl border border-[#eee] text-sm text-[#171717] placeholder-[#bdbdbd] resize-none outline-none focus:border-[#171717] transition-colors"
              />
            </div>
          )}

            {/* Language Selector */}
            {(config.languages || config.hasLanguageSelector) && (
              <div>
                <label className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2 block">语言</label>
                <div className="flex gap-2 mobile-scroll-x">
                  {(config.languages || [{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }]).map(lang => {
                    const isActive = selectedLang === lang.value;
                    return (
                      <button key={lang.value} onClick={() => setSelectedLang(lang.value)}
                        className={`mobile-tap flex-shrink-0 py-2.5 px-4 rounded-xl text-xs font-medium transition-all ${
                          isActive ? 'bg-blue-500 text-white shadow-sm shadow-blue-200/50' : 'bg-white text-[#737373] border border-[#eee]'
                        }`}>{lang.label}</button>
                    );
                  })}
                </div>
              </div>
            )}

{/* Model Selector */}
            {availableModels && availableModels.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2 block">模型</label>
                <button
                  onClick={() => setSheetOpen('model')}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-[#eee] text-sm"
                >
                  <span className="text-[#171717]">{availableModels.find(m => m.value === selectedModel)?.label || selectedModel}</span>
                  <ChevronDown size={16} className="text-[#a3a3a3]" />
                </button>
                <BottomSheet
                  open={sheetOpen === 'model'}
                  title="选择模型"
                  options={availableModels}
                  selected={selectedModel}
                  onSelect={setSelectedModel}
                  onClose={() => setSheetOpen(null)}
                />
              </div>
            )}

            {/* Aspect Ratio */}
            {config.aspectRatios && config.aspectRatios.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2 block">比例{config.multiSelectRatios ? '（可多选）' : ''}</label>
                {config.multiSelectRatios ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    {config.aspectRatios.map(r => {
                      const isOn = selectedRatios.includes(r.value);
                      const [w, h] = r.value.split(':').map(Number);
                      const isWide = w && h && w / h > 1;
                      const parts = r.label.split(' ');
                      const ratioStr = parts[0] || r.value;
                      const platform = parts.slice(1).join(' ');
                      return (
                        <button key={r.value} onClick={() => setSelectedRatios(prev =>
                          prev.includes(r.value) ? prev.filter(v => v !== r.value) : [...prev, r.value]
                        )                        } className={`mobile-tap flex items-center gap-3 px-4 py-3 rounded-2xl text-sm transition-all ${
                          isOn ? 'bg-blue-500 text-white shadow-sm shadow-blue-200/50' : 'bg-white text-[#525252] border border-[#eee]'
                        }`}>
                          <div className={`flex-shrink-0 rounded border-2 transition-colors ${
                            isWide ? 'w-6 h-4' : 'w-4 h-6'
                          } ${isOn ? 'border-white/70 bg-white/15' : 'border-[#d4d4d4]'}`} />
                          <div className="flex-1 text-left min-w-0">
                            <div className={`font-semibold text-xs ${isOn ? 'text-white' : 'text-[#171717]'}`}>{ratioStr}</div>
                            {platform && <div className={`text-[10px] truncate ${isOn ? 'text-white/50' : 'text-[#a3a3a3]'}`}>{platform}</div>}
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            isOn ? 'border-white bg-white/20' : 'border-[#d4d4d4]'
                          }`}>
                            {isOn && <Check size={12} className="text-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <RatioPicker options={config.aspectRatios} selected={selectedRatio} onChange={setSelectedRatio} />
                )}
              </div>
            )}

            {/* Count Selector */}
            {config.hasCountSelector && !config.hideCountSelector && (
              <div>
                <label className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2 block">生成数量</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCount(prev => Math.max(1, prev - 1))}
                    className="w-10 h-10 rounded-xl bg-white border border-[#eee] flex items-center justify-center text-lg font-medium text-[#171717]"
                  >
                    -
                  </button>
                  <span className="w-10 text-center text-base font-semibold text-[#171717]">{count}</span>
                  <button
                    onClick={() => setCount(prev => Math.min(config.maxCount || 10, prev + 1))}
                    className="w-10 h-10 rounded-xl bg-white border border-[#eee] flex items-center justify-center text-lg font-medium text-[#171717]"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {/* Quality Selector */}
            {config.hasQualitySelector && (
              <div>
                <label className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-2 block">画质</label>
                <div className="flex gap-2">
                  {[{ value: '2K', label: '2K' }, { value: '4K', label: '4K' }].map(q => (
                    <button key={q.value} onClick={() => setSelectedQuality(q.value)}
                      className={`mobile-tap flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        selectedQuality === q.value ? 'bg-blue-500 text-white shadow-sm shadow-blue-200/50' : 'bg-white text-[#737373] border border-[#eee]'
                      }`}>{q.label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5">
            {config.hasAnalysis && (
              <>
                <button
                  onClick={handleAnalyze}
                  disabled={!canAnalyze || isAnalyzing}
                  className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-sm font-semibold transition-all ${
                    canAnalyze && !isAnalyzing
                      ? 'bg-white text-[#171717] border border-[#ddd] active:bg-[#f5f5f5]'
                      : 'bg-[#f5f5f5] text-[#bbb]'
                  }`}
                >
                  {isAnalyzing ? (
                    <><Loader2 size={16} className="animate-spin" /> AI 分析中...</>
                  ) : (
                    <><Sparkles size={16} /> AI 分析产品</>
                  )}
                </button>

                {/* 分析结果展示（autoGenerate 时不展示，直接出图） */}
                {analysisResult && !isAnalyzing && !config.autoGenerate && (
                  <div className="bg-white rounded-2xl border border-[#eee] p-4 space-y-2">
                    <h3 className="text-xs font-bold text-[#999] uppercase tracking-wider">AI 分析结果</h3>
                    <div className="text-xs text-[#525252] leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                      {analysisResult}
                    </div>
                  </div>
                )}

                {/* 生成图片按钮（分析完成后显示，autoGenerate 时不展示） */}
                {analysisResult && !isAnalyzing && !config.autoGenerate && (
                  <button
                    onClick={isAuthenticated ? handleGenerate : () => window.dispatchEvent(new Event('mobile-auth-required'))}
                    disabled={isAuthenticated ? isGenerating : false}
                    className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-sm font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white active:from-blue-600 active:to-blue-700 transition-all shadow-sm shadow-blue-200/50 disabled:opacity-40"
                  >
                    {!isAuthenticated ? (
                      <><AlertTriangle size={16} /> 登录后使用</>
                    ) : isGenerating ? (
                      <><Loader2 size={16} className="animate-spin" /> 生成中...</>
                    ) : (
                      <><Sparkles size={16} /> 生成图片 ({generatePrice}积分/张)</>
                    )}
                  </button>
                )}
              </>
            )}

            {/* 无分析功能的工具：直接显示生成按钮 */}
            {!config.hasAnalysis && (
              <button
                onClick={isAuthenticated ? handleGenerate : () => window.dispatchEvent(new Event('mobile-auth-required'))}
                disabled={isAuthenticated ? (isGenerating || !canGenerate) : false}
                className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-sm font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white active:from-blue-600 active:to-blue-700 transition-all shadow-sm shadow-blue-200/50 disabled:opacity-40"
              >
                {!isAuthenticated ? (
                  <><AlertTriangle size={16} /> 登录后使用</>
                ) : isGenerating ? (
                  <><Loader2 size={16} className="animate-spin" /> 生成中...</>
                ) : (
                  <><Sparkles size={16} /> 生成 ({generatePrice}积分/张)</>
                )}
              </button>
            )}

            {error && (
              <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}
          </div>

          {/* Results */}
          {generatedImages.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ImageIcon size={16} className="text-[#171717]" />
                <h2 className="text-sm font-bold text-[#171717]">生成结果</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {generatedImages.map((url, idx) => (
                  <ImageResultCard
                    key={`${url}-${idx}`}
                    url={url}
                    onDownload={() => handleDownload(url)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

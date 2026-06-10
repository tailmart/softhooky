import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Loader2, Sparkles, Coins, Copy, Check, Plus, ChevronDown, AlertTriangle } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { chatCompletion, analyzeMultipleImages } from '../../services/aiChatService';
import { useAuth } from '../../contexts/AuthContext';
import { getAvailableModels } from '../../services/modelService';

const SCRIPTS = [
  { id: 'template1', label: '痛点场景', title: '痛点场景 → 解决方案 → 行动号召',
    structure: ['钩子/痛点放大 — 抓住注意力，描述用户遇到的麻烦','痛点解决/产品卖点 — 展示产品如何解决痛点，突出核心卖点','行动号召 — 限时优惠，催促下单'] },
  { id: 'template2', label: '问题推荐', title: '问题场景 → 产品推荐 → 行动号召',
    structure: ['问题场景钩子 — 指出用户可能遇到的问题或风险','解决方案/产品推荐 — 介绍产品如何解决问题','行动号召 — 价格优惠，促使用户行动'] },
  { id: 'template3', label: '好物推荐', title: '低价好物推荐',
    structure: ['观点钩子 — 以惊艳语气吸引注意力，强调超值','产品推荐+卖点 — 详细展示产品及使用方式，强调便利性和体验','行动号召 — 强调超低价格，鼓动立即购买'] },
  { id: 'template4', label: '避坑展示', title: '展示缺陷（悲催经历）',
    structure: ['展示缺陷/痛点 — 描述用户的错误经历或糟糕选择带来的后果','解决方案 — 介绍正确方案/产品，说明如何避免问题'] },
  { id: 'template5', label: '建议推荐', title: '如果我是你（建议式）',
    structure: ['建议钩子 — "如果我是你…" 语气，建立共情','推荐理由 — 说明产品或方法如何节省时间/金钱/麻烦'] },
  { id: 'template6', label: '反串抓马', title: '海外短视频·反串抓马爆款模板（适配TikTok/Reels）',
    structure: ['黄金3秒王炸开篇 — 极致反差造型面对痛点场景','冲突爆点 — 第二角色出场制造冲突','爽点反转 — 使用产品后问题瞬间解决','高频混剪 — 快切多个同类痛点场景','收尾转化口播 — 人物同框举产品，口播号召下单'] },
  { id: 'template7', label: '反差对比', title: '反差对比型 — 前后视觉冲击对比',
    structure: ['痛苦现状 — 描述用户当前遇到的麻烦/低效','优质对比 — 展示产品/方法带来的效果','极致爽感 — 突出前后差异带来的视觉冲击','情绪反馈 — 使用者的惊喜表情或真实感受','信任背书 — 数据/销量/用户评价增强可信度','行动号召 — 限时/限量/独家优惠推动下单'] },
];

const LANGUAGES = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
];

interface MobileTikTokProps { onBack: () => void; }

export const MobileTikTok: React.FC<MobileTikTokProps> = ({ onBack }) => {
  const { isAuthenticated, user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<string[]>([]);
  const [product, setProduct] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('template1');
  const [lang, setLang] = useState('zh');
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState('deepseek-chat');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<string | null>(null);

  useEffect(() => {
    getAvailableModels(['seedream']).then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      if (sorted.length > 0) setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
    });
  }, []);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const urls = await Promise.all(Array.from(files).slice(0, 3).map(f => fileToDataUrl(f)));
    setImages(prev => [...prev, ...urls].slice(0, 3));
    if (e.target) e.target.value = '';
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!product.trim()) return;
    setIsGenerating(true); setError('');
    const tmpl = SCRIPTS.find(t => t.id === selectedTemplate);
    try {
      let prompt = `你是一个TikTok短视频脚本专家。根据以下产品信息和脚本模板，生成短视频脚本。

产品：${product}
脚本模板：${tmpl?.title}
结构要求：
${tmpl?.structure.map((s, i) => `${i + 1}. ${s}`).join('\n')}

要求：
- 时长约30-60秒
- 语言：${lang === 'zh' ? '中文' : 'English'}
- 输出包含：标题 + 脚本正文（含画面描述和旁白/台词）`;

      if (images.length > 0) {
        const analysis = await analyzeMultipleImages(images, '分析这些产品图片，描述产品外观、特点、使用场景，用于生成带货脚本。');
        prompt += `\n\n产品图片分析：${analysis}`;
      }

      const res = await chatCompletion([{ role: 'user', content: prompt }]);
      setResult(res);
    } catch (err: any) { setError(err.message || '生成失败'); }
    finally { setIsGenerating(false); }
  }, [product, selectedTemplate, lang, images]);

  const handleCopy = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(result).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  }, [result]);

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#f0f0f0] bg-white flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f5f5f5] mobile-tap"><X size={16} className="text-[#737373]" /></button>
        <h1 className="text-base font-bold text-[#171717]">TK视频脚本</h1>
        {isAuthenticated && user && <div className="ml-auto flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-full"><Coins size={12} className="text-amber-500" /><span className="text-xs font-semibold text-amber-600">{Number(user.credits || 0).toFixed(1)}</span></div>}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-32 space-y-4">
          {/* Image Upload */}
          <div>
            <label className="text-xs font-semibold text-[#999] mb-2 block">产品图片 <span className="text-[#bdbdbd]">（可选）</span></label>
            <div className="flex gap-2.5 flex-wrap">
              {images.map((url, i) => <div key={i} className="relative w-[72px] h-[72px] rounded-xl overflow-hidden bg-white border border-[#eee]"><img src={url} className="w-full h-full object-cover" /><button onClick={() => setImages(p => p.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center"><X size={10} className="text-white" /></button></div>)}
              {images.length < 3 && <button onClick={() => fileRef.current?.click()} className="w-[72px] h-[72px] rounded-xl border-2 border-dashed border-[#ddd] flex items-center justify-center bg-white/50"><Plus size={20} className="text-[#bbb]" /></button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
          </div>

          {/* Product Input */}
          <div>
            <label className="text-xs font-semibold text-[#999] mb-2 block">产品名称 / 描述 <span className="text-red-400">*</span></label>
            <textarea value={product} onChange={e => setProduct(e.target.value)} placeholder="例如：一款便携式蓝牙音箱，防水设计，续航20小时..." rows={3} className="w-full px-4 py-3 bg-white rounded-xl border border-[#eee] text-sm resize-none outline-none" />
          </div>

          {/* Template Selector */}
          <div>
            <label className="text-xs font-semibold text-[#999] mb-2 block">脚本模板</label>
            <div className="mobile-scroll-x -mx-1"><div className="flex gap-2 px-1 pb-1">
              {SCRIPTS.map(t => (
                <button key={t.id} onClick={() => setSelectedTemplate(t.id)}
                  className={`mobile-tap flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                    selectedTemplate === t.id ? 'bg-[#171717] text-white shadow-sm' : 'bg-white text-[#737373] border border-[#eee]'
                  }`}>{t.label}</button>
              ))}
            </div></div>
            <p className="text-[11px] text-[#a3a3a3] mt-1.5">{SCRIPTS.find(t => t.id === selectedTemplate)?.title}</p>
          </div>

          {/* Language */}
          <div>
            <label className="text-xs font-semibold text-[#999] mb-2 block">语言</label>
            <div className="flex gap-2">{LANGUAGES.map(l => <button key={l.value} onClick={() => setLang(l.value)} className={`mobile-tap flex-1 py-2.5 rounded-xl text-xs font-medium transition-all ${lang === l.value ? 'bg-[#171717] text-white shadow-sm' : 'bg-white text-[#737373] border border-[#eee]'}`}>{l.label}</button>)}</div>
          </div>

          {/* Generate */}
          <button onClick={isAuthenticated ? handleGenerate : () => window.dispatchEvent(new Event('mobile-auth-required'))} disabled={!product.trim() || isGenerating}
            className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-sm font-bold bg-[#171717] text-white active:bg-[#333] transition-all shadow-sm disabled:opacity-50">
            {!isAuthenticated ? <><AlertTriangle size={16} /> 登录后使用</> : isGenerating ? <><Loader2 size={16} className="animate-spin" /> 生成中...</> : <><Sparkles size={16} /> 生成脚本</>}
          </button>

          {error && <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3"><p className="text-xs text-red-600">{error}</p></div>}

          {result && <div className="bg-white rounded-2xl border border-[#eee] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><Sparkles size={14} className="text-[#171717]" /><span className="text-xs font-semibold">脚本内容</span></div>
              <button onClick={handleCopy} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#f5f5f5] text-xs font-medium">
                {copied ? <><Check size={12} className="text-green-600" /> 已复制</> : <><Copy size={12} /> 复制</>}
              </button>
            </div>
            <p className="text-sm text-[#525252] leading-relaxed whitespace-pre-wrap">{result}</p>
          </div>}
        </div>
      </div>
    </div>
  );
};

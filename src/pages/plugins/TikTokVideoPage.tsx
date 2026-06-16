import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, Video, Download, Wand2, ChevronDown } from 'lucide-react';
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

const SCRIPTS = [
  {
    id: 'template1',
    title: '模板 1：痛点场景 → 解决方案 → 行动号召',
    label: '痛点场景',
    structure: [
      '钩子/痛点放大 — 抓住注意力，描述用户遇到的麻烦',
      '痛点解决/产品卖点 — 展示产品如何解决痛点，突出核心卖点',
      '行动号召 — 限时优惠，催促下单',
    ],
  },
  {
    id: 'template2',
    title: '模板 2：问题场景 → 产品推荐 → 行动号召',
    label: '问题推荐',
    structure: [
      '问题场景钩子 — 指出用户可能遇到的问题或风险',
      '解决方案/产品推荐 — 介绍产品如何解决问题',
      '行动号召 — 价格优惠，促使用户行动',
    ],
  },
  {
    id: 'template3',
    title: '模板 3：低价好物推荐',
    label: '好物推荐',
    structure: [
      '观点钩子 — 以惊艳语气吸引注意力，强调超值',
      '产品推荐+卖点 — 详细展示产品及使用方式，强调便利性和体验',
      '行动号召 — 强调超低价格，鼓动立即购买',
    ],
  },
  {
    id: 'template4',
    title: '模板 4：展示缺陷（悲催经历）',
    label: '避坑展示',
    structure: [
      '展示缺陷/痛点 — 描述用户的错误经历或糟糕选择带来的后果',
      '解决方案 — 介绍正确方案/产品，说明如何避免问题',
    ],
  },
  {
    id: 'template5',
    title: '模板 5：如果我是你（建议式）',
    label: '建议推荐',
    structure: [
      '建议钩子 — "如果我是你…" 语气，建立共情',
      '推荐理由 — 说明产品或方法如何节省时间/金钱/麻烦',
    ],
  },
  {
    id: 'template6',
    title: '海外短视频·反串抓马爆款模板（适配TikTok/Reels，反串抓马无厘头逻辑）',
    label: '反串抓马',
    structure: [
      '黄金3秒王炸开篇 — 极致反差造型（如猛男女仆/壮汉萝莉），面对产品解决的痛点场景（脏乱/损坏/问题），委屈道歉或崩溃，制造极致违和感',
      '冲突爆点 — 第二角色（反串）怒冲冲出场，制造肢体/语言冲突，顺势掏出产品怼镜头',
      '爽点反转 — 使用产品后问题瞬间解决，前后强烈对比，主角表情反转惊喜',
      '高频混剪 — 快切多个同类痛点场景（产品对应的各种使用场景），每个统一逻辑：问题→用产品→秒解决',
      '收尾转化口播 — 人物同框举产品，口播号召下单',
    ],
  },
  {
    id: 'template7',
    title: '反差对比型 — 前后视觉冲击对比，适合带货视频、好物测评',
    label: '反差对比',
    structure: [
      '痛苦现状 — 描述用户当前遇到的麻烦/低效/困扰，引发共鸣',
      '优质对比 — 展示产品/方法带来的效果，与开头形成强烈反差',
      '极致爽感 — 突出前后差异带来的视觉冲击和情绪满足',
      '情绪反馈 — 使用者的惊喜表情或真实感受，强化信任',
    ],
  },
  {
    id: 'template8',
    title: '故事带入型 — 真实经历叙事，适合个人IP、避坑干货、成长感悟',
    label: '故事带入',
    structure: [
      '真实经历开头 — "前阵子我被XX整崩溃了…" 建立共情',
      '情绪渲染 — 描述过程中的挫折、困惑、焦虑',
      '剧情反转 — 发现产品/方法后问题迎刃而解',
      '价值启发 — 总结心得，给出实用建议，引导互动',
    ],
  },
  {
    id: 'template9',
    title: '清单分享型 — 分点干货清单，适合技巧教学、避坑指南、知识输出',
    label: '清单分享',
    structure: [
      '热点问题引入 — "最近好多人问我XX怎么做…" 制造相关性',
      '清单干货 — 分点列出实用技巧/方法，每点简短有力',
      '总结点睛 — 一句话总结核心价值，强化记忆点',
    ],
  },
  {
    id: 'template10',
    title: '反常识开场型 — 打破认知，适合吸粉爆款、冷门知识、误区纠正',
    label: '反常识',
    structure: [
      '颠覆认知开场 — "你可能一直都做错了！" 瞬间抓住注意力',
      '真相拆解 — 解释为什么大家一直误解，给出正确认知',
      '延伸干货 — 补充更多实用信息，提升内容价值，引导关注',
    ],
  },
];

const LANGUAGES = [
  { value: 'zh', label: '简体中文', region: '中国大陆', people: '东亚面孔（中国人）' },
  { value: 'en', label: '英语', region: '欧美', people: '欧美人面孔' },
  { value: 'ja', label: '日语', region: '日本', people: '东亚面孔（日本人）' },
  { value: 'ko', label: '韩语', region: '韩国', people: '东亚面孔（韩国人）' },
  { value: 'ru', label: '俄语', region: '俄罗斯', people: '俄罗斯面孔（东斯拉夫人）' },
  { value: 'th', label: '泰语', region: '泰国', people: '东南亚面孔（泰国人）' },
  { value: 'ms', label: '马来语', region: '马来西亚/印尼', people: '东南亚面孔（马来人）' },
  { value: 'vi', label: '越南语', region: '越南', people: '东南亚面孔（越南人）' },
];

interface SceneData {
  scene: number;
  visualPrompt: string;
  caption: string;
}

interface AnalysisResult {
  title: string;
  copy: string;
  scenes: SceneData[];
}

export const TikTokVideoPage: React.FC = () => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [productImages, setProductImages] = useState<{ file: File; preview: string }[]>([]);
  const [productName, setProductName] = useState('');
  const [productDesc, setProductDesc] = useState('');
  const [language, setLanguage] = useState('zh');
  const [quality, setQuality] = useState<'2K' | '4K'>('2K');
  const [duration, setDuration] = useState(15);
  const [sceneCount, setSceneCount] = useState(6);
  const [selectedScripts, setSelectedScripts] = useState<string[]>([SCRIPTS[0].id]);
  const [analyzing, setAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [batchCount, setBatchCount] = useState(1);
  const [progress, setProgress] = useState('');
  const [analyses, setAnalyses] = useState<{ templateId: string; templateLabel: string; data: AnalysisResult }[]>([]);
  const [results, setResults] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);
  const productNameRef = useRef<HTMLTextAreaElement>(null);
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };
  useEffect(() => {
    if (productNameRef.current) autoResize(productNameRef.current);
  }, [productName]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAvailableModels().then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) setSelectedModel('gpt-image-2');
    });
  }, []);

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
      setProductImages(prev => [...prev, ...newItems].slice(0, 10));
    }).catch(err => {
      console.error('图片处理失败:', err);
      alert('部分图片处理失败，请尝试使用更小的图片');
    });
  };

  const removeImage = (idx: number) => setProductImages(prev => prev.filter((_, i) => i !== idx));

  const handleAnalyze = async () => {
    if (!requireAuth()) return;
    if (productImages.length === 0) { alert('请上传产品图片'); return; }
    const activeTemplates = SCRIPTS.filter(s => selectedScripts.includes(s.id));
    if (activeTemplates.length === 0) { alert('请至少选择一个脚本模板'); return; }
    setAnalyzing(true);
    setAnalyses([]);
    setResults([]);
    try {
      const b64s = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1200)));
      const langInfo = LANGUAGES.find(l => l.value === language) || LANGUAGES[0];

      // 深度分析产品（始终执行）
      let analysisContext = '';
      let finalName = productName;
      let finalDesc = productDesc;
      const deepRaw = await analyzeMultipleImages(b64s,
        `分析所有上传的图片中的产品，返回JSON：{"title":"产品名称","description":"产品描述","brand":"品牌","category":"品类","specs":"规格","sellingPoints":"卖点(逗号分隔)","targetAudience":"目标人群"}。仅输出JSON。`,
        { model: 'gemini-3.5-flash', maxTokens: 2000 }
      );
      const deepMatch = deepRaw.match(/\{[\s\S]*\}/);
      if (deepMatch) {
        const d = JSON.parse(deepMatch[0]) as Record<string, string>;
        if (!finalName.trim() && d.title) { setProductName(d.title); finalName = d.title; }
        if (!finalDesc.trim() && d.description) { setProductDesc(d.description); finalDesc = d.description; }
        analysisContext = `\n品牌：${d.brand || ''}\n品类：${d.category || ''}\n规格：${d.specs || ''}\n卖点：${d.sellingPoints || ''}\n目标人群：${d.targetAudience || ''}`;
      }

      // 对每个选中的模板并行分析
      const results = await Promise.all(activeTemplates.map(async (tmpl) => {
        const structureText = tmpl.structure.map((s, i) => `  镜头${i + 1}: ${s}`).join('\n');
        const scenesPerPart = Math.ceil(sceneCount / tmpl.structure.length);
        const prompt = `你是一个TikTok短视频脚本专家和产品营销专家。请根据用户提供的产品图片、产品名、描述，结合选定的脚本模板，创作一个专业的TikTok视频脚本。

产品名称: ${finalName}
产品描述: ${finalDesc || '无'}${analysisContext}
目标语言: ${langInfo.label}
目标受众地区: ${langInfo.region}
视频中出现的人物: ${langInfo.people}

脚本模板: ${tmpl.title}
总时长: ${duration}秒

脚本结构要求（共${sceneCount}个镜头，按结构分配）:
${structureText}
（每个部分分配约${scenesPerPart}个镜头，总计${sceneCount}个镜头）

【关键要求 - 必须严格遵守】

1. 产品一致性：所有镜头中的产品外观、颜色、造型、包装必须与用户提供的产品图片完全一致，不做任何改变。产品的文字和标签保持原样，不翻译、不替换。

2. 人物一致性：所有镜头中的人物必须是同一个人，面部特征、服装、发型、体型完全一致，仅角度和姿势变化。人物面部必须像iPhone实拍的真实照片——皮肤纹理、毛孔、肤质细微瑕疵可见，拒绝AI塑料假面、过度磨皮、对称假脸。

3. 智能使用图片：用户提供了多张产品图片。请分析这些图片，只使用与当前镜头内容相关的图片作为参考。例如需要展示产品细节时使用特写图，需要展示使用场景时使用场景图。不相关的图片不用加入该镜头。

4. 所有文案必须使用${langInfo.label}，禁止使用其他语言。

5. 爆款节奏控制：前3秒必须用冲突/痛点/反差/悬念做钩子抓住注意力，中间每5-7秒一个节奏点（画面/台词/情绪切换），最后3秒强引导转化。

6. 每个镜头都包含: scene(镜头序号), visualPrompt(画面描述，用于AI生图), caption(旁白文案)
   visualPrompt中必须明确标注需要用到的用户图片编号（例如"参考图1"、"参考图3"），以及人物的外貌特征（${langInfo.people}、${langInfo.region}面孔）

7. 镜头之间要有叙事连贯性

请严格按照以下JSON格式返回，不要包含任何其他文字:
{
  "title": "视频标题（用${langInfo.label}）",
  "copy": "完整视频文案（所有镜头的旁白连贯组合，用${langInfo.label}）",
  "scenes": [
    { "scene": 1, "visualPrompt": "画面1的详细描述，标注参考的用户图片编号，指定人物为${langInfo.people}...", "caption": "旁白1（${langInfo.label}）" },
    { "scene": 2, "visualPrompt": "画面2的详细描述，标注参考的用户图片编号，指定人物为${langInfo.people}...", "caption": "旁白2（${langInfo.label}）" }
  ]
}

注意: 返回${sceneCount}个镜头，从1到${sceneCount}。`;
        const raw = await analyzeMultipleImages(b64s, prompt, { model: 'gemini-3.5-flash', maxTokens: 8000 });
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        const parsed = JSON.parse(jsonMatch[0]) as AnalysisResult;
        return { templateId: tmpl.id, templateLabel: tmpl.label, data: parsed };
      }));
      const validResults = results.filter(r => r !== null);
      if (validResults.length === 0) { alert('分析失败，请重试'); }
      else { setAnalyses(validResults as { templateId: string; templateLabel: string; data: AnalysisResult }[]); }
    } catch (err: any) {
      console.error('分析失败:', err);
      alert('分析失败: ' + err.message);
    }
    setAnalyzing(false);
  };

  const handleGenerate = async () => {
    if (!requireAuth()) return;
    if (analyses.length === 0) { alert('请先分析脚本'); return; }
    setIsGenerating(true);
    setResults([]);
    try {
      const b64s = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1536)));
      console.log('生成任务数:', analyses.length, '个模板, 批量:', batchCount);
      const genTasks: { prompt: string; label: string }[] = [];
      for (const item of analyses) {
        const analysis = item.data;
        if (!analysis?.scenes?.length) { console.warn('模板', item.templateLabel, '镜头数为0，跳过'); continue; }
        const cols = sceneCount >= 10 ? 4 : sceneCount === 8 ? 4 : 3;
        const rows = Math.ceil(analysis.scenes.length / cols);
        const scenesDesc = analysis.scenes.map(s =>
          `图${s.scene}（位置：第${Math.ceil(s.scene / cols)}行第${((s.scene - 1) % cols) + 1}列）: ${s.visualPrompt}`
        ).join('\n');
        for (let b = 0; b < batchCount; b++) {
          const label = `${item.templateLabel} #${b + 1}`;
          const gridPrompt = `请生成一张16:9的视频分镜合成图第${b + 1}版，脚本模板：${item.templateLabel}，将${analysis.scenes.length}个镜头画面排列成${rows}行×${cols}列的网格布局。

每个画面的详细描述如下：
${scenesDesc}

【关键要求】
- 严格按照描述排列，每个画面左上角标注白色"#1""#2"等镜头编号
- 【重要】所有画面中的产品外观、颜色、造型、包装必须与用户提供的产品图片完全一致，不做任何改变
- 产品上的文字和标签保持原样，不翻译不替换
- 【重要】所有画面中的人物必须是同一个人，面部特征、服装、发型完全一致，仅角度变化。面部必须像真人实拍照片——皮肤纹理毛孔清晰可见，拒绝AI塑料假脸、过度磨皮
- 画面之间用细线或留白分隔，整体看起来像专业的视频分镜板
- 16:9横版
- 【光线场景真实感】自然真实光线，拒绝影棚打光AI感，场景像真实室内/户外实拍，光线柔和自然不刻意，暗部有真实阴影层次，整体像手机拍摄的真实素材而非CG渲染`;

        genTasks.push({ prompt: gridPrompt, label });
      }}
      console.log('总计生成任务:', genTasks.length, '个, 列表:', genTasks.map(t => t.label));
      const total = genTasks.length;
      for (let i = 0; i < total; i++) {
        setProgress(`生成中 (${i + 1}/${total})...`);
        try {
          const resp = await editImage({ prompt: genTasks[i].prompt, images: b64s, aspectRatio: '16:9', resolution: quality, model: selectedModel });
          const url = resp.data?.[0]?.url || resp.image_url || resp.url || '';
          if (url) {
            setResults(prev => [url, ...prev]);
            imageLibraryService.saveToLibrary({ image_url: url, prompt: genTasks[i].prompt, model: String(selectedModel || 'nanobann2'), aspect_ratio: String('16:9'), resolution: String(quality || '2K'), type: 'edited' });
          }
        } catch (e) { console.error(`生成第${i + 1}张失败:`, e); }
      }
    } catch (err: any) {
      console.error('生成失败:', err);
      alert('生成失败: ' + err.message);
    }
    setIsGenerating(false);
    setProgress('');
  };

  const handleDownload = async (url: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `tk-storyboard-${Date.now()}.png`; a.click(); URL.revokeObjectURL(u); } catch { window.open(url, '_blank'); }
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-gray-200 flex-shrink-0 bg-gray-50">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center"><Video size={16} className="text-white" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[#171717]">TK脚本图</h1>
          <p className="text-[10px] text-gray-400 leading-tight">产品图 → AI脚本分析 → 视频分镜合成</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[380px] border-r border-gray-200 overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-gray-50">
          {/* Upload */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Plus size={16} className="text-blue-500" />
              <div><h3 className="text-sm font-semibold text-[#171717]">产品图片</h3><p className="text-xs text-gray-400">多角度产品图</p></div>
              <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-xl">{productImages.length}/10</span>
            </div>
            {productImages.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mb-3">{productImages.map((item, idx) => (
                <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden bg-gray-100">
                  <img src={item.preview} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removeImage(idx)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100"><X size={14} className="text-white" /></button>
                </div>
              ))}</div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleUpload} multiple accept="image/*" className="hidden" />
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA] p-3 flex flex-col items-center justify-center gap-1 hover:border-gray-400 hover:bg-gray-50 transition-all cursor-pointer bg-[#FAFAFA]">
              <Plus size={18} className="text-gray-400" /><span className="text-xs text-gray-400">上传产品图片</span>
            </div>
          </div>

          {/* Product Info */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-[#171717]">产品信息</h3>
            <textarea value={productName} onChange={e => { setProductName(e.target.value); autoResize(e.target); }} placeholder="产品名称（AI可自动分析）"
              className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-2xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder:text-gray-400 resize-none overflow-hidden"
              rows={1} ref={productNameRef} />
            <textarea value={productDesc} onChange={e => { setProductDesc(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder="产品描述（可选）" rows={1} className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-200 overflow-hidden"
              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
          </div>

          {/* Script Template Selector - Multi-select Cards */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">脚本模板（多选）</span>
              <span className="ml-auto text-[10px] text-gray-400">{selectedScripts.length}个已选</span>
            </div>
            <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
              {SCRIPTS.map(s => {
                const sel = selectedScripts.includes(s.id);
                return (
                  <button key={s.id} onClick={() => {
                    if (selectedScripts.length === 1 && sel) return;
                    setSelectedScripts(prev => sel ? prev.filter(v => v !== s.id) : [...prev, s.id]);
                  }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all border ${
                      sel ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        sel ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                      }`}>
                        {sel && <span className="text-white text-[8px]">✓</span>}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium">{s.label}</div>
                        <div className="text-[9px] text-gray-400 truncate">{s.title}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Settings */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-[#171717]">生成设置</h3>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">模型</label>
              <div className="relative">
                <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="w-full bg-gray-100 px-3 py-2.5 pr-8 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer">
                  {models.length > 0 ? models.map(m => <option key={m.value} value={m.value}>{m.label}</option>) : <option value="nanobann2">Nanobann2</option>}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              <ModelSpeedNote />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">语言</label>
              <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full bg-gray-100 px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer">
                {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">清晰度</label>
              <div className="flex gap-2">
                {(['2K', '4K'] as const).map(q => (
                  <button key={q} onClick={() => setQuality(q)} className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${quality === q ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{q}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">时长</label>
              <div className="grid grid-cols-4 gap-2">
                {[8, 10, 12, 15].map(s => (
                  <button key={s} onClick={() => {
                    setDuration(s);
                    if (s <= 10 && sceneCount > 8) setSceneCount(8);
                    if (s === 8 && sceneCount > 8) setSceneCount(6);
                  }} className={`py-2 rounded-xl text-xs font-medium transition-all ${duration === s ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{s}秒</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">镜头数</label>
              <div className="relative">
                <select value={sceneCount} onChange={e => setSceneCount(Number(e.target.value))}
                  className="w-full bg-[#F5F5F5] px-3 py-2.5 pr-8 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 appearance-none cursor-pointer">
                  {[6, 8, 10, 12].map(n => (
                    <option key={n} value={n} disabled={(n === 12 && duration < 15) || (n === 10 && duration < 12)}>{n}个</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">生成数量</label>
              <div className="relative">
                <select value={batchCount} onChange={e => setBatchCount(Number(e.target.value))}
                  className="w-full bg-[#F5F5F5] px-3 py-2.5 pr-8 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 appearance-none cursor-pointer">
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}张</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

          </div>

          {/* Analyze Button */}
          {!analyzing && !isGenerating && (
            <button onClick={handleAnalyze} disabled={productImages.length === 0}
              className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-gray-200 disabled:text-gray-400 shadow-sm">
              <Sparkles size={18} /> 分析脚本
            </button>
          )}
          {analyses.length > 0 && !isGenerating && (
            <div className="space-y-2">
              <button onClick={handleGenerate}
                className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all shadow-sm">
                <Wand2 size={18} /> 生成视频分镜 ({analyses.length * batchCount}张)
              </button>
              <p className="text-[10px] text-gray-400 text-center leading-relaxed">⏱ 因多镜头合成设计，生成时间比普通图片略久，请耐心等待</p>
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {analyzing && analyses.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <LoadingAnimation title="AI 分析中..." description="正在根据产品图片和脚本模板创作视频脚本" />
            </div>
          ) : analyses.length === 0 && results.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 mx-auto mb-5 bg-gray-100 rounded-2xl flex items-center justify-center"><Video size={32} className="text-gray-300" /></div>
                <h2 className="text-lg font-semibold text-[#171717] mb-2">TK 视频脚本</h2>
                <p className="text-sm text-gray-400 leading-relaxed">上传产品图 → 选择脚本模板 → AI 分析生成视频分镜 → 一键合成</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Progress bar during generation */}
              {isGenerating && (
                <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm px-6 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <Loader2 size={16} className="animate-spin text-[#171717]" />
                    <span className="text-sm font-medium text-[#171717]">{progress}</span>
                    <span className="text-xs text-gray-400 ml-auto">已生成 {results.length} 张</span>
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Generated Images */}
                {results.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold text-[#171717] mb-3">视频分镜合成图 ({results.length})</h2>
                    <div className="grid grid-cols-2 gap-4">
                      {results.map((url, idx) => (
                        <div key={idx} className="group relative bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
                          <div className="cursor-pointer" onClick={() => setPreviewImage(url)}>
                            <img src={url} alt="" className="w-full h-auto" />
                          </div>
                          <div className="p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-600">分镜 #{idx + 1}</span>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => setReEditImage(url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#171717]"><Wand2 size={14} /></button>
                              <button onClick={() => handleDownload(url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#171717]"><Download size={14} /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Script - multiple analyses */}
                {analyses.length > 0 && analyses.map((item, ai) => (
                  <div key={ai} className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-0.5 bg-[#171717] text-white text-[10px] rounded-xl">{item.templateLabel}</span>
                      <span className="text-xs text-gray-400">脚本 #{ai + 1}</span>
                    </div>
                    <h2 className="text-sm font-semibold text-[#171717] mb-1">视频标题</h2>
                    <p className="text-base font-medium text-[#171717] mb-4">{item.data.title}</p>
                    <h2 className="text-sm font-semibold text-[#171717] mb-2">完整文案</h2>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap mb-4">{item.data.copy}</p>
                    <h2 className="text-sm font-semibold text-[#171717] mb-2">分镜脚本</h2>
                    <div className="space-y-2">
                      {item.data.scenes.map(s => (
                        <div key={s.scene} className="bg-white rounded-xl p-3 border border-gray-200">
                          <div className="text-xs font-bold text-[#171717] mb-1">镜头 #{s.scene}</div>
                          <div className="text-xs text-gray-500 mb-1"><span className="font-medium text-gray-700">画面:</span> {s.visualPrompt}</div>
                          <div className="text-xs text-gray-500"><span className="font-medium text-gray-700">旁白:</span> {s.caption}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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
        onReplaced={(oldUrl, newUrl) => setResults(prev => prev.map(item => item === oldUrl ? newUrl : item))}
      />
    </div>
  );
};
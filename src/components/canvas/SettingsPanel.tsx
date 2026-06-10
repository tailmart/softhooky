import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Monitor, Crop, ImagePlus, Cpu, Sparkles, Zap, Cpu as CpuIcon, Image as ImageIcon } from 'lucide-react';
import { getAvailableModels } from '../../services/modelService';
import { ModelSpeedNote } from '../ModelSpeedNote';
import type { ChatMode } from '../chat/ModeSelector';

interface SettingsPanelProps {
  show: boolean;
  chatMode?: ChatMode;
  resolution: string;
  aspectRatio: string;
  generateCount: number;
  model: string;
  deepSeekModel?: string;
  onResolutionChange: (res: string) => void;
  onAspectRatioChange: (ratio: string) => void;
  onGenerateCountChange: (count: number) => void;
  onModelChange: (model: string) => void;
  onDeepSeekModelChange?: (model: string) => void;
  onClose: () => void;
}

const ASPECT_RATIOS_GPT = [
  { label: '智能', value: '智能', icon: 'A' },
  { label: '1:1', value: '1:1', icon: '1:1' },
  { label: '3:4', value: '3:4', icon: '3:4' },
  { label: '4:3', value: '4:3', icon: '4:3' },
  { label: '9:16', value: '9:16', icon: '9:16' },
  { label: '16:9', value: '16:9', icon: '16:9' },
  { label: '21:9', value: '21:9', icon: '21:9' },
];

const ASPECT_RATIOS_NANO = [
  { label: '智能', value: '智能', icon: 'A' },
  { label: '1:1', value: '1:1', icon: '1:1' },
  { label: '3:4', value: '3:4', icon: '3:4' },
  { label: '4:3', value: '4:3', icon: '4:3' },
  { label: '9:16', value: '9:16', icon: '9:16' },
  { label: '16:9', value: '16:9', icon: '16:9' },
  { label: '21:9', value: '21:9', icon: '21:9' },
];

const getRatioStyle = (value: string) => {
  const map: Record<string, string> = {
    'auto': 'w-4 h-3',
    '智能': 'w-4 h-4',
    '1:1': 'w-3.5 h-3.5',
    '3:4': 'w-3 h-4',
    '9:16': 'w-2.5 h-5',
    '4:3': 'w-4 h-3',
    '16:9': 'w-5 h-2.5',
    '21:9': 'w-6 h-2',
    '2:3': 'w-2.5 h-4',
    '3:2': 'w-4 h-2.5',
    '1:8': 'w-1 h-4',
    '8:1': 'w-4 h-1',
  };
  return map[value] || 'w-4 h-4';
};

const DeepSeekModelSelector: React.FC<{
  deepSeekModel: string;
  onDeepSeekModelChange: (model: string) => void;
  onClose: () => void;
}> = ({ deepSeekModel, onDeepSeekModelChange, onClose }) => {
  const models = [
    {
      id: 'flash',
      label: 'DeepSeek‑V4‑Flash',
      icon: Zap,
      tag: '日常全能版',
      tagColor: 'bg-[#171717]',
      features: ['聊天办公', '文案总结', '联网搜索', '截图识图', '轻度任务'],
      note: '性价比高、速度更快、成本更低',
      color: 'from-[#171717] to-blue-600',
      bgLight: 'bg-blue-50',
      borderLight: 'border-blue-200',
    },
    {
      id: 'pro',
      label: 'DeepSeek‑V4‑Pro',
      icon: CpuIcon,
      tag: '旗舰全能版',
      tagColor: 'bg-violet-500',
      features: ['长文档分析', '复杂逻辑推理', '重度编程', '高精度识图', '正式商业方案'],
      note: '追求极致稳定与深度',
      color: 'from-violet-500 to-violet-600',
      bgLight: 'bg-violet-50',
      borderLight: 'border-violet-200',
    },
  ];

  return (
    <>
      <div className="pt-5 md:pt-6 px-6 pb-4 border-b border-[#F0F0F0]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#171717] rounded-full flex items-center justify-center shadow-md">
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#171717]">选择模型</h2>
              <p className="text-xs text-[#9E9E9E] mt-0.5">切换 DeepSeek 对话模型</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F5F5F5] transition-colors">
            <X size={18} className="text-[#9E9E9E]" />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {models.map(m => {
          const Icon = m.icon;
          const isSelected = deepSeekModel === m.id;
          return (
            <button
              key={m.id}
              onClick={() => { onDeepSeekModelChange(m.id); onClose(); }}
              className={`w-full text-left rounded-2xl border-2 transition-all ${
                isSelected
                  ? 'border-blue-500 ring-1 ring-blue-500/30'
                  : 'border-[#E5E5E5] hover:border-[#D4D4D4]'
              }`}
            >
              {/* Header with gradient */}
              <div className={`relative rounded-t-2xl bg-gradient-to-r ${m.color} px-5 py-3 overflow-hidden`}>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-10">
                  <Icon size={56} className="text-white" />
                </div>
                <div className="flex items-center gap-2">
                  <Icon size={18} className="text-white" />
                  <span className="text-white font-bold text-sm tracking-tight">{m.label}</span>
                  <span className={`ml-auto text-[10px] font-semibold text-white px-2 py-0.5 rounded-full bg-white/20`}>
                    {m.tag}
                  </span>
                </div>
              </div>

              {/* Features */}
              <div className="px-5 py-4">
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {m.features.map(f => (
                    <span key={f} className="text-[11px] text-[#737373] bg-[#F5F5F5] px-2 py-0.5 rounded-full">
                      {f}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-[#A3A3A3] leading-relaxed">
                  {m.note}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="px-6 pb-6">
        <div className="bg-[#F5F5F5] rounded-2xl px-4 py-3 text-center">
          <p className="text-xs text-[#9E9E9E]">
            复杂专业选 <strong className="text-[#171717]">Pro</strong>，日常全能选 <strong className="text-[#171717]">Flash</strong>
          </p>
        </div>
      </div>
    </>
  );
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  show,
  chatMode,
  resolution,
  aspectRatio,
  generateCount,
  model,
  deepSeekModel = 'flash',
  onResolutionChange,
  onAspectRatioChange,
  onGenerateCountChange,
  onModelChange,
  onDeepSeekModelChange,
  onClose
}) => {
  const ratios = model === 'gpt-image-2' ? ASPECT_RATIOS_GPT : ASPECT_RATIOS_NANO;
  const isGenMode = chatMode === 'nano-gen' || chatMode === 'gpt-image2-gen';
  const [availableModels, setAvailableModels] = useState<{ value: string; label: string }[]>([
    { value: 'gpt-image-2', label: 'GPT Image 2' },
    { value: 'nanobann2', label: 'Nanobann2' },
  ]);
  useEffect(() => {
    getAvailableModels().then(m => setAvailableModels(m.map(x => ({ value: x.model_id, label: x.label }))));
  }, []);

  const MODEL_CONFIGS: Record<string, {
    icon: typeof ImageIcon;
    subtitle: string;
    color: string;
  }> = {
    seedream: {
      icon: Cpu,
      subtitle: '创意灵感',
      color: 'from-amber-500 to-orange-600',
    },
    nanobann2: {
      icon: ImageIcon,
      subtitle: '极速生成',
      color: 'from-emerald-500 to-teal-600',
    },
    'gpt-image-2': {
      icon: Sparkles,
      subtitle: '极致画质',
      color: 'from-violet-500 to-purple-600',
    },
  };

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 md:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="relative bg-white rounded-t-3xl md:rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
          >
            {/* Handle bar (mobile) */}
            <div className="hidden md:block absolute top-0 left-0 right-0 h-1.5 bg-[#171717] mx-auto rounded-b-full" />

            {chatMode === 'deepseek-chat' ? (
              <DeepSeekModelSelector
                deepSeekModel={deepSeekModel}
                onDeepSeekModelChange={onDeepSeekModelChange || (() => {})}
                onClose={onClose}
              />
            ) : (
              <>
                <div className="pt-5 md:pt-6 px-6 pb-4 border-b border-[#F0F0F0]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#171717] rounded-full flex items-center justify-center shadow-md">
                        <Cpu size={18} className="text-white" />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-[#171717]">生成设置</h2>
                        <p className="text-xs text-[#9E9E9E] mt-0.5">配置图片生成参数</p>
                      </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F5F5F5] transition-colors">
                      <X size={18} className="text-[#9E9E9E]" />
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Model Selection */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <ImageIcon size={14} className="text-[#9E9E9E]" />
                      <span className="text-xs font-medium text-[#9E9E9E] uppercase tracking-wide">模型选择</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(availableModels.length > 0 ? availableModels : [{ value: 'nanobann2', label: 'Nanobann2' }]).map(m => {
                        const config = MODEL_CONFIGS[m.value];
                        const Icon = config?.icon || ImageIcon;
                        const isSelected = model === m.value;
                        return (
                          <button key={m.value} onClick={() => onModelChange(m.value)}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50 shadow-md'
                                : 'border-[#E5E5E5] bg-white hover:border-[#D4D4D4] hover:shadow-sm'
                            }`}
                          >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              isSelected ? 'bg-blue-500' : 'bg-gradient-to-br ' + (config?.color || 'from-gray-400 to-gray-500')
                            }`}>
                              <Icon size={18} className="text-white" />
                            </div>
                            <span className={`text-xs font-semibold text-center leading-tight ${
                              isSelected ? 'text-blue-600' : 'text-[#333]'
                            }`}>{m.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <ModelSpeedNote />
                  </div>

                  {/* Resolution */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Monitor size={14} className="text-[#9E9E9E]" />
                      <span className="text-xs font-medium text-[#9E9E9E] uppercase tracking-wide">分辨率</span>
                    </div>
                    <div className="flex gap-2">
                      {['2K', '4K'].map((res) => (
                        <button
                          key={res}
                          onClick={() => onResolutionChange(res)}
                          className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all ${
                            resolution === res
                              ? 'bg-blue-500 text-white shadow-md'
                              : 'bg-[#F7F7F7] text-[#525252] hover:bg-[#F0F0F0]'
                          }`}
                        >
                          {res}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Aspect Ratio */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Crop size={14} className="text-[#9E9E9E]" />
                      <span className="text-xs font-medium text-[#9E9E9E] uppercase tracking-wide">图片比例</span>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {ratios.map(size => (
                        <button key={size.value} onClick={() => onAspectRatioChange(size.value)}
                          className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg transition-all ${
                            aspectRatio === size.value ? 'bg-blue-500 text-white shadow-sm' : 'bg-[#F7F7F7] text-[#525252] hover:bg-[#F0F0F0]'
                          }`}>
                          <div className={`border-2 rounded-sm ${aspectRatio === size.value ? 'border-white' : 'border-[#D4D4D4]'} ${getRatioStyle(size.value)}`} />
                          <span className="text-[9px] font-medium">{size.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Generate Count */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <ImagePlus size={14} className="text-[#9E9E9E]" />
                      <span className="text-xs font-medium text-[#9E9E9E] uppercase tracking-wide">生成张数</span>
                    </div>
                    <select
                      value={generateCount}
                      onChange={(e) => onGenerateCountChange(Number(e.target.value))}
                      className="w-full py-2.5 px-4 rounded-full text-sm font-semibold bg-[#F7F7F7] text-[#525252] border border-[#E5E5E5] outline-none cursor-pointer hover:border-[#D4D4D4] focus:border-[#171717] transition-colors appearance-none"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='none'%3E%3Cpath d='M1 1.5l5 5 5-5' stroke='%23A3A3A3' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 12px center',
                        paddingRight: '32px',
                      }}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                        <option key={num} value={num}>{num} 张</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="px-6 pb-6">
                  <button onClick={onClose} className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full text-sm font-semibold transition-colors shadow-md">
                    应用设置
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

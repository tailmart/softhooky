import React, { useState, useEffect } from 'react';
import { Globe, Wand2, ChevronDown, Images, Layers } from 'lucide-react';
import { getAvailableModels } from '../../services/modelService';
import { ModelSpeedNote } from '../ModelSpeedNote';

export interface Language {
  value: string;
  label: string;
}

export interface AspectRatio {
  value: string;
  label: string;
}

interface EcommerceSettingsProps {
  language: string;
  onLanguageChange: (lang: string) => void;
  languages: Language[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  quality: string;
  onQualityChange: (quality: string) => void;
  // 可选的比例选择
  aspectRatios?: AspectRatio[];
  selectedRatios?: string[];
  onRatioToggle?: (ratio: string) => void;
  singleRatio?: string;
  onSingleRatioChange?: (ratio: string) => void;
  // 可选的批次数量
  batchCount?: number;
  onBatchCountChange?: (count: number) => void;
  showBatchCount?: boolean;
  // 自定义子标题
  languageLabel?: string;
  modelLabel?: string;
  qualityLabel?: string;
  ratioLabel?: string;
  batchLabel?: string;
}

export const EcommerceSettings: React.FC<EcommerceSettingsProps> = ({
  language,
  onLanguageChange,
  languages,
  selectedModel,
  onModelChange,
  quality,
  onQualityChange,
  aspectRatios,
  selectedRatios = [],
  onRatioToggle,
  singleRatio,
  onSingleRatioChange,
  batchCount,
  onBatchCountChange,
  showBatchCount = false,
  languageLabel = '语言',
  modelLabel = '模型',
  qualityLabel = '分辨率',
  ratioLabel = '图片比例',
  batchLabel = '生成张数'
}) => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    getAvailableModels().then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0 && !selectedModel) {
        onModelChange(sorted[0].model_id);
      }
    });
  }, []);

  return (
    <>
      {/* 语言选择 */}
      <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Globe size={14} className="text-blue-500" />
          <span className="text-sm font-semibold text-[#171717]">{languageLabel}</span>
        </div>
        <select
          value={language}
          onChange={e => onLanguageChange(e.target.value)}
          className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-[#171717]/20 appearance-none cursor-pointer"
        >
          {languages.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>

      {/* 比例选择 - 多选模式 */}
      {aspectRatios && onRatioToggle && (
        <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Images size={14} className="text-blue-500" />
            <span className="text-sm font-semibold text-[#171717]">{ratioLabel}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {aspectRatios.map(r => {
              const selected = selectedRatios.includes(r.value);
              return (
                <button
                  key={r.value}
                  onClick={() => onRatioToggle(r.value)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${selected ? 'bg-blue-500 text-white' : 'bg-[#F5F5F5] text-gray-500 hover:bg-gray-200'}`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 比例选择 - 单选模式 */}
      {aspectRatios && onSingleRatioChange && !onRatioToggle && (
        <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Images size={14} className="text-blue-500" />
            <span className="text-sm font-semibold text-[#171717]">{ratioLabel}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {aspectRatios.map(r => (
              <button
                key={r.value}
                onClick={() => onSingleRatioChange(r.value)}
                className={`py-2 rounded-xl text-xs font-medium transition-all ${singleRatio === r.value ? 'bg-blue-500 text-white' : 'bg-[#F5F5F5] text-gray-500 hover:bg-gray-200'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 批次数量 */}
      {showBatchCount && onBatchCountChange && batchCount !== undefined && (
        <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Layers size={14} className="text-blue-500" />
            <span className="text-sm font-semibold text-[#171717]">{batchLabel}</span>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                onClick={() => onBatchCountChange(n)}
                className={`py-2 rounded-xl text-xs font-medium transition-all ${batchCount === n ? 'bg-blue-500 text-white' : 'bg-[#F5F5F5] text-gray-500 hover:bg-gray-200'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 模型选择 */}
      <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 size={14} className="text-blue-500" />
          <span className="text-sm font-semibold text-[#171717]">{modelLabel}</span>
        </div>
        <div className="relative">
          <select
            value={selectedModel}
            onChange={e => onModelChange(e.target.value)}
            className="w-full bg-[#F5F5F5] px-3 py-2.5 pr-8 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-[#171717]/20 appearance-none cursor-pointer"
          >
            {models.length > 0 ? (
              models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)
            ) : (
              <option value="nanobann2">Nanobann2</option>
            )}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        <ModelSpeedNote />
      </div>

      {/* 分辨率 */}
      <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 size={14} className="text-blue-500" />
          <span className="text-sm font-semibold text-[#171717]">{qualityLabel}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {['2K', '4K'].map(q => (
            <button
              key={q}
              onClick={() => onQualityChange(q)}
              className={`py-2 rounded-xl text-xs font-medium transition-all ${quality === q ? 'bg-blue-500 text-white' : 'bg-[#F5F5F5] text-gray-500 hover:bg-gray-200'}`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

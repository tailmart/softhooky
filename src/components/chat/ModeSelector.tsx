import React from 'react';

export type ChatMode = 'deepseek-chat' | 'nano-gen' | 'gpt-image2-gen';

interface ModeOption {
  key: ChatMode;
  label: string;
  apiEndpoint: string;
  description: string;
}

const MODE_OPTIONS: ModeOption[] = [
  { key: 'deepseek-chat', label: 'Deepseek对话', apiEndpoint: '/api/chat/deepseek', description: 'Deepseek-V4 对话' },
  { key: 'nano-gen', label: 'Nano生图', apiEndpoint: '/api/generate/nano', description: 'Nanobann2 图片生成' },
  { key: 'gpt-image2-gen', label: 'GPT生图', apiEndpoint: '/api/generate/gpt-image2', description: 'GPT-Image2 图片生成' },
];

interface ModeSelectorProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  disabled?: boolean;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({ mode, onModeChange, disabled }) => {
  return (
    <select
      value={mode}
      disabled={disabled}
      onChange={(e) => onModeChange(e.target.value as ChatMode)}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border outline-none transition-colors appearance-none ${
        disabled
          ? 'bg-[#F0F0F0] text-[#525252] border-[#E5E5E5] cursor-not-allowed opacity-60'
          : 'bg-[#F0F0F0] text-[#525252] border-[#E5E5E5] cursor-pointer hover:border-[#D4D4D4] focus:border-[#171717]'
      }`}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23A3A3A3' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        paddingRight: '26px',
      }}
    >
      {MODE_OPTIONS.map(tab => (
        <option key={tab.key} value={tab.key}>
          {tab.label}
        </option>
      ))}
    </select>
  );
};

export const getModeApiEndpoint = (mode: ChatMode): string => {
  return MODE_OPTIONS.find(m => m.key === mode)?.apiEndpoint || '/api/chat/deepseek';
};

export const isChatMode = (mode: ChatMode): boolean => {
  return mode === 'deepseek-chat';
};

export const isGenerateMode = (mode: ChatMode): boolean => {
  return mode === 'nano-gen' || mode === 'gpt-image2-gen';
};

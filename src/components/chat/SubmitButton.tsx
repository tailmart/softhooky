import React from 'react';
import { Send, Loader2 } from 'lucide-react';
import { ChatMode, getModeApiEndpoint, isGenerateMode } from './ModeSelector';

interface SubmitButtonProps {
  mode: ChatMode;
  prompt: string;
  uploadedImages: string[];
  isGenerating: boolean;
  onSubmit: (endpoint: string, payload: any) => void;
}

export const SubmitButton: React.FC<SubmitButtonProps> = ({
  mode,
  prompt,
  uploadedImages,
  isGenerating,
  onSubmit,
}) => {
  const canSubmit = prompt.trim().length > 0 || uploadedImages.length > 0;
  const isGenMode = isGenerateMode(mode);

  const handleClick = () => {
    const endpoint = getModeApiEndpoint(mode);
    const payload = isGenMode
      ? { prompt, images: uploadedImages }
      : { prompt };

    onSubmit(endpoint, payload);
  };

  return (
    <button
      onClick={handleClick}
      disabled={!canSubmit || isGenerating}
      className="h-[50px] px-6 bg-[#171717] text-white rounded-2xl hover:bg-[#27272A] transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 shadow-md"
      title={isGenMode ? '生成' : '发送'}
    >
      {isGenerating ? (
        <Loader2 size={18} className="animate-spin" />
      ) : (
        <>
          <Send size={16} />
          <span className="text-sm font-medium">{isGenMode ? '生成' : '发送'}</span>
        </>
      )}
    </button>
  );
};

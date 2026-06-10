import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingAnimationProps {
  title?: string;
  description?: string;
  progress?: string;
  showProgressBar?: boolean;
  progressWidth?: string;
  thumbnails?: string[];
}

export const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
  title = 'AI 正在处理',
  description = '请稍候...',
  progress,
  showProgressBar = false,
  progressWidth = '60%',
  thumbnails,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-blue-500/5 rounded-full blur-3xl animate-pulse" />
        <div className="relative w-24 h-24 rounded-full border-4 border-[#E5E5E5] border-t-blue-500 border-r-blue-400 animate-spin" />
      </div>

      <div className="flex flex-col items-center gap-2 mb-6">
        <h3 className="text-lg font-semibold text-[#171717]">{title}</h3>
        <p className="text-sm text-[#A3A3A3]">{description}</p>
      </div>

      {thumbnails && thumbnails.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          {thumbnails.map((src, idx) => (
            <div key={idx} className="relative">
              <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-blue-400/50 shadow-lg shadow-blue-500/10 animate-pulse">
                <img src={src} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                <Loader2 size={10} className="text-white animate-spin" />
              </div>
            </div>
          ))}
        </div>
      )}

      {showProgressBar && (
        <div className="w-48 h-2 bg-[#F5F5F5] rounded-full overflow-hidden mb-4">
          <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full animate-pulse" style={{ width: progressWidth }} />
        </div>
      )}

      {progress && (
        <p className="text-xs text-[#A3A3A3] mb-4">{progress}</p>
      )}

      <div className="flex gap-1.5">
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
};

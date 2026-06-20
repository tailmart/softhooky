import React from 'react';

interface LoadingAnimationProps {
  title?: string;
  description?: string;
  progress?: string;
  showProgressBar?: boolean;
  progressWidth?: string;
  thumbnails?: string[];
  variant?: 'default' | 'minimal' | 'featured';
}

export const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
  title = '处理中',
  description,
  progress,
  showProgressBar = false,
  progressWidth = '60%',
  thumbnails,
  variant = 'default',
}) => {
  if (variant === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-[#E5E5E5] border-t-[#171717] rounded-full animate-spin mb-4" />
        <span className="text-sm font-medium text-[#171717]">{title}</span>
        {progress && progress !== description && (
          <p className="text-xs text-[#A3A3A3] mt-2">{progress}</p>
        )}
      </div>
    );
  }

  if (variant === 'featured') {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-8">
        <div className="w-10 h-10 border-2 border-[#E5E5E5] border-t-[#171717] rounded-full animate-spin mb-6" />

        <div className="flex flex-col items-center gap-2 mb-6 text-center">
          <h3 className="text-base font-semibold text-[#171717]">{title}</h3>
          {description && <p className="text-sm text-[#A3A3A3] max-w-xs">{description}</p>}
        </div>

        {thumbnails && thumbnails.length > 0 && (
          <div className="flex items-center gap-2 mb-6">
            {thumbnails.map((src, idx) => (
              <div key={idx} className="w-12 h-12 rounded-xl overflow-hidden border border-[#E5E5E5]">
                <img src={src} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}

        {showProgressBar && (
          <div className="w-48 h-1 bg-[#F0F0F0] rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-[#171717] rounded-full transition-all duration-500"
              style={{ width: progressWidth }}
            />
          </div>
        )}

        {progress && progress !== description && (
          <p className="text-xs text-[#A3A3A3]">{progress}</p>
        )}
      </div>
    );
  }

  // 默认样式
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-10 h-10 border-2 border-[#E5E5E5] border-t-[#171717] rounded-full animate-spin mb-6" />

      <div className="flex flex-col items-center gap-2 mb-6">
        <h3 className="text-base font-semibold text-[#171717]">{title}</h3>
        {description && <p className="text-sm text-[#A3A3A3]">{description}</p>}
      </div>

      {thumbnails && thumbnails.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          {thumbnails.map((src, idx) => (
            <div key={idx} className="w-12 h-12 rounded-xl overflow-hidden border border-[#E5E5E5]">
              <img src={src} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {showProgressBar && (
        <div className="w-48 h-1 bg-[#F0F0F0] rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-[#171717] rounded-full transition-all duration-500"
            style={{ width: progressWidth }}
          />
        </div>
      )}

      {progress && progress !== description && (
        <p className="text-xs text-[#A3A3A3]">{progress}</p>
      )}
    </div>
  );
};

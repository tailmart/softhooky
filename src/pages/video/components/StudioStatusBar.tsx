import React from 'react';

interface StudioStatusBarProps {
  activeTaskCount: number;
  totalCredits: number;
}

export function StudioStatusBar({ activeTaskCount, totalCredits }: StudioStatusBarProps) {
  return (
    <div className="h-8 flex items-center justify-between px-4 bg-white border-t border-slate-200 text-[11px]">
      {/* Left */}
      <span className="text-slate-400">Video Studio v1.0</span>

      {/* Center */}
      <div className="flex items-center justify-center">
        {activeTaskCount > 0 && (
          <span className="flex items-center gap-1.5 text-blue-600">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            {activeTaskCount} 个视频生成中...
          </span>
        )}
      </div>

      {/* Right */}
      <span className="text-slate-400">
        积分余额: <span className="text-slate-900">{totalCredits}</span>
      </span>
    </div>
  );
}

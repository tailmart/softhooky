import React from 'react';

interface MobileTryonProps { onBack: () => void; }

export const MobileTryon: React.FC<MobileTryonProps> = ({ onBack }) => {
  return (
    <div className="flex flex-col h-full bg-[#FAFAFA]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#f0f0f0] bg-white flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f5f5f5]"><span className="text-[#737373]">←</span></button>
        <h1 className="text-base font-bold text-[#171717]">产品试穿</h1>
      </div>
      <div className="flex-1 flex items-center justify-center text-[#A3A3A3] text-sm">
        页面重构中…
      </div>
    </div>
  );
};

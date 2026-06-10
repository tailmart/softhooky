import React from 'react';

export const ModelSpeedNote: React.FC = () => {
  return (
    <div className="flex flex-col gap-0.5 mt-1.5 px-0.5">
      <p className="text-[10px] text-gray-400 leading-relaxed">
        <span className="font-medium text-gray-500">Banana 极速版：</span>
        30-50 秒出图，出图速度快
      </p>
      <p className="text-[10px] text-gray-400 leading-relaxed">
        <span className="font-medium text-gray-500">GPT Image 2 优质版：</span>
        60-100 秒出图，画质 &amp; 细节更佳
      </p>
    </div>
  );
};

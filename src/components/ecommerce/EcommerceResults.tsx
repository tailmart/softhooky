import React from 'react';
import { Eye, Wand2, Download, Sparkles } from 'lucide-react';

interface ResultItem {
  url: string;
  label?: string;
  idx?: number;
}

interface EcommerceResultsProps {
  results: ResultItem[];
  onPreview: (url: string) => void;
  onReEdit?: (url: string) => void;
  onDownload: (url: string) => void;
  aspectRatio?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

export const EcommerceResults: React.FC<EcommerceResultsProps> = ({
  results,
  onPreview,
  onReEdit,
  onDownload,
  aspectRatio = '1/1',
  emptyTitle = '生成结果',
  emptyDescription = '上传图片后开始生成'
}) => {
  if (results.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-[#171717]/10 to-[#404040]/5 rounded-2xl flex items-center justify-center">
            <Sparkles size={32} className="text-[#171717]" />
          </div>
          <h2 className="text-lg font-semibold text-[#171717] mb-2">{emptyTitle}</h2>
          <p className="text-sm text-[#A3A3A3] leading-relaxed">{emptyDescription}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {results.map((item, idx) => (
        <div key={idx} className="group relative bg-[#FAFAFA] rounded-2xl overflow-hidden border border-[#E5E5E5]">
          <div className="cursor-pointer" onClick={() => onPreview(item.url)}>
            <img
              src={item.url}
              alt=""
              className="w-full h-full object-cover"
              style={{ aspectRatio }}
            />
          </div>
          <div className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {item.label && (
                <span className="text-xs font-medium text-[#525252]">{item.label}</span>
              )}
              {item.idx !== undefined && !item.label && (
                <span className="text-xs font-medium text-[#525252]">图片 #{item.idx}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPreview(item.url)}
                className="w-7 h-7 flex items-center justify-center rounded-xl text-[#A3A3A3] hover:bg-[#F0F0F0] hover:text-[#171717]"
                title="预览"
              >
                <Eye size={14} />
              </button>
              {onReEdit && (
                <button
                  onClick={() => onReEdit(item.url)}
                  className="w-7 h-7 flex items-center justify-center rounded-xl text-[#A3A3A3] hover:bg-[#F0F0F0] hover:text-[#171717]"
                  title="微调"
                >
                  <Wand2 size={14} />
                </button>
              )}
              <button
                onClick={() => onDownload(item.url)}
                className="w-7 h-7 flex items-center justify-center rounded-xl text-[#A3A3A3] hover:bg-[#F0F0F0] hover:text-[#171717]"
                title="下载"
              >
                <Download size={14} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

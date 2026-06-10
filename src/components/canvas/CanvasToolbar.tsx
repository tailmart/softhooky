import React, { useState, useEffect } from 'react';
import { Images, Trash2 } from 'lucide-react';
import { ImageLibraryModal } from './ImageLibraryModal';

interface CanvasToolbarProps {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  batchDeleteMode?: boolean;
  onToggleBatchDelete?: () => void;
  selectedDeleteCount?: number;
  onCancelBatchDelete?: () => void;
  onConfirmBatchDelete?: () => void;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  scale,
  onZoomIn,
  onZoomOut,
  batchDeleteMode,
  onToggleBatchDelete,
  selectedDeleteCount,
  onCancelBatchDelete,
  onConfirmBatchDelete
}) => {
  const [displayScale, setDisplayScale] = useState(Math.round(scale * 100));
  const [showImageLibrary, setShowImageLibrary] = useState(false);

  useEffect(() => {
    setDisplayScale(Math.round(scale * 100));
  }, [scale]);

  return (
    <>
      {/* 顶部工具栏 */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white rounded-full shadow-lg border border-[#E5E5E5] p-1.5">
        {/* 缩放控制 */}
        <button 
          onClick={onZoomOut}
          className="p-2.5 text-[#525252] hover:text-[#171717] hover:bg-[#F5F5F5] rounded-full transition-all"
          title="缩小"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35M8 11h6" />
          </svg>
        </button>
        
        <span className="text-sm font-semibold text-[#171717] min-w-[50px] text-center">
          {displayScale}%
        </span>
        
        <button 
          onClick={onZoomIn}
          className="p-2.5 text-[#525252] hover:text-[#171717] hover:bg-[#F5F5F5] rounded-full transition-all"
          title="放大"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
          </svg>
        </button>

        <div className="w-px h-6 bg-[#E5E5E5] mx-1" />

        {/* 功能按钮 */}
        <button 
          onClick={() => setShowImageLibrary(true)}
          className="p-2.5 text-[#A3A3A3] hover:text-[#525252] hover:bg-[#F5F5F5] rounded-full transition-all"
          title="图片库"
        >
          <Images size={18} />
        </button>

        <button
          onClick={onToggleBatchDelete}
          className={`p-2.5 rounded-full transition-all ${batchDeleteMode ? 'bg-[#171717] text-white' : 'text-[#A3A3A3] hover:text-[#525252] hover:bg-[#F5F5F5]'}`}
          title={batchDeleteMode ? '退出批量删除' : '批量删除'}
        >
          <Trash2 size={18} />
        </button>

        {batchDeleteMode && (
          <div className="flex items-center gap-3 ml-2 pl-3 border-l border-[#E5E5E5]">
            <span className="text-sm text-[#737373] whitespace-nowrap">已选 <strong className="text-[#171717]">{selectedDeleteCount || 0}</strong> 张</span>
            <button onClick={onCancelBatchDelete} className="px-2.5 py-1 text-sm text-[#737373] hover:text-[#171717] transition-colors">取消</button>
            <button
              onClick={onConfirmBatchDelete}
              disabled={!selectedDeleteCount || selectedDeleteCount === 0}
              className="px-3 py-1 bg-[#171717] text-white rounded-full text-sm font-medium hover:bg-[#27272A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              删除
            </button>
          </div>
        )}
      </div>

      {/* 图片库弹窗 */}
      <ImageLibraryModal
        isOpen={showImageLibrary}
        onClose={() => setShowImageLibrary(false)}
      />
    </>
  );
};
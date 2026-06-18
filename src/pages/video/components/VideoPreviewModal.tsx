import React from 'react';
import { X, Download, ExternalLink } from 'lucide-react';

const cosProxyUrl = (url: string) => {
  if (url && (url.includes('cos.ap-beijing.myqcloud.com') || url.includes('soruxgpt.com') || url.includes('agnes-ai.space') || url.includes('xgapi.top'))) {
    return `/api/cos-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
};

interface VideoPreviewModalProps {
  url: string;
  onClose: () => void;
  onDownload: (url: string) => void;
}

export function VideoPreviewModal({ url, onClose, onDownload }: VideoPreviewModalProps) {
  // 捕获 Safari 视频播放器内部的 EmptyRanges 错误
  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    e.stopPropagation();
    // Safari 内部错误，忽略即可
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col items-center gap-4 max-w-[80vw] max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X size={20} />
        </button>

        {/* Video player */}
        <video
          src={cosProxyUrl(url)}
          controls
          autoPlay
          crossOrigin="anonymous"
          className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl shadow-black/50 bg-black"
          onError={handleVideoError}
          onPlay={(e) => {
            // 阻止 Safari EmptyRanges 错误冒泡
            try { e.stopPropagation(); } catch {}
          }}
        >
          Your browser does not support the video tag.
        </video>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onDownload(url)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-shadow"
          >
            <Download size={16} />
            下载视频
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <ExternalLink size={16} />
            新窗口打开
          </a>
        </div>
      </div>
    </div>
  );
}

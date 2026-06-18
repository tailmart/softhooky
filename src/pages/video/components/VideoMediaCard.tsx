import React, { useState } from 'react';
import { Download, Trash2, Play, Image, Film, Clock, X } from 'lucide-react';

const cosProxyUrl = (url: string) => {
  if (url && (url.includes('cos.ap-beijing.myqcloud.com') || url.includes('soruxgpt.com') || url.includes('agnes-ai.space') || url.includes('xgapi.top'))) {
    return `/api/cos-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
};

interface VideoMediaCardProps {
  item: {
    id: number;
    image_url: string;
    prompt: string | null;
    model: string;
    type: 'video' | 'video-script' | 'video-social';
    created_at: string;
    expires_at: string | null;
  };
  onDelete: (id: number) => void;
  onDownload: (url: string) => void;
}

export const VideoMediaCard: React.FC<VideoMediaCardProps> = ({ item, onDelete, onDownload }) => {
  const [showPreview, setShowPreview] = useState(false);
  const isVideo = item.type === 'video' || item.image_url.includes('.mp4');
  const isImage = !isVideo;

  const getTypeLabel = () => {
    switch (item.type) {
      case 'video': return '视频';
      case 'video-script': return '脚本图';
      case 'video-social': return '社媒图';
      default: return '媒体';
    }
  };

  const getTypeColor = () => {
    switch (item.type) {
      case 'video': return 'bg-blue-100 text-blue-700';
      case 'video-script': return 'bg-purple-100 text-purple-700';
      case 'video-social': return 'bg-emerald-100 text-emerald-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getAutoDeleteInfo = () => {
    if (!item.created_at) return '';
    const created = new Date(item.created_at);
    const expires = new Date(created.getTime() + 3 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const diff = expires.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}天后删除`;
    if (hours > 0) return `${hours}小时后删除`;
    return '即将删除';
  };

  return (
    <>
      <div className="group relative bg-white rounded-xl overflow-hidden border border-slate-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300">
        {/* 缩略图区域 */}
        <div className="relative aspect-video bg-slate-100 overflow-hidden">
          {isVideo ? (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
              <div className="w-16 h-16 rounded-full bg-white/80 flex items-center justify-center shadow-lg">
                <Play size={24} className="text-blue-600 ml-1" />
              </div>
              <video
                src={cosProxyUrl(item.image_url)}
                className="absolute inset-0 w-full h-full object-cover opacity-30"
                muted
                crossOrigin="anonymous"
              />
            </div>
          ) : (
            <img
              src={item.image_url}
              alt={item.prompt || '媒体'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}

          {/* 类型标签 */}
          <div className={`absolute top-2 left-2 px-2 py-1 rounded-lg text-[10px] font-medium ${getTypeColor()}`}>
            {getTypeLabel()}
          </div>

          {/* 操作按钮 - hover 显示 */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); onDownload(item.image_url); }}
              className="w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-lg transition-all"
              title="下载"
            >
              <Download size={16} className="text-slate-700" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
              className="w-10 h-10 rounded-full bg-white/90 hover:bg-red-50 flex items-center justify-center shadow-lg transition-all"
              title="删除"
            >
              <Trash2 size={16} className="text-slate-700 hover:text-red-600" />
            </button>
            {(isVideo || isImage) && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowPreview(true); }}
                className="w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-lg transition-all"
                title="预览"
              >
                {isVideo ? <Film size={16} className="text-slate-700" /> : <Image size={16} className="text-slate-700" />}
              </button>
            )}
          </div>
        </div>

        {/* 信息区域 */}
        <div className="p-3">
          {item.prompt && (
            <p className="text-xs text-slate-600 line-clamp-2 mb-2 leading-relaxed">
              {item.prompt}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400">
              {new Date(item.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-amber-500 flex items-center gap-1">
                <Clock size={10} />
                {getAutoDeleteInfo()}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                className="w-6 h-6 rounded-md hover:bg-red-50 flex items-center justify-center transition-colors"
                title="删除"
              >
                <Trash2 size={12} className="text-slate-400 hover:text-red-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 预览弹窗 */}
      {showPreview && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowPreview(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full mx-4" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowPreview(false)}
              className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
            >
              <X size={20} className="text-white" />
            </button>
            {isVideo ? (
              <video
                src={cosProxyUrl(item.image_url)}
                controls
                autoPlay
                crossOrigin="anonymous"
                className="w-full rounded-2xl shadow-2xl"
              />
            ) : (
              <img
                src={item.image_url}
                alt={item.prompt || '预览'}
                className="w-full rounded-2xl shadow-2xl"
              />
            )}
            {item.prompt && (
              <div className="mt-4 p-4 bg-white/10 backdrop-blur-md rounded-xl">
                <p className="text-sm text-white/80">{item.prompt}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

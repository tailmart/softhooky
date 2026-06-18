import React, { useState, useEffect, useCallback } from 'react';
import { X, Download, Trash2, Loader2, Image as ImageIcon, Clock, Check, RefreshCw, Coins } from 'lucide-react';
import { imageLibraryService, GeneratedImage } from '../../services/imageLibraryService';
import { useAuth } from '../../contexts/AuthContext';

interface MobileImageLibraryProps { onBack: () => void; }

const getThumbUrl = (url: string): string => {
  if (!url || url.includes('/videos/') || url.includes('.mp4')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}w=400&format=webp`;
};

const isVideoUrl = (url: string): boolean => url.includes('.mp4') || url.includes('video') || url.includes('/videos/');

const getExpiresIn = (expiresAt: string): string => {
  if (!expiresAt) return '';
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return '已过期';
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours >= 24) return `${Math.floor(hours / 24)}天后删除`;
  if (hours > 0) return `${hours}小时${mins}分后删除`;
  return `${mins}分钟后删除`;
};

export const MobileImageLibrary: React.FC<MobileImageLibraryProps> = ({ onBack }) => {
  const { isAuthenticated, user } = useAuth();
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedImg, setExpandedImg] = useState<GeneratedImage | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [selMode, setSelMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const loadImages = useCallback(async (p: number) => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await imageLibraryService.getImages(p, 30);
      if (res.success) {
        setImages(res.data || []);
        setTotalPages(res.pagination?.totalPages || 1);
        setTotal(res.pagination?.total || 0);
      }
    } catch {} finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { loadImages(page); }, [page, loadImages]);

  const handleDelete = useCallback(async (id: number, url: string) => {
    try {
      await imageLibraryService.deleteImage(id);
      imageLibraryService.trackDeletedImageUrl(url);
      setImages(prev => prev.filter(img => img.id !== id));
    } catch {}
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (selected.size === 0) return;
    const selectedImages = images.filter(img => selected.has(img.id));
    try {
      await imageLibraryService.batchDeleteImages(Array.from(selected));
      selectedImages.forEach(img => imageLibraryService.trackDeletedImageUrl(img.image_url));
      setImages(prev => prev.filter(img => !selected.has(img.id)));
      setSelected(new Set());
      setSelMode(false);
    } catch {
      loadImages(page);
    }
  }, [selected, images, page, loadImages]);

  const handleDownload = useCallback(async (url: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `softhooky_${Date.now()}.${isVideoUrl(url) ? 'mp4' : 'png'}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {}
  }, []);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 mobile-tap"><X size={16} className="text-gray-500" /></button>
        <h1 className="text-base font-bold text-[#171717]">图片图库</h1>
        {isAuthenticated && user && (
          <div className="flex items-center gap-1 bg-blue-500/10 px-2.5 py-1 rounded-full">
            <Coins size={12} className="text-blue-400" />
            <span className="text-xs font-semibold text-blue-400">{Number(user.credits || 0).toFixed(1)}</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {selMode && (
            <button onClick={handleBatchDelete} disabled={selected.size === 0}
              className="text-xs font-medium text-red-400 px-3 py-1.5 rounded-full bg-red-500/10">
              删除{selected.size > 0 ? ` (${selected.size})` : ''}
            </button>
          )}
          <button onClick={() => { setSelMode(!selMode); setSelected(new Set()); }}
            className="text-xs font-medium text-gray-500 px-3 py-1.5 rounded-full bg-gray-100">
            {selMode ? '完成' : '选择'}
          </button>
          <span className="text-[11px] text-gray-400">{total}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="grid grid-cols-3 gap-1 p-1">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                <div className="w-full h-full mobile-shimmer" />
              </div>
            ))}
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-3 shadow-sm border border-gray-200">
              <ImageIcon size={28} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-400">暂无图片</p>
            <button onClick={() => loadImages(page)} className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 px-4 py-2 rounded-full bg-gray-50 border border-gray-200">
              <RefreshCw size={12} /> 刷新
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1 p-1">
              {images.map(img => {
                const isSel = selected.has(img.id);
                const expiresIn = getExpiresIn(img.expires_at);
                const expiringSoon = img.expires_at && new Date(img.expires_at).getTime() - Date.now() < 86400000;
                return (
                  <div key={img.id} className="relative aspect-square bg-gray-50 overflow-hidden"
                    onClick={() => { if (selMode) { setSelected(p => { const n = new Set(p); if (n.has(img.id)) n.delete(img.id); else n.add(img.id); return n; }); } else { setExpandedImg(img); setImgLoaded(false); } }}>
                    {selMode && (
                      <div className="absolute top-1.5 right-1.5 z-10">
                        <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center ${isSel ? 'bg-blue-500 border-blue-500' : 'bg-white/90 border-white/20'}`}>
                          {isSel && <Check size={11} className="text-white" />}
                        </div>
                      </div>
                    )}
                    {isVideoUrl(img.image_url) ? (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeOpacity="1" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                      </div>
                    ) : (
                      <img src={getThumbUrl(img.image_url)} alt={img.prompt || ''} loading="lazy"
                        className="w-full h-full object-cover" referrerPolicy="no-referrer"
                        onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23d4d4d4%22 stroke-width=%222%22%3E%3Crect x=%223%22 y=%223%22 width=%2218%22 height=%2218%22 rx=%222%22/%3E%3Ccircle cx=%228.5%22 cy=%228.5%22 r=%221.5%22/%3E%3Cpolyline points=%2221 15 16 10 5 21%22/%3E%3C/svg%3E'; }} />
                    )}
                    {/* hover overlay: download/delete - only when not in selection mode */}
                    {!selMode && !isVideoUrl(img.image_url) && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 flex items-center justify-end gap-1 opacity-0 hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); handleDownload(img.image_url); }} className="w-7 h-7 bg-white/90 rounded-full flex items-center justify-center">
                          <Download size={12} className="text-[#171717]" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(img.id, img.image_url); }} className="w-7 h-7 bg-white/90 rounded-full flex items-center justify-center">
                          <Trash2 size={12} className="text-red-500" />
                        </button>
                      </div>
                    )}
                    {/* Expiry badge */}
                    <div className="absolute top-1.5 left-1.5 bg-black/50 rounded-full px-1.5 py-0.5 flex items-center gap-0.5 backdrop-blur-sm">
                      <Clock size={8} className="text-white" />
                      <span className={`text-[8px] font-medium ${expiringSoon ? 'text-red-300' : 'text-white'}`}>{expiresIn}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 px-4 py-5">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="px-5 py-2.5 rounded-xl bg-gray-100 border border-gray-200 text-xs font-medium text-gray-500 disabled:opacity-40">上一页</button>
                <span className="text-xs text-gray-400">{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="px-5 py-2.5 rounded-xl bg-gray-100 border border-gray-200 text-xs font-medium text-gray-500 disabled:opacity-40">下一页</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Fullscreen Preview */}
      {expandedImg && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center" onClick={() => setExpandedImg(null)}>
          <div onClick={e => e.stopPropagation()} className="relative w-full h-full flex items-center justify-center">
            {isVideoUrl(expandedImg.image_url) ? (
              <div className="flex flex-col items-center gap-4">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                <p className="text-white/80 text-sm">视频文件无法预览</p>
                <button onClick={() => handleDownload(expandedImg.image_url)} className="px-5 py-2.5 bg-white rounded-xl text-sm font-medium flex items-center gap-2"><Download size={16} />下载</button>
              </div>
            ) : (
              <>
                {!imgLoaded && <Loader2 size={24} className="text-white/50 animate-spin absolute" />}
                <img src={expandedImg.image_url} alt="" className="max-w-[95vw] max-h-[85vh] object-contain" referrerPolicy="no-referrer"
                  onLoad={() => setImgLoaded(true)} style={{ opacity: imgLoaded ? 1 : 0 }} />
                <div className="absolute bottom-6 left-4 right-4 p-3 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl">
                  <p className="text-xs text-white/90 line-clamp-2">{expandedImg.prompt || 'AI生成图片'}</p>
                  <div className="flex items-center gap-1 mt-1.5 text-[10px] text-white/60">
                    <Clock size={10} /> 倒计时 {getExpiresIn(expandedImg.expires_at)}
                  </div>
                </div>
              </>
            )}
          </div>
          <button onClick={() => setExpandedImg(null)} className="absolute top-4 right-4 w-10 h-10 bg-white/15 rounded-full flex items-center justify-center">
            <X size={20} className="text-white" />
          </button>
        </div>
      )}
    </div>
  );
};

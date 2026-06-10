import React, { useState, useEffect, useCallback } from 'react';
import { X, Images, RefreshCw, Trash2, Download, Loader2, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { imageLibraryService, GeneratedImage } from '../../services/imageLibraryService';

const PAGE_SIZE = 15;

const getThumbUrl = (url: string): string => {
  if (!url || url.includes('/videos/') || url.includes('.mp4')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}w=400&format=webp`;
};

const ImageCard: React.FC<{
  image: GeneratedImage;
  onDelete: (id: number) => void;
  onSelect?: (image: GeneratedImage) => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelection: (id: number) => void;
}> = React.memo(({ image, onDelete, onSelect, isSelectionMode, isSelected, onToggleSelection }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);

  const isVideoUrl = (url: string): boolean => url.includes('.mp4') || url.includes('video') || url.includes('/videos/');

  const getExpiresIn = (expiresAt: string): string => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    if (diff <= 0) return '已过期';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours >= 24) { const days = Math.floor(hours / 24); return `${days}天后删除`; }
    if (hours > 0) return `${hours}小时${minutes}分钟后删除`;
    return `${minutes}分钟后删除`;
  };

  const expiresIn = getExpiresIn(image.expires_at);
  const isExpiringSoon = new Date(image.expires_at).getTime() - Date.now() < 24 * 60 * 60 * 1000;

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = image.image_url;
    const ext = isVideoUrl(image.image_url) ? 'mp4' : 'png';
    link.download = `image-${image.id}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = (e: React.MouseEvent) => { e.stopPropagation(); onDelete(image.id); };

  return (
    <>
      <div className={`group relative bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : 'border border-[#E5E5E5] hover:border-[#D4D4D4]'}`}
        onClick={() => { if (isSelectionMode) { onToggleSelection(image.id); } else { onSelect ? onSelect(image) : (isVideoUrl(image.image_url) ? handleDownload({ stopPropagation: () => {} } as React.MouseEvent) : setShowFullscreen(true)); } }}>
        <div className="relative aspect-square bg-[#F5F5F5] overflow-hidden">
          {isSelectionMode && (
            <div className="absolute top-2 right-2 z-10">
              <div className={`w-6 h-6 rounded-xl border-2 flex items-center justify-center transition-all shadow-sm ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white/90 border-[#D4D4D4]'}`}>
                {isSelected && <Check size={14} className="text-white" />}
              </div>
            </div>
          )}
          {!isLoaded && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#D4D4D4]" /></div>}
          {isVideoUrl(image.image_url) ? (
            <div className="w-full h-full flex items-center justify-center bg-[#F0F0F0]">
              <div className="flex flex-col items-center gap-2">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#A3A3A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                <span className="text-[10px] text-[#A3A3A3]">视频文件</span>
              </div>
            </div>
          ) : (
            <img src={getThumbUrl(image.image_url)} alt={image.prompt || 'Generated image'} loading="lazy" fetchPriority="low"
              className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
              referrerPolicy="no-referrer" onLoad={() => setIsLoaded(true)}
              onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23d4d4d4%22 stroke-width=%222%22%3E%3Crect x=%223%22 y=%223%22 width=%2218%22 height=%2218%22 rx=%222%22/%3E%3Ccircle cx=%228.5%22 cy=%228.5%22 r=%221.5%22/%3E%3Cpolyline points=%2221 15 16 10 5 21%22/%3E%3C/svg%3E'; setIsLoaded(true); }} />
          )}
          {!isSelectionMode && (isVideoUrl(image.image_url) || isLoaded) && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2 gap-1.5">
              <button onClick={handleDownload} className="w-9 h-9 bg-white/90 backdrop-blur-sm rounded-xl flex items-center justify-center hover:bg-white transition-all shadow-lg">
                <Download size={15} className="text-[#737373]" />
              </button>
              <button onClick={handleDelete} className="w-9 h-9 bg-white/90 backdrop-blur-sm rounded-xl flex items-center justify-center hover:bg-red-50 transition-all shadow-lg">
                <Trash2 size={15} className="text-red-500" />
              </button>
            </div>
          )}
        </div>
        <div className="p-2.5">
          <p className="text-xs text-[#737373] truncate leading-relaxed">{image.prompt || (image.type === 'edited' ? '图片编辑' : 'AI生成')}</p>
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-1.5">
              {image.sub_user_name && (
                <span className="inline-flex items-center px-1.5 py-0.5 bg-[#F0F0F0] text-[#737373] rounded text-[9px] font-medium">{image.sub_user_name}</span>
              )}
              <p className="text-[11px] text-[#A3A3A3]">{new Date(image.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
            </div>
            <p className={`text-[11px] ${isExpiringSoon ? 'text-red-500 font-medium' : 'text-[#A3A3A3]'}`}>{expiresIn}</p>
          </div>
        </div>
      </div>
      {showFullscreen && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center" onClick={() => setShowFullscreen(false)}>
          <div onClick={e => e.stopPropagation()} className="relative w-full h-full flex items-center justify-center">
            {isVideoUrl(image.image_url) ? (
              <div className="flex flex-col items-center gap-4">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                <p className="text-white/80 text-sm">视频文件无法在线预览</p>
                <button onClick={handleDownload} className="px-6 py-2 bg-white text-[#171717] rounded-xl text-sm font-medium hover:bg-white/90 transition-all flex items-center gap-2"><Download size={16} />下载到本地播放</button>
              </div>
            ) : (
              <img src={image.image_url} alt={image.prompt || 'Generated image'} className="max-w-[95vw] max-h-[95vh] object-contain rounded-2xl" referrerPolicy="no-referrer"
                onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23d4d4d4%22 stroke-width=%222%22%3E%3Crect x=%223%22 y=%223%22 width=%2218%22 height=%2218%22 rx=%222%22/%3E%3Ccircle cx=%228.5%22 cy=%228.5%22 r=%221.5%22/%3E%3Cpolyline points=%2221 15 16 10 5 21%22/%3E%3C/svg%3E'; }} />
            )}
            {/* Glass Panel - Keywords & Countdown */}
            <div className="absolute bottom-6 left-6 right-6 md:left-6 md:right-auto md:max-w-md p-4 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl text-white shadow-lg">
              <p className="text-sm font-medium line-clamp-2 text-white/90">
                {image.prompt || (image.type === 'edited' ? '图片编辑' : 'AI生成图片')}
              </p>
              <div className="flex items-center gap-1 mt-2 text-xs text-white/60">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                倒计时 {(() => {
                  const diff = new Date(image.expires_at).getTime() - Date.now();
                  if (diff <= 0) return '已过期';
                  const hours = Math.floor(diff / (1000 * 60 * 60));
                  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                  return hours >= 24 ? `${Math.floor(hours / 24)}天后` : `${hours}小时${minutes}分`;
                })()}
              </div>
            </div>
          </div>
          <button onClick={() => setShowFullscreen(false)} className="absolute top-4 right-4 w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center transition-all">
            <X size={22} className="text-white" />
          </button>
        </div>
      )}
    </>
  );
});

export const ImageLibraryPage: React.FC = () => {
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<'mine' | 'sub'>('mine');
  const isParent = !JSON.parse(sessionStorage.getItem('user') || '{}').isSubUser;

  const fetchPage = useCallback(async (page: number, f?: string) => {
    setLoading(true);
    try {
      const res = await imageLibraryService.getImages(page, PAGE_SIZE, f || filter);
      if (res.success) { setImages(res.data); setTotalPages(res.pagination.totalPages); setTotalCount(res.pagination.total); }
    } catch (error) { console.error('Failed to fetch images:', error); }
    finally { setLoading(false); }
  }, [filter]);

  const firstLoad = loading && images.length === 0;

  useEffect(() => { setCurrentPage(1); fetchPage(1, filter); }, [filter, fetchPage]);

  const switchFilter = (f: 'mine' | 'sub') => {
    if (f === filter) return;
    setFilter(f);
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const handleDelete = async (id: number) => {
    const img = images.find(i => i.id === id);
    if (!confirm('确定要删除这张图片吗？')) return;
    setImages(prev => prev.filter(img => img.id !== id));
    try {
      await imageLibraryService.deleteImage(id);
      if (img?.image_url) imageLibraryService.trackDeletedImageUrl(img.image_url);
    }
    catch (error) { console.error('Failed to delete image:', error); alert('删除失败，请重试'); fetchPage(currentPage); }
  };

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === images.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(images.map(img => img.id)));
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 张图片吗？`)) return;
    const selectedImages = images.filter(img => selectedIds.has(img.id));
    const oldSelectedIds = new Set(selectedIds);
    setSelectedIds(new Set());
    try {
      await imageLibraryService.batchDeleteImages(Array.from(oldSelectedIds) as number[]);
      const urls = selectedImages.map(img => img.image_url).filter(Boolean);
      if (urls.length > 0) imageLibraryService.trackDeletedImageUrls(urls);
      setIsSelectionMode(false);
      fetchPage(currentPage);
    } catch (error) { console.error('Failed to batch delete images:', error); alert('批量删除失败，请重试'); }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedIds(new Set());
    fetchPage(page, filter);
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-[#E5E5E5] flex-shrink-0 bg-[#F7F7F7]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center">
            <Images size={16} className="text-white" />
          </div>
          <div className="flex items-center gap-1">
            {isParent && (
              <>
                <button onClick={() => switchFilter('mine')}
                  className={`h-8 px-3 text-xs font-medium rounded-xl transition-colors flex items-center ${filter === 'mine' ? 'bg-white text-[#171717] shadow-sm' : 'text-[#A3A3A3] hover:text-[#737373]'}`}>我的图片</button>
                <button onClick={() => switchFilter('sub')}
                  className={`h-8 px-3 text-xs font-medium rounded-xl transition-colors flex items-center ${filter === 'sub' ? 'bg-white text-[#171717] shadow-sm' : 'text-[#A3A3A3] hover:text-[#737373]'}`}>子账号图片</button>
              </>
            )}
            {!isParent && <h1 className="text-base font-semibold text-[#171717]">图片库</h1>}
          </div>
          {!loading && <span className="text-xs text-[#A3A3A3] bg-white px-2 py-0.5 rounded-xl">{totalCount} 张</span>}
        </div>
        <div className="flex items-center gap-2">
          {isSelectionMode ? (
            <>
              <button onClick={toggleSelectAll} className="px-3 py-1.5 bg-white hover:bg-[#F5F5F5] rounded-xl text-xs font-medium text-[#525252] transition-all border border-[#E5E5E5]">
                {selectedIds.size === images.length ? '取消全选' : '全选'}
              </button>
              <button onClick={handleBatchDelete} disabled={selectedIds.size === 0}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                删除{selectedIds.size > 0 && ` (${selectedIds.size})`}
              </button>
              <button onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }}
                className="px-3 py-1.5 bg-white hover:bg-[#F5F5F5] rounded-xl text-xs font-medium text-[#525252] transition-all border border-[#E5E5E5]">取消</button>
            </>
          ) : (
            <>
              <button onClick={() => setIsSelectionMode(true)}
                className="h-8 px-3 bg-white hover:bg-[#F5F5F5] rounded-xl text-xs font-medium text-[#525252] transition-all border border-[#E5E5E5] flex items-center gap-1.5">批量管理</button>
              <button onClick={() => handlePageChange(1)} disabled={loading}
                className="h-8 px-3 bg-white hover:bg-[#F5F5F5] rounded-xl text-xs font-medium text-[#525252] transition-all border border-[#E5E5E5] flex items-center gap-1.5 disabled:opacity-50">
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                刷新
              </button>
            </>
          )}
          {isSelectionMode && <span className="text-xs text-[#171717] font-medium">已选 {selectedIds.size} 张</span>}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {firstLoad ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl overflow-hidden border border-[#E5E5E5] animate-pulse">
                <div className="aspect-square bg-[#F5F5F5]" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-[#F5F5F5] rounded w-3/4" />
                  <div className="h-2 bg-[#F5F5F5] rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-[#F5F5F5] rounded-2xl flex items-center justify-center mb-5">
              <Images size={40} className="text-[#D4D4D4]" />
            </div>
            <p className="text-[#737373] text-base font-medium">暂无生成的图片</p>
            <p className="text-[#A3A3A3] text-sm mt-1">生成的图片将自动保存在这里</p>
          </div>
        ) : (
          <div className="relative">
            {loading && (
              <div className="absolute inset-0 z-10 bg-white/60 flex items-start justify-center pt-20 rounded-2xl">
                <Loader2 size={24} className="animate-spin text-[#A3A3A3]" />
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {images.map(image => (
                <ImageCard key={image.id} image={image} onDelete={handleDelete} isSelectionMode={isSelectionMode} isSelected={selectedIds.has(image.id)} onToggleSelection={toggleSelection} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && !loading && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#E5E5E5] bg-white flex-shrink-0">
          <div className="text-sm text-[#A3A3A3]">共 {totalCount} 张图片</div>
          <div className="flex items-center gap-2">
            <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#F5F5F5] hover:bg-[#EEEEEE] disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              <ChevronLeft size={18} className="text-[#737373]" />
            </button>
            <div className="flex items-center gap-1 text-sm">
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) pageNum = i + 1;
                else if (currentPage <= 4) pageNum = i + 1;
                else if (currentPage >= totalPages - 3) pageNum = totalPages - 6 + i;
                else pageNum = currentPage - 3 + i;
                return (
                  <button key={pageNum} onClick={() => handlePageChange(pageNum)}
                    className={`w-9 h-9 rounded-xl text-sm font-medium transition-all ${currentPage === pageNum ? 'bg-[#171717] text-white' : 'text-[#737373] hover:bg-[#F5F5F5]'}`}>
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#F5F5F5] hover:bg-[#EEEEEE] disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              <ChevronRight size={18} className="text-[#737373]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

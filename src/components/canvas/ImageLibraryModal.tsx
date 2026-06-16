import React, { useState, useEffect, useCallback } from 'react';
import { X, Images, RefreshCw, Trash2, Download, Loader2, Check, ChevronLeft, ChevronRight, AlertTriangle, ZoomIn, Clock, Sparkles } from 'lucide-react';
import { imageLibraryService, GeneratedImage } from '../../services/imageLibraryService';

interface ImageLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectImage?: (image: GeneratedImage) => void;
}

const PAGE_SIZE = 15;

const getThumbUrl = (url: string): string => {
  if (!url || url.includes('/videos/') || url.includes('.mp4')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}w=400&format=webp`;
};

const ExpiryBadge: React.FC<{ expiresAt: string }> = ({ expiresAt }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const expiresTime = new Date(expiresAt);
  const now = new Date();
  const diff = expiresTime.getTime() - now.getTime();
  const isExpired = diff <= 0;
  const isExpiringSoon = diff > 0 && diff < 24 * 60 * 60 * 1000;

  const formatDate = (date: Date) => date.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });

  let text = isExpired ? '已过期' : '';
  if (!isExpired) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      text = `${days}天后删除`;
    } else if (hours > 0) {
      text = `${hours}小时${minutes}分`;
    } else {
      text = `${minutes}分钟后`;
    }
  }

  return (
    <div className="relative">
      <div
        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 ${
          isExpired ? 'bg-gray-100 text-gray-400' :
          isExpiringSoon ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'
        }`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Clock size={9} />
        <span>{text}</span>
      </div>
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-[10px] rounded-lg whitespace-nowrap z-50">
          {isExpired ? `过期时间: ${formatDate(expiresTime)}` : `将于 ${formatDate(expiresTime)} 删除`}
        </div>
      )}
    </div>
  );
};

const ImageCard: React.FC<{
  image: GeneratedImage;
  onDelete: (id: number) => void;
  onSelect?: (image: GeneratedImage) => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelection: (id: number) => void;
  onShowFullscreen: (image: GeneratedImage) => void;
}> = React.memo(({ image, onDelete, onSelect, isSelectionMode, isSelected, onToggleSelection, onShowFullscreen }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  const isVideoUrl = (url: string): boolean => {
    return url.includes('.mp4') || url.includes('video') || url.includes('/videos/');
  };

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

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(image.id);
  };

  const handleDoubleClick = () => {
    if (!isSelectionMode) {
      onSelect ? onSelect(image) : onShowFullscreen(image);
    }
  };

  return (
    <div
      className={`group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-200 cursor-pointer ${
        isSelected ? 'ring-2 ring-[#171717] ring-offset-2' : 'border border-[#E5E5E5] hover:border-[#D4D4D4]'
      }`}
      onClick={() => {
        if (isSelectionMode) {
          onToggleSelection(image.id);
        } else {
          onSelect ? onSelect(image) : onShowFullscreen(image);
        }
      }}
      onDoubleClick={handleDoubleClick}
    >
      <div className="relative aspect-square bg-[#F5F5F5] overflow-hidden">
        {isSelectionMode && (
          <div className="absolute top-2 left-2 z-10">
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shadow-sm ${
              isSelected
                ? 'bg-[#171717] border-[#171717]'
                : 'bg-white/90 border-[#D4D4D4]'
            }`}>
              {isSelected && <Check size={14} className="text-white" />}
            </div>
          </div>
        )}

        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[#E5E5E5] border-t-[#171717] rounded-full animate-spin" />
          </div>
        )}
        {isVideoUrl(image.image_url) ? (
          <video
            src={image.image_url}
            className="w-full h-full object-cover"
            controls
            preload="none"
            playsInline
            referrerPolicy="no-referrer"
          />
        ) : (
          <img
            src={getThumbUrl(image.image_url)}
            alt={image.prompt || 'Generated image'}
            loading="lazy"
            fetchPriority="low"
            className={`w-full h-full object-cover transition-all duration-300 ${isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
            referrerPolicy="no-referrer"
            onLoad={() => setIsLoaded(true)}
            onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23d4d4d4%22 stroke-width=%222%22%3E%3Crect x=%223%22 y=%223%22 width=%2218%22 height=%2218%22 rx=%222%22/%3E%3Ccircle cx=%228.5%22 cy=%228.5%22 r=%221.5%22/%3E%3Cpolyline points=%2221 15 16 10 5 21%22/%3E%3C/svg%3E'; setIsLoaded(true); }}
          />
        )}

        {/* Hover Overlay */}
        {!isSelectionMode && isLoaded && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col justify-between p-2.5">
            <div className="flex items-start justify-end gap-1.5">
              <button
                onClick={handleDownload}
                className="w-8 h-8 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-all shadow-md hover:scale-105"
              >
                <Download size={14} className="text-[#525252]" />
              </button>
              <button
                onClick={handleDelete}
                className="w-8 h-8 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-red-50 transition-all shadow-md hover:scale-105"
              >
                <Trash2 size={14} className="text-red-500" />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <div className="px-1.5 py-0.5 bg-white/90 backdrop-blur-sm rounded-full text-[10px] text-[#525252] font-medium">
                  <Sparkles size={10} className="inline mr-0.5 text-amber-500" />
                  {image.type === 'edited' ? '编辑' : 'AI'}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onShowFullscreen(image); }}
                className="w-8 h-8 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-all shadow-md hover:scale-105"
              >
                <ZoomIn size={14} className="text-[#525252]" />
              </button>
            </div>
          </div>
        )}

        {/* Expiry Badge */}
        {isLoaded && (
          <div className="absolute bottom-2 left-2">
            <ExpiryBadge expiresAt={image.expires_at} />
          </div>
        )}
      </div>

      <div className="p-3">
        <p className="text-xs text-[#525252] line-clamp-2 leading-relaxed min-h-[2.5em]">
          {image.prompt || (image.type === 'edited' ? '图片编辑' : 'AI生成图片')}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          {image.sub_user_name && (
            <span className="inline-flex items-center px-1.5 py-0.5 bg-[#F5F5F5] text-[#737373] rounded-full text-[9px] font-medium">{image.sub_user_name}</span>
          )}
          <p className="text-[10px] text-[#A3A3A3]">
            {new Date(image.created_at).toLocaleString('zh-CN', {
              month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
            })}
          </p>
        </div>
      </div>
    </div>
  );
});

export const ImageLibraryModal: React.FC<ImageLibraryModalProps> = ({
  isOpen,
  onClose,
  onSelectImage
}) => {
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [fullscreenImage, setFullscreenImage] = useState<GeneratedImage | null>(null);

  const fetchPage = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const res = await imageLibraryService.getImages(page, PAGE_SIZE);
      if (res.success) {
        setImages(res.data);
        setTotalPages(res.pagination.totalPages);
        setTotalCount(res.pagination.total);
      }
    } catch (error) {
      console.error('Failed to fetch images:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setCurrentPage(1);
      // Cleanup expired images from DB and COS first
      imageLibraryService.cleanupExpiredImages().then(() => {
        fetchPage(1);
      }).catch(() => {
        fetchPage(1);
      });
    }
  }, [isOpen, fetchPage]);

  // Keyboard shortcut: ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullscreenImage) {
          setFullscreenImage(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, fullscreenImage, onClose]);

  const handleDelete = async (id: number) => {
    const img = images.find(i => i.id === id);
    if (!confirm('确定要删除这张图片吗？')) return;

    setImages(prev => prev.filter(img => img.id !== id));

    try {
      await imageLibraryService.deleteImage(id);
      if (img?.image_url) imageLibraryService.trackDeletedImageUrl(img.image_url);
    } catch (error) {
      console.error('Failed to delete image:', error);
      alert('删除失败，请重试');
      fetchPage(currentPage);
    }
  };

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === images.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(images.map(img => img.id)));
    }
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
    } catch (error) {
      console.error('Failed to batch delete images:', error);
      alert('批量删除失败，请重试');
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedIds(new Set());
    fetchPage(page);
  };

  if (!isOpen) return null;

  const isVideoUrl = (url: string): boolean => {
    return url.includes('.mp4') || url.includes('video') || url.includes('/videos/');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-0 md:p-4">
      <div className="bg-white rounded-none md:rounded-3xl w-full h-full md:h-auto md:max-w-6xl md:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E5E5E5] bg-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#171717] rounded-full flex items-center justify-center shadow-md">
              <Images size={20} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-[#171717]">图片库</h2>
                {!loading && (
                  <span className="text-xs text-[#737373] bg-[#F5F5F5] px-2 py-0.5 rounded-full font-medium">
                    {totalCount} 张
                  </span>
                )}
              </div>
              {isSelectionMode && (
                <p className="text-xs text-[#171717] font-medium mt-0.5">
                  已选 {selectedIds.size} 张
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSelectionMode ? (
              <>
                <button
                  onClick={toggleSelectAll}
                  className="px-3 py-2 bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-full text-xs font-medium text-[#525252] transition-all"
                >
                  {selectedIds.size === images.length ? '取消全选' : '全选'}
                </button>
                <button
                  onClick={handleBatchDelete}
                  disabled={selectedIds.size === 0}
                  className="px-3 py-2 bg-[#171717] hover:bg-[#27272A] text-white rounded-full text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  删除{selectedIds.size > 0 && ` (${selectedIds.size})`}
                </button>
                <button
                  onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }}
                  className="px-3 py-2 bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-full text-xs font-medium text-[#525252] transition-all"
                >
                  取消
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsSelectionMode(true)}
                  className="px-3 py-2 bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-full text-xs font-medium text-[#525252] transition-all"
                >
                  批量管理
                </button>
                <button
                  onClick={() => fetchPage(currentPage)}
                  disabled={loading}
                  className="p-2 rounded-full hover:bg-[#F5F5F5] transition-colors"
                >
                  <RefreshCw size={16} className={`text-[#737373] ${loading ? 'animate-spin' : ''}`} />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[#F5F5F5] transition-colors"
            >
              <X size={20} className="text-[#737373]" />
            </button>
          </div>
        </div>

        {/* Image Grid */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5" style={{ WebkitOverflowScrolling: 'touch' }}>
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
              {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl overflow-hidden border border-[#E5E5E5] animate-pulse">
                  <div className="aspect-square bg-[#F5F5F5]" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-[#F5F5F5] rounded-full w-3/4" />
                    <div className="h-2 bg-[#F5F5F5] rounded-full w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 bg-[#F5F5F5] rounded-full flex items-center justify-center mb-5">
                <Images size={40} className="text-[#D4D4D4]" />
              </div>
              <p className="text-[#525252] text-base font-medium">暂无生成的图片</p>
              <p className="text-[#A3A3A3] text-sm mt-1">生成的图片将自动保存在这里</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
              {images.map((image) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  onDelete={handleDelete}
                  onSelect={onSelectImage}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedIds.has(image.id)}
                  onToggleSelection={toggleSelection}
                  onShowFullscreen={setFullscreenImage}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && !loading && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-[#E5E5E5] bg-white flex-shrink-0">
            <div className="text-sm text-[#A3A3A3]">
              共 {totalCount} 张图片
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-[#F5F5F5] hover:bg-[#E5E5E5] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft size={18} className="text-[#525252]" />
              </button>
              <div className="flex items-center gap-1.5 text-sm">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (currentPage <= 4) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 3) {
                    pageNum = totalPages - 6 + i;
                  } else {
                    pageNum = currentPage - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`w-9 h-9 rounded-full text-sm font-medium transition-all ${
                        currentPage === pageNum
                          ? 'bg-[#171717] text-white'
                          : 'text-[#525252] hover:bg-[#F5F5F5]'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-[#F5F5F5] hover:bg-[#E5E5E5] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight size={18} className="text-[#525252]" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Preview Modal */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center animate-in fade-in duration-200"
          onClick={() => setFullscreenImage(null)}
        >
          <div onClick={e => e.stopPropagation()} className="relative w-full h-full flex items-center justify-center p-4 md:p-8">
            {isVideoUrl(fullscreenImage.image_url) ? (
              <video
                src={fullscreenImage.image_url}
                controls
                autoPlay
                className="max-w-full max-h-full rounded-3xl"
                referrerPolicy="no-referrer"
              />
            ) : (
              <img
                src={fullscreenImage.image_url}
                alt={fullscreenImage.prompt || 'Generated image'}
                className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl"
                referrerPolicy="no-referrer"
              />
            )}

            {/* Image Info - Glass Panel */}
            <div className="absolute bottom-6 left-6 right-6 md:left-6 md:right-auto md:max-w-md p-5 bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl text-white shadow-lg">
              {fullscreenImage.sub_user_name && (
                <span className="inline-flex items-center px-2 py-0.5 bg-white/15 rounded-full text-[10px] text-white/70 mb-2">{fullscreenImage.sub_user_name}</span>
              )}
              {/* Keywords / Prompt */}
              <p className="text-sm font-medium line-clamp-2 text-white/90">
                {fullscreenImage.prompt || (fullscreenImage.type === 'edited' ? '图片编辑' : 'AI生成图片')}
              </p>
              {/* Countdown & Date */}
              <div className="flex items-center gap-3 mt-2 text-xs text-white/60">
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  倒计时 {(() => {
                    if (!fullscreenImage.expires_at) return '';
                    const diff = new Date(fullscreenImage.expires_at).getTime() - Date.now();
                    if (diff <= 0) return '已过期';
                    const hours = Math.floor(diff / (1000 * 60 * 60));
                    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    return hours >= 24 ? `${Math.floor(hours / 24)}天后` : `${hours}小时${minutes}分`;
                  })()}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <button
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = fullscreenImage.image_url;
                  const ext = isVideoUrl(fullscreenImage.image_url) ? 'mp4' : 'png';
                  link.download = `image-${fullscreenImage.id}.${ext}`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="w-11 h-11 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center transition-all"
              >
                <Download size={20} className="text-white" />
              </button>
              <button
                onClick={() => setFullscreenImage(null)}
                className="w-11 h-11 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center transition-all"
              >
                <X size={22} className="text-white" />
              </button>
            </div>

            {/* Close hint */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-xs text-white/50">
              按 ESC 关闭 · 双击图片选择
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

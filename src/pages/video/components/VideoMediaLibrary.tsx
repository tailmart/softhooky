import React, { useState, useEffect, useCallback } from 'react';
import { Image, Film, Loader2, Trash2, RefreshCw, ChevronLeft, ChevronRight, Layers, Clock } from 'lucide-react';
import { getVideoMediaLibrary, deleteVideoMedia, batchDeleteVideoMedia, cleanupExpiredVideoMedia, VideoMediaItem } from '../../../services/videoMediaService';
import { VideoMediaCard } from './VideoMediaCard';

interface VideoMediaLibraryProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VideoMediaLibrary: React.FC<VideoMediaLibraryProps> = ({ isOpen, onClose }) => {
  const [items, setItems] = useState<VideoMediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<'all' | 'video' | 'video-script' | 'video-social'>('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isCleaning, setIsCleaning] = useState(false);

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getVideoMediaLibrary(page, 20, filter);
      if (response.success) {
        setItems(response.data);
        setTotalPages(response.pagination.totalPages);
        setTotal(response.pagination.total);
      }
    } catch (error) {
      console.error('获取媒体库失败:', error);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    if (isOpen) {
      fetchMedia();
    }
  }, [isOpen, fetchMedia]);

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此媒体？删除后无法恢复。')) return;
    try {
      await deleteVideoMedia(id);
      setItems(prev => prev.filter(item => item.id !== id));
      setTotal(prev => prev - 1);
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`确定删除选中的 ${selectedIds.length} 条记录？`)) return;

    try {
      await batchDeleteVideoMedia(selectedIds);
      setItems(prev => prev.filter(item => !selectedIds.includes(item.id)));
      setTotal(prev => prev - selectedIds.length);
      setSelectedIds([]);
    } catch (error) {
      console.error('批量删除失败:', error);
      alert('批量删除失败');
    }
  };

  const handleCleanup = async () => {
    if (!confirm('将清理所有过期（3天）的媒体文件，确定继续？')) return;
    setIsCleaning(true);
    try {
      const result = await cleanupExpiredVideoMedia();
      alert(`已清理 ${result.cleanedCount} 条过期记录`);
      fetchMedia();
    } catch (error) {
      console.error('清理失败:', error);
      alert('清理失败');
    } finally {
      setIsCleaning(false);
    }
  };

  const handleDownload = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `video-studio-${Date.now()}.${url.includes('.mp4') ? 'mp4' : 'jpg'}`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('下载失败:', error);
      window.open(url, '_blank');
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map(item => item.id));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-6xl h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Layers size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">媒体库</h2>
              <p className="text-xs text-slate-500">共 {total} 条记录 · 3天后自动清理</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <button
                onClick={handleBatchDelete}
                className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors flex items-center gap-2"
              >
                <Trash2 size={14} />
                删除选中 ({selectedIds.length})
              </button>
            )}
            <button
              onClick={handleCleanup}
              disabled={isCleaning}
              className="px-4 py-2 bg-amber-50 text-amber-600 rounded-xl text-sm font-medium hover:bg-amber-100 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isCleaning ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
              清理过期
            </button>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
            >
              <span className="text-slate-500 text-lg">×</span>
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-100 bg-white">
          {[
            { value: 'all', label: '全部', icon: <Layers size={14} /> },
            { value: 'video', label: '视频', icon: <Film size={14} /> },
            { value: 'video-script', label: '脚本图', icon: <Image size={14} /> },
            { value: 'video-social', label: '社媒图', icon: <Image size={14} /> },
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => { setFilter(tab.value as any); setPage(1); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                filter === tab.value
                  ? 'bg-blue-50 text-blue-600 border border-blue-200'
                  : 'text-slate-500 hover:bg-slate-50 border border-transparent'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={selectAll}
            className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
          >
            {selectedIds.length === items.length ? '取消全选' : '全选'}
          </button>
          <button
            onClick={fetchMedia}
            className="w-8 h-8 rounded-lg hover:bg-slate-50 flex items-center justify-center transition-colors"
            title="刷新"
          >
            <RefreshCw size={14} className="text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={32} className="animate-spin text-blue-500" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-24 h-24 rounded-3xl bg-slate-100 flex items-center justify-center mb-4">
                <Layers size={40} className="text-slate-300" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-2">暂无媒体</h3>
              <p className="text-sm text-slate-500">生成的视频、脚本图和社媒图将显示在这里</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {items.map(item => (
                <div key={item.id} className="relative">
                  <div
                    className={`absolute top-2 right-2 z-10 w-5 h-5 rounded-md border-2 cursor-pointer transition-all ${
                      selectedIds.includes(item.id)
                        ? 'bg-blue-500 border-blue-500'
                        : 'bg-white/80 border-slate-300 hover:border-blue-400'
                    }`}
                    onClick={() => toggleSelect(item.id)}
                  >
                    {selectedIds.includes(item.id) && (
                      <svg className="w-full h-full text-white p-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <VideoMediaCard
                    item={item}
                    onDelete={handleDelete}
                    onDownload={handleDownload}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-sm text-slate-500">
              第 {page} / {totalPages} 页
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center disabled:opacity-50 hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft size={16} className="text-slate-600" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center disabled:opacity-50 hover:bg-slate-50 transition-colors"
              >
                <ChevronRight size={16} className="text-slate-600" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

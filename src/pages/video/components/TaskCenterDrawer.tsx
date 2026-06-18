import React, { useState } from 'react';
import { X, Film, Clock, CheckCircle, AlertCircle, Loader2, Download, RotateCcw, Eye, Trash2 } from 'lucide-react';

interface VideoTask {
  taskId: string;
  status: string;
  progress: number;
  url?: string;
  error?: string;
  prompt?: string;
  createdAt?: number;
}

interface TaskCenterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: VideoTask[];
  onRetry: (taskId: string) => void;
  onRemove: (taskId: string) => void;
  onPreview: (url: string) => void;
  onDownload: (url: string) => void;
}

type FilterKey = 'all' | 'pending' | 'done' | 'failed';

const filters: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '进行中' },
  { key: 'done', label: '已完成' },
  { key: 'failed', label: '失败' },
];

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed': return <CheckCircle size={16} className="text-emerald-500" />;
    case 'failed': return <AlertCircle size={16} className="text-red-500" />;
    default: return <Loader2 size={16} className="text-blue-500 animate-spin" />;
  }
}

function matchesFilter(task: VideoTask, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'pending') return task.status !== 'completed' && task.status !== 'failed';
  if (filter === 'done') return task.status === 'completed';
  if (filter === 'failed') return task.status === 'failed';
  return true;
}

export function TaskCenterDrawer({ isOpen, onClose, tasks, onRetry, onRemove, onPreview, onDownload }: TaskCenterDrawerProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const filtered = tasks.filter(t => matchesFilter(t, activeFilter));

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-[100] transition-opacity backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-[400px] bg-white border-l border-slate-200 z-[101] transform transition-transform duration-300 ease-in-out shadow-2xl ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-slate-200">
          <div className="flex items-center gap-2 text-slate-900 font-medium text-sm">
            <Film size={18} className="text-blue-600" />
            任务中心
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 px-5 py-3 border-b border-slate-200">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                activeFilter === f.key
                  ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Task List */}
        <div className="overflow-y-auto" style={{ height: 'calc(100% - 112px)' }}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2">
              <Film size={40} className="opacity-30" />
              <span>暂无任务</span>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {filtered.map(task => (
                <div
                  key={task.taskId}
                  className="bg-slate-50 rounded-2xl p-4 border border-slate-200 hover:border-blue-200 transition-colors"
                >
                  {/* Task header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(task.status)}
                      <span className="text-xs text-slate-500 font-mono">
                        {task.taskId.slice(0, 8)}...
                      </span>
                    </div>
                    <button
                      onClick={() => onRemove(task.taskId)}
                      className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Prompt */}
                  {task.prompt && (
                    <p className="text-xs text-slate-700 mb-2 line-clamp-2">{task.prompt}</p>
                  )}

                  {/* Progress bar for pending */}
                  {task.status !== 'completed' && task.status !== 'failed' && (
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6] rounded-full transition-all duration-500"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                  )}

                  {/* Error message */}
                  {task.status === 'failed' && task.error && (
                    <p className="text-xs text-red-500/80 mb-2">{task.error}</p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-1">
                    {task.status === 'completed' && task.url && (
                      <>
                        <button
                          onClick={() => onPreview(task.url!)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                        >
                          <Eye size={12} /> 预览
                        </button>
                        <button
                          onClick={() => onDownload(task.url!)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                        >
                          <Download size={12} /> 下载
                        </button>
                      </>
                    )}
                    {task.status === 'failed' && (
                      <button
                        onClick={() => onRetry(task.taskId)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                      >
                        <RotateCcw size={12} /> 重试
                      </button>
                    )}
                    {task.status !== 'completed' && task.status !== 'failed' && (
                      <span className="text-[11px] text-slate-500">{task.progress}%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

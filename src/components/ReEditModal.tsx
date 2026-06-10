import React, { useState } from 'react';
import { X, Loader2, Sparkles } from 'lucide-react';
import { editImage } from '../services/imageService';
import { requireAuth } from '../utils/authCheck';

interface ReEditModalProps {
  isOpen: boolean;
  imageUrl: string;
  aspectRatio: string;
  model: string;
  resolution: string;
  onClose: () => void;
  onReplaced: (oldUrl: string, newUrl: string) => void;
}

export const ReEditModal: React.FC<ReEditModalProps> = ({
  isOpen,
  imageUrl,
  aspectRatio,
  model,
  resolution,
  onClose,
  onReplaced,
}) => {
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [progress, setProgress] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!requireAuth()) return;
    if (!editPrompt.trim()) { alert('请输入微调描述'); return; }

    setIsEditing(true);
    setProgress('正在微调生成...');
    try {
      const resp = await editImage({
        prompt: editPrompt.trim(),
        images: [imageUrl],
        model,
        resolution,
        aspectRatio,
      });
      const newUrl = resp.data?.[0]?.url || resp.image_url || resp.url || '';
      if (!newUrl) throw new Error('生成未返回图片');
      onReplaced(imageUrl, newUrl);
      onClose();
      setEditPrompt('');
    } catch (err: any) {
      alert('微调失败: ' + (err.message || '请稍后重试'));
    } finally {
      setIsEditing(false);
      setProgress('');
    }
  };

  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .panel-slide-in {
          animation: slideInRight 0.3s ease-out;
        }
      `}</style>
      <div className="fixed inset-0 z-[9999] pointer-events-none">
        {/* Semi-transparent mask */}
        <div
          className="absolute inset-0 pointer-events-auto bg-black/10"
          onClick={(e) => { if (!isEditing) onClose(); }}
        />
        {/* Right-side panel */}
        <div className="absolute right-0 top-0 bottom-0 w-[480px] max-w-[90vw] pointer-events-auto bg-white shadow-2xl flex flex-col panel-slide-in border-l border-gray-200">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-[#171717]">二次微调</h2>
            <button
              onClick={onClose}
              disabled={isEditing}
              className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Image Preview */}
            <div className="bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden flex items-center justify-center" style={{ minHeight: 200 }}>
              <img
                src={imageUrl}
                alt="微调原图"
                className="max-w-full max-h-[280px] object-contain"
              />
            </div>

            {/* Input */}
            <div>
              <label className="text-sm font-semibold text-[#171717] block mb-2">
                微调描述
              </label>
              <textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder="输入你想调整的内容，如：将背景改为白色、调整产品颜色为红色、让光线更柔和..."
                className="w-full bg-gray-50 rounded-xl p-4 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none text-[#333333] placeholder:text-gray-400"
                rows={4}
                disabled={isEditing}
              />
            </div>

            {/* Params Info */}
            <div className="flex gap-3 text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3">
              <span>模型: {model}</span>
              <span>比例: {aspectRatio}</span>
              <span>分辨率: {resolution}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
            {progress && (
              <div className="flex items-center gap-2 text-xs text-gray-400 flex-1">
                <Loader2 size={14} className="animate-spin" />
                {progress}
              </div>
            )}
            <div className="flex-1" />
            <button
              onClick={onClose}
              disabled={isEditing}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={isEditing || !editPrompt.trim()}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#171717] hover:bg-[#27272A] transition-colors flex items-center gap-2 disabled:bg-gray-200 disabled:text-gray-400"
            >
              {isEditing ? (
                <><Loader2 size={16} className="animate-spin" /> 生成中...</>
              ) : (
                <><Sparkles size={16} /> 微调生成</>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

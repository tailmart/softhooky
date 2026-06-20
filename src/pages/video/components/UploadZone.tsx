import React, { useRef, useState, useCallback } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

interface UploadZoneProps {
  onUpload: (files: File[]) => void;
  maxFiles?: number;
  currentCount?: number;
  accept?: string;
  label?: string;
  className?: string;
}

export function UploadZone({ onUpload, maxFiles, currentCount = 0, accept = 'image/*', label, className = '' }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const remaining = maxFiles != null ? Math.max(0, maxFiles - currentCount) : Infinity;

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || remaining <= 0) return;
      const files = Array.from(fileList).slice(0, remaining);
      if (files.length > 0) onUpload(files);
    },
    [onUpload, remaining],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  return (
    <div
      className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer ${
        dragOver
          ? 'border-blue-400 bg-blue-50 shadow-[0_0_20px_rgba(59,130,246,0.1)]'
          : 'border-slate-300 bg-slate-50 hover:border-blue-300 hover:bg-slate-100'
      } ${className}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={!maxFiles || maxFiles > 1}
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />

      <div className="flex flex-col items-center gap-3 py-8 px-4">
        <div className={`p-3 rounded-xl transition-colors ${dragOver ? 'bg-blue-100' : 'bg-slate-200'}`}>
          {dragOver ? (
            <ImageIcon size={24} className="text-blue-500" />
          ) : (
            <Upload size={24} className="text-slate-400" />
          )}
        </div>

        <div className="text-center">
          <p className="text-sm text-slate-700 mb-1">
            {label || '拖拽文件到此处或点击上传'}
          </p>
          {maxFiles != null && (
            <p className="text-xs text-slate-400">
              已上传 {currentCount}/{maxFiles}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

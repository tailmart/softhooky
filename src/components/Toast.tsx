import React, { useEffect } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  visible: boolean;
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({ message, type, visible, onClose, duration = 4000 }) => {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [visible, onClose, duration]);

  if (!visible) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-300">
      <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border ${
        type === 'success'
          ? 'bg-white border-green-200 text-green-800'
          : 'bg-white border-red-200 text-red-800'
      }`}>
        {type === 'success' ? <CheckCircle size={18} className="flex-shrink-0" /> : <AlertCircle size={18} className="flex-shrink-0" />}
        <span className="text-sm font-medium">{message}</span>
        <button onClick={onClose} className="ml-1 p-0.5 rounded-lg hover:bg-black/5 transition-colors flex-shrink-0">
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

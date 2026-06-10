import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { tauriAPI } from '../tauri';

const api = tauriAPI.isTauri ? tauriAPI : null;

export const UpdateButton: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [version, setVersion] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!api) return;
    api.onUpdateStatus((type: string, data?: any) => {
      if (type === 'available') { setStatus('available'); setVersion(data?.version || ''); }
      else if (type === 'not-available') { setStatus('not-available'); setTimeout(() => setStatus('idle'), 3000); }
      else if (type === 'downloaded') { setStatus('downloaded'); }
      else if (type === 'error') { setStatus('error'); setErrorMsg(data || '检查更新失败'); setTimeout(() => setStatus('idle'), 4000); }
    });
    api.onDownloadProgress((pct: number) => {
      setProgress(pct);
      if (pct >= 100) setTimeout(() => setStatus('downloaded'), 500);
    });
  }, []);

  const handleClick = async () => {
    if (!api) return;
    setStatus('checking');
    try {
      const result = await api.checkForUpdates();
      if (!result.success) { setStatus('error'); setErrorMsg(result.message); setTimeout(() => setStatus('idle'), 3000); }
      else if (result.hasUpdate) { setStatus('available'); setVersion(result.version); setStatus('downloading'); setProgress(0); api.downloadUpdate(); }
      else { setStatus('not-available'); setTimeout(() => setStatus('idle'), 3000); }
    } catch { setStatus('error'); setTimeout(() => setStatus('idle'), 3000); }
  };

  if (compact) {
    const label = status === 'checking' ? '检查中...'
      : status === 'downloading' ? `下载中 ${progress}%`
      : status === 'downloaded' ? '已下载，重启生效'
      : status === 'available' ? `新版本 v${version}`
      : status === 'not-available' ? '已是最新'
      : status === 'error' ? '检查失败'
      : '检查更新';
    const color = status === 'downloaded' ? 'text-green-500'
      : status === 'error' ? 'text-red-500'
      : 'text-gray-400 hover:text-gray-600';
    return (
      <button onClick={handleClick} disabled={status === 'checking' || status === 'downloading'}
        className={`text-xs ${color} transition-colors ${status === 'checking' || status === 'downloading' ? 'opacity-60 cursor-not-allowed' : ''}`}>
        {label}
      </button>
    );
  }

  const isDisabled = status === 'checking' || status === 'downloading';
  const bgColor = status === 'downloaded' ? 'hover:bg-green-50'
    : status === 'error' ? 'hover:bg-red-50' : 'hover:bg-gray-50';

  const statusIcon = () => {
    switch (status) {
      case 'checking': return <Loader2 size={18} className="animate-spin text-blue-500" />;
      case 'downloading': return <Loader2 size={18} className="animate-spin text-blue-500" />;
      case 'downloaded': return <CheckCircle size={18} className="text-green-500" />;
      case 'available': return <Download size={18} className="text-blue-500" />;
      case 'not-available': return <CheckCircle size={18} className="text-gray-400" />;
      case 'error': return <AlertCircle size={18} className="text-red-500" />;
      default: return <RefreshCw size={18} className="text-gray-400" />;
    }
  };

  const statusText = () => {
    switch (status) {
      case 'checking': return '检查更新...';
      case 'downloading': return `下载中 ${progress}%`;
      case 'downloaded': return '已下载，重启生效';
      case 'available': return version ? `新版本 v${version}` : '新版本可用';
      case 'not-available': return '已是最新版本';
      case 'error': return errorMsg || '检查失败';
      default: return '检查更新';
    }
  };

  return (
    <button onClick={handleClick} disabled={isDisabled}
      className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all ${bgColor} ${isDisabled ? 'opacity-60' : ''}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${status === 'downloaded' ? 'bg-green-100' : status === 'error' ? 'bg-red-100' : 'bg-gray-100'}`}>
        {statusIcon()}
      </div>
      <div className="flex-1 text-left">
        <p className={`text-sm font-semibold ${status === 'downloaded' ? 'text-green-700' : status === 'error' ? 'text-red-700' : 'text-gray-900'}`}>{statusText()}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {status === 'downloading' ? '正在下载更新包' : status === 'downloaded' ? '重启应用以安装' : status === 'available' ? '点击下载更新' : '检查最新版本'}
        </p>
      </div>
      {status === 'downloading' && (
        <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}
    </button>
  );
};

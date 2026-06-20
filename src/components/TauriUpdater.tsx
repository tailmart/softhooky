import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X, RefreshCw } from 'lucide-react';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

function isWindows(): boolean {
  return navigator.userAgent.includes('Windows');
}

function isMacOS(): boolean {
  return navigator.userAgent.includes('Mac OS') || navigator.userAgent.includes('Intel Mac');
}

interface UpdateInfo {
  version: string;
  notes: string;
  downloadUrl: string;
}

export default function TauriUpdater() {
  const [showDialog, setShowDialog] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);

  const currentVersion = '1.1.0';

  /** Windows: 通过 GitHub Releases 检查更新 */
  const checkGitHubRelease = async (): Promise<UpdateInfo | null> => {
    const resp = await fetch('https://api.github.com/repos/tailmart/softhooky/releases/latest');
    if (!resp.ok) return null;
    const data = await resp.json();
    const tagVersion = (data.tag_name || '').replace(/^v/, '');
    if (!tagVersion || tagVersion === currentVersion) return null;
    return {
      version: tagVersion,
      notes: data.body || '新版本已发布',
      downloadUrl: `https://github.com/tailmart/softhooky/releases/tag/${data.tag_name}`,
    };
  };

  /** macOS: 通过后端 API 检查更新 */
  const checkServerVersion = async (): Promise<UpdateInfo | null> => {
    const resp = await fetch('http://43.143.213.221/api/version');
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.version || data.version === currentVersion) return null;
    return {
      version: data.version,
      notes: data.notes || '新版本已发布',
      downloadUrl: 'https://softhooky.com/download',
    };
  };

  const checkForUpdates = useCallback(async () => {
    if (!isTauri()) return;
    setChecking(true);

    try {
      const info = isWindows() ? await checkGitHubRelease() : await checkServerVersion();
      if (info) {
        setUpdateInfo(info);
        setShowDialog(true);
      }
    } catch (err) {
      console.log('[Update] Check failed:', err);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(checkForUpdates, 5000);
    const interval = setInterval(checkForUpdates, 30 * 60 * 1000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [checkForUpdates]);

  const handleDownload = () => {
    if (updateInfo?.downloadUrl) {
      window.open(updateInfo.downloadUrl, '_blank');
    }
    setShowDialog(false);
  };

  if (!isTauri() || !showDialog || !updateInfo) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
        onClick={() => setShowDialog(false)}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-8 text-white">
            <button
              onClick={() => setShowDialog(false)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <RefreshCw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold">发现新版本</h3>
                <p className="text-white/80 text-sm">v{updateInfo.version}</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{updateInfo.notes}</p>
            </div>
            <button
              onClick={handleDownload}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              {isWindows() ? '从 GitHub 下载更新' : '前往下载新版本'}
            </button>
            <button
              onClick={() => setShowDialog(false)}
              className="w-full text-center py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              稍后再说
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

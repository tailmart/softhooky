import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X, RefreshCw, CheckCircle } from 'lucide-react';

// 检测是否在 Tauri 环境中运行
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

interface UpdateInfo {
  version: string;
  notes: string;
}

export default function TauriUpdater() {
  const [showDialog, setShowDialog] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const checkForUpdates = useCallback(async () => {
    if (!isTauri()) return;

    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (update) {
        setUpdateInfo({
          version: update.version || '未知',
          notes: update.body || '新版本可用',
        });
        setShowDialog(true);
      }
    } catch (err) {
      console.log('Update check failed (非致命错误):', err);
    }
  }, []);

  useEffect(() => {
    // 启动后延迟 5 秒检查更新
    const timer = setTimeout(checkForUpdates, 5000);
    // 每 30 分钟检查一次
    const interval = setInterval(checkForUpdates, 30 * 60 * 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [checkForUpdates]);

  const handleUpdate = async () => {
    if (!updateInfo) return;

    setDownloading(true);
    setError(null);
    setDownloadProgress(0);

    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (update) {
        // 下载并安装更新
        await update.downloadAndInstall((event) => {
          if (event.event === 'Started' && event.data.contentLength) {
            setDownloadProgress(0);
          } else if (event.event === 'Progress') {
            // 更新进度
            setDownloadProgress((prev) => Math.min(prev + 1, 99));
          } else if (event.event === 'Finished') {
            setDownloadProgress(100);
          }
        });

        // 安装完成后重启应用
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      }
    } catch (err: any) {
      console.error('Update failed:', err);
      setError(err?.message || '更新失败，请稍后重试');
      setDownloading(false);
    }
  };

  if (!isTauri() || !showDialog || !updateInfo) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
        onClick={() => !downloading && setShowDialog(false)}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 头部 */}
          <div className="relative bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-8 text-white">
            {!downloading && (
              <button
                onClick={() => setShowDialog(false)}
                className="absolute top-4 right-4 p-1 rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
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

          {/* 内容 */}
          <div className="px-6 py-5">
            {downloading ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-gray-700">
                  <Download className="w-5 h-5 text-blue-500 animate-bounce" />
                  <span className="font-medium">正在下载更新...</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <motion.div
                    className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2.5 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${downloadProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-sm text-gray-500 text-center">{downloadProgress}%</p>
              </div>
            ) : error ? (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleUpdate}
                    className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2.5 rounded-lg font-medium transition-colors"
                  >
                    重试
                  </button>
                  <button
                    onClick={() => setShowDialog(false)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg font-medium transition-colors"
                  >
                    稍后再说
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {updateInfo.notes || '新版本包含改进和修复'}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleUpdate}
                    className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white py-2.5 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    立即更新
                  </button>
                  <button
                    onClick={() => setShowDialog(false)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg font-medium transition-colors"
                  >
                    稍后再说
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

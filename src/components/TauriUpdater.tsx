import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X, RefreshCw } from 'lucide-react';

/**
 * 检测是否在 Tauri 环境中运行
 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

interface UpdateInfo {
  version: string;
  notes: string;
}

/**
 * 版本检查更新组件
 *
 * 原理：定期请求后端版本接口，有新版本时提示用户去云盘下载
 * 不需要签名密钥、不需要 manifest，适用小团队快速迭代
 */
export default function TauriUpdater() {
  const [showDialog, setShowDialog] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentVersion = '1.1.0'; // 与 package.json 同步

  const checkForUpdates = useCallback(async () => {
    if (!isTauri()) return;

    setChecking(true);
    setError(null);

    try {
      // 请求后端版本接口（在服务端加一个简单的 JSON 接口即可）
      const resp = await fetch('http://43.143.213.221/api/version');
      if (!resp.ok) return;
      const data = await resp.json();

      if (data.version && data.version !== currentVersion) {
        setUpdateInfo({
          version: data.version,
          notes: data.notes || '新版本已发布，请下载更新',
        });
        setShowDialog(true);
      }
    } catch (err) {
      // 版本检查失败不阻塞用户
      console.log('[Update] Check failed:', err);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    // 启动后 5 秒检查
    const timer = setTimeout(checkForUpdates, 5000);
    // 每 30 分钟检查一次
    const interval = setInterval(checkForUpdates, 30 * 60 * 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [checkForUpdates]);

  const handleDownload = () => {
    // 打开云盘下载链接
    window.open('https://softhooky.com/download', '_blank');
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
          {/* 头部 */}
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

          {/* 内容 */}
          <div className="px-6 py-5 space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <p className="text-sm text-gray-600 whitespace-pre-wrap">
                {updateInfo.notes}
              </p>
            </div>
            <button
              onClick={handleDownload}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              前往下载新版本
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

/**
 * Tauri 平台 API 封装层
 * 统一对外接口，方便前端调用
 */

type UpdateCallback = (type: string, data?: any) => void;
type ProgressCallback = (pct: number) => void;

let updateListeners: UpdateCallback[] = [];
let progressListeners: ProgressCallback[] = [];

async function initUpdaterListeners() {
  try {
    const { onUpdaterEvent } = await import('@tauri-apps/plugin-updater');
    await onUpdaterEvent((event) => {
      console.log('[tauri-updater]', event);
      switch (event.status) {
        case 'ERROR':
          updateListeners.forEach(cb => cb('error', event.error || '更新出错'));
          break;
        case 'DONE':
          updateListeners.forEach(cb => cb('downloaded'));
          break;
        case 'UP_TO_DATE':
          updateListeners.forEach(cb => cb('not-available'));
          break;
      }
    });
  } catch (e) {
    console.warn('[tauri] Updater events not available:', e);
  }
}

let initialized = false;

async function ensureInit() {
  if (initialized) return;
  initialized = true;
  await initUpdaterListeners();
}

export const tauriAPI = {
  isTauri: typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window,
  platform: typeof navigator !== 'undefined' ? navigator.platform.toLowerCase() : 'unknown',
  version: __TAURI_INTERNALS__?.metadata?.version || '1.0.0',

  // ===== 窗口控制 =====
  async minimize() {
    if (!this.isTauri) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().minimize();
  },

  async maximizeToggle() {
    if (!this.isTauri) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    if (await win.isMaximized()) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  },

  async close() {
    if (!this.isTauri) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  },

  async isMaximized(): Promise<boolean> {
    if (!this.isTauri) return false;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return await getCurrentWindow().isMaximized();
  },

  onMaximizeChange(callback: (maximized: boolean) => void) {
    if (!this.isTauri) return;
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      getCurrentWindow().onResized(() => {
        getCurrentWindow().isMaximized().then(callback);
      });
    });
  },

  // ===== 更新功能 =====
  async checkForUpdates(): Promise<{ success: boolean; hasUpdate?: boolean; version?: string; message?: string }> {
    await ensureInit();
    if (!this.isTauri) return { success: false, message: '非 Tauri 环境' };
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        return { success: true, hasUpdate: true, version: update.version };
      }
      return { success: true, hasUpdate: false };
    } catch (err: any) {
      return { success: false, message: err.message || '检查更新失败' };
    }
  },

  async downloadUpdate() {
    await ensureInit();
    if (!this.isTauri) return;
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        progressListeners.forEach(cb => cb(0));
        await update.downloadAndInstall();
        progressListeners.forEach(cb => cb(100));
      }
    } catch (err) {
      console.error('[tauri] Download update failed:', err);
    }
  },

  onUpdateStatus(callback: UpdateCallback) {
    updateListeners.push(callback);
    return () => {
      updateListeners = updateListeners.filter(cb => cb !== callback);
    };
  },

  onDownloadProgress(callback: ProgressCallback) {
    progressListeners.push(callback);
    return () => {
      progressListeners = progressListeners.filter(cb => cb !== callback);
    };
  },
};

// 暴露到全局，兼容旧引用
if (typeof window !== 'undefined') {
  (window as any).tauriAPI = tauriAPI;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_API_URL?: string
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Tauri 类型声明
interface Window {
  __TAURI_INTERNALS__?: {
    metadata?: {
      version?: string
    }
  }
  tauriAPI?: {
    isTauri: boolean
    platform: string
    version: string
    minimize: () => Promise<void>
    maximizeToggle: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    onMaximizeChange: (callback: (maximized: boolean) => void) => void
    checkForUpdates: () => Promise<{ success: boolean; hasUpdate?: boolean; version?: string; message?: string }>
    downloadUpdate: () => Promise<void>
    onUpdateStatus: (callback: (type: string, data?: any) => void) => void
    onDownloadProgress: (callback: (pct: number) => void) => void
  }
}

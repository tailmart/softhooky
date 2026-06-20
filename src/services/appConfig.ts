/**
 * 运行时配置加载器
 * 
 * 在 Tauri 桌面端，应用启动时读取 config.json
 * 代理只需在安装目录放一个 config.json 即可定制 API 地址
 * 无需为每个代理重新打包
 * 
 * config.json 格式：
 * {
 *   "apiBaseUrl": "http://代理域名.com",
 *   "brandName": "代理品牌名",
 *   "logoUrl": "http://..."
 * }
 */

export interface AppConfig {
  apiBaseUrl?: string;
  brandName?: string;
  logoUrl?: string;
  /** 额外的 Axios 请求头（用于代理鉴权） */
  extraHeaders?: Record<string, string>;
}

let cachedConfig: AppConfig | null = null;

/**
 * 检测是否运行在 Tauri 环境中
 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * 加载运行时配置
 */
export async function loadAppConfig(): Promise<AppConfig | null> {
  if (cachedConfig) return cachedConfig;

  if (!isTauri()) return null; // 网页端不需要读取配置文件

  try {
    // 通过 Tauri IPC 调用 Rust 命令读取 config.json
    const { invoke } = await import('@tauri-apps/api/core');
    const raw = await invoke<string | null>('read_app_config');
    
    if (raw) {
      const config = JSON.parse(raw) as AppConfig;
      cachedConfig = config;
      console.log('[Softhooky] 已加载运行时配置:', config.apiBaseUrl ? `API: ${config.apiBaseUrl}` : '无 API 覆盖');
      return config;
    }
  } catch (err) {
    console.warn('[Softhooky] 读取运行时配置失败（非致命）:', err);
  }

  return null;
}

/**
 * 获取配置的 API 基础 URL（如果配置中有）
 */
export function getConfigApiUrl(): string | null {
  return cachedConfig?.apiBaseUrl || null;
}

/**
 * 获取配置的额外请求头
 */
export function getConfigHeaders(): Record<string, string> {
  return cachedConfig?.extraHeaders || {};
}

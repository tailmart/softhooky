import axios from 'axios';
import { loadAppConfig, getConfigApiUrl, getConfigHeaders } from './appConfig';

const API_URL = import.meta.env.VITE_API_URL ?? '';

// 设置全局 axios 默认 baseURL，确保所有服务文件（authService 等）
// 使用的相对路径 API 调用在桌面端能正确指向后端服务器
//
// 优先级：运行时 config.json > VITE_API_URL 构建变量 > 回退 URL
async function initBaseURL() {
  // 1. 尝试读取运行时配置（config.json）
  const config = await loadAppConfig();
  const configUrl = getConfigApiUrl();
  const finalUrl = configUrl || API_URL;

  if (finalUrl) {
    axios.defaults.baseURL = finalUrl;
    console.log('[API] baseURL =', finalUrl);
  }

  // 2. 设置额外请求头（代理鉴权等）
  const headers = getConfigHeaders();
  for (const [key, value] of Object.entries(headers)) {
    axios.defaults.headers.common[key] = value;
  }
}

// 立即执行初始化
initBaseURL();

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

export { API_URL };
export default api;

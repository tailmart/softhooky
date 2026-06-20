import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ?? '';

// 设置全局 axios 默认 baseURL，确保所有服务文件（authService 等）
// 使用的相对路径 API 调用在桌面端能正确指向后端服务器
if (API_URL) {
  axios.defaults.baseURL = API_URL;
}

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

export { API_URL };
export default api;

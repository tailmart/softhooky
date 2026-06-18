import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://43.161.228.92:3001';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

export { API_URL };
export default api;

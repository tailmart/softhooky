import axios from 'axios';
import { clearPricingCache } from './pricingService';

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 403 && error.response?.data?.message?.includes('账号已被禁用')) {
      if (error.config?.url === '/api/auth/sub-login') {
        return Promise.reject(error);
      }
      logout();
      const user = getCurrentUser();
      const redirectUrl = user?.isSubUser ? '/sub-login?disabled=1' : '/auth?disabled=1';
      window.location.href = redirectUrl;
    }
    if (error.response?.status === 401) {
      // 登录/注册接口的401是密码错误，不重定向
      const url = error.config?.url || '';
      if (url.includes('/api/auth/login') || url.includes('/api/auth/register')) {
        return Promise.reject(error);
      }
      // 如果已经在登录页或子账号登录页，不弹窗也不跳转
      const currentPath = window.location.pathname;
      if (currentPath === '/auth' || currentPath === '/sub-login') {
        return Promise.reject(error);
      }
      // 清除本地无效 token
      sessionStorage.removeItem('authToken');
      sessionStorage.removeItem('user');
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      alert('登录已过期，请重新登录');
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  }
);

export interface RegisterData {
  email: string;
  password: string;
  code?: string;
  apiKey?: string;
  inviteCode?: string;
}

export interface LoginData {
  email: string;
  password: string;
  captchaToken?: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: {
    id: number;
    email: string;
    credits: number;
    apiKey?: string;
    recharge_disabled?: boolean;
  };
  message?: string;
}

/**
 * 注册新用户
 */
export const register = async (data: RegisterData): Promise<AuthResponse> => {
  clearPricingCache();
  try {
    const response = await axios.post('/api/auth/register', data);
    
    // 保存 token 和 apiKey 到 sessionStorage（窗口关闭后自动清除）
    if (response.data.token) {
      sessionStorage.setItem('authToken', response.data.token);
      sessionStorage.setItem('user', JSON.stringify(response.data.user));
      if (response.data.user?.apiKey) {
        sessionStorage.setItem('apiKey', response.data.user.apiKey);
      }
      // 触发积分更新事件
      window.dispatchEvent(new Event('credits-updated'));
    }
    
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || '注册失败');
  }
};

/**
 * 用户登录
 */
export const login = async (data: LoginData & { rememberMe?: boolean }): Promise<AuthResponse> => {
  clearPricingCache();
  try {
    const response = await axios.post('/api/auth/login', data);

    if (response.data.token) {
      const storage = data.rememberMe ? localStorage : sessionStorage;
      storage.setItem('authToken', response.data.token);
      storage.setItem('user', JSON.stringify(response.data.user));
      if (response.data.user?.apiKey) {
        storage.setItem('apiKey', response.data.user.apiKey);
      }
      // Always keep sessionStorage in sync for current session
      sessionStorage.setItem('authToken', response.data.token);
      sessionStorage.setItem('user', JSON.stringify(response.data.user));
      window.dispatchEvent(new Event('credits-updated'));
    }

    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || '登录失败');
  }
};

/**
 * 退出登录 - 清除所有本地用户数据，防止下一个人看到聊天记录
 */
export const logout = () => {
  clearPricingCache();
  // 清除 sessionStorage
  sessionStorage.removeItem('authToken');
  sessionStorage.removeItem('user');
  sessionStorage.removeItem('apiKey');
  sessionStorage.removeItem('paymentAmount');
  sessionStorage.removeItem('paymentOrderId');

  // 需要清除的固定 key
  const exactKeys = [
    'authToken',
    'user',
    'apiKey',
    'currentView',
    'sf_chatMode',
    'notif_dismissed',
    'adminToken',
    'adminUser',
    'deleted_image_urls',
    'nanogen_history_images',
  ];

  // 按前缀匹配的动态 key（用户相关存储）
  const prefixes = [
    'canvas_state_',
    'deepseek_canvas_state_',
    'nanogen_history_',
    'gptimagegen_history_',
  ];

  // 先收集要删除的 key（避免遍历过程中因删除导致 index 偏移）
  const keysToRemove = [...exactKeys];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && prefixes.some(p => key.startsWith(p)) && !keysToRemove.includes(key)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach(key => localStorage.removeItem(key));
};

/**
 * 获取当前用户 - 支持记住我（从 localStorage 恢复）
 */
export const getCurrentUser = () => {
  let userStr = sessionStorage.getItem('user');
  if (!userStr) userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
};

/**
 * 获取认证 token - 支持记住我（从 localStorage 恢复）
 */
export const getAuthToken = () => {
  return sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
};

/**
 * 获取用户的 API Key
 */
export const getApiKey = () => {
  return sessionStorage.getItem('apiKey');
};

/**
 * 检查是否已登录
 */
export const isAuthenticated = () => {
  return !!getAuthToken();
};

/**
 * 刷新用户积分
 */
export const refreshCredits = async (): Promise<number> => {
  try {
    const token = getAuthToken();
    if (!token) return 0;
    const response = await axios.get('/api/auth/credits', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      const credits = response.data.credits;
      const quotaMode = response.data.quota_mode;
      const rechargeDisabled = response.data.recharge_disabled;
      const userStr = sessionStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        user.credits = credits;
        user.quota_mode = quotaMode;
        if (rechargeDisabled !== undefined) user.recharge_disabled = rechargeDisabled;
        sessionStorage.setItem('user', JSON.stringify(user));
        // 不在这里 dispatch 事件，避免 Header 里的 handleCreditsUpdate 递归调用
      }
      return credits;
    }
    return 0;
  } catch (error) {
    console.error('Failed to refresh credits:', error);
    return 0;
  }
};

/**
 * 充值积分
 */
export const rechargeCredits = async (amount: number): Promise<{ success: boolean; credits: number; message?: string }> => {
  try {
    const token = getAuthToken();
    const response = await axios.post('/api/auth/recharge', { amount }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (response.data.success) {
      const userStr = sessionStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        user.credits = response.data.credits;
        sessionStorage.setItem('user', JSON.stringify(user));
        window.dispatchEvent(new Event('credits-updated'));
      }
      return response.data;
    }
    return { success: false, credits: 0, message: response.data.message };
  } catch (error: any) {
    return { success: false, credits: 0, message: error.response?.data?.message || '充值失败' };
  }
};

/**
 * 从服务器获取当前用户信息
 */
export const fetchCurrentUser = async (): Promise<{ id: number; email: string; credits: number; apiKey?: string; isSubUser?: boolean; parentUserId?: number; recharge_disabled?: boolean } | null> => {
  try {
    const token = getAuthToken();
    if (!token) return null;
    
    const response = await axios.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.data.success && response.data.user) {
      // 更新 sessionStorage 中的用户信息
      sessionStorage.setItem('user', JSON.stringify(response.data.user));
      window.dispatchEvent(new Event('credits-updated'));
      return response.data.user;
    }
    return null;
  } catch (error) {
    console.error('获取当前用户失败:', error);
    return null;
  }
};

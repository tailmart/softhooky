import { getCurrentUser } from '../services/authService';

/**
 * 检查用户是否已登录
 * @returns true if logged in, false if not
 */
export const requireAuth = (): boolean => {
  const user = getCurrentUser();
  if (!user) {
    window.dispatchEvent(new CustomEvent('show-auth-modal'));
    return false;
  }
  return true;
};

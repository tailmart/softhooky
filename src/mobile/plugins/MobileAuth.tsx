import React, { useState, useEffect } from 'react';
import { X, Mail, Lock, Eye, EyeOff, Loader2, Check, ShieldCheck } from 'lucide-react';
import { login, register } from '../../services/authService';
import { TianaiCaptchaButton } from '../../components/TianaiCaptcha';
import { useSiteConfig } from '../../contexts/SiteConfigContext';

interface MobileAuthProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type AuthMode = 'login' | 'register';

export const MobileAuth: React.FC<MobileAuthProps> = ({ open, onClose, onSuccess }) => {
  const { config } = useSiteConfig();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [oauthLoading, setOauthLoading] = useState(false);

  // ========== OAuth 微信登录 ==========
  const handleOAuthLogin = async (type: string) => {
    try {
      setError('');
      setOauthLoading(true);

      const res = await fetch(`/api/auth/oauth/login?type=${type}&redirect=${encodeURIComponent(window.location.href)}`);
      const data = await res.json();

      if (!data?.success || !data?.data?.url) {
        setError(data?.message || '获取登录链接失败');
        setOauthLoading(false);
        return;
      }

      // 打开 OAuth 授权弹窗
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.innerWidth - width) / 2;
      const top = window.screenY + (window.innerHeight - height) / 2;

      window.open(
        data.data.url,
        'oauth-login',
        `width=${width},height=${height},left=${left},top=${top}`
      );
    } catch (err: any) {
      setError(err.message || '发起微信登录失败');
      setOauthLoading(false);
    }
  };

  // 监听 OAuth 回调消息
  useEffect(() => {
    if (!open) return;

    let handled = false;

    const processOAuthResult = (token: string, user: any) => {
      if (handled) return;
      handled = true;
      setOauthLoading(false);
      sessionStorage.setItem('authToken', token);
      sessionStorage.setItem('user', JSON.stringify(user));
      localStorage.removeItem('oauth_login_result');
      localStorage.removeItem('oauth_login_ts');
      window.dispatchEvent(new Event('credits-updated'));
      window.dispatchEvent(new Event('auth-state-changed'));
      onSuccess();
      onClose();
    };

    const processOAuthError = (message: string) => {
      if (handled) return;
      handled = true;
      setOauthLoading(false);
      setError(message);
      localStorage.removeItem('oauth_login_error');
    };

    // 方式1: postMessage
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_LOGIN_SUCCESS') {
        const { token, user } = event.data.payload;
        if (token && user) processOAuthResult(token, user);
      } else if (event.data?.type === 'OAUTH_LOGIN_ERROR') {
        processOAuthError(event.data.payload?.message || '登录失败');
      }
    };
    window.addEventListener('message', handleOAuthMessage);

    // 方式2: storage 事件
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'oauth_login_result' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          if (data.token && data.user) processOAuthResult(data.token, data.user);
        } catch(e) {}
      } else if (event.key === 'oauth_login_error' && event.newValue) {
        processOAuthError(event.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);

    // 方式3: 轮询 localStorage
    const pollTimer = setInterval(() => {
      if (handled) { clearInterval(pollTimer); return; }
      try {
        const result = localStorage.getItem('oauth_login_result');
        if (result) {
          const data = JSON.parse(result);
          if (data.token && data.user) processOAuthResult(data.token, data.user);
        }
        const errMsg = localStorage.getItem('oauth_login_error');
        if (errMsg) processOAuthError(errMsg);
      } catch(e) {}
    }, 500);

    return () => {
      window.removeEventListener('message', handleOAuthMessage);
      window.removeEventListener('storage', handleStorage);
      clearInterval(pollTimer);
    };
  }, [open, onSuccess, onClose]);

  if (!open) return null;

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('请填写邮箱和密码');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('两次密码输入不一致');
      return;
    }
    if (mode === 'register' && password.length < 6) {
      setError('密码至少6位');
      return;
    }
    if (!captchaToken) {
      setError('请先完成安全验证');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'login') {
        await login({ email: email.trim(), password, rememberMe, captchaToken });
      } else {
        await register({ email: email.trim(), password, captchaToken });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '操作失败，请重试');
      setCaptchaToken('');
      setCaptchaKey(k => k + 1);
    } finally {
      setIsLoading(false);
    }
  };

  // 判断是否有第三方登录平台
  const hasOAuthPlatforms = config.oauth_platforms && config.oauth_platforms.length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full bg-white rounded-t-3xl pb-[calc(24px+env(safe-area-inset-bottom,0px))] animate-mobile-slide-up"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '90vh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-2">
          <h2 className="text-lg font-bold text-[#171717]">
            {mode === 'login' ? '登录' : '注册'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 pt-3 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 80px)' }}>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">邮箱</label>
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-100 rounded-xl">
              <Mail size={16} className="text-gray-400" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="请输入邮箱"
                className="flex-1 bg-transparent text-sm text-[#171717] placeholder-gray-300 outline-none" autoFocus />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">密码</label>
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-100 rounded-xl">
              <Lock size={16} className="text-gray-400" />
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="请输入密码"
                className="flex-1 bg-transparent text-sm text-[#171717] placeholder-gray-300 outline-none" />
              <button onClick={() => setShowPassword(!showPassword)} className="text-gray-400">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">确认密码</label>
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-100 rounded-xl">
                <Lock size={16} className="text-gray-400" />
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="再次输入密码"
                  className="flex-1 bg-transparent text-sm text-[#171717] placeholder-gray-300 outline-none" />
              </div>
            </div>
          )}

          {mode === 'login' && (
            <label className="flex items-center gap-2.5">
              <button onClick={() => setRememberMe(!rememberMe)}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${rememberMe ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                {rememberMe && <Check size={12} className="text-white" />}
              </button>
              <span className="text-xs text-gray-500">记住我</span>
            </label>
          )}

          {/* Captcha */}
          <div className="bg-gray-100 rounded-2xl p-3">
            {captchaToken ? (
              <div className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-green-500">
                <ShieldCheck size={18} /> 验证通过
              </div>
            ) : (
              <TianaiCaptchaButton key={captchaKey} onSuccess={(token) => setCaptchaToken(token)} />
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <button onClick={handleSubmit} disabled={isLoading || !captchaToken}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl text-sm font-semibold active:from-blue-600 active:to-blue-700 transition-colors disabled:opacity-50">
            {isLoading ? <><Loader2 size={16} className="animate-spin" /> 处理中...</> : mode === 'login' ? '登录' : '注册'}
          </button>

          {/* ===== 第三方登录（仅登录模式显示） ===== */}
          {mode === 'login' && hasOAuthPlatforms && (
            <>
              {/* 分割线 */}
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-4 text-[11px] text-gray-300">其他登录方式</span>
                </div>
              </div>

              {/* OAuth 按钮 */}
              <div className="flex items-center justify-center gap-5 pb-1">
                {config.oauth_platforms?.includes('wechat') && (
                  <button
                    type="button"
                    onClick={() => handleOAuthLogin('wechat')}
                    disabled={oauthLoading}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className={`w-12 h-12 rounded-2xl bg-[#07C160] flex items-center justify-center text-white shadow-md shadow-[#07C160]/20 active:scale-95 transition-all duration-200 ${oauthLoading ? 'opacity-60' : ''}`}>
                      {oauthLoading ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                          <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.045c.135 0 .242-.11.242-.246 0-.06-.024-.12-.04-.178l-.325-1.233a.655.655 0 0 1-.024-.171.493.493 0 0 1 .201-.383C23.028 18.855 24 17.17 24 15.257c0-3.288-3.198-5.931-7.062-6.399zm-2.213 3.052c.535 0 .969.44.969.982a.976.976 0 0 1-.97.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.97.983.976.976 0 0 1-.968-.983c0-.542.434-.982.969-.982z"/>
                        </svg>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500 font-medium">微信</span>
                  </button>
                )}
                {config.oauth_platforms?.includes('qq') && (
                  <button
                    type="button"
                    onClick={() => handleOAuthLogin('qq')}
                    disabled={oauthLoading}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className={`w-12 h-12 rounded-2xl bg-[#12B7F5] flex items-center justify-center text-white shadow-md shadow-[#12B7F5]/20 active:scale-95 transition-all duration-200 ${oauthLoading ? 'opacity-60' : ''}`}>
                      {oauthLoading ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                          <path d="M21.62 14.923c-1.222-2.482-3.493-4.052-5.066-5.079A7.604 7.604 0 0 0 12 8.694a7.604 7.604 0 0 0-4.554 1.15C5.873 10.871 3.602 12.44 2.38 14.923c-.247.5-.19 1.072.264 1.325.455.253 1.007.052 1.254-.448.19-.387.528-.918 1.006-1.472.478 1.995 1.93 3.415 3.732 4.075-.301.277-.486.761-.486 1.336 0 1.154.665 1.71 1.485 1.71s1.485-.556 1.485-1.71c0-.574-.184-1.058-.485-1.335.31-.098.639-.15.982-.15.343 0 .672.052.982.15-.301.277-.485.761-.485 1.335 0 1.154.665 1.71 1.485 1.71s1.485-.556 1.485-1.71c0-.575-.185-1.06-.486-1.337 1.802-.66 3.254-2.08 4.732-4.075.478.554.816 1.085 1.006 1.472.247.5.799.7 1.254.448.454-.253.511-.825.264-1.325z"/>
                        </svg>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500 font-medium">QQ</span>
                  </button>
                )}
                {config.oauth_platforms?.includes('github') && (
                  <button
                    type="button"
                    onClick={() => handleOAuthLogin('github')}
                    disabled={oauthLoading}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className={`w-12 h-12 rounded-2xl bg-[#24292F] flex items-center justify-center text-white shadow-md shadow-[#24292F]/20 active:scale-95 transition-all duration-200 ${oauthLoading ? 'opacity-60' : ''}`}>
                      {oauthLoading ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                        </svg>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500 font-medium">GitHub</span>
                  </button>
                )}
                {config.oauth_platforms?.includes('dingtalk') && (
                  <button
                    type="button"
                    onClick={() => handleOAuthLogin('dingtalk')}
                    disabled={oauthLoading}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className={`w-12 h-12 rounded-2xl bg-[#0089FF] flex items-center justify-center text-white shadow-md shadow-[#0089FF]/20 active:scale-95 transition-all duration-200 ${oauthLoading ? 'opacity-60' : ''}`}>
                      {oauthLoading ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                          <path d="M11.72.044C5.256.044 0 5.176 0 11.644c0 6.468 5.112 11.752 11.72 11.752 6.468 0 11.752-5.284 11.752-11.752C23.472 5.176 18.188.044 11.72.044zm4.392 8.34c-.232.428-2.56 4.244-3.208 5.288-.48.784-.592 1.284-.24 1.7.368.432 1.12.452 1.856.172l.176-.06.104.14c.776 1.04.976 1.504.696 1.828-.368.428-1.456.572-2.392.484-.74-.068-1.216-.232-1.488-.4-.34-.204-.412-.2-.624.044-.364.412-.704.856-1.004 1.328-.508.84-.644 1.436-.644 1.436l-.02.108-.112.008c-.008 0-.448-1.248-.528-2.108-.072-.724-.02-1.412.272-2.216.332-.896.748-1.452.748-1.452s-1.588.58-2.264.808c-1.48.496-2.184.548-2.596.244-.612-.456.116-1.488.116-1.488s4.072-3.368 5.424-5.616c.984-1.632 1.192-2.52 1.192-3.064 0-.24-.044-.588-.468-.588-.3 0-.768.172-1.988.836-.344.188-1.14.588-1.14.588l-.108-.152c.02-.012 1.864-1.564 2.456-2.008 1.216-.912 2.548-1.316 3.248-1.316.796 0 1.244.4 1.244 1.256 0 .836-.512 2.368-1.2 3.848-.132.284-1.032.924-1.032.924s.044.028.12.064c.292.14 1.708.836 2.196 2 .392.936.284 1.732-.14 2.572z"/>
                        </svg>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500 font-medium">钉钉</span>
                  </button>
                )}
              </div>
            </>
          )}

          {/* Toggle mode */}
          <div className="flex items-center justify-center gap-1 py-2">
            {mode === 'login' ? (
              <>
                <span className="text-xs text-gray-400">还没有账号？</span>
                <button onClick={() => { setMode('register'); setError(''); setCaptchaToken(''); setCaptchaKey(k => k + 1); }} className="text-xs font-semibold text-[#171717]">去注册</button>
              </>
            ) : (
              <>
                <span className="text-xs text-gray-400">已有账号？</span>
                <button onClick={() => { setMode('login'); setError(''); setCaptchaToken(''); setCaptchaKey(k => k + 1); }} className="text-xs font-semibold text-[#171717]">去登录</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, Loader2, Mail, Lock, Eye, EyeOff, User, Shield } from 'lucide-react';
import { register, login } from '../services/authService';
import { TermsModal } from './TermsModal';
import { PrivacyModal } from './PrivacyModal';
import { TianaiCaptchaButton } from './TianaiCaptcha';
import axios from 'axios';
import { useSiteConfig } from '../contexts/SiteConfigContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess?: () => void;
}

const api = axios.create({
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' }
});

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const { config } = useSiteConfig();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot-password' | 'sub-login'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [forgotStep, setForgotStep] = useState<'email' | 'verify' | 'reset'>('email');
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);
  const [animatedError, setAnimatedError] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const handleDismiss = () => {
    setDismissed(true);
  };

  const handleOAuthLogin = async (type: string) => {
    try {
      setError('');
      // 打开 OAuth 登录弹窗
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.innerWidth - width) / 2;
      const top = window.screenY + (window.innerHeight - height) / 2;

      // 先获取 OAuth URL
      const res = await axios.get('/api/auth/oauth/login', {
        params: { type, redirect: window.location.href }
      });

      if (!res.data?.success || !res.data?.data?.url) {
        setError(res.data?.message || '获取登录链接失败');
        return;
      }

      const popup = window.open(
        res.data.data.url,
        'oauth-login',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!popup) {
        setError('弹窗被拦截，请允许弹出窗口');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '发起OAuth登录失败');
    }
  };

  // 监听 OAuth 回调消息（来自弹窗）
  useEffect(() => {
    let handled = false;

    const processOAuthResult = (token: string, user: any) => {
      if (handled) return;
      handled = true;
      sessionStorage.setItem('authToken', token);
      sessionStorage.setItem('user', JSON.stringify(user));
      localStorage.removeItem('oauth_login_result');
      localStorage.removeItem('oauth_login_ts');
      window.dispatchEvent(new Event('credits-updated'));
      window.dispatchEvent(new Event('auth-state-changed'));
      onLoginSuccess?.();
      onClose();
    };

    const processOAuthError = (message: string) => {
      if (handled) return;
      handled = true;
      setError(message);
      localStorage.removeItem('oauth_login_error');
    };

    // 方式1: postMessage（弹窗 opener 可用时）
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_LOGIN_SUCCESS') {
        const { token, user } = event.data.payload;
        if (token && user) processOAuthResult(token, user);
      } else if (event.data?.type === 'OAUTH_LOGIN_ERROR') {
        processOAuthError(event.data.payload?.message || '登录失败');
      }
    };
    window.addEventListener('message', handleOAuthMessage);

    // 方式2: storage 事件（opener 丢失时的回退）
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

    // 方式3: 轮询 localStorage（storage 事件在同源 popup 中不触发时的最终回退）
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
  }, [onLoginSuccess, onClose]);

  const sendCode = async () => {
    if (!email || !email.includes('@')) {
      setError('请先输入有效的邮箱地址');
      return;
    }
    const isReset = mode === 'forgot-password';
    const isRegister = mode === 'register';
    if ((isReset || isRegister) && !captchaToken) {
      setError('请先完成安全验证');
      return;
    }
    setSendingCode(true);
    setError('');
    try {
      const response = await api.post('/api/auth/send-code', {
        email,
        isResetPassword: isReset,
        ...(isReset || isRegister ? { captchaToken } : {}),
      });
      if (response.data.success) {
        setCountdown(60);
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) { clearInterval(timer); return 0; }
            return prev - 1;
          });
        }, 1000);
      } else {
        setError(response.data.message || '发送失败，请稍后重试');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '发送失败，请稍后重试');
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'sub-login') {
      if (!email || !password) { setError('请填写邮箱和密码'); return; }
      if (!captchaToken) { setError('请先完成安全验证'); return; }
      setLoading(true);
      try {
        const response = await axios.post('/api/auth/sub-login', { email, password, captchaToken });
        if (response.data.success) {
          const storage = rememberMe ? localStorage : sessionStorage;
          storage.setItem('authToken', response.data.token);
          storage.setItem('user', JSON.stringify(response.data.user));
          if (response.data.user?.apiKey) {
            storage.setItem('apiKey', response.data.user.apiKey);
          }
          sessionStorage.setItem('authToken', response.data.token);
          sessionStorage.setItem('user', JSON.stringify(response.data.user));
          window.dispatchEvent(new Event('credits-updated'));
          onLoginSuccess?.();
          onClose();
        } else {
          setError(response.data.message || '登录失败');
        }
      } catch (err: any) {
        const data = err.response?.data;
        setCaptchaToken(''); setCaptchaKey(k => k + 1);
        setError(data?.message || '登录失败，请重试');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'forgot-password') {
      if (forgotStep === 'email') {
        if (!email || !email.includes('@')) { setError('请输入有效的邮箱地址'); return; }
        setLoading(true);
        try {
          const response = await api.post('/api/auth/send-code', { email, isResetPassword: true, captchaToken });
          if (response.data.success) {
            setForgotStep('verify');
            setCountdown(60);
            const timer = setInterval(() => {
              setCountdown((prev) => {
                if (prev <= 1) { clearInterval(timer); return 0; }
                return prev - 1;
              });
            }, 1000);
          }
        } catch (err: any) {
          setError(err.response?.data?.message || '发送失败，请稍后重试');
        } finally { setLoading(false); }
        return;
      }
      if (forgotStep === 'verify') {
        if (!code) { setError('请输入验证码'); return; }
        setLoading(true);
        try {
          const response = await api.post('/api/auth/verify-code', { email, code });
          if (response.data.success) { setForgotStep('reset'); setCode(''); }
        } catch (err: any) {
          setError(err.response?.data?.message || '验证失败，请重试');
        } finally { setLoading(false); }
        return;
      }
      if (forgotStep === 'reset') {
        if (!password || !confirmPassword) { setError('请填写新密码'); return; }
        if (password !== confirmPassword) { setError('两次输入的密码不一致'); return; }
        if (password.length < 6) { setError('密码至少需要 6 位'); return; }
        setLoading(true);
        try {
          const response = await api.post('/api/auth/reset-password', { email, password });
          if (response.data.success) {
            alert('密码重置成功，请重新登录');
            setMode('login');
            setEmail(''); setPassword(''); setConfirmPassword(''); setForgotStep('email');
          }
        } catch (err: any) {
          setError(err.response?.data?.message || '重置失败，请稍后重试');
        } finally { setLoading(false); }
        return;
      }
    }

    if (mode === 'register') {
      if (!code) { setError('请输入验证码'); return; }
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        const registerData: any = { email, password, code };
        if (inviteCode) registerData.inviteCode = inviteCode;
        await register(registerData);
      } else {
        if (!captchaToken) { setError('请先完成安全验证'); setLoading(false); return; }
        await login({ email, password, rememberMe, captchaToken });
      }
      onLoginSuccess?.();
      onClose();
    } catch (err: any) {
      const data = err.response?.data;
      setCaptchaToken(''); setCaptchaKey(k => k + 1);
      setError(data?.message || err.message || '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setMode('login');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setCode('');
      setInviteCode('');
      setError('');
      setAnimatedError('');
      setForgotStep('email');
      setShowPassword(false);
      setShowConfirmPassword(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setTimeout(() => emailInputRef.current?.focus(), 100);
      // 读取 URL 参数中的邀请码
      const params = new URLSearchParams(window.location.search);
      const codeFromUrl = params.get('code');
      if (codeFromUrl) {
        setInviteCode(codeFromUrl);
      }
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // 监听其他组件触发的显示登录弹窗事件
  useEffect(() => {
    const handleShowAuthModal = () => {
      setDismissed(false);
    };
    window.addEventListener('show-auth-modal', handleShowAuthModal);
    return () => window.removeEventListener('show-auth-modal', handleShowAuthModal);
  }, []);

  useEffect(() => {
    if (error) {
      setAnimatedError(error);
      const timer = setTimeout(() => setAnimatedError(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (isOpen && (mode === 'login' || mode === 'register')) {
      setCaptchaToken('');
    }
  }, [isOpen, mode]);

  if (!isOpen) return null;

  return (
    <>
      {/* Modal overlay */}
      {!dismissed && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
          {/* Header */}
          <div className="relative px-6 pt-5 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={config.logo_url} alt="Softhooky" className="w-10 h-10 rounded-xl" />
                <div>
                  <h2 className="text-lg font-bold text-[#171717]">
                    {mode === 'sub-login' ? '子账号登录' : mode === 'forgot-password' ? '找回密码' : '欢迎回来'}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {mode === 'sub-login' ? '登录到子账号' : mode === 'forgot-password' ? '重置您的密码' : '登录到 Softhooky'}
                  </p>
                </div>
              </div>
              </div>
          </div>

          {/* Tab Switcher - Enhanced */}
          {mode !== 'forgot-password' && mode !== 'sub-login' && (
            <div className="px-6 pb-3">
              <div className="flex bg-gray-100 p-1 rounded-xl">
                <button
                  onClick={() => { setMode('login'); setError(''); }}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    mode === 'login'
                      ? 'bg-white text-[#171717] shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  登录
                </button>
                <button
                  onClick={() => { setMode('register'); setError(''); }}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    mode === 'register'
                      ? 'bg-white text-[#171717] shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  注册
                </button>
              </div>
            </div>
          )}

          {/* Animated Error Banner */}
          {animatedError && (
            <div className="mx-6 mb-1">
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs animate-shake">
                <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertCircle size={13} />
                </div>
                <span className="flex-1">{animatedError}</span>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-3">
            {/* Sub-account Login */}
            {mode === 'sub-login' && (
              <>
                <div className="space-y-2.5">
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="请输入邮箱"
                      ref={emailInputRef}
                      className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                      required
                    />
                  </div>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="请输入密码"
                      className="w-full pl-11 pr-11 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                {/* Captcha */}
                <TianaiCaptchaButton key={captchaKey} onSuccess={(token) => setCaptchaToken(token)} />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-[#171717] focus:ring-[#171717]"
                  />
                  <span className="text-xs text-gray-500">记住我</span>
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#171717] text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-[#27272A] transition-all shadow-lg shadow-black/10 flex items-center justify-center gap-1.5"
                >
                  {loading ? (
                    <><Loader2 size={15} className="animate-spin" />登录中...</>
                  ) : (
                    <>登录子账号 <Shield size={14} /></>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="w-full text-center py-2 text-xs text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1"
                >
                  <span>←</span> 返回主账号登录
                </button>
              </>
            )}

            {/* Forgot Password */}
            {mode === 'forgot-password' && (
              <>
                {forgotStep === 'email' && (
                  <>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="请输入邮箱地址"
                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                        required
                      />
                    </div>
                    <TianaiCaptchaButton key={captchaKey} onSuccess={(token) => setCaptchaToken(token)} />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#171717] text-white py-3.5 rounded-xl text-base font-semibold disabled:opacity-50 hover:bg-[#27272A] transition-all shadow-lg shadow-black/10 flex items-center justify-center gap-1.5"
                >
                      {loading ? (
                        <><Loader2 size={15} className="animate-spin" />发送中...</>
                      ) : (
                        <>发送验证码</>
                      )}
                    </button>
                  </>
                )}
                {forgotStep === 'verify' && (
                  <>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={code}
                          onChange={(e) => setCode(e.target.value.toUpperCase())}
                          placeholder="验证码"
                          maxLength={6}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm uppercase text-center tracking-[0.25em] focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={sendCode}
                        disabled={countdown > 0 || !email.includes('@')}
                        className="px-4 bg-[#171717] text-white rounded-xl text-xs font-medium disabled:opacity-50 hover:bg-[#27272A] transition-all whitespace-nowrap"
                      >
                        {countdown > 0 ? `${countdown}s` : '重新发送'}
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-[#171717] text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-[#27272A] transition-all shadow-lg shadow-black/10"
                    >
                      {loading ? '验证中...' : '验证'}
                    </button>
                  </>
                )}
                {forgotStep === 'reset' && (
                  <>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="请输入新密码"
                        className="w-full pl-11 pr-11 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="请再次输入密码"
                        className="w-full pl-11 pr-11 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-[#171717] text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-[#27272A] transition-all shadow-lg shadow-black/10"
                    >
                      {loading ? '重置中...' : '重置密码'}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => { setMode('login'); setForgotStep('email'); }}
                  className="w-full text-center py-2 text-xs text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1"
                >
                  <span>←</span> 返回登录
                </button>
              </>
            )}

            {/* Login Form */}
            {mode === 'login' && (
              <>
                <div className="space-y-2.5">
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="请输入邮箱"
                      ref={emailInputRef}
                      className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                      required
                    />
                  </div>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="请输入密码"
                      className="w-full pl-11 pr-11 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Captcha */}
                <TianaiCaptchaButton key={captchaKey} onSuccess={(token) => setCaptchaToken(token)} />

                {/* Remember me & Forgot password row */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-[#171717] focus:ring-[#171717]"
                    />
                    <span className="text-xs text-gray-500">记住我</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setMode('forgot-password')}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    忘记密码？
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#171717] text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-[#27272A] transition-all shadow-lg shadow-black/10 flex items-center justify-center gap-1.5"
                >
                  {loading ? (
                    <><Loader2 size={15} className="animate-spin" />登录中...</>
                  ) : (
                    <>登录</>
                  )}
                </button>

                {/* Sub-account login & OAuth 第三方登录 - 已隐藏 */}
              </>
            )}

            {/* Register Form */}
            {mode === 'register' && (
              <>
                <div className="space-y-2.5">
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="请输入邮箱"
                      ref={emailInputRef}
                      className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                      required
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="验证码"
                      maxLength={6}
                      className="flex-1 min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm uppercase text-center tracking-[0.2em] focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                    />
                    <button
                      type="button"
                      onClick={sendCode}
                      disabled={countdown > 0 || sendingCode || !email.includes('@') || (mode === 'register' && !captchaToken)}
                      className="px-3 py-2 bg-[#171717] text-white rounded-xl text-xs font-medium disabled:opacity-50 hover:bg-[#27272A] transition-all whitespace-nowrap shrink-0"
                    >
                      {countdown > 0 ? `${countdown}s` : '获取验证码'}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="请输入密码（至少6位）"
                      className="w-full pl-11 pr-11 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {inviteCode ? (
                    <div className="px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700 flex items-center gap-1.5">
                      <Shield size={14} />
                      邀请码：<strong>{inviteCode}</strong>（自动填写）
                    </div>
                  ) : (
                    <div className="relative">
                      <Shield size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        placeholder="邀请码（可选）"
                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                      />
                    </div>
                  )}
                </div>
                <TianaiCaptchaButton key={captchaKey} onSuccess={(token) => setCaptchaToken(token)} />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#171717] text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-[#27272A] transition-all shadow-lg shadow-black/10 flex items-center justify-center gap-1.5"
                >
                  {loading ? (
                    <><Loader2 size={15} className="animate-spin" />注册中...</>
                  ) : (
                    <>注册</>
                  )}
                </button>
              </>
            )}

            <p className="text-xs text-center text-gray-400 pt-1">
              登录即表示同意{' '}
              <button type="button" onClick={() => setShowTermsModal(true)} className="underline hover:text-gray-600">使用条款</button>
              {' '}和{' '}
              <button type="button" onClick={() => setShowPrivacyModal(true)} className="underline hover:text-gray-600">隐私政策</button>
            </p>
            {!dismissed && (
              <div className="flex justify-center pt-3">
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  稍后登录
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
      )}

      {showTermsModal && <TermsModal onClose={() => setShowTermsModal(false)} />}
      {showPrivacyModal && <PrivacyModal onClose={() => setShowPrivacyModal(false)} />}
    </>
  );
};

// OAuth 第三方登录按钮组件
const OAuthButton = ({ label, icon, bgClass, onClick }: { label: string; icon: React.ReactNode; bgClass: string; onClick: () => void }) => {
  const [oauthLoading, setOauthLoading] = React.useState(false);

  const handleClick = () => {
    setOauthLoading(true);
    onClick();
    setTimeout(() => setOauthLoading(false), 30000);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={oauthLoading}
      className={`w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-sm hover:shadow-md transform hover:scale-105 transition-all duration-200 ${oauthLoading ? 'opacity-60' : ''}`}
      title={label}
    >
      {oauthLoading ? (
        <Loader2 size={18} className="animate-spin" />
      ) : (
        <div className={`w-full h-full rounded-2xl flex items-center justify-center ${bgClass}`}>
          {icon}
        </div>
      )}
    </button>
  );
};

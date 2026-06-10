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
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
          {/* Header */}
          <div className="relative px-6 pt-6 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={config.logo_url} alt="Softhooky" className="w-12 h-12 rounded-2xl" />
                <div>
                  <h2 className="text-xl font-bold text-[#171717]">
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
            <div className="px-6 pb-4">
              <div className="flex bg-gray-100 p-1.5 rounded-2xl">
                <button
                  onClick={() => { setMode('login'); setError(''); }}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    mode === 'login'
                      ? 'bg-white text-[#171717] shadow-md'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  登录
                </button>
                <button
                  onClick={() => { setMode('register'); setError(''); }}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    mode === 'register'
                      ? 'bg-white text-[#171717] shadow-md'
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
            <div className="mx-6 mb-2">
              <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm animate-shake">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertCircle size={16} />
                </div>
                <span className="flex-1">{animatedError}</span>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
            {/* Sub-account Login */}
            {mode === 'sub-login' && (
              <>
                <div className="space-y-4">
                  <div className="relative">
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="请输入邮箱"
                      ref={emailInputRef}
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                      required
                    />
                  </div>
                  <div className="relative">
                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="请输入密码"
                      className="w-full pl-12 pr-12 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
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
                  className="w-full bg-[#171717] text-white py-4 rounded-2xl text-sm font-semibold disabled:opacity-50 hover:bg-[#27272A] transition-all shadow-lg shadow-black/10 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><Loader2 size={18} className="animate-spin" />登录中...</>
                  ) : (
                    <>登录子账号 <Shield size={16} className="ml-1" /></>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="w-full text-center py-3 text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1"
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
                      <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="请输入邮箱地址"
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                        required
                      />
                    </div>
                    <TianaiCaptchaButton key={captchaKey} onSuccess={(token) => setCaptchaToken(token)} />
                    <button
                      type="submit"
                      disabled={loading || !captchaToken}
                      className="w-full bg-[#171717] text-white py-4 rounded-2xl text-sm font-semibold disabled:opacity-50 hover:bg-[#27272A] transition-all shadow-lg shadow-black/10 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <><Loader2 size={18} className="animate-spin" />发送中...</>
                      ) : (
                        <>发送验证码</>
                      )}
                    </button>
                  </>
                )}
                {forgotStep === 'verify' && (
                  <>
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={code}
                          onChange={(e) => setCode(e.target.value.toUpperCase())}
                          placeholder="验证码"
                          maxLength={6}
                          className="w-full px-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm uppercase text-center tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={sendCode}
                        disabled={countdown > 0 || !email.includes('@')}
                        className="px-6 bg-[#171717] text-white rounded-2xl text-sm font-medium disabled:opacity-50 hover:bg-[#27272A] transition-all whitespace-nowrap"
                      >
                        {countdown > 0 ? `${countdown}s` : '重新发送'}
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-[#171717] text-white py-4 rounded-2xl text-sm font-semibold disabled:opacity-50 hover:bg-[#27272A] transition-all shadow-lg shadow-black/10"
                    >
                      {loading ? '验证中...' : '验证'}
                    </button>
                  </>
                )}
                {forgotStep === 'reset' && (
                  <>
                    <div className="relative">
                      <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="请输入新密码"
                        className="w-full pl-12 pr-12 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <div className="relative">
                      <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="请再次输入密码"
                        className="w-full pl-12 pr-12 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-[#171717] text-white py-4 rounded-2xl text-sm font-semibold disabled:opacity-50 hover:bg-[#27272A] transition-all shadow-lg shadow-black/10"
                    >
                      {loading ? '重置中...' : '重置密码'}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => { setMode('login'); setForgotStep('email'); }}
                  className="w-full text-center py-3 text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1"
                >
                  <span>←</span> 返回登录
                </button>
              </>
            )}

            {/* Login Form */}
            {mode === 'login' && (
              <>
                <div className="space-y-3">
                  <div className="relative">
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="请输入邮箱"
                      ref={emailInputRef}
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                      required
                    />
                  </div>
                  <div className="relative">
                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="请输入密码"
                      className="w-full pl-12 pr-12 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
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
                  className="w-full bg-[#171717] text-white py-4 rounded-2xl text-sm font-semibold disabled:opacity-50 hover:bg-[#27272A] transition-all shadow-lg shadow-black/10 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><Loader2 size={18} className="animate-spin" />登录中...</>
                  ) : (
                    <>登录</>
                  )}
                </button>

                {/* Divider */}
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-4 text-xs text-gray-400">其他登录方式</span>
                  </div>
                </div>

                {/* Sub-account login button */}
                <button
                  type="button"
                  onClick={() => setMode('sub-login')}
                  className="w-full py-3.5 border-2 border-gray-200 rounded-2xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center justify-center gap-2"
                >
                  <User size={16} />
                  子账号登录
                </button>
              </>
            )}

            {/* Register Form */}
            {mode === 'register' && (
              <>
                <div className="space-y-3">
                  <div className="relative">
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="请输入邮箱"
                      ref={emailInputRef}
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                      required
                    />
                  </div>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="验证码"
                      maxLength={6}
                      className="flex-1 px-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm uppercase text-center tracking-[0.2em] focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                    />
                    <button
                      type="button"
                      onClick={sendCode}
                      disabled={countdown > 0 || sendingCode || !email.includes('@') || (mode === 'register' && !captchaToken)}
                      className="px-5 bg-[#171717] text-white rounded-2xl text-sm font-medium disabled:opacity-50 hover:bg-[#27272A] transition-all whitespace-nowrap"
                    >
                      {countdown > 0 ? `${countdown}s` : '获取验证码'}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="请输入密码（至少6位）"
                      className="w-full pl-12 pr-12 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {inviteCode ? (
                    <div className="px-4 py-2.5 bg-green-50 border border-green-200 rounded-2xl text-sm text-green-700 flex items-center gap-2">
                      <Shield size={16} />
                      邀请码：<strong>{inviteCode}</strong>（自动填写）
                    </div>
                  ) : (
                    <div className="relative">
                      <Shield size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        placeholder="邀请码（可选）"
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]/20 focus:border-blue-300 transition-all"
                      />
                    </div>
                  )}
                </div>
                <TianaiCaptchaButton key={captchaKey} onSuccess={(token) => setCaptchaToken(token)} />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#171717] text-white py-4 rounded-2xl text-sm font-semibold disabled:opacity-50 hover:bg-[#27272A] transition-all shadow-lg shadow-black/10 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><Loader2 size={18} className="animate-spin" />注册中...</>
                  ) : (
                    <>注册</>
                  )}
                </button>
              </>
            )}

            <p className="text-xs text-center text-gray-400 pt-2">
              登录即表示同意{' '}
              <button type="button" onClick={() => setShowTermsModal(true)} className="underline hover:text-gray-600">使用条款</button>
              {' '}和{' '}
              <button type="button" onClick={() => setShowPrivacyModal(true)} className="underline hover:text-gray-600">隐私政策</button>
            </p>
            {!dismissed && (
              <div className="flex justify-center pt-4">
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
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

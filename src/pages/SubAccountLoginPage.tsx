import React, { useState, useEffect } from 'react';
import { Mail, Lock, ArrowRight, AlertCircle, X } from 'lucide-react';
import api from '../services/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TianaiCaptchaButton } from '../components/TianaiCaptcha';
import { useSiteConfig } from '../contexts/SiteConfigContext';

const AccountDisabledToast: React.FC<{ message: string; email?: string; onClose: () => void }> = ({ message, email, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 10000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-white border border-red-200 rounded-2xl shadow-2xl p-4 w-full max-w-sm mx-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#171717]">{message}</p>
          {email && <p className="text-sm font-medium text-[#171717] mt-1">{email}</p>}
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full flex-shrink-0">
          <X size={16} className="text-gray-400" />
        </button>
      </div>
    </div>
  );
};

export const SubAccountLoginPage: React.FC = () => {
  const { config } = useSiteConfig();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);
  const [showDisabledToast, setShowDisabledToast] = useState(false);
  const [disabledMessage, setDisabledMessage] = useState('');
  const [disabledEmail, setDisabledEmail] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDisabled = searchParams.get('disabled') === '1';

  useEffect(() => {
    if (isDisabled) {
      setDisabledMessage('账号已被禁用，请联系主账号管理员');
      setDisabledEmail('');
      setShowDisabledToast(true);
    }
  }, [isDisabled]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!captchaToken) { setError('请先完成安全验证'); return; }
    setLoading(true);

    try {
      const response = await api.post('/api/auth/sub-login', {
        email,
        password,
        captchaToken
      });

      if (response.data.success) {
        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem('authToken', response.data.token);
        storage.setItem('user', JSON.stringify(response.data.user));
        if (response.data.user?.apiKey) {
          storage.setItem('apiKey', response.data.user.apiKey);
        } else if (response.data.apiKey) {
          storage.setItem('apiKey', response.data.apiKey);
        }
        // Always keep sessionStorage in sync
        sessionStorage.setItem('authToken', response.data.token);
        sessionStorage.setItem('user', JSON.stringify(response.data.user));

        navigate('/');
        window.location.reload();
      }
    } catch (error: any) {
      const data = error.response?.data;
      setCaptchaToken(''); setCaptchaKey(k => k + 1);
      if (error.response?.status === 403 && data?.parentEmail) {
        setShowDisabledToast(true);
        setDisabledMessage(data.message);
        setDisabledEmail(data.parentEmail);
        setError('');
      } else if (error.response?.status === 403) {
        setShowDisabledToast(true);
        setDisabledMessage('账号已被禁用，请联系主账号管理员');
        setDisabledEmail('');
        setError('');
      } else {
        setError(data?.message || '登录失败，请检查邮箱和密码');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      {showDisabledToast && (
        <AccountDisabledToast
          message={disabledMessage}
          email={disabledEmail}
          onClose={() => setShowDisabledToast(false)}
        />
      )}
      {/* Mobile Layout */}
      <div className="w-full max-w-sm mx-auto md:hidden">
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl mb-5 overflow-hidden">
            <img src={config.logo_url} alt="Softhooky" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-semibold text-[#171717] mb-1">子账号登录</h1>
          <p className="text-sm text-gray-400">使用子账号邮箱登录</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="邮箱"
            className="w-full px-4 py-3.5 bg-gray-50 border-0 rounded-xl text-base"
            required
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            className="w-full px-4 py-3.5 bg-gray-50 border-0 rounded-xl text-base"
            required
          />

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
            className="w-full py-3.5 bg-[#171717] text-white rounded-xl text-base font-medium disabled:opacity-50 hover:bg-[#27272A] transition-all"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <button
          onClick={() => navigate('/auth')}
          className="w-full py-3 text-gray-500 text-sm mt-6"
        >
          主账号登录
        </button>

        <p className="text-xs text-center text-gray-400 mt-8">
          请联系主账号管理员创建子账号
        </p>
      </div>

      {/* PC Layout - Original Style */}
      <div className="hidden md:block w-full max-w-md">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 overflow-hidden">
            <img src={config.logo_url} alt="Softhooky" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold mb-2">子账号登录</h1>
          <p className="text-gray-400">使用您的子账号邮箱和密码登录</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-3xl shadow-lg p-8 space-y-6">
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-bold mb-3">邮箱地址</label>
            <div className="relative">
              <Mail size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold mb-3">密码</label>
            <div className="relative">
              <Lock size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none"
                required
              />
            </div>
          </div>

          {/* Captcha */}
          <div>
            <label className="block text-sm font-bold mb-3">安全验证</label>
          <TianaiCaptchaButton key={captchaKey} onSuccess={(token) => setCaptchaToken(token)} />
          </div>

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
            className="w-full py-3 bg-[#171717] text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all"
          >
            {loading ? '登录中...' : '登录'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/auth')}
            className="w-full py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-bold"
          >
            主账号登录
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-8">
          请联系主账号管理员创建子账号
        </p>
      </div>
    </div>
  );
};

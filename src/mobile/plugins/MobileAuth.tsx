import React, { useState } from 'react';
import { X, Mail, Lock, Eye, EyeOff, Loader2, Check, ShieldCheck, ShieldAlert } from 'lucide-react';
import { login, register } from '../../services/authService';
import { TianaiCaptchaButton } from '../../components/TianaiCaptcha';

interface MobileAuthProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type AuthMode = 'login' | 'register';

export const MobileAuth: React.FC<MobileAuthProps> = ({ open, onClose, onSuccess }) => {
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

  return (
    <div className="fixed inset-0 z-[100] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full bg-white rounded-t-3xl pb-[calc(24px+env(safe-area-inset-bottom,0px))] animate-mobile-slide-up"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '90vh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#ddd]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-2">
          <h2 className="text-lg font-bold text-[#171717]">
            {mode === 'login' ? '登录' : '注册'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f5f5f5]">
            <X size={16} className="text-[#737373]" />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 pt-3 space-y-4">
          <div>
            <label className="text-xs font-medium text-[#737373] mb-1.5 block">邮箱</label>
            <div className="flex items-center gap-3 px-4 py-3 bg-[#f5f5f5] rounded-xl">
              <Mail size={16} className="text-[#a3a3a3]" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="请输入邮箱"
                className="flex-1 bg-transparent text-sm text-[#171717] placeholder-[#bdbdbd] outline-none" autoFocus />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-[#737373] mb-1.5 block">密码</label>
            <div className="flex items-center gap-3 px-4 py-3 bg-[#f5f5f5] rounded-xl">
              <Lock size={16} className="text-[#a3a3a3]" />
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="请输入密码"
                className="flex-1 bg-transparent text-sm text-[#171717] placeholder-[#bdbdbd] outline-none" />
              <button onClick={() => setShowPassword(!showPassword)} className="text-[#a3a3a3]">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label className="text-xs font-medium text-[#737373] mb-1.5 block">确认密码</label>
              <div className="flex items-center gap-3 px-4 py-3 bg-[#f5f5f5] rounded-xl">
                <Lock size={16} className="text-[#a3a3a3]" />
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="再次输入密码"
                  className="flex-1 bg-transparent text-sm text-[#171717] placeholder-[#bdbdbd] outline-none" />
              </div>
            </div>
          )}

          {mode === 'login' && (
            <label className="flex items-center gap-2.5">
              <button onClick={() => setRememberMe(!rememberMe)}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${rememberMe ? 'bg-[#171717] border-[#171717]' : 'border-[#ddd]'}`}>
                {rememberMe && <Check size={12} className="text-white" />}
              </button>
              <span className="text-xs text-[#737373]">记住我</span>
            </label>
          )}

          {/* Captcha */}
          <div className="bg-[#f5f5f5] rounded-2xl p-3">
            {captchaToken ? (
              <div className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-green-600">
                <ShieldCheck size={18} /> 验证通过
              </div>
            ) : (
              <TianaiCaptchaButton key={captchaKey} onSuccess={(token) => setCaptchaToken(token)} />
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          <button onClick={handleSubmit} disabled={isLoading || !captchaToken}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#171717] text-white rounded-2xl text-sm font-semibold active:bg-[#333] transition-colors disabled:bg-[#ccc]">
            {isLoading ? <><Loader2 size={16} className="animate-spin" /> 处理中...</> : mode === 'login' ? '登录' : '注册'}
          </button>

          {/* Toggle mode */}
          <div className="flex items-center justify-center gap-1 py-2">
            {mode === 'login' ? (
              <>
                <span className="text-xs text-[#a3a3a3]">还没有账号？</span>
                <button onClick={() => { setMode('register'); setError(''); setCaptchaToken(''); setCaptchaKey(k => k + 1); }} className="text-xs font-semibold text-[#171717]">去注册</button>
              </>
            ) : (
              <>
                <span className="text-xs text-[#a3a3a3]">已有账号？</span>
                <button onClick={() => { setMode('login'); setError(''); setCaptchaToken(''); setCaptchaKey(k => k + 1); }} className="text-xs font-semibold text-[#171717]">去登录</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

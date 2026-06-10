import React, { useState, useCallback } from 'react';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';

interface AJCaptchaProps {
  onSuccess: (captchaToken: string) => void;
  onFail?: () => void;
}

declare global {
  interface Window { AJCaptcha: any; }
}

export const AJCaptchaButton: React.FC<AJCaptchaProps> = ({ onSuccess, onFail }) => {
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const openCaptcha = useCallback(() => {
    if (verified || verifying || !window.AJCaptcha) return;
    setVerifying(true);
    const { instance } = window.AJCaptcha.popup({
      server: '/api',
      captchaType: 'blockPuzzle',
      title: '请完成安全验证',
      lang: {
        sliderTip: '向右拖动滑块填充拼图',
        refreshTitle: '刷新',
        checking: '验证中...',
        verifySuccess: '验证通过',
        verifyFail: '验证失败，请重试',
        getFail: '获取验证码失败',
        checkFail: '校验失败',
        networkError: '网络错误: ',
        popupTitle: '请完成安全验证',
      },
      onSuccess: () => {
        setVerifying(false);
        setVerified(true);
        const token = instance._token;
        if (token) onSuccess(token);
      },
      onFail: () => {
        setVerifying(false);
        onFail?.();
      },
    });
  }, [verified, verifying, onSuccess, onFail]);

  return (
    <button
      type="button"
      onClick={openCaptcha}
      disabled={verified || verifying}
      className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-medium transition-all cursor-pointer border ${
        verified
          ? 'bg-green-50 border-green-200 text-green-600'
          : verifying
          ? 'bg-gray-50 border-gray-200 text-gray-400'
          : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {verified ? (
        <><ShieldCheck size={18} /> 验证通过</>
      ) : verifying ? (
        <><Loader2 size={18} className="animate-spin" /> 加载中...</>
      ) : (
        <><ShieldAlert size={18} /> 点击进行安全验证</>
      )}
    </button>
  );
};
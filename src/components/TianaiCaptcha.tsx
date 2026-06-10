import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';

interface TianaiCaptchaProps {
  onSuccess: (captchaToken: string) => void;
}

declare global {
  interface Window { initTAC: any; }
}

export const TianaiCaptchaButton: React.FC<TianaiCaptchaProps> = ({ onSuccess }) => {
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const tacRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Position container as fixed overlay when popup is shown
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (showPopup) {
      el.style.position = 'fixed';
      el.style.inset = '0';
      el.style.zIndex = '9999';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.background = 'rgba(0,0,0,0.5)';
    } else {
      el.style.position = '';
      el.style.inset = '';
      el.style.zIndex = '';
      el.style.display = '';
      el.style.alignItems = '';
      el.style.justifyContent = '';
      el.style.background = '';
    }
  }, [showPopup]);

  const closePopup = () => {
    setShowPopup(false);
    setLoading(false);
    if (tacRef.current) {
      try { tacRef.current.destroyWindow(); } catch {}
      tacRef.current = null;
    }
  };

  const openCaptcha = async () => {
    if (verified || loading || !window.initTAC) return;
    setLoading(true);
    setShowPopup(true);
    try {
      const tac = await window.initTAC('/tac', {
        bindEl: '#tac-captcha-container',
        requestCaptchaDataUrl: '/api/captcha/tianai/gen',
        validCaptchaUrl: '/api/captcha/tianai/check',
        validSuccess: (res: any, _slider: any, _tac: any) => {
          if (res?.data?.token) {
            setVerified(true);
            onSuccess(res.data.token);
            closePopup();
          }
        },
        validFail: () => {},
        btnCloseFun: () => { closePopup(); },
        btnRefreshFun: (_el: any, t: any) => { t.reloadCaptcha(); },
      }, {
        logoUrl: null,
        bgUrl: null,
        btnUrl: 'https://minio.tianai.cloud/public/captcha-btn/btn3.png',
        moveTrackMaskBgColor: '#f7b645',
        moveTrackMaskBorderColor: '#ef9c0d',
      });
      tacRef.current = tac;
      tac.init();
    } catch (e) {
      closePopup();
    }
  };

  useEffect(() => {
    return () => {
      if (tacRef.current) {
        try { tacRef.current.destroyWindow(); } catch {}
      }
    };
  }, []);

  return (
    <>
      <div id="tac-captcha-container" ref={containerRef} onClick={(e) => { if (e.target === containerRef.current) closePopup(); }} />
      {!verified && (
        <button
          type="button"
          onClick={openCaptcha}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-medium transition-all cursor-pointer border bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
        >
          {loading ? (
            <><Loader2 size={18} className="animate-spin" /> 加载中...</>
          ) : (
            <><ShieldAlert size={18} /> 点击进行安全验证</>
          )}
        </button>
      )}
      {verified && (
        <div className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-medium border bg-green-50 border-green-200 text-green-600">
          <ShieldCheck size={18} /> 验证通过
        </div>
      )}
    </>
  );
};
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react';
import { API_URL } from '../services/api';

interface ChineseCharCaptchaProps {
  onSuccess: (token: string) => void;
}

interface CharPosition {
  char: string;
  x: number;
  y: number;
}

const CANVAS_W = 300;
const CANVAS_H = 200;

// 颜色池，用于字符渲染
const COLORS = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400',
  '#2c3e50', '#16a085', '#e74c3c', '#3498db', '#f39c12',
  '#1abc9c', '#9b59b6', '#e67e22', '#34495e', '#e91e63',
];

const BG_COLORS = ['#f0f4ff', '#fdf6f0', '#f0fdf4', '#fef3f2', '#faf5ff', '#fefce8'];

export const ChineseCharCaptcha: React.FC<ChineseCharCaptchaProps> = ({ onSuccess }) => {
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [targetChars, setTargetChars] = useState<string[]>([]);
  const [charPositions, setCharPositions] = useState<CharPosition[]>([]);
  const [clickedIndices, setClickedIndices] = useState<number[]>([]);
  const [clickedChars, setClickedChars] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fetchCaptcha = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    setClickedIndices([]);
    setClickedChars([]);
    try {
      const resp = await fetch(`${API_URL}/api/captcha/char-click/gen`);
      const data = await resp.json();
      if (data.success) {
        setSessionId(data.data.id);
        setTargetChars(data.data.targetChars);
        setCharPositions(data.data.charPositions);
      } else {
        setErrorMsg(data.message || '获取验证码失败');
      }
    } catch {
      setErrorMsg('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }, []);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || charPositions.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    // 背景
    const bgColor = BG_COLORS[Math.floor(Math.random() * BG_COLORS.length)];
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 噪点
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(${Math.random() * 200},${Math.random() * 200},${Math.random() * 200},${0.2 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.arc(Math.random() * CANVAS_W, Math.random() * CANVAS_H, 1 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 干扰线
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(${Math.random() * 180},${Math.random() * 180},${Math.random() * 180},0.3)`;
      ctx.lineWidth = 0.5 + Math.random();
      ctx.beginPath();
      ctx.moveTo(Math.random() * CANVAS_W, Math.random() * CANVAS_H);
      ctx.quadraticCurveTo(Math.random() * CANVAS_W, Math.random() * CANVAS_H, Math.random() * CANVAS_W, Math.random() * CANVAS_H);
      ctx.stroke();
    }

    // 绘制字符
    charPositions.forEach((pos, idx) => {
      const isClicked = clickedIndices.includes(idx);
      const fontSize = 20 + Math.floor(Math.random() * 6);
      const rotation = (Math.random() - 0.5) * 0.5; // 轻微旋转
      const color = isClicked ? '#ffffff' : COLORS[idx % COLORS.length];

      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(rotation);
      ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (isClicked) {
        // 已点击的字符显示圆圈高亮
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(0, 0, fontSize * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.fillStyle = color;
      }

      // 阴影增加立体感
      ctx.shadowColor = 'rgba(0,0,0,0.1)';
      ctx.shadowBlur = 1;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillText(pos.char, 0, 0);
      ctx.restore();
    });
  }, [charPositions, clickedIndices]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const openCaptcha = async () => {
    if (verified || loading) return;
    setShowPopup(true);
    await fetchCaptcha();
  };

  const closePopup = () => {
    setShowPopup(false);
    setErrorMsg('');
    setClickedIndices([]);
    setClickedChars([]);
  };

  const handleCanvasClick = useCallback(async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (loading) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // 查找点击范围内的字符（考虑字符大小约 24px 的半径）
    const hitRadius = 18;
    let hitIdx = -1;
    for (let i = charPositions.length - 1; i >= 0; i--) {
      const pos = charPositions[i];
      const dist = Math.hypot(pos.x - clickX, pos.y - clickY);
      if (dist <= hitRadius) {
        hitIdx = i;
        break;
      }
    }

    if (hitIdx === -1) return;
    // 已经点击过的不再处理
    if (clickedIndices.includes(hitIdx)) return;

    const newClickedIndices = [...clickedIndices, hitIdx];
    const newClickedChars = [...clickedChars, charPositions[hitIdx].char];
    setClickedIndices(newClickedIndices);
    setClickedChars(newClickedChars);

    // 收集满 3 个后提交验证
    if (newClickedChars.length === 3) {
      setLoading(true);
      setErrorMsg('');
      try {
        const resp = await fetch(`${API_URL}/api/captcha/char-click/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: sessionId, clickedChars: newClickedChars }),
        });
        const data = await resp.json();
        if (data.success && data.data?.token) {
          setVerified(true);
          onSuccess(data.data.token);
          closePopup();
        } else {
          setErrorMsg(data.message || '验证失败');
          // 延迟后刷新验证码
          setTimeout(async () => {
            setErrorMsg('');
            await fetchCaptcha();
          }, 1200);
        }
      } catch {
        setErrorMsg('网络错误');
        setTimeout(async () => {
          setErrorMsg('');
          await fetchCaptcha();
        }, 1200);
      } finally {
        setLoading(false);
      }
    }
  }, [loading, charPositions, clickedIndices, clickedChars, sessionId, onSuccess, fetchCaptcha]);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await fetchCaptcha();
  };

  if (verified) {
    return (
      <div className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-medium border bg-green-50 border-green-200 text-green-600">
        <ShieldCheck size={18} /> 验证通过
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={openCaptcha}
        className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-medium transition-all border cursor-pointer ${
          errorMsg
            ? 'bg-red-50 border-red-200 text-red-500'
            : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300'
        }`}
      >
        {errorMsg ? (
          <><ShieldAlert size={18} /> {errorMsg}</>
        ) : (
          <><ShieldAlert size={18} /> 点击进行安全验证</>
        )}
      </button>

      {showPopup && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={closePopup}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl p-5"
            style={{ width: CANVAS_W + 40 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">请完成安全验证</span>
              <button type="button" onClick={closePopup} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <span className="text-gray-400 text-lg leading-none">&times;</span>
              </button>
            </div>

            {/* 提示区域 */}
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-blue-50 rounded-lg">
              <span className="text-xs text-blue-600 font-medium">请按顺序点击：</span>
              <div className="flex items-center gap-1.5">
                {targetChars.map((char, i) => (
                  <React.Fragment key={i}>
                    <span
                      className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-sm font-bold transition-all ${
                        i < clickedChars.length
                          ? 'bg-green-100 text-green-600 border border-green-300'
                          : 'bg-white text-gray-700 border border-gray-300'
                      }`}
                    >
                      {i < clickedChars.length ? clickedChars[i] : char}
                    </span>
                    {i < targetChars.length - 1 && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    )}
                  </React.Fragment>
                ))}
              </div>
              {/* 刷新按钮 */}
              <button
                type="button"
                onClick={handleRefresh}
                className="ml-auto p-1 hover:bg-blue-100 rounded-md transition-colors"
                title="刷新验证码"
              >
                <RefreshCw size={14} className={`text-blue-500 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* 画布区域 */}
            <div
              className="relative overflow-hidden rounded-lg cursor-pointer"
              style={{ width: CANVAS_W, height: CANVAS_H }}
            >
              {loading && charPositions.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                  <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : (
                <canvas
                  ref={canvasRef}
                  style={{ width: CANVAS_W, height: CANVAS_H }}
                  onClick={handleCanvasClick}
                />
              )}
            </div>

            {/* 错误提示 */}
            {errorMsg && (
              <div className="mt-3 text-sm text-red-500 text-center">{errorMsg}</div>
            )}

            {/* 底部提示 */}
            <div className="mt-2 text-[11px] text-gray-400 text-center">
              已点击 {clickedChars.length}/3 个字符
            </div>
          </div>
        </div>
      )}
    </>
  );
};

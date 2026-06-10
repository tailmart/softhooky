import React, { useEffect, useState } from 'react';
import { tauriAPI } from '../tauri';

const btnStyle: React.CSSProperties = {
  width: 46,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  borderRadius: 0,
  cursor: 'pointer',
  color: '#666',
  flexShrink: 0,
  transition: 'background 0.15s',
};

const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const isDesktop = tauriAPI.isTauri;

  useEffect(() => {
    if (!tauriAPI.isTauri) return;
    tauriAPI.isMaximized().then(setIsMaximized);
    tauriAPI.onMaximizeChange((m: boolean) => setIsMaximized(m));
  }, []);

  if (!isDesktop) return null;

  return (
    <div
      data-tauri-drag-region
      style={{
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#FAFAFA',
        borderBottom: '1px solid #E5E5E5',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* 拖拽区域 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 14,
          flex: 1,
          height: '100%',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>Softhooky</span>
      </div>

      {/* 窗口控制按钮 */}
      <div style={{ display: 'flex', height: '100%' }}>
        <button
          onClick={() => tauriAPI.minimize()}
          style={btnStyle}
          title="最小化"
          onMouseEnter={e => (e.currentTarget.style.background = '#E5E5E5')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <svg width="10" height="10" viewBox="0 0 12 12"><rect y="5" width="12" height="1.5" fill="currentColor" rx="0.75" /></svg>
        </button>
        <button
          onClick={() => tauriAPI.maximizeToggle()}
          style={btnStyle}
          title={isMaximized ? '还原' : '最大化'}
          onMouseEnter={e => (e.currentTarget.style.background = '#E5E5E5')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="1.5" y="3.5" width="7" height="7" rx="1" />
              <path d="M3.5 3.5V2.5a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
            </svg>
          )}
        </button>
        <button
          onClick={() => tauriAPI.close()}
          style={{ ...btnStyle }}
          title="关闭"
          onMouseEnter={e => { e.currentTarget.style.background = '#E81123'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666'; }}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;

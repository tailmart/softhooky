import React from 'react';

interface RatioOption {
  value: string;
  label: string;
}

interface RatioPickerProps {
  options: RatioOption[];
  selected: string;
  onChange: (value: string) => void;
}

/** 根据比例返回形状的宽高比（用于CSS） */
const getShapeStyle = (value: string): React.CSSProperties => {
  const [w, h] = value.split(':').map(Number);
  if (!w || !h) return { width: 24, height: 24 };
  const max = 28;
  const ratio = w / h;
  if (ratio >= 1) {
    return { width: max, height: max / ratio };
  }
  return { width: max * ratio, height: max };
};

/** 比例对应的中文描述 */
const getRatioHint = (value: string): string => {
  const map: Record<string, string> = {
    '1:1': '方形',
    '3:4': '竖版',
    '4:3': '横版',
    '9:16': '手机',
    '16:9': '宽屏',
    '2:3': '竖版',
    '3:2': '横版',
    '21:9': '超宽',
    'auto': '智能',
    '智能': '智能',
    'Smart': '智能',
  };
  return map[value] || '';
};

export const RatioPicker: React.FC<RatioPickerProps> = ({ options, selected, onChange }) => {
  return (
    <div className="mobile-scroll-x -mx-1">
      <div className="flex gap-2 px-1 pb-0.5">
        {options.map(opt => {
          const isActive = selected === opt.value;
          const shapeStyle = getShapeStyle(opt.value);
          const hint = opt.label.length <= 4 ? '' : getRatioHint(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`mobile-tap flex-shrink-0 flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-medium transition-all ${
                isActive
                  ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/25'
                  : 'bg-gray-50 text-gray-500 border border-gray-200'
              }`}
            >
              {/* Shape icon */}
              <div
                className="rounded-sm border-2 flex items-center justify-center transition-colors"
                style={{
                  ...shapeStyle,
                  borderColor: isActive ? '#3b82f6' : '#d4d4d4',
                  backgroundColor: isActive ? 'rgba(59,130,246,0.08)' : 'transparent',
                }}
              />
              <span className="font-semibold text-xs leading-none">{opt.label}</span>
              {(hint) && <span className="text-[9px] opacity-60 leading-none -mt-0.5">{hint}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

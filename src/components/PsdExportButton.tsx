/**
 * 可复用的 PSD 导出按钮组件
 * 可直接插入到任何图片卡片的操作按钮组中
 */
import React, { useState } from 'react';
import { Layers, Loader2 } from 'lucide-react';
import { convertImageToPsd } from '../utils/psdConverter';

interface PsdExportButtonProps {
  imageUrl: string;
  /** 按钮尺寸: sm=w-6 h-6, md=w-7 h-7(默认), lg=w-9 h-9 */
  size?: 'sm' | 'md' | 'lg';
  /** 自定义 className，会追加到默认样式后 */
  className?: string;
  /** hover 后的颜色主题，默认 purple */
  color?: 'purple' | 'emerald';
}

export const PsdExportButton: React.FC<PsdExportButtonProps> = ({
  imageUrl,
  size = 'md',
  className = '',
  color = 'purple',
}) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      await convertImageToPsd(imageUrl);
    } catch (err: any) {
      console.error('PSD导出失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const sizeMap = {
    sm: 'w-6 h-6',
    md: 'w-7 h-7',
    lg: 'w-9 h-9',
  };

  const iconSizeMap = { sm: 10, md: 14, lg: 16 };
  const colorClass = color === 'purple'
    ? 'hover:bg-purple-500 hover:text-white'
    : 'hover:bg-emerald-500 hover:text-white';

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`${sizeMap[size]} rounded-xl flex items-center justify-center shadow-md ${colorClass} transition-all disabled:opacity-50 ${className}`}
      title="导出为PSD分层文件"
    >
      {loading ? (
        <Loader2 size={iconSizeMap[size]} className="animate-spin text-purple-500" />
      ) : (
        <Layers size={iconSizeMap[size]} className="text-[#171717]" />
      )}
    </button>
  );
};

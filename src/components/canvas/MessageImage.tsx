import React from 'react';
import { LazyImage } from './LazyImage';
import { ZoomIn, ImagePlus } from 'lucide-react';

interface MessageImageProps {
  img: string;
  imgIndex: number;
  onImageClick: (url: string) => void;
  onPreview: (url: string) => void;
}

export const MessageImage = React.memo<MessageImageProps>(({
  img,
  imgIndex,
  onImageClick,
  onPreview
}) => {
  return (
    <div
      className="relative group cursor-pointer rounded-lg overflow-hidden border border-gray-200 hover:border-emerald-400 transition-all inline-block"
      style={{ maxWidth: '120px', width: '120px' }}
    >
      <LazyImage
        src={img}
        alt={`Generated ${imgIndex}`}
        className="w-full h-auto block"
        referrerPolicy="no-referrer"
      />
      {/* Overlay with two actions - always visible on mobile, show on hover for desktop */}
      <div className="absolute inset-0 bg-black/40 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onPreview(img); }}
          className="p-1.5 bg-white/90 hover:bg-white rounded-lg text-gray-800 transition-colors"
          title="放大查看"
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onImageClick(img); }}
          className="p-1.5 bg-white/90 hover:bg-white rounded-lg text-gray-800 transition-colors"
          title="作为参考图"
        >
          <ImagePlus size={14} />
        </button>
      </div>
    </div>
  );
});

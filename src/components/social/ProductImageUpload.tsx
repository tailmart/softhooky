import React, { useRef } from 'react';
import { X, Plus, Images, FileImage } from 'lucide-react';

interface ProductImageUploadProps {
  images: { file: File; preview: string }[];
  onImagesChange: (images: { file: File; preview: string }[]) => void;
  maxImages?: number;
  icon?: 'images' | 'file';
}

export const ProductImageUpload: React.FC<ProductImageUploadProps> = ({
  images,
  onImagesChange,
  maxImages = 10,
  icon = 'images'
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    const oversized = files.find(f => f.size > MAX_FILE_SIZE);
    if (oversized) {
      alert(`图片"${oversized.name}"超过 20MB，请压缩后重新上传`);
      e.target.value = '';
      return;
    }
    const newItems = files.map(f => ({ file: f, preview: '' }));
    Promise.all(newItems.map(item => new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => { item.preview = reader.result as string; resolve(); };
      reader.onerror = reject;
      reader.readAsDataURL(item.file);
    }))).then(() => {
      onImagesChange([...images, ...newItems].slice(0, maxImages));
    }).catch(err => {
      console.error('图片处理失败:', err);
      alert('部分图片处理失败，请尝试使用更小的图片');
    });
  };

  const removeImage = (idx: number) => {
    onImagesChange(images.filter((_, i) => i !== idx));
  };

  const IconComponent = icon === 'images' ? Images : FileImage;

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <IconComponent size={16} className="text-blue-500" />
        <div>
          <h3 className="text-sm font-semibold text-[#171717]">产品图片</h3>
          <p className="text-xs text-gray-400">AI会通过提供参考图自行选择设计</p>
        </div>
        <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-xl">
          {images.length}/{maxImages}
        </span>
      </div>
      {images.length > 0 && (
        <div className="grid grid-cols-5 gap-2 mb-3">
          {images.map((item, idx) => (
            <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden bg-gray-100">
              <img src={item.preview} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(idx)}
                className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100"
              >
                <X size={14} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUpload}
        multiple
        accept="image/*"
        className="hidden"
      />
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA] p-3 flex flex-col items-center justify-center gap-1 hover:border-gray-400 hover:bg-gray-50 transition-all cursor-pointer"
      >
        <Plus size={18} className="text-gray-400" />
        <span className="text-xs text-gray-400">上传产品图</span>
      </div>
    </div>
  );
};

import React, { useRef } from 'react';
import { X, Plus, Images, Image as ImageIcon } from 'lucide-react';

interface EcommerceImageUploadProps {
  images: { file: File; preview: string }[];
  onImagesChange: (images: { file: File; preview: string }[]) => void;
  maxImages?: number;
  title?: string;
  subtitle?: string;
  icon?: 'images' | 'image';
}

export const EcommerceImageUpload: React.FC<EcommerceImageUploadProps> = ({
  images,
  onImagesChange,
  maxImages = 10,
  title = '产品图片',
  subtitle = 'AI会通过提供参考图自行选择设计',
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
    const availableSlots = maxImages - images.length;
    if (availableSlots <= 0) {
      alert(`最多只能上传${maxImages}张图片`);
      return;
    }
    const filesToAdd = files.slice(0, availableSlots);
    const newItems = filesToAdd.map(f => ({ file: f, preview: '' }));
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
    e.target.value = '';
  };

  const removeImage = (idx: number) => {
    onImagesChange(images.filter((_, i) => i !== idx));
  };

  const IconComponent = icon === 'images' ? Images : ImageIcon;

  return (
    <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <IconComponent size={16} className="text-blue-500" />
        <div>
          <h3 className="text-sm font-semibold text-[#171717]">{title}</h3>
          <p className="text-xs text-[#A3A3A3]">{subtitle}</p>
        </div>
        <span className="ml-auto text-xs text-[#A3A3A3] bg-[#F5F5F5] px-2 py-1 rounded-xl">
          {images.length}/{maxImages}
        </span>
      </div>
      {images.length > 0 && (
        <div className="grid grid-cols-5 gap-2 mb-3">
          {images.map((item, idx) => (
            <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden bg-[#F5F5F5]">
              <img src={item.preview} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(idx)}
                className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100"
              >
                <X size={12} className="text-white" />
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
        className="border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA] p-3 flex flex-col items-center justify-center gap-1 hover:border-[#171717]/30 hover:bg-[#F5F5F5] transition-all cursor-pointer"
      >
        <Plus size={18} className="text-[#A3A3A3]" />
        <span className="text-xs text-[#A3A3A3]">上传图片</span>
      </div>
    </div>
  );
};

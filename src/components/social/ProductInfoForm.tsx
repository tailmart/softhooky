import React, { useRef, useEffect } from 'react';
import { Sparkles } from 'lucide-react';

interface ProductInfoFormProps {
  productName: string;
  onProductNameChange: (name: string) => void;
  productDesc: string;
  onProductDescChange: (desc: string) => void;
  nameLabel?: string;
  descLabel?: string;
  namePlaceholder?: string;
  descPlaceholder?: string;
}

export const ProductInfoForm: React.FC<ProductInfoFormProps> = ({
  productName,
  onProductNameChange,
  productDesc,
  onProductDescChange,
  nameLabel = '产品标题',
  descLabel = '产品描述（可选）',
  namePlaceholder = '例如：无线降噪蓝牙耳机',
  descPlaceholder = '产品卖点、功能、使用场景...'
}) => {
  const productNameRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  useEffect(() => {
    if (productNameRef.current) autoResize(productNameRef.current);
  }, [productName]);

  return (
    <>
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-blue-500" />
          <span className="text-sm font-semibold text-[#171717]">{nameLabel}</span>
        </div>
        <textarea
          value={productName}
          onChange={e => { onProductNameChange(e.target.value); autoResize(e.target); }}
          placeholder={namePlaceholder}
          className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-2xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder:text-gray-400 resize-none overflow-hidden"
          rows={1}
          ref={productNameRef}
        />
      </div>

      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-blue-500" />
          <span className="text-sm font-semibold text-[#171717]">{descLabel}</span>
        </div>
        <textarea
          value={productDesc}
          onChange={e => {
            onProductDescChange(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          placeholder={descPlaceholder}
          className="w-full bg-[#F5F5F5] rounded-2xl p-3 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none text-[#171717] placeholder:text-gray-400 overflow-hidden"
          rows={1}
          ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
        />
      </div>
    </>
  );
};

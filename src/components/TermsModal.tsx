import React from 'react';
import { FileText, CheckCircle } from 'lucide-react';

interface TermsModalProps {
  onClose: () => void;
}

export const TermsModal: React.FC<TermsModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-[#171717] flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#171717]">使用条款</h2>
            <p className="text-xs text-gray-500">请仔细阅读以下条款</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
          <div className="space-y-5">
            <div className="bg-gray-50 rounded-2xl p-4">
              <h3 className="font-semibold text-[#171717] mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#171717] text-white text-xs flex items-center justify-center">1</span>
                服务概述
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Softhooky 提供基于人工智能的图像生成服务，允许用户通过文本描述创建独特的图像内容。
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4">
              <h3 className="font-semibold text-[#171717] mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#171717] text-white text-xs flex items-center justify-center">2</span>
                用户责任
              </h3>
              <ul className="text-sm text-gray-600 space-y-1.5 ml-8">
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-1">•</span>
                  <span>不得生成违法、有害、暴力或不当内容</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-1">•</span>
                  <span>不得侵犯他人版权或知识产权</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-1">•</span>
                  <span>不得生成虚假信息或深度伪造内容</span>
                </li>
              </ul>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4">
              <h3 className="font-semibold text-[#171717] mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#171717] text-white text-xs flex items-center justify-center">3</span>
                知识产权
              </h3>
              <ul className="text-sm text-gray-600 space-y-1.5 ml-8">
                <li className="flex items-start gap-2">
                  <CheckCircle size={14} className="text-green-500 mt-1 flex-shrink-0" />
                  <span>用户拥有生成图像的使用权和修改权</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle size={14} className="text-green-500 mt-1 flex-shrink-0" />
                  <span>商业使用时需注明使用了AI生成技术</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle size={14} className="text-green-500 mt-1 flex-shrink-0" />
                  <span>平台保留展示用户优秀作品的权利</span>
                </li>
              </ul>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4">
              <h3 className="font-semibold text-[#171717] mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#171717] text-white text-xs flex items-center justify-center">4</span>
                服务限制
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed ml-8">
                每日生成次数可能受限，复杂图像需要更长时间，平台有权拒绝不当请求。
              </p>
            </div>

            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200">
              <h3 className="font-semibold text-amber-800 mb-2">免责声明</h3>
              <p className="text-sm text-amber-700 leading-relaxed">
                AI生成的图像可能存在不准确之处，我们不对生成内容的准确性做任何保证。
              </p>
            </div>

            <p className="text-xs text-gray-400 text-center pt-2">
              继续使用服务即表示您接受上述条款
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full bg-[#171717] text-white py-3.5 rounded-xl text-sm font-semibold hover:bg-[#27272A] transition-colors flex items-center justify-center gap-2"
          >
            <CheckCircle size={16} />
            我已阅读并同意
          </button>
        </div>
      </div>
    </div>
  );
};

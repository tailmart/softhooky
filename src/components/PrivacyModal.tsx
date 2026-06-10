import React from 'react';
import { Shield, CheckCircle, AlertTriangle } from 'lucide-react';

interface PrivacyModalProps {
  onClose: () => void;
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({ onClose }) => {
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
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#171717]">隐私政策</h2>
            <p className="text-xs text-gray-500">您的隐私安全至关重要</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
          <div className="space-y-5">
            {/* Highlighted: Image Privacy */}
            <div className="bg-green-50 rounded-2xl p-4 border border-green-200">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <h3 className="font-bold text-green-800">您的图片隐私完全安全</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <CheckCircle size={14} className="text-green-500 mt-1 flex-shrink-0" />
                  <span className="text-sm text-green-700">所有生成的图片将在<strong>3天后自动删除</strong></span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle size={14} className="text-green-500 mt-1 flex-shrink-0" />
                  <span className="text-sm text-green-700">我们<strong>不会收集、存储或分析</strong>您的图片</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle size={14} className="text-green-500 mt-1 flex-shrink-0" />
                  <span className="text-sm text-green-700">图片<strong>永远不会用于AI训练</strong></span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4">
              <h3 className="font-semibold text-[#171717] mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#171717] text-white text-xs flex items-center justify-center">1</span>
                我们收集的信息
              </h3>
              <div className="grid grid-cols-2 gap-2 ml-8">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  <span>邮箱地址</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  <span>用户名</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  <span>密码（加密）</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  <span>使用数据</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4">
              <h3 className="font-semibold text-[#171717] mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#171717] text-white text-xs flex items-center justify-center">2</span>
                图片生命周期
              </h3>
              <div className="ml-8 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-xs font-bold text-[#171717]">0h</span>
                  </div>
                  <span className="text-sm text-gray-600">图片生成后立即显示给您</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-xs font-bold text-[#171717]">72h</span>
                  </div>
                  <span className="text-sm text-gray-600">图片保持可访问状态</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                    <span className="text-xs font-bold text-red-600">×</span>
                  </div>
                  <span className="text-sm text-gray-600">3天后永久自动删除</span>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h3 className="font-semibold text-amber-800">重要提醒</h3>
              </div>
              <p className="text-sm text-amber-700 leading-relaxed">
                请在3天内下载您的图片，删除后无法恢复。建议将重要创作保存到您的设备。
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4">
              <h3 className="font-semibold text-[#171717] mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#171717] text-white text-xs flex items-center justify-center">3</span>
                联系我们
              </h3>
              <p className="text-sm text-gray-600 ml-8">
                隐私问题咨询：<span className="text-[#171717] font-medium">softhooky@163.com</span>
              </p>
              <p className="text-xs text-gray-400 ml-8 mt-1">24小时内回复</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full bg-[#171717] text-white py-3.5 rounded-xl text-sm font-semibold hover:bg-[#27272A] transition-colors flex items-center justify-center gap-2"
          >
            <CheckCircle size={16} />
            我已阅读并理解
          </button>
        </div>
      </div>
    </div>
  );
};

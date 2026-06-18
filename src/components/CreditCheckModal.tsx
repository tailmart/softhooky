import React from 'react';
import { Coins, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface CreditCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRecharge: () => void;
  requiredCredits?: number;
}

export const CreditCheckModal: React.FC<CreditCheckModalProps> = ({
  isOpen,
  onClose,
  onRecharge,
  requiredCredits = 0.1
}) => {
  const { user } = useAuth();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-[#F5F5F5] rounded-lg flex items-center justify-center">
              <Coins className="w-4.5 h-4.5 text-[#171717]" />
            </div>
            <h3 className="text-base font-semibold">积分不足</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-[#F5F5F5] rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        
        <div className="bg-[#F8F8F8] rounded-lg p-3 mb-5">
          <p className="text-xs text-[#525252] mb-2">积分消耗说明：</p>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-[#525252]">图片生成 (nano-banana-2)</span>
              <span className="font-semibold text-[#171717]">0.3 积分/次</span>
            </div>
          </div>
        </div>
        
        <p className="text-[#525252] text-sm mb-5">
          当前积分 <span className="font-semibold text-[#171717]">{user?.credits || 0}</span> 不足，
          需要至少 <span className="font-semibold text-[#171717]">{requiredCredits}</span> 积分才能继续操作。
        </p>
        
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-lg text-sm font-medium transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => {
              onClose();
              onRecharge();
            }}
            className="flex-1 px-4 py-2.5 bg-[#171717] hover:bg-[#27272A] text-white rounded-lg text-sm font-medium transition-colors"
          >
            立即充值
          </button>
        </div>
      </div>
    </div>
  );
};

export const useCreditCheck = () => {
  const { user } = useAuth();

  const checkCredits = (requiredCredits: number = 0.1): boolean => {
    const credits = user?.credits || 0;
    return credits >= requiredCredits;
  };

  const getCreditInfo = () => ({
    currentCredits: user?.credits || 0,
    isAuthenticated: !!user
  });

  return {
    checkCredits,
    getCreditInfo
  };
};

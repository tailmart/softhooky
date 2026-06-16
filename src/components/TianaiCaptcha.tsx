import React from 'react';
import { ChineseCharCaptcha } from './ChineseCharCaptcha';

interface TianaiCaptchaProps {
  onSuccess: (captchaToken: string) => void;
}

export const TianaiCaptchaButton: React.FC<TianaiCaptchaProps> = ({ onSuccess }) => {
  return <ChineseCharCaptcha onSuccess={onSuccess} />;
};

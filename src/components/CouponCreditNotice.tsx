import React, { useState, useEffect, useCallback } from 'react';
import { Gift } from 'lucide-react';
import { getAuthToken } from '../services/authService';

interface CouponCreditInfo {
  total: number;
  nearestExpireDays: number;
}

export const CouponCreditNotice: React.FC = () => {
  const [info, setInfo] = useState<CouponCreditInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCouponCredits = useCallback(async () => {
    const token = getAuthToken();
    console.log('[CouponCreditNotice] mounted, token:', token ? 'exists' : 'null');
    if (!token) { setLoading(false); return; }
    try {
      const res = await fetch('/api/coupons/claims', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      console.log('[CouponCreditNotice] API response:', json);
      const claims = json.data || [];
      const now = new Date();

      // 过滤有效的（未过期且未到失效时间）
      const activeClaims = claims.filter((c: any) => {
        if (c.expired === 1) return false;
        return new Date(c.expires_at) > now;
      });

      console.log('[CouponCreditNotice] activeClaims:', activeClaims);

      if (activeClaims.length === 0) {
        console.log('[CouponCreditNotice] no active claims, hiding');
        setInfo(null);
        setLoading(false);
        return;
      }

      const total = activeClaims.reduce((sum: number, c: any) => sum + Number(c.credits || 0), 0);

      // 找最近的过期时间
      let nearestExpire = Infinity;
      activeClaims.forEach((c: any) => {
        const d = new Date(c.expires_at).getTime();
        if (d < nearestExpire) nearestExpire = d;
      });

      const daysLeft = Math.ceil((nearestExpire - now.getTime()) / (1000 * 60 * 60 * 24));
      console.log('[CouponCreditNotice] showing:', { total, daysLeft });
      setInfo({ total, nearestExpireDays: daysLeft });
    } catch (err) {
      console.error('[CouponCreditNotice] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCouponCredits();
    // 积分更新时重新获取
    window.addEventListener('credits-updated', fetchCouponCredits);
    return () => window.removeEventListener('credits-updated', fetchCouponCredits);
  }, [fetchCouponCredits]);

  // 调试：如果 loading 完成但 info 为 null，显示一条不可见的调试信息
  if (loading) {
    console.log('[CouponCreditNotice] still loading...');
    return null;
  }
  if (!info || info.total <= 0) {
    console.log('[CouponCreditNotice] no info to show');
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50/80 px-2.5 py-1.5 rounded-lg border border-amber-200/60">
      <Gift size={12} className="flex-shrink-0" />
      <span>
        <strong>{info.total.toFixed(1)}</strong> 积分通过优惠券获得，
        请在 <strong>{info.nearestExpireDays} 天</strong> 内用完
      </span>
    </div>
  );
};

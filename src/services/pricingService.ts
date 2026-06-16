import axios from 'axios';

interface Pricing {
  nanobann2_generation?: number;
  nanobann2_edit?: number;
  gpt_image2_generation?: number;
  gpt_image2_edit?: number;
  product_fusion?: number;
  veo31_video?: number;
  veo31_video_fast?: number;
  veo31_video_4k?: number;
  veo31_video_fast_4k?: number;
  [key: string]: number | undefined;
}

let cachedPricing: Pricing | null = null;
let pricingCacheTime = 0;
const PRICING_CACHE_TTL = 300000; // 5分钟缓存

export const getPricing = async (): Promise<Pricing> => {
  const now = Date.now();
  const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');

  // 登录用户每次请求最新价格（可能有代理定价），不走缓存
  if (token) {
    try {
      const response = await axios.get('/api/pricing', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        return response.data.data;
      }
    } catch (error) {
      console.error('获取价格配置失败:', error);
    }
    return {};
  }

  // 未登录用户使用缓存
  if (cachedPricing && now - pricingCacheTime < PRICING_CACHE_TTL) {
    return cachedPricing;
  }

  try {
    const response = await axios.get('/api/pricing');
    if (response.data.success) {
      cachedPricing = response.data.data;
      pricingCacheTime = now;
      return cachedPricing;
    }
  } catch (error) {
    console.error('获取价格配置失败:', error);
  }

  return cachedPricing || {};
}

export const getGeneratePrice = async (): Promise<number> => {
  const pricing = await getPricing();
  return pricing.nanobann2_generation || pricing.gpt_image2_generation || 0.3;
}

export const getEditPrice = async (): Promise<number> => {
  const pricing = await getPricing();
  return pricing.nanobann2_edit || pricing.gpt_image2_edit || 0.3;
}

export const clearPricingCache = () => {
  cachedPricing = null;
  pricingCacheTime = 0;
};

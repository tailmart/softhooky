import api from './api';
import { getAuthToken } from './authService';

// 响应拦截器：自动同步积分（放在全局 axios 上，确保所有请求都能触发）
api.interceptors.response.use(
  async (response) => {
    if (response.data?.remainingCredits !== undefined) {
      const userStr = sessionStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        user.credits = response.data.remainingCredits;
        sessionStorage.setItem('user', JSON.stringify(user));
        window.dispatchEvent(new Event('credits-updated'));
      }
    }
    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export interface ImageGenerationParams {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  n?: number;
}

export interface ImageEditParams {
  prompt: string;
  images: string[]; // base64 data URLs or URLs
  model?: string;
  resolution?: string;
  aspectRatio?: string;
}

export interface ImageGenerationResponse {
  data: Array<{
    url: string;
    revised_prompt?: string;
  }>;
  image_url?: string;
  url?: string;
  remainingCredits?: number;
}

/**
 * 文生图 - 走后端 API，后端负责：扣费 + 调第三方 + R2上传 + DB保存
 */
export const generateImage = async (params: ImageGenerationParams): Promise<ImageGenerationResponse> => {
  const { prompt, model, aspectRatio, resolution, n } = params;
  const token = getAuthToken();

  const response = await api.post(
    '/api/images/generations',
    {
      prompt,
      model: model || 'gemini-3.1-flash-image-preview',
      aspectRatio: aspectRatio || '智能',
      resolution: resolution || '1K',
      n: n || 1
    },
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: 600000
    }
  );

  // 后端返回 { data: [{ url }], remainingCredits }
  return response.data;
};

/**
 * 图生图/编辑 - 走后端 API，后端负责：扣费 + 调第三方 + R2上传 + DB保存
 */
export const editImage = async (params: ImageEditParams): Promise<ImageGenerationResponse> => {
  const { prompt, images, model, resolution, aspectRatio } = params;
  const token = getAuthToken();

  const response = await api.post(
    '/api/images/edits',
    {
      prompt,
      images, // base64 data URLs 或 URLs
      model: model || 'gemini-3.1-flash-image-preview',
      size: resolution === '4K' ? '4K' : resolution === '2K' ? '2K' : '1K',
      aspectRatio: aspectRatio || '智能'
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 600000
    }
  );

  return response.data;
};

export const updateImagePositions = async (images: { imageUrl: string; x: number; y: number }[]) => {
  const token = getAuthToken();
  const response = await api.post(
    '/api/images/update-positions',
    { images },
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: 10000
    }
  );
  return response.data;
};

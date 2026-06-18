import { getAuthToken } from './authService';

export interface VideoMediaItem {
  id: number;
  user_id: number;
  image_url: string;
  prompt: string | null;
  model: string;
  aspect_ratio: string;
  resolution: string;
  type: 'video' | 'video-script' | 'video-social';
  created_at: string;
  expires_at: string | null;
  sub_user_name?: string | null;
}

export interface VideoMediaResponse {
  success: boolean;
  data: VideoMediaItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getAuthToken()}`,
});

// 获取视频媒体库
export const getVideoMediaLibrary = async (
  page: number = 1,
  pageSize: number = 20,
  mediaType?: string
): Promise<VideoMediaResponse> => {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
  });
  if (mediaType && mediaType !== 'all') {
    params.append('type', mediaType);
  }

  const response = await fetch(`/api/video/media-library?${params}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('获取视频媒体库失败');
  }

  return response.json();
};

// 删除单条视频媒体
export const deleteVideoMedia = async (id: number): Promise<void> => {
  const response = await fetch(`/api/video/media/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('删除失败');
  }
};

// 批量删除视频媒体
export const batchDeleteVideoMedia = async (ids: number[]): Promise<void> => {
  const response = await fetch('/api/video/media/batch-delete', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    throw new Error('批量删除失败');
  }
};

// 清理过期视频媒体
export const cleanupExpiredVideoMedia = async (): Promise<{ cleanedCount: number }> => {
  const response = await fetch('/api/video/media/cleanup', {
    method: 'POST',
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('清理失败');
  }

  return response.json();
};

import api from './api';
import { getAuthToken } from './authService';

export interface GeneratedImage {
  id: number;
  user_id: number;
  image_url: string;
  prompt: string | null;
  model: string;
  aspect_ratio: string;
  resolution: string;
  type: 'generated' | 'edited' | 'video';
  created_at: string;
  expires_at: string;
  sub_user_name?: string | null;
}

export interface ImageLibraryResponse {
  success: boolean;
  data: GeneratedImage[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// 用于跟踪正在保存的图片URL，防止重复保存
const savingUrls = new Set<string>();
// 用于跟踪已成功保存的图片URL，防止重复保存
// 注意：每次生成前应调用 clearSavedUrlsCache() 清理，避免阻塞新图片保存
const savedUrls = new Set<string>();

export const imageLibraryService = {
  async getImages(page: number = 1, pageSize: number = 20, filter: string = 'mine'): Promise<ImageLibraryResponse> {
    const token = getAuthToken();
    const res = await api.get('/api/images/library', {
      headers: { Authorization: `Bearer ${token}` },
      params: { page, pageSize, filter }
    });
    return res.data;
  },

  async saveToLibrary(imageData: {
    image_url: string;
    prompt: string | null;
    model: string;
    aspect_ratio: string;
    resolution: string;
    type: 'generated' | 'edited' | 'chatgen';
  }): Promise<{ success: boolean; message: string }> {
    const token = getAuthToken();
    
    // 多重防重复检查
    if (savingUrls.has(imageData.image_url)) {
      console.log('⚠️ Image already being saved:', imageData.image_url.substring(0, 50));
      return { success: true, message: '图片正在保存中' };
    }
    
    if (savedUrls.has(imageData.image_url)) {
      console.log('⚠️ Image already saved:', imageData.image_url.substring(0, 50));
      return { success: true, message: '图片已保存' };
    }
    
    savingUrls.add(imageData.image_url);
    
    console.log('=== imageLibraryService.saveToLibrary called ===');
    console.log('image_url:', imageData.image_url.substring(0, 100));
    console.log('token:', token ? 'exists' : 'null');
    console.log('current savingUrls count:', savingUrls.size);
    console.log('current savedUrls count:', savedUrls.size);
    
    // 转换字段名以匹配后端期望的格式
    const backendData = {
      imageUrl: imageData.image_url,
      prompt: imageData.prompt,
      model: imageData.model,
      aspectRatio: imageData.aspect_ratio,
      type: imageData.type,
      skipDeduct: true  // 图片生成时已扣费，保存时跳过扣费
    };
    
    console.log('backendData:', JSON.stringify(backendData));
    
    try {
      const res = await api.post('/api/images/library', backendData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('保存成功:', res.data);
      
      // 保存成功后，添加到已保存集合
      savedUrls.add(imageData.image_url);
      
      return res.data;
    } catch (error: any) {
      console.error('保存失败 - 状态:', error.response?.status);
      console.error('保存失败 - 数据:', error.response?.data);
      console.error('保存失败 - 消息:', error.message);
      throw error;
    } finally {
      // 保存完成后从正在保存集合中移除
      savingUrls.delete(imageData.image_url);
      console.log('Removed from savingUrls, current count:', savingUrls.size);
    }
  },

  // 清理已保存的URL缓存（用于页面刷新或重置）
  clearSavedUrlsCache() {
    savedUrls.clear();
    console.log('🧹 Cleared saved URLs cache');
  },

  async deleteImage(id: number): Promise<{ success: boolean; message: string }> {
    const token = getAuthToken();
    const res = await api.delete(`/api/images/library/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.data;
  },

  async deleteImageByUrl(url: string): Promise<{ success: boolean; message: string }> {
    const token = getAuthToken();
    const res = await api.post('/api/images/delete-by-url',
      { url },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  },

  async cleanupExpiredImages(): Promise<{ success: boolean; message: string; deletedCount?: number; deletedUrls?: string[] }> {
    const token = getAuthToken();
    const res = await api.post('/api/images/library/cleanup', {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    // 记录已删除的图片URL到本地
    if (res.data?.success && res.data?.deletedUrls?.length > 0) {
      const deletedUrls = this.getDeletedUrls();
      const newDeleted = [...new Set([...deletedUrls, ...res.data.deletedUrls])];
      localStorage.setItem('deleted_image_urls', JSON.stringify(newDeleted));
    }
    return res.data;
  },

  getDeletedUrls(): string[] {
    try {
      const saved = localStorage.getItem('deleted_image_urls');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  },

  clearDeletedUrlsCache() {
    localStorage.removeItem('deleted_image_urls');
  },

  isImageDeleted(url: string): boolean {
    const deletedUrls = this.getDeletedUrls();
    return deletedUrls.some(deleted => url.includes(deleted) || deleted.includes(url));
  },

  trackDeletedImageUrl(url: string): void {
    const deletedUrls = this.getDeletedUrls();
    if (!deletedUrls.some(d => url.includes(d) || d.includes(url))) {
      deletedUrls.push(url);
      localStorage.setItem('deleted_image_urls', JSON.stringify(deletedUrls));
      window.dispatchEvent(new CustomEvent('images-deleted', { detail: { urls: [url] } }));
    }
  },

  trackDeletedImageUrls(urls: string[]): void {
    const deletedUrls = this.getDeletedUrls();
    let changed = false;
    for (const url of urls) {
      if (!deletedUrls.some(d => url.includes(d) || d.includes(url))) {
        deletedUrls.push(url);
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem('deleted_image_urls', JSON.stringify(deletedUrls));
      window.dispatchEvent(new CustomEvent('images-deleted', { detail: { urls } }));
    }
  },

  // 清除已删除图片的追踪记录（用于调试或重置）
  resetDeletedUrls() {
    localStorage.removeItem('deleted_image_urls');
  },

  async batchDeleteImages(ids: number[]): Promise<{ success: boolean; message: string }> {
    const token = getAuthToken();
    const res = await api.post('/api/images/library/batch-delete', 
      { ids },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  },

  async saveVideoToLibrary(videoData: {
    video_url: string;
    prompt: string | null;
    model: string;
    aspect_ratio: string;
  }): Promise<{ success: boolean; message: string }> {
    const token = getAuthToken();
    
    if (savingUrls.has(videoData.video_url)) {
      console.log('⚠️ Video already being saved:', videoData.video_url.substring(0, 50));
      return { success: true, message: '视频正在保存中' };
    }
    
    if (savedUrls.has(videoData.video_url)) {
      console.log('⚠️ Video already saved:', videoData.video_url.substring(0, 50));
      return { success: true, message: '视频已保存' };
    }
    
    savingUrls.add(videoData.video_url);
    
    console.log('=== imageLibraryService.saveVideoToLibrary called ===');
    console.log('video_url:', videoData.video_url.substring(0, 100));
    
    const backendData = {
      imageUrl: videoData.video_url,
      prompt: videoData.prompt,
      model: videoData.model,
      aspectRatio: videoData.aspect_ratio,
      type: 'generated',
      isVideo: true,
      skipDeduct: true  // 视频生成时已扣费，保存时跳过扣费
    };
    
    try {
      const res = await api.post('/api/images/library', backendData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('视频保存成功:', res.data);
      
      savedUrls.add(videoData.video_url);
      
      return res.data;
    } catch (error: any) {
      console.error('视频保存失败 - 状态:', error.response?.status);
      console.error('视频保存失败 - 数据:', error.response?.data);
      console.error('视频保存失败 - 消息:', error.message);
      throw error;
    } finally {
      savingUrls.delete(videoData.video_url);
    }
  }
};

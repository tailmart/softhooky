import axios from 'axios';
import { getAuthToken } from './authService';

/**
 * 上传文件对象到 COS（转换为 base64）
 * @param file File 对象
 * @returns COS 公开访问 URL
 */
export async function uploadFileToCos(file: File): Promise<string> {
  try {
    console.log('📤 上传文件到 COS:', file.name);

    // 转换为 base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const token = getAuthToken();
    const response = await axios.post('/api/images/upload-base64-to-cos', {
      base64,
      mimeType: file.type,
      fileName: file.name
    }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (response.data.success) {
      console.log('✅ 文件已上传到 COS:', response.data.url);
      return response.data.url;
    } else {
      throw new Error('上传失败');
    }
  } catch (error: any) {
    console.error('❌ 上传到 COS 失败:', error);
    throw new Error(error.response?.data?.error || '上传文件到 COS 失败');
  }
}

/**
 * 从 URL 下载图片并上传到 COS（通过服务器端 API）
 * @param imageUrl 图片 URL
 * @returns COS 公开访问 URL
 */
export async function uploadImageToCos(imageUrl: string): Promise<string> {
  try {
    console.log('📤 上传图片到 COS:', imageUrl);

    const token = getAuthToken();
    const response = await axios.post('/api/images/upload-to-cos', {
      imageUrl
    }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (response.data.success) {
      console.log('✅ 图片已上传到 COS:', response.data.url);
      return response.data.url;
    } else {
      throw new Error('上传失败');
    }
  } catch (error: any) {
    console.error('❌ 上传到 COS 失败:', error);
    throw new Error(error.response?.data?.error || '上传图片到 COS 失败');
  }
}

/**
 * 批量上传图片到 COS
 * @param imageUrls 图片 URL 数组
 * @returns COS 公开访问 URL 数组
 */
export async function uploadImagesToCos(imageUrls: string[]): Promise<string[]> {
  try {
    console.log('📤 批量上传图片到 COS:', imageUrls.length, '张');

    const token = getAuthToken();
    const response = await axios.post('/api/images/batch-upload-to-cos', {
      imageUrls
    }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (response.data.success) {
      const urls = response.data.images.map((img: any) => img.url);
      console.log('✅ 批量上传完成:', urls.length, '张');
      return urls;
    } else {
      throw new Error('批量上传失败');
    }
  } catch (error: any) {
    console.error('❌ 批量上传到 COS 失败:', error);
    throw new Error(error.response?.data?.error || '批量上传图片到 COS 失败');
  }
}

/**
 * 将 File 对象转换为 base64 data URL（不上传，直接给 AI 接口用）
 * 可选 maxDimension：限制最长边，缩小图片减少网络传输量（默认不压缩）
 */
export function fileToDataUrl(file: File, maxDimension?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!maxDimension) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > height && width > maxDimension) {
          height = Math.round(height * maxDimension / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round(width * maxDimension / height);
          height = maxDimension;
        }
        // 检查 canvas 尺寸是否超限（部分设备有限制）
        const MAX_CANVAS = 16384;
        if (width > MAX_CANVAS || height > MAX_CANVAS) {
          throw new Error(`图片尺寸过大 (${width}x${height})，无法处理`);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 初始化失败');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (err) {
        // canvas 处理失败时回退到原始文件读取（不压缩）
        console.warn('Canvas resize 失败，回退到原始文件:', err);
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      } finally {
        URL.revokeObjectURL(img.src);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('图片加载失败'));
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * 图片元素分割与PSD生成工具
 * 调用服务端API分割图片元素，在浏览器端生成PSD文件并下载
 */
import { writePsd } from 'ag-psd';
import { Psd } from 'ag-psd/dist/psd';

interface SplitElement {
  name: string;
  base64: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isText: boolean;
  text: string;
}

interface SplitResult {
  width: number;
  height: number;
  elements: SplitElement[];
}

/**
 * 将图片转换为PSD分层文件并下载
 * @param imageUrl 图片URL
 */
export async function convertImageToPsd(imageUrl: string): Promise<void> {
  const apiUrl = import.meta.env.VITE_API_URL || '';
  const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');

  // 1. 调用服务端API分割元素
  const response = await fetch(`${apiUrl}/api/images/split-to-psd`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ imageUrl }),
  });

  if (!response.ok) {
    throw new Error(`服务器错误: ${response.status}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message || '图片元素分割失败');
  }

  const data: SplitResult = result.data;

  if (!data.elements || data.elements.length === 0) {
    throw new Error('未能从图片中检测到独立元素');
  }

  // 2. 并行加载所有元素图片到Canvas
  const layers = await Promise.all(
    data.elements.map(async (el) => {
      const canvas = document.createElement('canvas');
      canvas.width = el.width;
      canvas.height = el.height;
      const ctx = canvas.getContext('2d')!;

      const img = await loadImage(`data:image/png;base64,${el.base64}`);
      ctx.drawImage(img, 0, 0);

      // 文字图层：设置可编辑文本属性
      const layer: any = {
        name: el.name,
        canvas,
        left: el.x,
        top: el.y,
        bottom: el.y + el.height,
        right: el.x + el.width,
        opacity: 255,
      };

      if (el.isText && el.text) {
        // 创建Photoshop可编辑的文字图层
        layer.text = {
          text: el.text,
          left: 0,
          top: 0,
          bottom: el.height,
          right: el.width,
          transform: [1, 0, 0, 1, 0, 0],
          antiAlias: 'crisp' as any,
        };
      }

      return layer;
    })
  );

  // 3. 创建白色背景层
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = data.width;
  bgCanvas.height = data.height;
  const bgCtx = bgCanvas.getContext('2d')!;
  bgCtx.fillStyle = '#FFFFFF';
  bgCtx.fillRect(0, 0, data.width, data.height);

  // 4. 组装PSD文档
  const psdDoc: Psd = {
    width: data.width,
    height: data.height,
    children: [
      { name: '背景', canvas: bgCanvas, opacity: 255 },
      ...layers,
    ],
  };

  // 5. 生成PSD二进制数据
  const psdArrayBuffer = writePsd(psdDoc);

  // 6. 触发下载
  const blob = new Blob([psdArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `layered-${Date.now()}.psd`;
  a.click();
  URL.revokeObjectURL(url);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

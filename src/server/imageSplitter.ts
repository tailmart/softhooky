import sharp from 'sharp';
import Tesseract from 'tesseract.js';

interface Region {
  id: number;
  minX: number; minY: number;
  maxX: number; maxY: number;
  pixelCount: number;
}

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
 * 对图片进行元素分割，提取所有独立视觉元素
 * 文字区域通过OCR识别为可编辑文本，其他元素作为位图
 */
export async function splitImageElements(imageBuffer: Buffer, topN = 40): Promise<SplitResult> {
  const metadata = await sharp(imageBuffer).metadata();
  let imgWidth = metadata.width!;
  let imgHeight = metadata.height!;

  // 如果图片过大，缩小到2000px以内以加快处理
  let workingBuffer = imageBuffer;
  if (imgWidth > 2000 || imgHeight > 2000) {
    workingBuffer = await sharp(imageBuffer)
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .toBuffer();
    const m = await sharp(workingBuffer).metadata();
    imgWidth = m.width!;
    imgHeight = m.height!;
  }

  // 1. 获取灰度数据
  const { data: grayData } = await sharp(workingBuffer)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 2. 获取完整RGBA数据
  const { data: rgbaData } = await sharp(workingBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 3. Sobel边缘检测
  const edgeMap = computeSobelEdges(grayData, imgWidth, imgHeight);

  // 4. 二值化 + 膨胀（闭合边缘间隙）
  const dilated = thresholdAndDilate(edgeMap, imgWidth, imgHeight, 28);

  // 5. 连通区域分析（泛洪填充）
  const regions = findConnectedComponents(dilated, imgWidth, imgHeight, 80);

  // 6. 提取每个元素
  const elements = await extractElements(rgbaData, labels, regions, imgWidth, imgHeight, topN);

  return {
    width: imgWidth,
    height: imgHeight,
    elements,
  };
}

// 共享标签数组，避免GC压力
let labels: Int32Array;

function computeSobelEdges(gray: Uint8Array, w: number, h: number): Float32Array {
  const edges = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const gx =
        gray[(y - 1) * w + (x + 1)] + 2 * gray[y * w + (x + 1)] + gray[(y + 1) * w + (x + 1)]
        - gray[(y - 1) * w + (x - 1)] - 2 * gray[y * w + (x - 1)] - gray[(y + 1) * w + (x - 1)];
      const gy =
        gray[(y - 1) * w + (x - 1)] + 2 * gray[(y - 1) * w + x] + gray[(y - 1) * w + (x + 1)]
        - gray[(y + 1) * w + (x - 1)] - 2 * gray[(y + 1) * w + x] - gray[(y + 1) * w + (x + 1)];
      edges[idx] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return edges;
}

function thresholdAndDilate(
  edges: Float32Array, w: number, h: number, threshold: number
): Uint8Array {
  const binary = new Uint8Array(w * h);
  // 先二值化
  for (let i = 0; i < w * h; i++) {
    if (edges[i] > threshold) {
      binary[i] = 1;
    }
  }
  // 再膨胀（3x3）
  const dilated = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (binary[y * w + x]) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
              dilated[ny * w + nx] = 1;
            }
          }
        }
      }
    }
  }
  return dilated;
}

function findConnectedComponents(
  binary: Uint8Array, w: number, h: number, minPixels: number
): Region[] {
  labels = new Int32Array(w * h).fill(-1);
  const regions: Region[] = [];
  let nextLabel = 0;

  // 逐行扫描 + 栈式泛洪填充（避免递归栈溢出）
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (binary[idx] === 0 && labels[idx] === -1) {
        const region: Region = {
          id: nextLabel,
          minX: x, minY: y, maxX: x, maxY: y, pixelCount: 0,
        };

        // 栈式泛洪
        labels[idx] = nextLabel;
        const stack: Array<[number, number]> = [[x, y]];

        while (stack.length > 0) {
          const [cx, cy] = stack.pop()!;
          region.pixelCount++;

          if (cx < region.minX) region.minX = cx;
          if (cx > region.maxX) region.maxX = cx;
          if (cy < region.minY) region.minY = cy;
          if (cy > region.maxY) region.maxY = cy;

          // 4-连通邻域
          if (cx > 0 && labels[cy * w + (cx - 1)] === -1 && binary[cy * w + (cx - 1)] === 0) {
            labels[cy * w + (cx - 1)] = nextLabel;
            stack.push([cx - 1, cy]);
          }
          if (cx < w - 1 && labels[cy * w + (cx + 1)] === -1 && binary[cy * w + (cx + 1)] === 0) {
            labels[cy * w + (cx + 1)] = nextLabel;
            stack.push([cx + 1, cy]);
          }
          if (cy > 0 && labels[(cy - 1) * w + cx] === -1 && binary[(cy - 1) * w + cx] === 0) {
            labels[(cy - 1) * w + cx] = nextLabel;
            stack.push([cx, cy - 1]);
          }
          if (cy < h - 1 && labels[(cy + 1) * w + cx] === -1 && binary[(cy + 1) * w + cx] === 0) {
            labels[(cy + 1) * w + cx] = nextLabel;
            stack.push([cx, cy + 1]);
          }
        }

        if (region.pixelCount >= minPixels) {
          regions.push(region);
          nextLabel++;
        }
      }
    }
  }

  // 按面积降序排列（第一个是背景）
  regions.sort((a, b) => b.pixelCount - a.pixelCount);
  return regions;
}

async function extractElements(
  rgbaData: Buffer,
  labels: Int32Array,
  regions: Region[],
  imgWidth: number,
  imgHeight: number,
  topN: number,
): Promise<SplitElement[]> {
  // 跳过大区域（第1个是背景），取后续最多topN个
  const foregrounds = regions.slice(1, Math.min(topN + 1, regions.length));
  const elements: SplitElement[] = [];

  for (let i = 0; i < foregrounds.length; i++) {
    const r = foregrounds[i];
    const ew = r.maxX - r.minX + 1;
    const eh = r.maxY - r.minY + 1;

    // 填充2px边距
    const pad = 2;
    const paddedW = ew + pad * 2;
    const paddedH = eh + pad * 2;
    const paddedMinX = Math.max(0, r.minX - pad);
    const paddedMinY = Math.max(0, r.minY - pad);

    // 创建带透明通道的独立元素图像
    const elementBuffer = Buffer.alloc(paddedW * paddedH * 4, 0);

    for (let py = 0; py < paddedH; py++) {
      for (let px = 0; px < paddedW; px++) {
        const srcX = paddedMinX + px;
        const srcY = paddedMinY + py;
        if (srcX >= 0 && srcX < imgWidth && srcY >= 0 && srcY < imgHeight) {
          const srcIdx = (srcY * imgWidth + srcX) * 4;
          if (labels[srcY * imgWidth + srcX] === r.id) {
            const dstIdx = (py * paddedW + px) * 4;
            elementBuffer[dstIdx] = rgbaData[srcIdx];
            elementBuffer[dstIdx + 1] = rgbaData[srcIdx + 1];
            elementBuffer[dstIdx + 2] = rgbaData[srcIdx + 2];
            elementBuffer[dstIdx + 3] = rgbaData[srcIdx + 3];
          }
          // 非该区域的像素保持透明
        }
      }
    }

    // 用sharp编码为PNG
    const elementPng = await sharp(elementBuffer, {
      raw: { width: paddedW, height: paddedH, channels: 4 },
    })
      .png({ compressionLevel: 6 })
      .toBuffer();

    // 判断是否为文字区域（启发式：高宽比>2.5 且 面积不太大）
    const aspectRatio = Math.max(ew, eh) / Math.max(1, Math.min(ew, eh));
    const totalArea = imgWidth * imgHeight;
    const elemArea = ew * eh;
    const isLikelyText = aspectRatio > 2.5 && elemArea < totalArea * 0.3;

    let text = '';
    let isText = false;

    // 对可能的文字区域执行OCR
    if (isLikelyText && elemArea < totalArea * 0.4) {
      try {
        const ocrResult = await Tesseract.recognize(elementPng, 'eng+chi_sim', {
          logger: () => {}, // 静默处理
        });
        text = ocrResult.data.text.trim();
        isText = text.length > 0;
      } catch {
        // OCR失败，当作图片处理
      }
    }

    elements.push({
      name: isText ? `文字_${i + 1}` : `元素_${i + 1}`,
      base64: elementPng.toString('base64'),
      x: paddedMinX,
      y: paddedMinY,
      width: paddedW,
      height: paddedH,
      isText,
      text,
    });
  }

  return elements;
}

export type { SplitElement, SplitResult };

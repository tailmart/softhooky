import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Upload, Loader2, X, Download, Eye, Wand2,
  Image as ImageIcon, Type, Replace, RotateCcw, Plus, Paintbrush, Eraser
} from 'lucide-react';
import { fileToDataUrl } from '../../services/cosService';
import { editImage } from '../../services/imageService';
import { requireAuth } from '../../utils/authCheck';
import { imageLibraryService } from '../../services/imageLibraryService';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { LANGUAGES, getSavedLanguage, saveLanguage } from '../../constants/languages';

interface StrokePoint {
  x: number;
  y: number;
}

interface Stroke {
  id: string;
  points: StrokePoint[];
  brushSize: number;
}

type EditMode = 'text' | 'replace';
type DrawTool = 'brush' | 'eraser';

export const ImageEditRegionPage: React.FC = () => {
  // 上传的原图
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [imageScale, setImageScale] = useState(1);

  // 画笔
  const [drawTool, setDrawTool] = useState<DrawTool>('brush');
  const [brushSize, setBrushSize] = useState(30);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<StrokePoint[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  // 编辑面板
  const [editMode, setEditMode] = useState<EditMode>('text');
  const [editText, setEditText] = useState('');
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replacePreview, setReplacePreview] = useState<string | null>(null);

  // 生成
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [language, setLanguage] = useState(getSavedLanguage());

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const sourceImgRef = useRef<HTMLImageElement | null>(null);

  // 绘制 canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas || !maskCanvas || !sourceImage) return;

    const ctx = canvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    if (!ctx || !maskCtx) return;

    const img = new Image();
    img.onload = () => {
      sourceImgRef.current = img;
      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.clientWidth - 2;
      const containerHeight = container.clientHeight - 2;

      const scaleX = containerWidth / img.width;
      const scaleY = containerHeight / img.height;
      const scale = Math.min(scaleX, scaleY, 1);

      const displayWidth = img.width * scale;
      const displayHeight = img.height * scale;

      setImageScale(scale);

      canvas.width = displayWidth;
      canvas.height = displayHeight;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      maskCanvas.width = displayWidth;
      maskCanvas.height = displayHeight;

      // 绘制原图（无遮罩）
      ctx.clearRect(0, 0, displayWidth, displayHeight);
      ctx.drawImage(img, 0, 0, displayWidth, displayHeight);

      // 用独立的临时 canvas 画笔画区域高亮
      const hasAnyStrokes = strokes.length > 0 || currentStroke.length >= 2;
      if (hasAnyStrokes) {
        const hlCanvas = document.createElement('canvas');
        hlCanvas.width = displayWidth;
        hlCanvas.height = displayHeight;
        const hlCtx = hlCanvas.getContext('2d')!;

        // 在临时 canvas 上画所有笔画（白色）
        hlCtx.strokeStyle = '#FFFFFF';
        hlCtx.lineCap = 'round';
        hlCtx.lineJoin = 'round';

        const drawStrokePath = (points: StrokePoint[], width: number) => {
          if (points.length < 2) return;
          hlCtx.lineWidth = width;
          hlCtx.beginPath();
          hlCtx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            const p0 = points[i - 1];
            const p1 = points[i];
            hlCtx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
          }
          hlCtx.stroke();
        };

        strokes.forEach(s => drawStrokePath(s.points, s.brushSize * scale));
        drawStrokePath(currentStroke, brushSize * scale);

        // source-in: 只保留笔画区域内的亮青色
        hlCtx.globalCompositeOperation = 'source-in';
        hlCtx.fillStyle = 'rgba(0, 212, 255, 0.5)';
        hlCtx.fillRect(0, 0, displayWidth, displayHeight);

        // 叠加到主 canvas
        ctx.drawImage(hlCanvas, 0, 0);

        // 画笔画描边
        ctx.strokeStyle = 'rgba(0, 212, 255, 1)';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        strokes.forEach(stroke => {
          if (stroke.points.length < 2) return;
          ctx.lineWidth = Math.max(2, stroke.brushSize * scale * 0.12);
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < stroke.points.length; i++) {
            const p0 = stroke.points[i - 1];
            const p1 = stroke.points[i];
            ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
          }
          ctx.stroke();
        });
        if (currentStroke.length >= 2) {
          ctx.lineWidth = Math.max(2, brushSize * scale * 0.12);
          ctx.beginPath();
          ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
          for (let i = 1; i < currentStroke.length; i++) {
            const p0 = currentStroke[i - 1];
            const p1 = currentStroke[i];
            ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
          }
          ctx.stroke();
        }

        // 绘制每个区域的编号标签
        strokes.forEach((stroke, idx) => {
          if (stroke.points.length < 1) return;
          // 计算笔画中心点
          let cx = 0, cy = 0;
          stroke.points.forEach(p => { cx += p.x; cy += p.y; });
          cx /= stroke.points.length;
          cy /= stroke.points.length;

          const radius = 14;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0, 212, 255, 1)';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 13px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${idx + 1}`, cx, cy);
        });
      }
    };
    img.src = sourceImage;
  }, [sourceImage, strokes, currentStroke, brushSize]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => drawCanvas());
    observer.observe(container);
    return () => observer.disconnect();
  }, [drawCanvas]);

  // 生成 mask 图片（白色=选区，黑色=其他）
  const generateMaskImage = (): string | null => {
    const canvas = canvasRef.current;
    const sourceImg = sourceImgRef.current;
    if (!canvas || !sourceImg) return null;

    // 创建与原图等大的 mask
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = sourceImg.width;
    maskCanvas.height = sourceImg.height;
    const ctx = maskCanvas.getContext('2d')!;

    // 全黑背景
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    // 白色笔画 = 选区
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      // 将显示坐标转回原图坐标
      ctx.lineWidth = stroke.brushSize;
      ctx.beginPath();
      const sx = stroke.points[0].x / imageScale;
      const sy = stroke.points[0].y / imageScale;
      ctx.moveTo(sx, sy);
      for (let i = 1; i < stroke.points.length; i++) {
        const px = stroke.points[i].x / imageScale;
        const py = stroke.points[i].y / imageScale;
        const p0x = stroke.points[i - 1].x / imageScale;
        const p0y = stroke.points[i - 1].y / imageScale;
        ctx.quadraticCurveTo(p0x, p0y, (p0x + px) / 2, (p0y + py) / 2);
      }
      ctx.stroke();
    });

    return maskCanvas.toDataURL('image/png');
  };

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // 画笔/橡皮事件
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasCoords(e);
    setIsDrawing(true);

    if (drawTool === 'eraser') {
      // 橡皮：检查并删除被触碰的笔画
      const eraseRadius = brushSize / 2;
      setStrokes(prev => prev.filter(stroke => {
        return !stroke.points.some(p => {
          const dx = p.x - pos.x;
          const dy = p.y - pos.y;
          return Math.sqrt(dx * dx + dy * dy) < eraseRadius + (stroke.brushSize * imageScale) / 2;
        });
      }));
      return;
    }

    setCurrentStroke([pos]);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const pos = getCanvasCoords(e);

    if (drawTool === 'eraser') {
      // 橡皮持续擦除
      const eraseRadius = brushSize / 2;
      setStrokes(prev => prev.filter(stroke => {
        return !stroke.points.some(p => {
          const dx = p.x - pos.x;
          const dy = p.y - pos.y;
          return Math.sqrt(dx * dx + dy * dy) < eraseRadius + (stroke.brushSize * imageScale) / 2;
        });
      }));
      return;
    }

    setCurrentStroke(prev => [...prev, pos]);
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (drawTool !== 'eraser' && currentStroke.length >= 2) {
      const newStroke: Stroke = {
        id: `stroke-${Date.now()}`,
        points: currentStroke,
        brushSize,
      };
      setStrokes(prev => [...prev, newStroke]);
    }
    setCurrentStroke([]);
  };

  // 触摸事件支持
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    setIsDrawing(true);

    if (drawTool === 'eraser') {
      const eraseRadius = brushSize / 2;
      setStrokes(prev => prev.filter(stroke => {
        return !stroke.points.some(p => {
          const dx = p.x - pos.x;
          const dy = p.y - pos.y;
          return Math.sqrt(dx * dx + dy * dy) < eraseRadius + (stroke.brushSize * imageScale) / 2;
        });
      }));
      return;
    }

    setCurrentStroke([pos]);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    const touch = e.touches[0];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };

    if (drawTool === 'eraser') {
      const eraseRadius = brushSize / 2;
      setStrokes(prev => prev.filter(stroke => {
        return !stroke.points.some(p => {
          const dx = p.x - pos.x;
          const dy = p.y - pos.y;
          return Math.sqrt(dx * dx + dy * dy) < eraseRadius + (stroke.brushSize * imageScale) / 2;
        });
      }));
      return;
    }

    setCurrentStroke(prev => [...prev, pos]);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    handleMouseUp();
  };

  // 上传图片
  const handleSourceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 20 * 1024 * 1024) {
      alert('图片超过 20MB，请压缩后重新上传');
      return;
    }
    setSourceFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setSourceImage(reader.result as string);
      const img = new window.Image();
      img.onload = () => setImageSize({ width: img.width, height: img.height });
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    setStrokes([]);
    setCurrentStroke([]);
    setResultImage(null);
    setEditText('');
    setReplaceFile(null);
    setReplacePreview(null);
    e.target.value = '';
  };

  const handleReplaceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setReplaceFile(file);
    const reader = new FileReader();
    reader.onload = () => setReplacePreview(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 撤销最后一笔
  const undoLastStroke = () => {
    setStrokes(prev => prev.slice(0, -1));
  };

  // 清除所有笔画
  const clearAllStrokes = () => {
    setStrokes([]);
    setCurrentStroke([]);
  };

  // 获取每笔选区的独立边界框（百分比）
  const getPerStrokeBBoxes = (): Array<{ left: number; top: number; right: number; bottom: number }> => {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) return [];

    return strokes.map(stroke => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      stroke.points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
      const pad = (stroke.brushSize || brushSize) * imageScale / 2;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(canvas.width, maxX + pad);
      maxY = Math.min(canvas.height, maxY + pad);
      return {
        left: Math.round((minX / canvas.width) * 100),
        top: Math.round((minY / canvas.height) * 100),
        right: Math.round((maxX / canvas.width) * 100),
        bottom: Math.round((maxY / canvas.height) * 100),
      };
    });
  };

  // 获取合并的总边界框
  const getSelectionBBox = (): { left: number; top: number; right: number; bottom: number } | null => {
    const boxes = getPerStrokeBBoxes();
    if (boxes.length === 0) return null;
    return {
      left: Math.min(...boxes.map(b => b.left)),
      top: Math.min(...boxes.map(b => b.top)),
      right: Math.max(...boxes.map(b => b.right)),
      bottom: Math.max(...boxes.map(b => b.bottom)),
    };
  };

  // 将像素尺寸转换为最近的标准比例
  const getStandardRatio = (w: number, h: number): string => {
    const ratios: [string, number][] = [
      ['1:1', 1], ['4:3', 4/3], ['3:4', 3/4], ['16:9', 16/9], ['9:16', 9/16],
      ['3:2', 3/2], ['2:3', 2/3], ['5:4', 5/4], ['4:5', 4/5],
    ];
    const r = w / h;
    let best = ratios[0];
    let bestDiff = Math.abs(r - ratios[0][1]);
    for (const item of ratios) {
      const diff = Math.abs(r - item[1]);
      if (diff < bestDiff) { bestDiff = diff; best = item; }
    }
    return best[0];
  };

  // 生成编辑
  const handleGenerate = async () => {
    if (!requireAuth()) return;
    if (!sourceImage) return;
    if (strokes.length === 0) { alert('请先用画笔涂抹要编辑的区域'); return; }

    let imageDataUrl = sourceImage;
    if (sourceFile && !sourceImage.startsWith('data:')) {
      imageDataUrl = await fileToDataUrl(sourceFile, 2048);
    }

    setIsProcessing(true);
    setResultImage(null);

    try {
      const perStrokeBoxes = getPerStrokeBBoxes();
      const locationDesc = perStrokeBoxes.length > 0
        ? perStrokeBoxes.length === 1
          ? `在图片的区域（左${perStrokeBoxes[0].left}%上${perStrokeBoxes[0].top}%右${perStrokeBoxes[0].right}%下${perStrokeBoxes[0].bottom}%）`
          : `在图片的${perStrokeBoxes.length}个区域分别进行修改：${perStrokeBoxes.map((b, i) => `区域${i + 1}（左${b.left}%上${b.top}%右${b.right}%下${b.bottom}%）`).join('、')}`
        : '在图片中画笔涂抹的区域';

      if (editMode === 'text') {
        if (!editText.trim()) {
          alert('请输入编辑描述');
          setIsProcessing(false);
          return;
        }
        const prompt = `${locationDesc}内进行修改：${editText.trim()}。只修改涂抹区域的内容，保持图片其他部分完全不变。`;
        setProgress('正在AI编辑中...');

        const images = [imageDataUrl];
        const response = await editImage({
          prompt,
          images,
          model: 'nanobann2',
          aspectRatio: getStandardRatio(imageSize.width, imageSize.height),
          resolution: '2K',
        });

        const url = response.data?.[0]?.url || response.image_url || response.url || '';
        if (url) {
          setResultImage(url);
          imageLibraryService.saveToLibrary({
            image_url: url,
            prompt,
            model: 'nanobann2',
            aspect_ratio: getStandardRatio(imageSize.width, imageSize.height),
            resolution: '2K',
            type: 'edited',
          });
        }
      } else {
        if (!replaceFile) {
          alert('请上传替换产品图');
          setIsProcessing(false);
          return;
        }
        const replaceDataUrl = await fileToDataUrl(replaceFile, 1024);
        const userDesc = editText.trim() || '替换为上传的产品';
        const prompt = `将${locationDesc}中的物体替换为第二张图中的产品。${userDesc}。保持图片其他部分完全不变，让替换后的产品自然融入原图场景，光影和透视保持一致。`;
        setProgress('正在AI替换中...');

        const images = [imageDataUrl, replaceDataUrl];
        const response = await editImage({
          prompt,
          images,
          model: 'nanobann2',
          aspectRatio: getStandardRatio(imageSize.width, imageSize.height),
          resolution: '2K',
        });

        const url = response.data?.[0]?.url || response.image_url || response.url || '';
        if (url) {
          setResultImage(url);
          imageLibraryService.saveToLibrary({
            image_url: url,
            prompt,
            model: 'nanobann2',
            aspect_ratio: getStandardRatio(imageSize.width, imageSize.height),
            resolution: '2K',
            type: 'edited',
          });
        }
      }
    } catch (err: any) {
      console.error('编辑失败:', err);
      alert('编辑失败: ' + (err.message || '请稍后重试'));
    } finally {
      setIsProcessing(false);
      setProgress('');
    }
  };

  const handleDownload = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `edit-region-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  const hasStrokes = strokes.length > 0;

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-14 border-b border-[#E5E5E5] flex-shrink-0 bg-[#F7F7F7]">
        <div className="w-8 h-8 rounded-xl bg-gray-900 flex items-center justify-center">
          <Wand2 size={16} className="text-white" />
        </div>
        <h1 className="text-base font-semibold text-[#171717]">区域编辑</h1>
        <span className="text-xs text-[#A3A3A3]">画笔涂抹要修改的区域，AI智能编辑</span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: 图片 + 画笔 + 编辑面板 */}
        <div className="w-[620px] border-r border-[#E5E5E5] flex flex-col flex-shrink-0 bg-[#FAFAFA] overflow-y-auto">
          {!sourceImage ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <input type="file" ref={fileInputRef} onChange={handleSourceUpload} accept="image/*" className="hidden" />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full max-w-sm border-2 border-dashed border-[#E5E5E5] bg-white rounded-2xl p-10 flex flex-col items-center justify-center gap-4 hover:border-[#6366F1]/40 hover:bg-[#F5F3FF] transition-all cursor-pointer"
              >
                <div className="w-16 h-16 rounded-2xl bg-[#F0EFFF] flex items-center justify-center">
                  <Upload size={28} className="text-[#6366F1]" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-[#171717] mb-1">上传图片开始编辑</p>
                  <p className="text-xs text-[#A3A3A3]">支持 JPG、PNG，最大 20MB</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* 画笔工具栏 */}
              <div className="px-4 pt-3 pb-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ImageIcon size={14} className="text-[#6366F1]" />
                    <span className="text-xs font-medium text-[#525252]">
                      {imageSize.width} × {imageSize.height}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={undoLastStroke}
                      disabled={strokes.length === 0}
                      className="text-xs text-[#A3A3A3] hover:text-[#171717] px-2 py-1 rounded-lg hover:bg-white transition-colors disabled:opacity-40"
                      title="撤销上一笔"
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      onClick={clearAllStrokes}
                      disabled={strokes.length === 0}
                      className="text-xs text-[#A3A3A3] hover:text-red-500 px-2 py-1 rounded-lg hover:bg-white transition-colors disabled:opacity-40"
                      title="清除涂抹"
                    >
                      <X size={13} />
                    </button>
                    <button
                      onClick={() => {
                        setSourceImage(null);
                        setSourceFile(null);
                        setStrokes([]);
                        setCurrentStroke([]);
                        setResultImage(null);
                      }}
                      className="text-xs text-[#A3A3A3] hover:text-[#171717] px-2 py-1 rounded-lg hover:bg-white transition-colors"
                      title="更换图片"
                    >
                      <Upload size={13} />
                    </button>
                  </div>
                </div>

                {/* 画笔/橡皮切换 + 大小 */}
                <div className="flex items-center gap-3 bg-white rounded-xl p-2 border border-[#E5E5E5]">
                  <button
                    onClick={() => setDrawTool('brush')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      drawTool === 'brush'
                        ? 'bg-[#6366F1] text-white shadow-sm'
                        : 'text-[#737373] hover:bg-[#F5F5F5]'
                    }`}
                  >
                    <Paintbrush size={13} /> 画笔
                  </button>
                  <button
                    onClick={() => setDrawTool('eraser')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      drawTool === 'eraser'
                        ? 'bg-red-500 text-white shadow-sm'
                        : 'text-[#737373] hover:bg-[#F5F5F5]'
                    }`}
                  >
                    <Eraser size={13} /> 橡皮
                  </button>
                  <div className="flex-1 flex items-center gap-2 px-2">
                    <span className="text-[11px] text-[#A3A3A3] whitespace-nowrap">大小</span>
                    <input
                      type="range"
                      min={5}
                      max={80}
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="flex-1 h-1 accent-[#6366F1]"
                    />
                    <span className="text-[11px] text-[#525252] w-6 text-right">{brushSize}</span>
                  </div>
                </div>
              </div>

              {/* 画布 */}
              <div className="px-4 pb-2">
                <div
                  ref={containerRef}
                  className="relative bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden"
                  style={{ height: 480 }}
                >
                  <canvas
                    ref={canvasRef}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{ cursor: drawTool === 'brush' ? 'crosshair' : 'cell' }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  />
                  {/* 隐藏的 mask canvas */}
                  <canvas ref={maskCanvasRef} className="hidden" />
                </div>
                {hasStrokes && (
                  <p className="text-[11px] text-[#00B4D8] text-center mt-1.5 font-medium">
                    已涂抹 {strokes.length} 笔 · 青色区域为选区
                  </p>
                )}
              </div>

              {/* 编辑面板 */}
              {hasStrokes && (
                <div className="px-4 pb-2">
                  <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-sm overflow-hidden">
                    <div className="flex border-b border-[#F0F0F0]">
                      <button
                        onClick={() => setEditMode('text')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors ${
                          editMode === 'text'
                            ? 'text-[#6366F1] border-b-2 border-[#6366F1] bg-[#F5F3FF]/50'
                            : 'text-[#A3A3A3] hover:text-[#525252]'
                        }`}
                      >
                        <Type size={14} />
                        文字编辑
                      </button>
                      <button
                        onClick={() => setEditMode('replace')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors ${
                          editMode === 'replace'
                            ? 'text-[#6366F1] border-b-2 border-[#6366F1] bg-[#F5F3FF]/50'
                            : 'text-[#A3A3A3] hover:text-[#525252]'
                        }`}
                      >
                        <Replace size={14} />
                        产品替换
                      </button>
                    </div>

                    <div className="p-4 space-y-3">
                      {editMode === 'text' ? (
                        <>
                          <div>
                            <label className="text-xs font-medium text-[#525252] mb-1.5 block">
                              描述你想要的修改
                            </label>
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              placeholder="例如：将可乐改为雪碧、把红色改成蓝色、添加logo..."
                              className="w-full bg-[#F5F5F5] rounded-xl p-3 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 resize-none text-[#171717] placeholder:text-[#BDBDBD]"
                              rows={3}
                            />
                          </div>
                          <p className="text-[11px] text-[#A3A3A3] leading-relaxed">
                            AI 将只修改涂抹区域内的内容，保持图片其他部分不变。涂抹多个区域时，可用"区域1改为XX，区域2改为XX"分别描述
                          </p>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="text-xs font-medium text-[#525252] mb-1.5 block">
                              上传替换产品图
                            </label>
                            <input
                              type="file"
                              ref={replaceInputRef}
                              onChange={handleReplaceUpload}
                              accept="image/*"
                              className="hidden"
                            />
                            {replacePreview ? (
                              <div className="relative group">
                                <div className="w-full h-28 rounded-xl overflow-hidden bg-[#F5F5F5] border border-[#E5E5E5]">
                                  <img src={replacePreview} alt="" className="w-full h-full object-contain" />
                                </div>
                                <button
                                  onClick={() => { setReplaceFile(null); setReplacePreview(null); }}
                                  className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X size={10} className="text-white" />
                                </button>
                              </div>
                            ) : (
                              <div
                                onClick={() => replaceInputRef.current?.click()}
                                className="border-2 border-dashed border-[#E5E5E5] bg-[#FAFAFA] rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 hover:border-[#6366F1]/30 transition-all cursor-pointer"
                              >
                                <Plus size={18} className="text-[#A3A3A3]" />
                                <span className="text-xs text-[#A3A3A3]">点击上传产品图</span>
                              </div>
                            )}
                          </div>
                          <div>
                            <label className="text-xs font-medium text-[#525252] mb-1.5 block">
                              补充描述（可选）
                            </label>
                            <input
                              type="text"
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              placeholder="例如：将可乐替换为这个布娃娃"
                              className="w-full bg-[#F5F5F5] rounded-xl px-3 py-2.5 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 text-[#171717] placeholder:text-[#BDBDBD]"
                            />
                          </div>
                          <p className="text-[11px] text-[#A3A3A3] leading-relaxed">
                            AI 将用上传的产品替换涂抹区域的物体，保持自然融合
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 语言选择 */}
              <div className="px-4 pb-2">
                <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-sm p-4">
                  <label className="text-xs font-medium text-[#525252] mb-1.5 block">语言</label>
                  <select value={language} onChange={(e) => { setLanguage(e.target.value); saveLanguage(e.target.value); }}
                    className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 appearance-none cursor-pointer">
                    {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
              </div>

              {/* 生成按钮 */}
              <div className="px-4 pb-4">
                <button
                  onClick={handleGenerate}
                  disabled={!sourceImage || !hasStrokes || isProcessing}
                  className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-[#E5E5E5] disabled:text-[#A3A3A3] disabled:cursor-not-allowed shadow-sm"
                >
                  {isProcessing ? (
                    <><Loader2 size={18} className="animate-spin" /> {progress}</>
                  ) : (
                    <><Sparkles size={18} /> 开始编辑</>
                  )}
                </button>
                {!hasStrokes && sourceImage && (
                  <p className="text-xs text-[#A3A3A3] text-center mt-2">请先用画笔涂抹要编辑的区域</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: 结果展示 */}
        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
          {!resultImage && !isProcessing ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-xs px-6">
                <div className="w-20 h-20 mx-auto mb-5 bg-[#F5F3FF] rounded-2xl flex items-center justify-center">
                  <Wand2 size={32} className="text-[#C4B5FD]" />
                </div>
                <h2 className="text-lg font-semibold text-[#171717] mb-2">区域编辑</h2>
                <p className="text-sm text-[#A3A3A3] mb-4 leading-relaxed">
                  上传图片，用画笔涂抹需要修改的区域，AI 智能完成编辑
                </p>
                <div className="text-left bg-[#FAFAFA] rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#6366F1] text-white text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                    <p className="text-xs text-[#737373]">上传一张需要编辑的图片</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#6366F1] text-white text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                    <p className="text-xs text-[#737373]">用画笔涂抹要修改的区域（支持多次涂抹）</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#6366F1] text-white text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                    <p className="text-xs text-[#737373]">输入修改描述或上传产品替换图</p>
                  </div>
                </div>
              </div>
            </div>
          ) : isProcessing ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-gradient-to-r from-[#6366F1]/10 to-[#8B5CF6]/10 rounded-full blur-3xl animate-pulse" />
                <div className="relative w-24 h-24 rounded-full border-4 border-[#E5E5E5] border-t-[#6366F1] border-r-[#8B5CF6] animate-spin" />
              </div>
              <div className="flex flex-col items-center gap-2 mb-6">
                <h3 className="text-lg font-semibold text-[#171717]">
                  {editMode === 'text' ? 'AI 正在编辑' : 'AI 正在替换'}
                </h3>
                <p className="text-sm text-[#A3A3A3]">{progress || '处理中...'}</p>
              </div>
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#6366F1] animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-[#8B5CF6] animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-[#A78BFA] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          ) : resultImage ? (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[#171717]">编辑结果</h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPreviewImage(resultImage)}
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-[#A3A3A3] hover:bg-[#F0F0F0] hover:text-[#171717] transition-colors"
                    title="预览"
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    onClick={() => handleDownload(resultImage)}
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-[#A3A3A3] hover:bg-[#F0F0F0] hover:text-[#171717] transition-colors"
                    title="下载"
                  >
                    <Download size={15} />
                  </button>
                </div>
              </div>
              <div className="bg-[#FAFAFA] rounded-2xl overflow-hidden border border-[#E5E5E5]">
                <img
                  src={resultImage}
                  alt="编辑结果"
                  className="w-full h-auto cursor-pointer"
                  onClick={() => setPreviewImage(resultImage)}
                />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => {
                    setSourceImage(resultImage);
                    setStrokes([]);
                    setCurrentStroke([]);
                    setResultImage(null);
                    setEditText('');
                    setReplaceFile(null);
                    setReplacePreview(null);
                    const img = new window.Image();
                    img.onload = () => setImageSize({ width: img.width, height: img.height });
                    img.src = resultImage;
                  }}
                  className="flex-1 bg-[#F5F5F5] text-[#525252] py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#EEEEEE] transition-colors"
                >
                  <Wand2 size={15} /> 继续编辑此图
                </button>
                <button
                  onClick={() => handleDownload(resultImage)}
                  className="flex-1 bg-[#171717] text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#27272A] transition-colors"
                >
                  <Download size={15} /> 下载结果
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {previewImage && (
          <ImagePreviewModal
            isOpen={!!previewImage}
            onClose={() => setPreviewImage(null)}
            imageUrl={previewImage}
          />
        )}
      </div>
    </div>
  );
};

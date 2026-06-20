import React, { useState, useRef } from 'react';
import { Sparkles, X, Loader2, Plus, Image as ImageIcon, Check, Eye, Wand2, User } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { requireAuth } from '../../utils/authCheck';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import ModelLibraryPicker from '../../components/ModelLibraryPicker';
import { LANGUAGES, getSavedLanguage, saveLanguage } from '../../constants/languages';
import { EcommerceImageUpload, EcommerceSettings, EcommerceResults } from '../../components/ecommerce';
import { LoadingAnimation } from '../../components/LoadingAnimation';

const ASPECT_RATIO_OPTIONS = [
  { value: '3:4', label: '3:4 竖版' },
  { value: '9:16', label: '9:16 手机屏' },
  { value: '16:9', label: '16:9 横版' },
];

interface ProductTryonImage {
  file: File;
  preview: string;
  desc: string;
}

export const ProductTryonPage: React.FC = () => {
  // 模特生成相关状态
  const [modelRefImages, setModelRefImages] = useState<ProductTryonImage[]>([]);
  const [modelBodyType, setModelBodyType] = useState<'半身' | '全身'>('全身');
  const [modelCount, setModelCount] = useState(1);
  const [generatedModels, setGeneratedModels] = useState<string[]>([]);
  const [isGeneratingModel, setIsGeneratingModel] = useState(false);
  const [selectedGeneratedModel, setSelectedGeneratedModel] = useState<string | null>(null);
  const [previewModelImage, setPreviewModelImage] = useState<string | null>(null);
  
  // 最终模特（可能是上传的单图或生成的）
  const [finalModelImage, setFinalModelImage] = useState<ProductTryonImage | null>(null);
  const [uploadedModelBodyType, setUploadedModelBodyType] = useState<'半身' | '全身' | null>(null);
  
  // 产品图片相关
  const [productImages, setProductImages] = useState<ProductTryonImage[]>([]);
  
  // 其他设置
  const [userRequirement, setUserRequirement] = useState('');
  const [aspectRatio, setAspectRatio] = useState('3:4');
  const [quality, setQuality] = useState('2K');
  const [selectedModel, setSelectedModel] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<{ url: string; label: string }[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);
  const [showModelLibrary, setShowModelLibrary] = useState(false);
  const [showModelLibraryRef, setShowModelLibraryRef] = useState(false);
  const [language, setLanguage] = useState(getSavedLanguage());
  
  // 生成类型选择
  const [genTypes, setGenTypes] = useState({
    scene: true,    // 固定场景
    pose1: true,    // 姿势1
    pose2: true,    // 姿势2
    fabric: true,   // 面料质感
    collar: true,   // 领口袖口
    pattern: true,  // 图案印花
    craft: true,    // 做工细节
    cut: true       // 版型剪裁
  });
  
  const selectedTypeCount = Object.values(genTypes).filter(Boolean).length;
  
  const modelRefFileRef = useRef<HTMLInputElement>(null);
  const finalModelFileRef = useRef<HTMLInputElement>(null);

  // 上传模特参考图片（用于融合生成真实模特）
  const handleModelRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files;
    if (!inputFiles) return;
    const files: File[] = [];
    for (let i = 0; i < inputFiles.length; i++) {
      const file = inputFiles[i];
      if (file.type.startsWith('image/')) {
        files.push(file);
      }
    }
    if (files.length === 0) return;
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    const oversized = files.find((f: File) => f.size > MAX_FILE_SIZE);
    if (oversized) {
      alert(`图片"${oversized.name}"超过 20MB，请压缩后重新上传`);
      e.target.value = '';
      return;
    }
    const availableSlots = 10 - modelRefImages.length;
    if (availableSlots <= 0) {
      alert('最多只能上传10张图片');
      return;
    }
    const filesToAdd = files.slice(0, availableSlots);
    const newItems = filesToAdd.map((f: File) => ({ file: f, preview: '', desc: '' }));
    Promise.all(newItems.map(item => new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => { item.preview = reader.result as string; resolve(); };
      reader.onerror = reject;
      reader.readAsDataURL(item.file);
    }))).then(() => {
      setModelRefImages(prev => [...prev, ...newItems].slice(0, 10));
    }).catch(err => {
      console.error('图片处理失败:', err);
      alert('部分图片处理失败，请尝试使用更小的图片');
    });
    e.target.value = '';
  };

  const removeModelRef = (idx: number) => {
    setModelRefImages(prev => prev.filter((_, i) => i !== idx));
  };

  // 生成融合模特
  const handleGenerateModel = async () => {
    if (!requireAuth()) return;
    if (modelRefImages.length < 2) {
      alert('请至少上传2张模特参考图片进行融合');
      return;
    }
    
    setIsGeneratingModel(true);
    setGeneratedModels([]);
    
    try {
      const imageUrls = await Promise.all(modelRefImages.map(item => item.file ? fileToDataUrl(item.file, 1536) : Promise.resolve(item.preview)));
      
      const bodyTypeDesc = modelBodyType === '半身' 
        ? '必须是半身展示（腰部以上可见，包含头部、肩部、胸部及腰部以上部分）'
        : '必须是全身展示（完整身体可见，从头到脚）';
      
      const prompt = `根据上传的多张模特图片，分析模特的外貌特征（面部轮廓、五官、发型、体型等），生成一张全新的外国模特照片。

🔥 核心要求
- 分析所有上传图片中模特的共同外貌特征
- 基于这些特征，生成一个全新的外国模特形象
- ${bodyTypeDesc}
- 将模特置于第1张图片的场景中（保留第1张图的背景场景）

🔥 真人质感（最重要）
- 必须看起来像真人实拍照片，不能有AI生成感
- 保留真实的皮肤质感：原生毛孔、自然肌理、轻微肤色不均
- 五官要有自然的不对称性，拒绝完美对称的脸
- 光影过渡自然，像真实摄影
- 整体气质自然、真实、有生活感

🔥 输出要求
- 生成1张${modelBodyType}外国模特照片
- 背景场景与第1张图片一致
- 人物清晰，细节丰富
- 8K超高清画质

⚠️ 重要提示：第1张图片的场景背景会被保留，生成的模特将出现在该场景中。`;

      // 生成多张模特图片
      for (let i = 0; i < modelCount; i++) {
        try {
          const response = await editImage({
            prompt,
            images: imageUrls,
            type: 'edited',
            aspectRatio: '3:4',
            resolution: '4K',
            model: 'nanobann2'
          });
          
          if (response.data?.[0]?.url) {
            const modelUrl = response.data[0].url;
            imageLibraryService.saveToLibrary({ image_url: modelUrl, prompt, model: String('nanobann2'), aspect_ratio: String('3:4'), resolution: String('4K'), type: 'edited' });
            setGeneratedModels(prev => {
              const newModels = [...prev, modelUrl];
              // 第一张生成后自动选中
              if (newModels.length === 1) {
                setSelectedGeneratedModel(modelUrl);
                setFinalModelImage({ file: null as any, preview: modelUrl, desc: '' });
                setUploadedModelBodyType(modelBodyType);
              }
              return newModels;
            });
          }
        } catch (err) {
          console.error(`生成第${i + 1}张模特失败:`, err);
        }
      }
    } catch (error: any) {
      console.error('生成模特失败:', error);
      alert('生成失败: ' + (error.message || '请稍后重试'));
    } finally {
      setIsGeneratingModel(false);
    }
  };

  // 选择生成的模特
  const handleSelectGeneratedModel = (url: string) => {
    setSelectedGeneratedModel(url);
    // 直接用URL作为预览，file设为null标记这是生成的模特
    setFinalModelImage({ file: null as any, preview: url, desc: '' });
    setUploadedModelBodyType(modelBodyType);
  };

  // 上传最终模特图片（单张）
  const handleFinalModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files;
    if (!inputFiles || inputFiles.length === 0) return;
    const file = inputFiles[0];
    if (!file.type.startsWith('image/')) return;
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      alert(`图片"${file.name}"超过 20MB，请压缩后重新上传`);
      e.target.value = '';
      return;
    }
    const bodyType = window.confirm('这张模特图是半身还是全身？\n\n确定 = 全身\n取消 = 半身') ? '全身' : '半身';
    const reader = new FileReader();
    reader.onload = () => {
      setFinalModelImage({ file, preview: reader.result as string, desc: '' });
      setUploadedModelBodyType(bodyType);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeFinalModel = () => {
    setFinalModelImage(null);
    setSelectedGeneratedModel(null);
    setUploadedModelBodyType(null);
  };

  const handleSelectFromLibrary = (imageUrl: string) => {
    setFinalModelImage({ file: null as any, preview: imageUrl, desc: '' });
    setUploadedModelBodyType('全身');
  };

  const handleSelectRefFromLibrary = (urls: string | string[]) => {
    const imageUrls = Array.isArray(urls) ? urls : [urls]
    const availableSlots = 10 - modelRefImages.length
    const toAdd = imageUrls.slice(0, availableSlots)
    const newItems = toAdd.map(url => ({ file: null as any, preview: url, desc: '' }))
    setModelRefImages(prev => [...prev, ...newItems].slice(0, 10))
  }

  // 最终生成穿搭效果图
  const handleGenerate = async () => {
    if (!requireAuth()) return;
    if (!finalModelImage) { alert('请上传或生成模特图片'); return; }
    if (productImages.length === 0) { alert('请上传产品图片'); return; }
    
    setIsProcessing(true);
    setResults([]);
    
    try {
      // 区分：上传的模特有File对象，生成的模特file为null用URL
      const modelUrl = finalModelImage.file 
        ? await fileToDataUrl(finalModelImage.file, 1536)
        : finalModelImage.preview;
      const productUrls = await Promise.all(productImages.map(item => item.file ? fileToDataUrl(item.file, 1536) : Promise.resolve(item.preview)));
      
      const requirementDesc = userRequirement ? `\n用户需求：${userRequirement}` : '';
      
      // 如果用户上传了模特，使用上传模特的身体类型；否则使用选择的类型
      const effectiveBodyType = uploadedModelBodyType || modelBodyType;
      
      for (let p = 0; p < productUrls.length; p++) {
        const productUrl = productUrls[p];
        
        // 定义所有生成类型及对应prompt
        const allGenerationTypes = [
          {
            key: 'scene',
            type: '固定场景',
            prompt: `固定场景穿搭效果展示。

模特图片：第1张
产品图片：第2张

🔥 场景要求（必须严格遵守）
- 固定场景：浅色木地板地面 + 白色/米白色落地窗帘背景
- 场景必须统一：所有图都使用相同的背景环境
- 模特站在场景中央，${effectiveBodyType}展示

🔥 穿搭要求
将产品（第2张图片中的产品）穿/戴在模特（第1张图片中的人物）身上，模特穿着该产品站在固定场景中展示。${requirementDesc}

🔥 产品一致性
【最重要】产品本身必须100%保持不变：产品造型、颜色、材质、纹理、尺寸比例、文字图案完全不变，产品不能有任何变形或变化。产品在画面中完整清晰展示，所有细节可见。

🔥 模特一致性
模特的面部特征、发型、体型、肤色必须与原图保持一致，不能改变模特的个人特征。

🔥 真人质感
真人实拍风格，自然窗光/柔光板散射光，非影棚人工补光，无AI光感，光影过渡真实自然，像真人实拍照片。原生毛孔，自然肌理，轻微肤色不均，无磨皮，真人抓拍感。

🔥 画质要求
8K 超高清画质，商业广告摄影标准，呈现逼真的照片效果，画面清晰聚焦，细节丰富，色彩还原度高，无失真、无变形。`
          },
          {
            key: 'pose1',
            type: '姿势1',
            prompt: `模特姿势变体图 - 姿势一。

模特图片：第1张
产品图片：第2张

🔥 场景要求
- 固定场景：浅色木地板地面 + 白色/米白色落地窗帘背景
- 与场景图保持一致的背景环境

🔥 穿搭要求
将产品（第2张图片中的产品）穿/戴在模特（第1张图片中的人物）身上。${requirementDesc}

🔥 姿势要求（核心差异）
- 模特采用不同的站姿/坐姿/侧身等姿势展示产品
- 姿势自然优雅，像专业模特摆拍
- 产品在该姿势下完整展示，细节清晰可见

🔥 产品一致性
【最重要】产品本身必须100%保持不变：产品造型、颜色、材质、纹理、尺寸比例、文字图案完全不变，产品不能有任何变形或变化。

🔥 模特一致性
模特的面部特征、发型、体型、肤色必须与原图保持一致，不能改变模特的个人特征。

🔥 真人质感
真人实拍风格，自然窗光/柔光板散射光，非影棚人工补光，无AI光感，光影过渡真实自然，像真人实拍照片。原生毛孔，自然肌理，轻微肤色不均，无磨皮，真人抓拍感。

🔥 画质要求
8K 超高清画质，商业广告摄影标准，呈现逼真的照片效果，画面清晰聚焦，细节丰富，色彩还原度高，无失真、无变形。`
          },
          {
            key: 'pose2',
            type: '姿势2',
            prompt: `模特姿势变体图 - 姿势二。

模特图片：第1张
产品图片：第2张

🔥 场景要求
- 固定场景：浅色木地板地面 + 白色/米白色落地窗帘背景
- 与场景图保持一致的背景环境

🔥 穿搭要求
将产品（第2张图片中的产品）穿/戴在模特（第1张图片中的人物）身上。${requirementDesc}

🔥 姿势要求（核心差异）
- 模特采用另一种不同的站姿/坐姿/走动等姿势展示产品
- 与姿势一完全不同的姿态，避免重复
- 姿势自然优雅，像专业模特摆拍
- 产品在该姿势下完整展示，细节清晰可见

🔥 产品一致性
【最重要】产品本身必须100%保持不变：产品造型、颜色、材质、纹理、尺寸比例、文字图案完全不变，产品不能有任何变形或变化。

🔥 模特一致性
模特的面部特征、发型、体型、肤色必须与原图保持一致，不能改变模特的个人特征。

🔥 真人质感
真人实拍风格，自然窗光/柔光板散射光，非影棚人工补光，无AI光感，光影过渡真实自然，像真人实拍照片。原生毛孔，自然肌理，轻微肤色不均，无磨皮，真人抓拍感。

🔥 画质要求
8K 超高清画质，商业广告摄影标准，呈现逼真的照片效果，画面清晰聚焦，细节丰富，色彩还原度高，无失真、无变形。`
          },
          {
            key: 'fabric',
            type: '面料质感',
            prompt: `产品穿搭细节特写 - 面料质感。

模特图片：第1张
产品图片：第2张

🔥 穿搭要求
将产品（第2张图片中的产品）穿/戴在模特（第1张图片中的人物）身上。${requirementDesc}

🔥 细节特写要求
- 拉近镜头，聚焦在产品面料的质感上
- 展示面料的纹理、材质、光泽、手感
- 清晰呈现面料的真实质感，如针织纹理、棉麻质感、丝绸光泽等
- 产品不能有任何变形或变化

🔥 真人质感
真人实拍风格，自然光线，光影过渡真实自然，像真人实拍照片。

🔥 画质要求
8K 超高清画质，细节丰富，色彩还原度高。`
          },
          {
            key: 'collar',
            type: '领口/袖口',
            prompt: `产品穿搭细节特写 - 领口/袖口。

模特图片：第1张
产品图片：第2张

🔥 穿搭要求
将产品（第2张图片中的产品）穿/戴在模特（第1张图片中的人物）身上。${requirementDesc}

🔥 细节特写要求
- 拉近镜头，聚焦在领口或袖口的细节设计上
- 展示领口/袖口的形状、做工、车缝线、扣子、装饰等
- 清晰呈现这些关键部位的设计细节
- 产品不能有任何变形或变化

🔥 真人质感
真人实拍风格，自然光线，光影过渡真实自然，像真人实拍照片。

🔥 画质要求
8K 超高清画质，细节丰富，色彩还原度高。`
          },
          {
            key: 'pattern',
            type: '图案/印花',
            prompt: `产品穿搭细节特写 - 图案/印花。

模特图片：第1张
产品图片：第2张

🔥 穿搭要求
将产品（第2张图片中的产品）穿/戴在模特（第1张图片中的人物）身上。${requirementDesc}

🔥 细节特写要求
- 拉近镜头，聚焦在产品上的图案、印花、刺绣、logo等装饰细节上
- 展示图案的清晰度、色彩、工艺（如印花质量、刺绣针法等）
- 清晰呈现图案的每一个细节
- 产品不能有任何变形或变化

🔥 真人质感
真人实拍风格，自然光线，光影过渡真实自然，像真人实拍照片。

🔥 画质要求
8K 超高清画质，细节丰富，色彩还原度高。`
          },
          {
            key: 'craft',
            type: '做工细节',
            prompt: `产品穿搭细节特写 - 做工细节。

模特图片：第1张
产品图片：第2张

🔥 穿搭要求
将产品（第2张图片中的产品）穿/戴在模特（第1张图片中的人物）身上。${requirementDesc}

🔥 细节特写要求
- 拉近镜头，聚焦在产品的做工细节上
- 展示车缝线、拉链、纽扣、口袋、拼接等工艺细节
- 清晰呈现产品的做工质量
- 产品不能有任何变形或变化

🔥 真人质感
真人实拍风格，自然光线，光影过渡真实自然，像真人实拍照片。

🔥 画质要求
8K 超高清画质，细节丰富，色彩还原度高。`
          },
          {
            key: 'cut',
            type: '版型剪裁',
            prompt: `产品穿搭细节特写 - 版型剪裁。

模特图片：第1张
产品图片：第2张

🔥 穿搭要求
将产品（第2张图片中的产品）穿/戴在模特（第1张图片中的人物）身上。${requirementDesc}

🔥 细节特写要求
- 拉近镜头，聚焦在产品的版型剪裁线条上
- 展示肩线、腰线、袖型、下摆等版型细节
- 清晰呈现产品的剪裁轮廓和立体感
- 产品不能有任何变形或变化

🔥 真人质感
真人实拍风格，自然光线，光影过渡真实自然，像真人实拍照片。

🔥 画质要求
8K 超高清画质，细节丰富，色彩还原度高。`
          }
        ];
        
        // 过滤出用户选中的类型
        const generationTypes = allGenerationTypes.filter(gen => gen.key in genTypes && genTypes[gen.key as keyof typeof genTypes]);
        
        // 为每个产品生成选中的图
        for (const gen of generationTypes) {
          try {
            const response = await editImage({ 
              prompt: gen.prompt, 
              images: [modelUrl, productUrl], 
              aspectRatio: aspectRatio, 
              resolution: quality, 
              model: selectedModel,
              type: 'edited',
            });
            
            if (response.data?.[0]?.url) {
              const finalUrl = response.data[0].url;
              setResults(prev => [{ url: finalUrl, label: gen.type }, ...prev]);
              imageLibraryService.saveToLibrary({ image_url: finalUrl, prompt: gen.prompt, model: String(selectedModel || 'nanobann2'), aspect_ratio: String(aspectRatio), resolution: String(quality || '2K'), type: 'edited' });
            }
          } catch (err) {
            console.error(`生成${gen.type}失败:`, err);
          }
        }
      }
    } catch (error: any) {
      console.error('生成失败:', error);
      alert('生成失败: ' + (error.message || '请稍后重试'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `tryon-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-[#E5E5E5] flex-shrink-0 bg-[#F7F7F7]">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center">
          <User size={16} className="text-white" />
        </div>
        <h1 className="text-base font-semibold text-[#171717]">产品穿搭</h1>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[380px] border-r border-[#E5E5E5] overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-[#FAFAFA]">
          
          {/* 模特生成区域 */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <User size={14} className="text-purple-500" />
              <span className="text-sm font-semibold text-[#171717]">模特生成（融合模特）</span>
            </div>
            <p className="text-xs text-[#A3A3A3] mb-2">上传多张参考图，AI生成全新外国模特形象</p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
              <p className="text-[10px] text-amber-700">
                ⚠️ 第1张图片的场景背景会被保留，生成的模特将出现在该场景中
              </p>
            </div>
            
            {/* 模特参考图上传 */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-[#525252]">参考图片</span>
                <span className="text-xs text-[#A3A3A3]">{modelRefImages.length}/10</span>
              </div>
              {modelRefImages.length > 0 && (
                <div className="grid grid-cols-5 gap-2 mb-2">
                  {modelRefImages.map((item, index) => (
                    <div key={index} className="relative group aspect-square rounded-xl overflow-hidden bg-[#F5F5F5]">
                      <img src={item.preview} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => removeModelRef(index)} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <X size={12} className="text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input type="file" ref={modelRefFileRef} onChange={handleModelRefUpload} multiple accept="image/*" className="hidden" />
              <div className="grid grid-cols-2 gap-2">
                <div onClick={() => modelRefFileRef.current?.click()}
                  className="bg-[#F3F0FF] hover:bg-[#EDE9FE] border border-[#DDD6FE] text-[#7C3AED] py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all">
                  <Plus size={14} />
                  <span className="text-[11px] font-medium">本地上传</span>
                </div>
                <div onClick={() => setShowModelLibraryRef(true)}
                  className="bg-[#F3F0FF] hover:bg-[#EDE9FE] border border-[#DDD6FE] text-[#7C3AED] py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all">
                  <ImageIcon size={14} />
                  <span className="text-[11px] font-medium">从模特库选择</span>
                </div>
              </div>
            </div>

            {/* 半身/全身选择 */}
            <div className="mb-3">
              <label className="text-xs font-medium text-[#525252] mb-1.5 block">展示方式</label>
              <div className="grid grid-cols-2 gap-2">
                {(['半身', '全身'] as const).map(type => (
                  <button key={type} onClick={() => setModelBodyType(type)}
                    className={`py-2 rounded-xl text-xs font-medium transition-all ${modelBodyType === type ? 'bg-purple-500 text-white' : 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'}`}>
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* 张数选择 */}
            <div className="mb-3">
              <label className="text-xs font-medium text-[#525252] mb-1.5 block">生成张数</label>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setModelCount(n)}
                    className={`py-2 rounded-xl text-xs font-medium transition-all ${modelCount === n ? 'bg-purple-500 text-white' : 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* 生成模特按钮 */}
            <button onClick={handleGenerateModel} disabled={modelRefImages.length < 2 || isGeneratingModel}
              className="w-full bg-purple-500 text-white py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 hover:bg-purple-600 transition-all disabled:bg-[#E5E5E5] disabled:text-[#A3A3A3] disabled:cursor-not-allowed">
              {isGeneratingModel ? <><Loader2 size={14} className="animate-spin" /> 生成中...</> : <><Sparkles size={14} /> 生成外国模特</>}
            </button>
            <p className="text-[10px] text-[#A3A3A3] text-center mt-1.5">建议上传2-5张不同角度的照片，第1张图片场景会被保留</p>
          </div>

          {/* 生成的模特选择区域 */}
          {generatedModels.length > 0 && (
            <div className="bg-white rounded-2xl p-4 border border-purple-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Check size={14} className="text-green-500" />
                <span className="text-sm font-semibold text-[#171717]">选择模特</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {generatedModels.map((url, idx) => (
                  <div key={idx} className="relative group">
                    <div 
                      onClick={() => handleSelectGeneratedModel(url)}
                      className={`aspect-[3/4] rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${selectedGeneratedModel === url ? 'border-purple-500 shadow-md' : 'border-transparent hover:border-gray-300'}`}>
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      {selectedGeneratedModel === url && (
                        <div className="absolute top-1 right-1 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                          <Check size={10} className="text-white" />
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setPreviewModelImage(url); }}
                      className="absolute bottom-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                      <Eye size={12} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[#A3A3A3] text-center mt-2">点击选择模特，悬停可预览大图</p>
            </div>
          )}

          {/* 最终模特图片（已选择或直接上传） */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <User size={14} className="text-blue-500" />
                <span className="text-sm font-semibold text-[#171717]">模特图片</span>
              </div>
              {(generatedModels.length > 0 || isGeneratingModel || modelRefImages.length > 0) && !finalModelImage && (
                <span className="text-[10px] text-[#A3A3A3] bg-[#F5F5F5] px-2 py-0.5 rounded-full">
                  {isGeneratingModel ? '模特生成中...' : modelRefImages.length > 0 ? '已上传参考图，请先生成模特' : '已生成模特，请选择上方模特'}
                </span>
              )}
            </div>
            
            {finalModelImage ? (
              <div className="relative">
                <div className="aspect-[3/4] rounded-xl overflow-hidden bg-[#F5F5F5]">
                  <img src={finalModelImage.preview} alt="" className="w-full h-full object-cover" />
                </div>
                <button onClick={removeFinalModel} 
                  className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-all">
                  <X size={12} className="text-white" />
                </button>
                <div className="absolute bottom-2 left-2 flex gap-1">
                  <div className="bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                    已就绪
                  </div>
                  {uploadedModelBodyType && (
                    <div className="bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                      {uploadedModelBodyType}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <input type="file" ref={finalModelFileRef} onChange={handleFinalModelUpload} accept="image/*" className="hidden" />
                <div className="grid grid-cols-2 gap-2">
                  <div onClick={() => finalModelFileRef.current?.click()}
                    className="bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] text-[#2563EB] py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all">
                    <User size={14} />
                    <span className="text-[11px] font-medium">本地上传</span>
                  </div>
                  <div onClick={() => setShowModelLibrary(true)}
                    className="bg-[#F3F0FF] hover:bg-[#EDE9FE] border border-[#DDD6FE] text-[#7C3AED] py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all">
                    <ImageIcon size={14} />
                    <span className="text-[11px] font-medium">从模特库选择</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 产品图片上传 */}
          <EcommerceImageUpload
            images={productImages as any}
            onImagesChange={(imgs) => setProductImages(imgs.map(img => ({ ...img, desc: '' })))}
            maxImages={10}
            title="产品图片"
            subtitle="1-10张产品照片"
            icon="image"
          />

          {/* 需求介绍 */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 size={14} className="text-amber-500" />
              <span className="text-sm font-semibold text-[#171717]">需求介绍</span>
            </div>
            <textarea
              value={userRequirement}
              onChange={(e) => setUserRequirement(e.target.value)}
              placeholder="描述您的穿搭需求，如：希望模特穿着产品在户外场景展示，自然光线下..."
              className="w-full bg-[#F5F5F5] px-3 py-2 rounded-xl text-xs text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:text-[#BDBDBD] resize-none"
              rows={3}
            />
          </div>

          {/* 生成设置 */}
          <EcommerceSettings
            language={language}
            onLanguageChange={(lang) => { setLanguage(lang); saveLanguage(lang); }}
            languages={LANGUAGES}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            quality={quality}
            onQualityChange={setQuality}
            aspectRatios={ASPECT_RATIO_OPTIONS}
            singleRatio={aspectRatio}
            onSingleRatioChange={setAspectRatio}
          />

          {/* 生成内容选择 */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ImageIcon size={14} className="text-amber-500" />
                <span className="text-sm font-semibold text-[#171717]">生成内容</span>
              </div>
              <button onClick={() => {
                const allSelected = Object.values(genTypes).every(Boolean);
                setGenTypes({ scene: !allSelected, pose1: !allSelected, pose2: !allSelected, fabric: !allSelected, collar: !allSelected, pattern: !allSelected, craft: !allSelected, cut: !allSelected });
              }} className="text-[10px] text-blue-500 hover:text-blue-600">
                {Object.values(genTypes).every(Boolean) ? '取消全选' : '全选'}
              </button>
            </div>
            <p className="text-xs text-[#A3A3A3] mb-3">选择要生成的图片类型，每张产品图将生成选中类型的图片</p>
            
            {/* 场景 & 姿势 */}
            <div className="mb-3">
              <p className="text-[10px] text-[#A3A3A3] mb-1.5">场景展示</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'scene' as const, label: '固定场景', desc: '地板+窗帘' },
                  { key: 'pose1' as const, label: '姿势1', desc: '不同站姿' },
                  { key: 'pose2' as const, label: '姿势2', desc: '另一种姿态' }
                ]).map(item => (
                  <button key={item.key} onClick={() => setGenTypes(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${genTypes[item.key] ? 'bg-blue-500 text-white' : 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'}`}>
                    <Check size={10} className={genTypes[item.key] ? 'opacity-100' : 'opacity-0'} />
                    {item.label}
                    <span className="text-[10px] opacity-60">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            
            {/* 细节特写 */}
            <div>
              <p className="text-[10px] text-[#A3A3A3] mb-1.5">细节特写</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'fabric' as const, label: '面料质感' },
                  { key: 'collar' as const, label: '领口袖口' },
                  { key: 'pattern' as const, label: '图案印花' },
                  { key: 'craft' as const, label: '做工细节' },
                  { key: 'cut' as const, label: '版型剪裁' }
                ]).map(item => (
                  <button key={item.key} onClick={() => setGenTypes(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${genTypes[item.key] ? 'bg-blue-500 text-white' : 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'}`}>
                    <Check size={10} className={genTypes[item.key] ? 'opacity-100' : 'opacity-0'} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            
            <p className="text-[10px] text-[#A3A3A3] mt-2">已选 {selectedTypeCount} 种类型，每张产品图生成 {selectedTypeCount} 张</p>
          </div>

          {/* 最终生成按钮 */}
          {!isProcessing && (
            <>
              <button onClick={handleGenerate} disabled={!finalModelImage || productImages.length === 0}
                className="w-full bg-[#171717] text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#27272A] transition-all disabled:bg-[#E5E5E5] disabled:text-[#A3A3A3] disabled:cursor-not-allowed shadow-sm">
                <Sparkles size={18} /> 开始生成 ({productImages.length * selectedTypeCount}张产品穿搭图)
              </button>
              {finalModelImage && productImages.length === 0 && (
                <p className="text-[10px] text-amber-600 text-center mt-1.5">
                  ✅ 模特已就绪，请在上方上传产品图片
                </p>
              )}
              {!finalModelImage && (
                <p className="text-[10px] text-[#A3A3A3] text-center mt-1.5">
                  请先在上方选择或上传模特图片
                </p>
              )}
            </>
          )}
          {isProcessing && (
            <div className="text-center text-xs text-[#A3A3A3] bg-[#F5F5F5] rounded-xl py-3 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              生成中...
            </div>
          )}
        </div>

        {/* 右侧结果区域 */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 生成中 - 无结果时显示大loading */}
          {isProcessing && results.length === 0 && (
            <LoadingAnimation
              variant="featured"
              title="正在生成穿搭图"
              description="AI 视觉引擎全力运行中..."
              showProgressBar
              progressWidth="60%"
            />
          )}

          {/* 结果区域 */}
          <div className="flex-1 flex flex-col">
            {results.length > 0 && (
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[#171717]">
                  生成结果 ({results.length})
                  {isProcessing && <span className="text-xs text-[#A3A3A3] font-normal ml-2">生成中...</span>}
                </h2>
                {isProcessing && (
                  <div className="flex items-center gap-2 text-xs text-[#A3A3A3] bg-[#F5F5F5] rounded-xl px-3 py-1.5">
                    正在生成剩余图片...
                  </div>
                )}
              </div>
            )}
            <EcommerceResults
              results={results}
              onPreview={setPreviewImage}
              onReEdit={setReEditImage}
              onDownload={handleDownload}
              aspectRatio="1/1"
              emptyTitle="产品穿搭"
              emptyDescription="1. 上传多张参考图生成真实模特&#10;2. 上传产品图片&#10;3. 选择要生成的图片类型，点击生成"
            />
          </div>
        </div>
      </div>

      {previewImage && (
        <ImagePreviewModal isOpen={true} onClose={() => setPreviewImage(null)} imageUrl={previewImage} />
      )}
      {previewModelImage && (
        <ImagePreviewModal isOpen={true} onClose={() => setPreviewModelImage(null)} imageUrl={previewModelImage} />
      )}
      {reEditImage && (
        <ReEditModal
          isOpen={true}
          imageUrl={reEditImage}
          aspectRatio={aspectRatio}
          model={selectedModel}
          resolution={quality}
          onClose={() => setReEditImage(null)}
          onReplaced={(oldUrl, newUrl) => setResults(prev => prev.map(item => item.url === oldUrl ? { ...item, url: newUrl } : item))}
        />
      )}

      {showModelLibrary && (
        <ModelLibraryPicker
          onSelect={handleSelectFromLibrary}
          onClose={() => setShowModelLibrary(false)}
        />
      )}

      {showModelLibraryRef && (
        <ModelLibraryPicker
          multi
          onSelect={handleSelectRefFromLibrary}
          onClose={() => setShowModelLibraryRef(false)}
        />
      )}
    </div>
  );
};

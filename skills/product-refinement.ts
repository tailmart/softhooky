import axios from 'axios';

// 触发关键词
const TRIGGER_KEYWORDS = [
  'softhooky生图',
  '用softhooky生图',
  '我想用softhooky生图',
  'softhooky生成',
  '用softhooky生成',
];

// 类型定义
interface User {
  id: number;
  username: string;
  credits: number;
}

interface GenerateParams {
  type: ProductType;
  images: string[];
  title?: string;
  description?: string;
  language?: string;
  ratio: ImageRatio;
  model: AIModel;
  isEdit?: boolean; // 是否是修图模式
  editRequirement?: string; // 修图需求
}

type ProductType = 
  | 'recommend'
  | 'three-view'
  | 'style-transfer'
  | 'standalone-carousel'
  | 'amazon-image-gen'
  | 'detail-page'
  | 'banner'
  | 'xiaohongshu'
  | 'social-pov'
  | 'storyboard'
  | 'tk-script'
  | 'copywriting';

type ImageRatio = '1:1' | '3:4' | '4:3' | '16:9' | '9:16';
type AIModel = 'nano' | 'gpt';

// 积分配置
const CREDITS_CONFIG: Record<ProductType, { nano: number; gpt: number }> = {
  'recommend': { nano: 5, gpt: 10 },
  'three-view': { nano: 15, gpt: 30 },
  'style-transfer': { nano: 10, gpt: 20 },
  'standalone-carousel': { nano: 20, gpt: 40 },
  'amazon-image-gen': { nano: 20, gpt: 40 },
  'detail-page': { nano: 30, gpt: 60 },
  'banner': { nano: 15, gpt: 30 },
  'xiaohongshu': { nano: 10, gpt: 20 },
  'social-pov': { nano: 10, gpt: 20 },
  'storyboard': { nano: 25, gpt: 50 },
  'tk-script': { nano: 25, gpt: 50 },
  'copywriting': { nano: 5, gpt: 10 },
};

// 功能名称映射
const PRODUCT_TYPE_NAMES: Record<ProductType, string> = {
  'recommend': '推荐',
  'three-view': '三视图生成',
  'style-transfer': '智能设计克隆',
  'standalone-carousel': '独立站轮播图',
  'amazon-image-gen': '亚马逊生图',
  'detail-page': '详情页设计',
  'banner': 'Banner设计',
  'xiaohongshu': '小红书种草图文',
  'social-pov': '社媒POV出图',
  'storyboard': '故事板',
  'tk-script': 'TK脚本图',
  'copywriting': '电商文案助手',
};

// API基础URL
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

export class ProductRefinementSkill {
  private token: string | null = null;
  private user: User | null = null;

  // 检测是否触发了生图功能
  static detectTrigger(message: string): {
    triggered: boolean;
    isEdit: boolean;
    images: string[];
    requirement: string;
  } {
    const lowerMessage = message.toLowerCase();
    
    // 检查是否包含触发关键词
    const triggered = TRIGGER_KEYWORDS.some(keyword => 
      lowerMessage.includes(keyword.toLowerCase())
    );

    if (!triggered) {
      return { triggered: false, isEdit: false, images: [], requirement: '' };
    }

    // 提取图片URL（支持多种格式）
    const imageUrlRegex = /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp))/gi;
    const images = message.match(imageUrlRegex) || [];

    // 提取需求描述（移除触发词和图片URL后的内容）
    let requirement = message;
    TRIGGER_KEYWORDS.forEach(keyword => {
      requirement = requirement.replace(new RegExp(keyword, 'gi'), '');
    });
    images.forEach(url => {
      requirement = requirement.replace(url, '');
    });
    requirement = requirement.trim();

    // 判断是否是修图模式（提供了图片）
    const isEdit = images.length > 0;

    return { triggered, isEdit, images, requirement };
  }

  // 登录
  async login(username: string, password: string): Promise<boolean> {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        username,
        password,
      });

      if (response.data.success) {
        this.token = response.data.token;
        this.user = {
          id: response.data.userId,
          username,
          credits: 0,
        };
        await this.refreshCredits();
        return true;
      }
      return false;
    } catch (error) {
      console.error('登录失败:', error);
      return false;
    }
  }

  // 刷新积分
  async refreshCredits(): Promise<number> {
    if (!this.token) throw new Error('请先登录');

    try {
      const response = await axios.get(`${API_BASE_URL}/api/user/credits`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      if (this.user) {
        this.user.credits = response.data.credits;
      }
      return response.data.credits;
    } catch (error) {
      console.error('查询积分失败:', error);
      throw error;
    }
  }

  // 检查积分是否足够
  checkCredits(type: ProductType, model: AIModel): boolean {
    if (!this.user) throw new Error('请先登录');
    
    const required = CREDITS_CONFIG[type][model];
    return this.user.credits >= required;
  }

  // 获取所需积分
  getRequiredCredits(type: ProductType, model: AIModel): number {
    return CREDITS_CONFIG[type][model];
  }

  // 获取功能分类
  getProductCategories(): Record<string, ProductType[]> {
    return {
      '场景融合': ['recommend', 'three-view'],
      '电商': ['style-transfer', 'standalone-carousel', 'amazon-image-gen', 'detail-page', 'banner'],
      '社媒': ['xiaohongshu', 'social-pov'],
      '视频': ['storyboard', 'tk-script'],
      '工具': ['copywriting'],
    };
  }

  // 获取功能名称
  getProductTypeName(type: ProductType): string {
    return PRODUCT_TYPE_NAMES[type];
  }

  // 生成图片
  async generate(params: GenerateParams): Promise<{
    success: boolean;
    imageUrl?: string;
    creditsUsed?: number;
    remainingCredits?: number;
    error?: string;
  }> {
    if (!this.token) throw new Error('请先登录');

    // 检查积分
    if (!this.checkCredits(params.type, params.model)) {
      return {
        success: false,
        error: `积分不足，需要${this.getRequiredCredits(params.type, params.model)}积分，当前剩余${this.user?.credits}积分`,
      };
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/api/generate/image`, params, {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      if (response.data.success) {
        // 扣费
        await this.deductCredits(
          response.data.creditsUsed,
          params.type,
          `生成${PRODUCT_TYPE_NAMES[params.type]}`
        );

        // 保存到图片库
        await this.saveToGallery(response.data.imageUrl, params);

        // 刷新积分
        await this.refreshCredits();

        return {
          success: true,
          imageUrl: response.data.imageUrl,
          creditsUsed: response.data.creditsUsed,
          remainingCredits: this.user?.credits,
        };
      }

      return { success: false, error: '生成失败' };
    } catch (error) {
      console.error('生成失败:', error);
      return { success: false, error: '生成过程中出现错误' };
    }
  }

  // 扣费
  private async deductCredits(amount: number, type: string, description: string): Promise<void> {
    if (!this.token) throw new Error('请先登录');

    await axios.post(`${API_BASE_URL}/api/user/deduct-credits`, {
      amount,
      type,
      description,
    }, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
  }

  // 保存到图片库
  private async saveToGallery(imageUrl: string, params: GenerateParams): Promise<void> {
    if (!this.token) throw new Error('请先登录');

    await axios.post(`${API_BASE_URL}/api/user/gallery`, {
      imageUrl,
      type: params.type,
      params,
      ratio: params.ratio,
      model: params.model,
      createdAt: new Date(),
    }, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
  }

  // 获取用户图片库
  async getGallery(): Promise<any[]> {
    if (!this.token) throw new Error('请先登录');

    const response = await axios.get(`${API_BASE_URL}/api/user/gallery`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    return response.data.images;
  }

  // 处理用户交互流程
  async handleInteraction(message: string): Promise<{
    step: 'login' | 'select_type' | 'select_ratio' | 'select_model' | 'confirm' | 'generating' | 'done';
    prompt?: string;
    data?: any;
  }> {
    // 检测触发
    const triggerResult = ProductRefinementSkill.detectTrigger(message);

    if (!triggerResult.triggered) {
      return { step: 'select_type', prompt: '请告诉我您需要什么帮助？' };
    }

    // 检查登录状态
    if (!this.token) {
      return { 
        step: 'login', 
        prompt: '请先登录，请提供您的账号和密码（格式：账号/密码）' 
      };
    }

    // 如果是修图模式
    if (triggerResult.isEdit) {
      return {
        step: 'select_model',
        prompt: '检测到您提供了图片，将进入修图模式。\n\n请告诉我：\n1. 您的修图需求是什么？\n2. 选择模型：nano（快速）还是 gpt（高质量）？\n3. 选择比例：1:1、3:4、4:3、16:9、9:16？',
        data: {
          isEdit: true,
          images: triggerResult.images,
          requirement: triggerResult.requirement,
        },
      };
    }

    // 如果有明确需求
    if (triggerResult.requirement) {
      return {
        step: 'select_model',
        prompt: `收到您的需求：${triggerResult.requirement}\n\n请告诉我：\n1. 选择模型：nano（快速）还是 gpt（高质量）？\n2. 选择比例：1:1、3:4、4:3、16:9、9:16？`,
        data: {
          isEdit: false,
          requirement: triggerResult.requirement,
        },
      };
    }

    // 展示功能列表
    const categories = this.getProductCategories();
    let prompt = '请选择您需要的功能：\n\n';
    
    for (const [category, types] of Object.entries(categories)) {
      prompt += `【${category}】\n`;
      types.forEach((type, index) => {
        prompt += `  ${index + 1}. ${this.getProductTypeName(type)}\n`;
      });
      prompt += '\n';
    }

    prompt += '请告诉我您要使用哪个功能？';

    return { step: 'select_type', prompt };
  }

  // 处理类型选择
  handleTypeSelection(input: string): ProductType | null {
    const typeMap: Record<string, ProductType> = {
      '1': 'recommend',
      '2': 'three-view',
      '3': 'style-transfer',
      '4': 'standalone-carousel',
      '5': 'amazon-image-gen',
      '6': 'detail-page',
      '7': 'banner',
      '8': 'xiaohongshu',
      '10': 'social-pov',
      '11': 'storyboard',
      '12': 'tk-script',
      '13': 'copywriting',
    };

    // 尝试通过数字选择
    if (typeMap[input]) {
      return typeMap[input];
    }

    // 尝试通过名称匹配
    const lowerInput = input.toLowerCase();
    for (const [type, name] of Object.entries(PRODUCT_TYPE_NAMES)) {
      if (lowerInput.includes(name.toLowerCase()) || lowerInput.includes(type)) {
        return type as ProductType;
      }
    }

    return null;
  }

  // 处理比例选择
  handleRatioSelection(input: string): ImageRatio | null {
    const ratioMap: Record<string, ImageRatio> = {
      '1': '1:1',
      '2': '3:4',
      '3': '4:3',
      '4': '16:9',
      '5': '9:16',
    };

    // 尝试通过数字选择
    if (ratioMap[input]) {
      return ratioMap[input];
    }

    // 尝试直接匹配
    const validRatios: ImageRatio[] = ['1:1', '3:4', '4:3', '16:9', '9:16'];
    if (validRatios.includes(input as ImageRatio)) {
      return input as ImageRatio;
    }

    // 尝试模糊匹配
    if (input.includes('1:1') || input.includes('正方形')) return '1:1';
    if (input.includes('3:4') || input.includes('竖版')) return '3:4';
    if (input.includes('4:3') || input.includes('横版')) return '4:3';
    if (input.includes('16:9') || input.includes('宽屏')) return '16:9';
    if (input.includes('9:16') || input.includes('竖屏')) return '9:16';

    return null;
  }

  // 处理模型选择
  handleModelSelection(input: string): AIModel | null {
    const lowerInput = input.toLowerCase();

    if (lowerInput.includes('nano') || lowerInput.includes('快速')) {
      return 'nano';
    }

    if (lowerInput.includes('gpt') || lowerInput.includes('高质量')) {
      return 'gpt';
    }

    // 默认根据复杂度判断
    if (lowerInput.includes('简单') || lowerInput.includes('快速')) {
      return 'nano';
    }

    return null;
  }

  // 完整的生图流程
  async generateImage(params: {
    type?: ProductType;
    images: string[];
    requirement?: string;
    title?: string;
    description?: string;
    language?: string;
    ratio: ImageRatio;
    model: AIModel;
    isEdit?: boolean;
  }): Promise<{
    success: boolean;
    imageUrl?: string;
    creditsUsed?: number;
    remainingCredits?: number;
    error?: string;
  }> {
    // 刷新积分
    await this.refreshCredits();

    // 检查积分
    const type = params.type || (params.isEdit ? 'style-transfer' : 'recommend');
    if (!this.checkCredits(type, params.model)) {
      const required = this.getRequiredCredits(type, params.model);
      return {
        success: false,
        error: `积分不足！需要${required}积分，当前剩余${this.user?.credits}积分`,
      };
    }

    // 调用生成接口
    const generateParams: GenerateParams = {
      type,
      images: params.images,
      title: params.title,
      description: params.description,
      language: params.language,
      ratio: params.ratio,
      model: params.model,
      isEdit: params.isEdit,
      editRequirement: params.requirement,
    };

    return this.generate(generateParams);
  }

  // 获取示例提示词
  getExamplePrompt(type: ProductType): string {
    const examples: Record<ProductType, string> = {
      'recommend': '请为我推荐最佳的产品展示方案',
      'three-view': '请生成产品的正面、侧面、背面三视图',
      'style-transfer': '请将我的产品设计迁移到现代简约风格',
      'standalone-carousel': `请为我生成独立站轮播图：
- 产品图片：[请上传]
- 产品标题：[请输入]
- 产品描述：[请输入]
- 生成语言：[中文/英文]`,
      'amazon-image-gen': `请为我生成亚马逊生图：
- 产品图片：[请上传]
- 产品标题：[请输入]
- 五点描述：[请输入]`,
      'detail-page': `请为我生成产品详情页：
- 产品主图：[请上传]
- 产品细节图：[请上传]
- 产品参数：[请输入]
- 卖点描述：[请输入]`,
      'banner': `请为我生成Banner图：
- 产品图片：[请上传]
- 营销文案：[请输入]
- 活动信息：[请输入]`,
      'xiaohongshu': `请为我生成小红书种草图文：
- 产品图片：[请上传]
- 种草文案：[请输入]
- 标签话题：[请输入]`,
      'social-pov': `请为我生成社媒POV图：
- 产品图片：[请上传]
- 社交平台：[小红书/抖音/Instagram]
- 风格要求：[请输入]`,
      'storyboard': `请为我生成视频故事板：
- 产品图片：[请上传]
- 故事脚本：[请输入]
- 场景描述：[请输入]`,
      'tk-script': `请为我生成TikTok脚本图：
- 产品图片：[请上传]
- 视频脚本：[请输入]
- 时长要求：[请输入]`,
      'copywriting': `请为我生成电商文案：
- 产品名称：[请输入]
- 产品特点：[请输入]
- 目标平台：[淘宝/亚马逊/独立站]`,
    };

    return examples[type];
  }
}

export default ProductRefinementSkill;

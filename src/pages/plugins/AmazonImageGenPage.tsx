import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, Plus, ShoppingCart, Images, Globe, Download, Layout, Wand2, ChevronDown, Columns3 } from 'lucide-react';
import { fileToDataUrl } from '../../services/r2Service';
import { editImage } from '../../services/imageService';
import { analyzeMultipleImages } from '../../services/aiChatService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { requireAuth } from '../../utils/authCheck';
import { getAvailableModels } from '../../services/modelService';
import { createConcurrencyLimit } from '../../utils/concurrency';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { ReEditModal } from '../../components/ReEditModal';
import { ModelSpeedNote } from '../../components/ModelSpeedNote';
import { LoadingAnimation } from '../../components/LoadingAnimation';
import { Toast } from '../../components/Toast';
import { LANGUAGES, getSavedLanguage, saveLanguage } from '../../constants/languages';

const MODES = [
  { value: 'main', label: '主图' },
  { value: 'aplus', label: 'A+页面' },
  { value: 'poster', label: '海报' },
];

const PRODUCT_DEEP_ANALYSIS_PROMPT = `你是一位专业亚马逊产品分析师。仔细分析所有上传的参考图，从中识别产品的真实外观特征，忽略不清晰或无关的图片，进行全面深度分析。

## 第一步：提取产品特征
请回答以下7个问题：

1. **这是什么产品？** → 产品名称、品类
2. **它解决什么问题？** → 核心痛点
3. **它和竞品有什么不同？** → 差异化优势
4. **它的材质/尺寸/颜色是什么？** → 物理属性
5. **它的使用场景是什么？** → 应用场景
6. **谁会买它？** → 目标人群
7. **买家最在意什么？** → 决策因素

## 第二步：生成关键词矩阵
根据产品特征自动输出以下关键词：

### 核心功能词（描述产品核心价值）
- 功能1
- 功能2
- 功能3

### 情感词（触发购买欲望）
- 情感1
- 情感2

### 信任词（降低决策风险）
- 信任1
- 信任2

### 场景词（联想使用场景）
- 场景1
- 场景2
- 场景3

### 差异化词（突出独特卖点）
- 差异化1
- 差异化2

## 第三步：匹配轮播图结构（买家浏览心理排序）
根据关键词优先级分配到8张轮播图，按买家注意力递减排列：

图1: 使用场景（在哪里用）→ 生活方式场景图，情感共鸣，让买家"看到自己使用"
图2: 核心功能（解决什么问题）→ 功能展示，说明产品解决的核心痛点
图3: 差异化卖点（凭什么选我）→ 最强差异化优势，与竞品的核心区别
图4: 信任背书（材质/安全）→ 品质保证、认证、材质
图5: 细节品质（值不值）→ 工艺细节特写，证明做工精良
图6: 尺寸规格（适不适合）→ 参数规格、尺寸对比
图7: 易用性（好不好用）→ 使用步骤、便捷操作
图8: 行动号召（买不买）→ 促销信息、限时优惠

## 输出格式
返回一个JSON对象：
{
  "title": "产品名称（简短有力，适合亚马逊Listing）",
  "description": "产品外观与设计、材质、功能特性描述",
  "brand": "品牌名（从图片中识别，如无则空字符串）",
  "category": "产品品类",
  "specs": "规格参数（尺寸、容量、重量、功率等）",
  "sellingPoints": "核心卖点（3-5个，逗号分隔）",
  "targetAudience": "目标人群描述",
  "painPoints": "核心痛点（产品解决的问题）",
  "differentiators": "差异化优势（与竞品的区别）",
  "useScenarios": "使用场景（在哪里用）",
  "decisionFactors": "买家决策因素（最在意什么）",
  "keywordMatrix": {
    "coreFunction": ["核心功能词1", "核心功能词2", "核心功能词3"],
    "emotional": ["情感词1", "情感词2"],
    "trust": ["信任词1", "信任词2"],
    "scenario": ["场景词1", "场景词2", "场景词3"],
    "differentiator": ["差异化词1", "差异化词2"]
  },
  "carouselPlan": {
    "img0": "白底产品主图（纯净展示，Amazon首图要求）",
    "img1": "使用场景（情感共鸣，买家代入）",
    "img2": "核心功能（解决痛点）",
    "img3": "差异化卖点（凭什么选我）",
    "img4": "信任背书（材质/安全认证）",
    "img5": "细节品质（工艺特写）",
    "img6": "尺寸规格（参数对比）",
    "img7": "易用性（使用步骤）",
    "img8": "行动号召（促销信息）"
  }
}

要求：
- title 要简洁，突出核心特征
- description 要详细、有条理
- 必须从图片中真实提取信息，不要编造
- 关键词矩阵要覆盖5类关键词
- 轮播图规划要基于关键词优先级
- 仅输出JSON对象，不要额外文字`;

const PROMPT_PREFIX = 'Professional commercial product photography, photorealistic, 8K ultra high definition, sharp focus, soft natural daylight, soft shadow, clean aesthetic, e-commerce style, Amazon listing image, no watermark, no clutter, pure tone';

const MAIN_IMAGE_PROMPT = `你是一位亚马逊产品主图与信息图设计师。分析所有上传的产品图片，从中识别产品的真实外观特征，忽略不清晰或无关的图片，为亚马逊主图规划展示方案。

## 通用款轮播图结构（9张）
基于AI分析的关键词矩阵，按买家注意力递减排列：

### 图0: 产品白底图（纯净展示，Amazon首图要求）
- 纯白色背景，产品居中
- 无文字、无logo、无装饰
- 突出产品整体外观和设计
- 专业电商主图风格
- 高清细节，真实还原产品

### 图1: 使用场景（情感共鸣，让买家"看到自己使用"）
- 展示产品在真实生活场景中的使用画面
- 生活化场景图，买家能代入自己使用的画面
- 场景词 + 情感词，触发购买欲望
- 营造"我也需要这个"的代入感

### 图2: 核心功能（解决什么问题）
- 展示产品解决的核心痛点
- 功能图标+文字说明
- 使用前/后对比或功能演示
- 核心功能词

### 图3: 差异化卖点（凭什么选我）
- 展示产品最独特的差异化优势
- 大标题突出核心卖点
- 产品主图+细节特写
- 差异化词，与竞品的核心区别

### 图4: 信任背书（材质/安全）
- 展示材质、工艺、安全认证
- 品质特写+信任标识
- 信任词，降低决策风险
- 安全认证、材质证书等

### 图5: 细节品质（值不值）
- 展示工艺细节和品质
- 细节特写+材质质感
- 值得购买的品质感
- 精工细作的细节

### 图6: 尺寸规格（适不适合）
- 产品尺寸标注+规格参数
- 尺寸对比图+参数表格
- 适不适合的决策依据
- 清晰的规格信息

### 图7: 易用性（好不好用）
- 展示产品易用性
- 步骤图解（1-2-3）
- 操作便捷性
- 简单易懂的使用说明

### 图8: 行动号召（买不买）
- 促销信息或购买引导
- 限时优惠、赠品等
- 购买按钮或二维码
- 创造紧迫感

## 每张图需要：
1. "title": 展示内容标题（英文，简洁概括）
2. "desc": 详细画面描述（英文）

## 输出格式 - STRICT JSON array:
[{"title":"展示标题","desc":"完整英文图像生成提示词"},...]

## 设计风格关键词（必须融入每张图）
- **色调**：warm beige/cream background (#F5F0EB), deep forest green accents (#2D4A2D), warm brown highlights
- **字体**：bold sans-serif headlines, light-weight body text, high contrast
- **布局**：rounded corner cards (border-radius 20-30px), wave/curve dividers, icon+text bullet points in dark green rounded pills
- **图标**：circular white background with thin line icons, minimalist style
- **光影**：soft natural daylight from left, gentle shadows, warm ambient lighting
- **场景**：cozy home interior, wooden floors, plants, warm decor

## 各图详细设计规范

### 图0: 产品白底图（Amazon首图要求）
Pure white background product photo:
- Pure white background (#FFFFFF), product centered
- No text, no logo, no decorative elements
- Eye-level angle, showcasing overall design and texture
- Professional e-commerce main image style
- High-definition detail, true-to-life product representation
- Soft natural lighting, subtle shadows for depth
- 8K quality, sharp focus on product

### 图1: 使用场景（情感共鸣）
Lifestyle scene showcase:
- 2-3 rounded rectangular lifestyle scene images
- Show product being used in real-life situations
- Each scene with label tag (deep green pill)
- Warm, inviting atmosphere with natural lighting
- Buyer should think: "I can see myself using this"
- Headline: category-adapted lifestyle title

### 图2: 核心功能（解决痛点）
Feature showcase layout:
- Large headline: "Solves [Problem]"
- Product image with callout arrows pointing to key features
- 3-4 feature icons with descriptions
- Before/after comparison or problem-solution visual
- Clean layout with feature highlights

### 图3: 差异化卖点（凭什么选我）
Split layout infographic:
- LEFT SIDE: Large bold headline in deep green (#2D4A2D) with product differentiator
- Subtitle in smaller dark brown text explaining why it's unique
- 2-3 circular icon badges with key differentiators
- RIGHT SIDE: Product hero image
- BOTTOM: 2-3 small rounded inset images showing competitive advantages
- Background: warm beige/cream tone

### 图4: 信任背书（品质保证）
Trust & quality layout:
- Headline: "Premium Quality" or "Safe & Reliable"
- Material close-up shots in circular insets
- Safety certification badges
- Quality assurance icons
- Trust-building visual elements

### 图5: 细节品质（工艺特写）
Detail showcase:
- Headline: "Premium Craftsmanship"
- Main product + 2-3 detail close-ups
- Texture and material highlights
- Quality indicators
- High-detail imagery

### 图6: 尺寸规格（参数对比）
Specifications layout:
- Product with dimension arrows and measurements
- Specs table below (size, weight, material, etc.)
- Size comparison visual
- Clean, professional layout
- Easy-to-read measurements

### 图7: 易用性（使用步骤）
Step-by-step guide:
- Headline: "Easy to Use"
- 3 numbered circular badges (1-2-3)
- Each step with image and description
- Simple, clear instructions
- User-friendly visual design

### 图8: 行动号召（促销信息）
Call-to-action layout:
- Headline: "Order Now" or promotional message
- Product hero image
- Limited-time offer or bonus items
- Clear CTA button or QR code
- Urgency-creating elements

## 原则
- desc 必须是完整的英文图像生成提示词，可直接用于 AI 生图
- 数量固定9张，严格按照上述结构（图0白底图 + 图1-8轮播图）
- 文字使用英文（图0白底图除外）
- 每张图差异化，但风格统一
- ★★★ 所有输出的图片必须作为一套完整的视觉系列，左右拼接时背景色调、光影方向、视觉风格必须统一，形成连贯的视觉流 ★★★
- ★★★ 色调必须统一使用暖米色背景 + 深绿色强调色，营造温馨高端的品牌感 ★★★
- ★★★ 基于关键词矩阵规划内容，确保每张图都有明确的营销目的 ★★★`;

const APLUS_IMAGE_PROMPT = `你是一位亚马逊A+页面设计师。分析所有上传的产品图片，从中识别产品的真实外观特征、产品品类，忽略不清晰或无关的图片，为A+详情页规划展示方案。

每张图需要：
1. "title": 展示内容标题（简短有力，英文）
2. "desc": 详细英文图像生成提示词，描述完整的画面内容，包括布局、文案、图标、场景等

## 输出格式 - STRICT JSON array:
[{"title":"展示标题","desc":"完整英文图像生成提示词"},...]

## 设计风格关键词（必须融入每张图）
- **色调**：warm beige/cream background (#F5F0EB), deep forest green accents (#2D4A2D), warm brown highlights (#C4A882)
- **字体**：bold sans-serif headlines (deep green), light-weight body text (dark brown), high contrast
- **布局**：rounded corner cards (border-radius 20-30px), wave/curve dividers, icon+text bullet points in dark green rounded pills
- **图标**：circular white background with thin line icons, minimalist style
- **光影**：soft natural daylight from left, gentle shadows, warm ambient lighting
- **场景**：cozy home interior, wooden floors, plants, warm decor
- **整体风格**：现代简约 | 温馨居家 | 高端质感 | 圆角设计 | 生活场景

## 第一步：判断产品品类
根据产品图片判断属于以下哪个大类，选择对应的模块组合：
- 👕 服装/鞋帽/配饰（有尺码、颜色变体）
- 🍵 食品/饮品/茶叶（强调产地、工艺、口感）
- ⌚ 数码/电子/手表（强调参数、功能、科技感）
- 💄 美妆/护肤/个护（强调成分、功效、使用前后）
- 🏠 家居/厨房/生活用品（强调材质、容量、实用场景）
- 🔧 工具/户外/运动装备（强调耐用性、功能、多场景）
- 其他品类：参照最接近的类别灵活调整

## 第二步：从以下模块中选择5-8个，组合成最合适的A+页面

### 【通用模块 - 所有品类可用】

#### A. Hero品牌大图（必选，第一张）
- 占满整张画面的高品质场景图，展示产品在真实使用环境中
- 左上角或顶部叠加品牌名（大字，deep green）+ 产品标题（2-3行粗体文字）
- 底部可加一行小图标或关键词展示核心卖点（白色圆形图标+深绿色文字）
- 场景要匹配产品品类：服装→运动/户外场景，手表→商务/运动场景，茶叶→茶室/自然场景，护肤品→浴室/梳妆场景
- 背景：warm beige/cream tone，柔和自然光

#### B. 卖点图标条（强烈推荐）
- 横向排列4-5个圆形图标，每个图标下方一个卖点关键词
- 图标风格：细线条，白色圆形背景，深绿色图标
- 背景：与Hero图同色调的warm beige纯色
- 卖点关键词根据品类自适应
- 圆角标签设计，深绿色背景+白色文字

#### C. 功能/特点特写详解（强烈推荐）
- 大标题描述核心功能/特点（deep green bold headline）
- 一侧：产品局部特写（放大细节）
- 另一侧：2-3个圆形图标网格，每个图标标注一个功能点
- 每个功能点用深绿色圆角标签展示
- 根据品类调整：服装→口袋/拉链/面料，手表→表盘/表带/按钮，护肤品→质地/瓶口/成分
- 底部：2-3个小圆角矩形细节特写图

#### D. 使用场景网格
- 标题如"Perfect for Every Occasion" 或品类适配标题
- 3-6个圆角矩形网格，展示不同使用场景
- 每个场景图下方有小标签标注（深绿色背景+白色文字）
- 场景根据品类自适应
- 统一的warm beige背景

#### E. 材质/品质展示
- 大标题突出材质/品质特性（deep green bold）
- 上方：材质微距特写或功能可视化
- 下方：3-4个圆形图标+文字展示特性（白色圆形+深绿色图标）
- 根据品类调整：面料→透气/防水，茶叶→产地/工艺，手表→机芯/表壳材质，护肤品→成分/质地

#### F. 尺寸规格图（推荐）
- 产品正面/侧面视图+尺寸标注箭头
- 清晰的测量标签（sans-serif字体）
- 底部区域：规格参数表格（size, material, weight等）
- 表格风格：简洁清晰，白底+浅色线条
- Light beige背景，专业布局

#### G. 步骤图解图（推荐）
- 大标题+副标题在顶部
- 3个编号圆形徽章（1-2-3）+步骤描述
- 下方：3个圆角矩形图片展示每个步骤
- 每个步骤图片底部有深绿色标签条+步骤名称
- 清晰布局，一致间距

#### H. 细节特写图（推荐）
- 大标题描述该特性（deep green bold）
- 主产品图在一侧
- 2-3个圆形或圆角小图展示材质/工艺细节
- 每个小图下方有深绿色小标签
- 底部标语（deep green text）
- 暖色自然光，高细节

#### I. 多角度展示图
- 主产品图+箭头指示+文字"360° design"
- 2-3个小圆角图展示不同角度（前/侧/后）
- 极简背景，明亮光线，8K细节

### 【品类专属模块 - 根据产品品类选用】

#### J. 服装专属模块
- 多色/多款展示网格：4-6个圆角矩形展示不同颜色/款式
- 尺码表：品牌名+专业尺码对照表格（Size/Waist/Hip等）
- 穿搭建议：不同搭配方式展示

#### K. 食品/茶叶专属模块
- 产地溯源：产地地图/茶园/工厂场景+文字标注
- 冲泡/食用方法：步骤图解（Step 1/2/3）
- 口感/风味图：风味轮/口感描述可视化
- 包装展示：产品包装全家福/开箱图

#### L. 数码/手表专属模块
- 参数规格表：品牌名+技术参数表格（尺寸/重量/材质/电池等）
- 功能演示：核心功能逐个展示（如防水测试、计步、心率等）
- 配件清单：产品+所有配件平铺展示

#### M. 美妆/护肤专属模块
- 成分解析：核心成分图标+功效说明
- 使用步骤：洁面→精华→面霜等步骤图解
- 适用肤质/人群：不同肤质适用性说明
- 使用前后对比：效果对比展示

#### N. 家居/厨房专属模块
- 尺寸参数图：产品尺寸标注+容量说明
- 使用演示：实际操作场景展示
- 对比优势：与同类产品的差异化对比

#### O. 工具/户外专属模块
- 多场景应用：不同环境下使用展示
- 耐用性展示：防水/防摔/耐磨等功能可视化
- 参数规格表：技术参数+尺寸图

### 【收尾模块 - 推荐作为最后一张】

#### P. 规格参数表（推荐）
- 顶部品牌名（大字居中）
- 专业参数表格，根据品类选择合适的参数列
- 表格风格：简洁清晰，白底+浅色线条
- 适用于所有品类：服装→尺码表，手表→参数表，茶叶→规格表，护肤品→成分表

#### Q. 品牌故事/承诺
- 品牌理念/口号
- 售后保障信息
- 品牌logo+简洁的信任背书

## 设计规范
- 所有文字使用英文
- 整套图片使用统一的品牌色调：warm beige background + deep green accents
- 每张图的背景色、光影方向、视觉风格必须高度一致
- 文字叠加在图片上时使用高对比度（白字+半透明暗底，或深色字+浅底）
- 布局要有明确的信息层次：大标题 > 副标题 > 正文 > 图标标签
- 圆角卡片设计（border-radius 20-30px）
- 波浪/曲线分割线
- 深绿色圆角标签+白色文字

## ★★★ 视觉统一性要求 ★★★
所有图片作为一组连续的A+页面模块，上下拼接展示时：
- 背景色调无缝过渡（warm beige/cream tone）
- 光影方向和强度一致（soft natural daylight from left）
- 字体风格和大小层级一致（bold sans-serif headlines + light body text）
- 图标风格统一（white circular background + thin line icons in deep green）
- 整体呈现为一个完整的品牌页面，而非零散的独立图片
- 色调：warm beige + deep forest green + warm brown accents`;

const POSTER_IMAGE_PROMPT = `你是一位亚马逊促销海报设计师。分析所有上传的产品图片，从中识别产品的真实外观特征，忽略不清晰或无关的图片，为亚马逊促销海报规划方案。

## ★★★ 海报 = 单张独立的视觉冲击画面，不是多模块拼接 ★★★

每张图需要：
1. "title": 海报主题标题
2. "desc": 详细画面描述

## 输出格式 - STRICT JSON array:
[{"title":"展示标题","desc":"完整英文图像生成提示词"},...]

## 海报定义（严格遵守）
每张海报是一张独立的、视觉冲击力强的大幅画面，类似杂志封面或户外广告牌。
产品必须占据画面 40%-60% 面积，位于视觉焦点位置。

## 海报类型（根据产品特征选择3-5张）
- 生活方式海报：产品在真实生活场景中，营造"拥有它的生活"的情感氛围
- 促销海报：大字标题（如"50% OFF"）+ 产品特写 + 视觉冲击元素
- 品牌氛围海报：产品 + 情绪氛围（光线、色彩、环境），传达品牌调性
- 卖点海报：一个核心卖点 + 产品展示 + 简洁有力的一行文案

## ★★★ 海报绝对不能有的元素 ★★★
- 禁止：网格布局、多图拼接、多模块排列
- 禁止：图标列表、功能图标网格、步骤图解
- 禁止：尺寸表格、参数表格、规格对比表
- 禁止：尺码表、对比图表
- 禁止：A+页面风格的分段式布局
- 禁止：多列文字排版

## 海报风格要求
- 每张图就是一个完整的画面，不要分区、分块
- 大标题文字直接叠在画面上（大号粗体，3-5个词）
- 产品是画面主角，占据主要视觉空间
- 背景是完整的场景或纯色，不要网格分割
- 21:9 宽幅构图，充分利用横向空间
- 高端商业广告视觉风格，简洁大气

## 设计风格
- 色调：warm beige/cream background + deep forest green accents
- 光影：soft natural daylight, dramatic shadows for depth
- 文字：large bold sans-serif headline, maximum 5 words per poster
- 氛围：premium brand advertising, editorial photography feel
- ★★★ 所有海报保持统一色调和光影，形成系列感 ★★★`;

const MODE_GEN_PROMPTS: Record<string, string> = {
  main: `${PROMPT_PREFIX}. {desc}. IMPORTANT: This image is part of a cohesive Amazon listing set. Must use consistent color palette (warm beige background + deep forest green accents), same lighting direction and intensity (soft natural daylight from left), matching background style as all other images in this set. Seamless visual transition when placed side by side.`,
  aplus: `${PROMPT_PREFIX}. Amazon A+ detail page module image, professional brand-level e-commerce design. {desc}. CRITICAL DESIGN RULES: (1) Color palette: warm beige/cream background (#F5F0EB), deep forest green accents (#2D4A2D), warm brown highlights (#C4A882). (2) Typography: bold sans-serif headlines in deep green, light-weight body text in dark brown. (3) Layout: rounded corner cards (border-radius 20-30px), wave/curve dividers, icon+text bullet points in dark green rounded pills. (4) Icons: circular white background with thin line icons in deep green. (5) Lighting: soft natural daylight from left, gentle shadows, warm ambient lighting. (6) This image is part of a cohesive A+ module set displayed vertically - must share identical color palette, consistent lighting, matching background tone. Design to look like a premium brand's A+ page section with modern minimalist style, cozy home aesthetic, and premium texture.`,
  poster: `${PROMPT_PREFIX}. Single standalone promotional poster (NOT an A+ page, NOT a grid layout, NOT multi-panel). One complete visual scene filling the entire 21:9 canvas. Product prominently displayed occupying 40-60% of the frame. ONE bold headline text overlaid on the image. No grids, no icons, no tables, no multi-column layout. {desc}. CRITICAL: This must look like a magazine advertisement or billboard poster - a single dramatic visual, not a product information sheet. Maintain consistent warm beige + deep green color palette across the poster set.`,
};

interface Card {
  title: string;
  desc: string;
  refImageIndices?: number[];
}

/** 从 AI 响应文本中安全提取 JSON（对象或数组），优先从 markdown 代码块中提取 */
function extractJson<T = any>(text: string): T | null {
  // 1. 尝试从 markdown 代码块中提取
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1].trim()); } catch {}
  }
  // 2. 尝试花括号匹配（对象）
  const braceStart = text.indexOf('{');
  if (braceStart !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = braceStart; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(braceStart, i + 1)); } catch { break; } } }
    }
  }
  // 3. 尝试方括号匹配（数组）
  const bracketStart = text.indexOf('[');
  if (bracketStart !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = bracketStart; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '[') depth++;
      else if (ch === ']') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(bracketStart, i + 1)); } catch { break; } } }
    }
  }
  // 4. 最后兜底：贪婪匹配
  try {
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) return JSON.parse(objMatch[0]);
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) return JSON.parse(arrMatch[0]);
  } catch {}
  return null;
}

export const AmazonImageGenPage: React.FC = () => {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getAvailableModels().then(m => {
      const sorted = m.filter(x => x.enabled).sort((a, b) => a.sort_order - b.sort_order);
      setModels(sorted.map(x => ({ value: x.model_id, label: x.label })));
      if (sorted.length > 0) setSelectedModel('gpt-image-2');
    });
  }, []);
  const [productImages, setProductImages] = useState<{ file: File; preview: string }[]>([]);
  const [productTitle, setProductTitle] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [selectedModes, setSelectedModes] = useState<string[]>(['main']);
  const [language, setLanguage] = useState(getSavedLanguage());
  const [aspectRatio, setAspectRatio] = useState('1:1');

  // 各模式默认比例
  const MODE_RATIOS: Record<string, { default: string; options: string[] }> = {
    main: { default: '1:1', options: ['1:1', '3:4'] },
    aplus: { default: '21:9', options: ['21:9', '16:9', '9:16', '3:4'] },
    poster: { default: '21:9', options: ['21:9', '9:16', '16:9', '3:4'] },
  };

  const MODE_LABEL_MAP: Record<string, string> = { main: '主图', aplus: 'A+页面', poster: '海报' };

  // 多选模式：根据已选模式合并可用比例选项
  const isMultiMode = selectedModes.length > 1;
  const ratioOptions = isMultiMode
    ? ['1:1', '16:9', '9:16', '3:4', '4:3', '21:9']
    : MODE_RATIOS[selectedModes[0]]?.options || ['1:1'];

  const handleModeToggle = (modeValue: string) => {
    setSelectedModes(prev => {
      const next = prev.includes(modeValue)
        ? prev.filter(m => m !== modeValue)
        : [...prev, modeValue];
      // 至少保留一个
      if (next.length === 0) return prev;
      // 切换到单选时更新比例
      if (next.length === 1) {
        setAspectRatio(MODE_RATIOS[next[0]].default);
      }
      return next;
    });
  };
  const [selectedModel, setSelectedModel] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [quality, setQuality] = useState('2K');
  const [progress, setProgress] = useState('');
  const [deepAnalysis, setDeepAnalysis] = useState<Record<string, string> | null>(null);
  const [results, setResults] = useState<{ url: string; title: string }[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reEditImage, setReEditImage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [merging, setMerging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 存储分析结果供生成阶段使用
  const analysisRef = useRef<{
    filteredB64s: string[];
    filteredFiles: { file: File; preview: string }[];
    imageLabels: string[];
    imageDesc: string;
    finalTitle: string;
    finalDesc: string;
    analysisContext: string;
    urls: string[];
  } | null>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    const files = Array.from(fileList as FileList).filter((f: File) => f.type.startsWith('image/'));
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    const oversized = files.find(f => f.size > MAX_FILE_SIZE);
    if (oversized) {
      setToast({ message: `图片"${oversized.name}"超过 20MB，请压缩后重新上传`, type: 'error' });
      e.target.value = '';
      return;
    }
    const newItems = files.map(f => ({ file: f, preview: '' }));
    Promise.all(newItems.map(item => new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => { item.preview = reader.result as string; resolve(); };
      reader.onerror = reject;
      reader.readAsDataURL(item.file);
    }))).then(() => {
      setProductImages(prev => [...prev, ...newItems].slice(0, 10));
    }).catch(err => {
      console.error('图片处理失败:', err);
      setToast({ message: '部分图片处理失败，请尝试使用更小的图片', type: 'error' });
    });
  };

  const removeImage = (idx: number) => setProductImages(prev => prev.filter((_, i) => i !== idx));

  const handleAnalyze = async () => {
    if (!requireAuth()) return;
    if (productImages.length === 0) { setToast({ message: '请上传产品图片', type: 'error' }); return; }
    setAnalyzing(true);
    setAnalysisComplete(false);
    setResults([]);
    setProgress('AI正在筛选图片...');
    try {
      // 第一步：筛图 — 让AI识别哪些图片是有效的产品图
      const b64sAll = await Promise.all(productImages.map(item => fileToDataUrl(item.file, 1200)));

      const screenRaw = await analyzeMultipleImages(b64sAll,
        `分析所有上传的图片，判断哪些是有效产品图（清晰展示产品的正/侧/背面、细节、包装等），忽略不清晰、无关、重复角度或乱入的图片。
返回JSON数组，只包含有效图片的索引（从0开始）。如果全部有效则返回全部索引。
示例：{"validIndices":[0,1,3]}`,
        { model: 'gemini-3.5-flash', maxTokens: 1000 }
      );
      let validIndices: number[] = [];
      try {
        const screenParsed = extractJson<{ validIndices?: number[] }>(screenRaw);
        validIndices = screenParsed?.validIndices && screenParsed.validIndices.length > 0 ? screenParsed.validIndices : productImages.map((_, i) => i);
      } catch { validIndices = productImages.map((_, i) => i); }

      // 只保留筛选后的图片
      const filteredB64s = validIndices.map(i => b64sAll[i]).filter(Boolean);
      const filteredFiles = validIndices.map(i => productImages[i]).filter(Boolean);

      // Step 0: Identify each image
      setProgress('AI正在识别每张图片展示的产品部位...');
      const identifyPrompt = `分析所有上传的图片，对每张图片用一句话（10字以内）说明这张图展示的是产品的哪个部分或角度。
返回JSON数组，顺序与图片顺序一致。
示例：["产品正面","产品背面","接口特写","侧面按键","包装正面"]
仅输出JSON数组，不要其他文字。`;
      const identifyRaw = await analyzeMultipleImages(filteredB64s, identifyPrompt, { model: 'gemini-3.5-flash', maxTokens: 1000 });
      let imageLabels: string[] = [];
      try {
        const labelsParsed = extractJson<string[]>(identifyRaw);
        if (Array.isArray(labelsParsed) && labelsParsed.length === filteredB64s.length) imageLabels = labelsParsed;
      } catch {}
      if (imageLabels.length === 0) imageLabels = filteredB64s.map((_, i) => `产品图 ${i + 1}`);
      const imageDesc = imageLabels.map((label, i) => `图${i + 1}：${label}`).join('\n');

      // 深度产品分析（始终执行）
      let finalTitle = productTitle;
      let finalDesc = customDescription;
      let analysisContext = '';
      setProgress('AI正在深度分析产品...');
      const raw = await analyzeMultipleImages(filteredB64s, PRODUCT_DEEP_ANALYSIS_PROMPT, { model: 'gemini-3.5-flash', maxTokens: 4000 });
      const parsed = extractJson(raw) as Record<string, any> | null;
      if (parsed) {
        setDeepAnalysis(parsed);
        if (!finalTitle.trim() && parsed.title) {
          setProductTitle(parsed.title);
          finalTitle = parsed.title;
        }
        if (!finalDesc.trim() && parsed.description) {
          setCustomDescription(parsed.description);
          finalDesc = parsed.description;
        }
        analysisContext = `\n## AI深度分析产品信息\n品牌：${parsed.brand || ''}\n品类：${parsed.category || ''}\n规格：${parsed.specs || ''}\n卖点：${parsed.sellingPoints || ''}\n目标人群：${parsed.targetAudience || ''}\n核心痛点：${parsed.painPoints || ''}\n差异化优势：${parsed.differentiators || ''}\n使用场景：${parsed.useScenarios || ''}\n决策因素：${parsed.decisionFactors || ''}`;
        // 提取关键词矩阵用于后续生图
        if (parsed.keywordMatrix) {
          const km = parsed.keywordMatrix;
          analysisContext += `\n\n## 关键词矩阵\n核心功能词：${(km.coreFunction || []).join('、')}\n情感词：${(km.emotional || []).join('、')}\n信任词：${(km.trust || []).join('、')}\n场景词：${(km.scenario || []).join('、')}\n差异化词：${(km.differentiator || []).join('、')}`;
        }
      }

      // 准备高分辨率图片URLs供生成阶段使用
      const urls = await Promise.all(filteredFiles.map(item => fileToDataUrl(item.file, 1536)));
      
      // 存储分析结果
      analysisRef.current = {
        filteredB64s,
        filteredFiles,
        imageLabels,
        imageDesc,
        finalTitle,
        finalDesc,
        analysisContext,
        urls
      };

      setAnalysisComplete(true);
      setToast({ message: '分析完成！请确认后点击"开始生成"', type: 'success' });
    } catch (err: any) {
      console.error('分析失败:', err);
      setToast({ message: '分析失败: ' + (err.message || '请稍后重试'), type: 'error' });
    } finally {
      setAnalyzing(false);
      setProgress('');
    }
  };

  const handleGenerate = async () => {
    if (!analysisRef.current) {
      setToast({ message: '请先进行AI分析', type: 'error' });
      return;
    }
    const { filteredB64s, imageDesc, finalTitle, finalDesc, analysisContext, urls } = analysisRef.current;
    const langLabel = LANGUAGES.find(l => l.value === language)?.label || 'English';

    setIsGenerating(true);
    setProgress('');
    imageLibraryService.clearSavedUrlsCache();

    try {
      // 定义一个生成函数，根据模式和卡片列表生成图片
      const generateForMode = async (currentMode: string, cards: Card[]) => {
        const currentRatio = isMultiMode ? MODE_RATIOS[currentMode].default : aspectRatio;
        // 提取关键词矩阵
        const km = deepAnalysis?.keywordMatrix;
        // 每张图对应的关键词类别映射（买家心理排序）
        const cardKeywordMap: Record<number, { category: string; keywords: string[] }> = {};
        if (km) {
          cardKeywordMap[1] = { category: '场景+情感', keywords: [...(km.scenario || []), ...(km.emotional || [])] };
          cardKeywordMap[2] = { category: '核心功能', keywords: km.coreFunction || [] };
          cardKeywordMap[3] = { category: '差异化', keywords: km.differentiator || [] };
          cardKeywordMap[4] = { category: '信任', keywords: km.trust || [] };
        }
        // 统一视觉风格指南：所有图片共享相同的光影、色调和背景基调
        const visualStyleGuide = `\n\n## 统一视觉风格规范（本组9张图片必须严格遵守）\n\n### 色彩系统\n- 背景色：暖米色（warm beige/cream #F5F0EB）\n- 强调色：深森林绿（deep forest green #2D4A2D）\n- 点缀色：暖棕色（warm brown #C4A882）\n- 文字色：深绿色标题 + 深棕色正文\n- 白底图：纯白色背景（#FFFFFF）\n\n### 字体规范\n- 大标题：深绿色粗体无衬线字体（bold sans-serif, deep green）\n- 副标题：深棕色细体字（light-weight, dark brown）\n- 标签：白色文字+深绿色背景（white text on deep green pill）\n\n### 布局元素\n- 圆角卡片：border-radius 20-30px\n- 波浪分割线：wave/curve dividers\n- 图标标签：深绿色圆角标签+白色文字\n- 图标：白色圆形背景+深绿色细线条图标\n\n### 光影氛围\n- 光源：左侧自然光（soft natural daylight from left）\n- 阴影：柔和一致（gentle shadows）\n- 氛围：温馨居家、高端质感\n\n### 场景风格\n- 环境：cozy home interior, wooden floors, plants, warm decor\n- 气氛：现代简约 | 温馨居家 | 高端质感\n\n### 9张图结构一致性\n- 图0：纯白色背景产品图（电商主图标准）\n- 图1-8：暖米色背景+深绿色强调色轮播图\n- 所有图片保持完全相同的色调、光影、布局风格\n- 每张图的标题颜色、标签样式必须统一\n- 拼接展示时视觉连贯无缝\n\n### 关键词矩阵应用\n- 基于AI分析的关键词矩阵规划每张图内容\n- 确保每张图都有明确的营销目的\n- 覆盖：白底展示、差异化、功能、信任、场景、规格、易用性、品质、行动号召`;
        let doneCount = 0;
        const limit = createConcurrencyLimit(3);
        const tasks = cards.map((card, i) => {
          const genTemplate = MODE_GEN_PROMPTS[currentMode];
          // 注入该张图对应的关键词
          const cardKw = cardKeywordMap[i];
          const keywordHint = cardKw && cardKw.keywords.length > 0
            ? `\n\n## 本张图必须融入的关键词（${cardKw.category}）\n${cardKw.keywords.join('、')}\n请将这些关键词自然融入画面设计中`
            : '';
          const genPrompt = genTemplate
            .replace('{title}', finalTitle)
            .replace('{desc}', `${card.desc}。${finalDesc || ''}`)
            + `${analysisContext}${visualStyleGuide}${keywordHint}\n\n要求：\n- **产品本身已有的文字、标签、Logo、包装文字绝对不能被翻译或修改，必须保持原样**\n- 产品上的中文文字不能变成英文，反之亦然\n- 产品的造型、颜色、材质等视觉特征必须与参考图一致\n- 画面新增文案使用${langLabel}\n- 每张图差异化，互不重复`;
          return limit(async () => {
            setProgress(`${MODE_LABEL_MAP[currentMode]} 生成中 (${doneCount + 1}/${cards.length})...`);
            try {
              const refIndices = card.refImageIndices?.filter(idx => idx >= 0 && idx < urls.length) || []
              const images = refIndices.length > 0 ? refIndices.map(idx => urls[idx]) : urls
              const resp = await editImage({ prompt: genPrompt, images, aspectRatio: currentRatio, resolution: quality, model: selectedModel });
              if (resp.data?.[0]?.url) {
                setResults(prev => [{ url: resp.data[0].url, title: `[${MODE_LABEL_MAP[currentMode]}] ${card.title}` }, ...prev]);
                imageLibraryService.saveToLibrary({ image_url: resp.data[0].url, prompt: genPrompt, model: String(selectedModel || 'nanobann2'), aspect_ratio: String(currentRatio), resolution: String(quality || '2K'), type: 'edited' });
              }
            } catch {}
            doneCount++;
            setProgress(`${MODE_LABEL_MAP[currentMode]} 生成中 (${doneCount}/${cards.length})...`);
          });
        });
        await Promise.all(tasks);
      };

      if (selectedModes.length > 1) {
        // 多模式：一次API调用规划所有选中的模式
        const modeNames = selectedModes.map(m => MODE_LABEL_MAP[m]).join('、');
        setProgress(`AI正在规划${modeNames}方案...`);

        // 构建各模式的要求描述
        const modeReqs: string[] = [];
        if (selectedModes.includes('main')) {
          modeReqs.push(`- 主图：白色纯背景，产品居中占85%以上，无文字无logo（通常5-8张）`);
        }
        if (selectedModes.includes('aplus')) {
          modeReqs.push(`- A+页面（desc必须是完整英文图像生成提示词）：先判断产品品类，再选择模块组合。通用模块：
  A. Hero品牌大图（必选）— 产品在真实使用场景中，叠加品牌名+产品标题+卖点关键词
  B. 卖点图标条 — 4-5个图标+关键词横向排列
  C. 功能特写详解 — 产品局部特写+功能图标网格
  D. 使用场景网格 — 不同使用场景+标签
  E. 材质/品质展示 — 特写+特性图标
  品类专属模块：服装→多色展示+尺码表，茶叶→产地+冲泡步骤+风味图，手表→参数表+功能演示，护肤品→成分解析+使用步骤+前后对比，家居→尺寸图+使用演示，户外→多场景+耐用性展示
  收尾：规格参数表或品牌故事。根据产品特征选5-8个模块，必含Hero大图`);
        }
        if (selectedModes.includes('poster')) {
          modeReqs.push(`- 海报：促销风格，产品视觉中心，情绪氛围（通常3-5张）`);
        }

        const combinedPrompt = `你是一位亚马逊视觉设计师。为以下产品同时规划以下类型的视觉方案：${modeNames}。

产品：${finalTitle}
描述：${finalDesc || ''}${analysisContext}
目标语言：${langLabel}

## 上传图片清单
${imageDesc}

重要：每张轮播图必须指定使用哪张参考图。在输出中为每个对象添加 "refImageIndices" 字段，表示该轮播图需要参考哪些上传的图片（数组中的数字对应上文图1、图2...的索引，从0开始）。例如某张轮播图需要参考第1张和第3张图，则写 "refImageIndices": [0, 2]。

请输出JSON，格式如下：
${selectedModes.map(m => `  "${m}": [{"title":"标题","desc":"画面描述"},...]`).join(',\n')}

## 各类型要求
${modeReqs.join('\n')}
- 所有文案使用目标语言，每张图差异化不重复
- ★★★ 整套图片无论哪种类型，色调、光影方向、背景风格必须高度统一，左右拼接展示时视觉连贯无缝 ★★★`;
        const combinedRaw = await analyzeMultipleImages(filteredB64s, combinedPrompt, { model: 'gemini-3.5-flash', maxTokens: 12000 });
        const combined = extractJson(combinedRaw);
        if (combined) {
          for (const cm of selectedModes) {
            const cards = combined[cm];
            if (Array.isArray(cards) && cards.length > 0) {
              await generateForMode(cm, cards);
            } else {
              console.warn(`${MODE_LABEL_MAP[cm]}方案为空，跳过`);
            }
          }
        }
      } else {
        // 单个模式：正常走一个API
        const currentMode = selectedModes[0];
        setProgress(`AI正在规划${MODE_LABEL_MAP[currentMode]}方案...`);
        const singlePrompt = currentMode === 'main' ? MAIN_IMAGE_PROMPT : currentMode === 'aplus' ? APLUS_IMAGE_PROMPT : POSTER_IMAGE_PROMPT;
        const userContent = `${singlePrompt}\n\n=====\n\n产品：${finalTitle}\n描述：${finalDesc || ''}${analysisContext}\n目标语言：${langLabel}\n\n## 上传图片清单\n${imageDesc}\n\n重要：每张轮播图必须指定使用哪张参考图。在输出中为每个对象添加 "refImageIndices" 字段，表示该轮播图需要参考哪些上传的图片（数组中的数字对应上文图1、图2...的索引，从0开始）。例如某张轮播图需要参考第1张和第3张图，则写 "refImageIndices": [0, 2]。\n\n根据产品特征自行决定最适合的图片数量。`;
        const raw2 = await analyzeMultipleImages(filteredB64s, userContent, { model: 'gemini-3.5-flash', maxTokens: 8000 });
        const cards = extractJson<Card[]>(raw2);
        if (Array.isArray(cards) && cards.length > 0) {
          await generateForMode(currentMode, cards);
        }
      }
    } catch (err: any) {
      console.error('生成失败:', err);
      setToast({ message: '生成失败: ' + (err.message || '请稍后重试'), type: 'error' });
    } finally {
      setIsGenerating(false);
      setProgress('');
    }
  };

  const handleDownload = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `amazon-${Date.now()}.png`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleDownloadAll = async () => {
    for (const item of results) {
      await handleDownload(item.url);
    }
  };

  // 合并A+图片为长截图
  const handleMergeImages = async () => {
    if (results.length < 2) {
      setToast({ message: '至少需要2张图片才能合并', type: 'error' });
      return;
    }
    setMerging(true);
    setToast({ message: '正在合并图片...', type: 'success' });

    try {
      // 加载所有图片
      const imagePromises = results.map((item) => {
        return new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = item.url;
        });
      });

      const images = await Promise.all(imagePromises);

      // 计算合并后的尺寸（所有图片等宽，高度相加）
      const targetWidth = Math.max(...images.map(img => img.width));
      const totalHeight = images.reduce((sum, img) => {
        const ratio = targetWidth / img.width;
        return sum + img.height * ratio;
      }, 0);

      // 创建Canvas
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = totalHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('无法创建Canvas');
      }

      // 绘制所有图片
      let currentY = 0;
      for (const img of images) {
        const ratio = targetWidth / img.width;
        const drawHeight = img.height * ratio;
        ctx.drawImage(img, 0, currentY, targetWidth, drawHeight);
        currentY += drawHeight;
      }

      // 导出为图片并下载
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `aplus-long-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
          setToast({ message: '合并成功！', type: 'success' });
        } else {
          setToast({ message: '合并失败', type: 'error' });
        }
        setMerging(false);
      }, 'image/png');
    } catch (err) {
      console.error('合并图片失败:', err);
      setToast({ message: '合并失败: ' + (err as Error).message, type: 'error' });
      setMerging(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      <div className="flex items-center gap-3 px-6 h-14 border-b border-gray-200 flex-shrink-0 bg-gray-50">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center"><ShoppingCart size={16} className="text-white" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[#171717]">亚马逊生图</h1>
          <p className="text-[10px] text-gray-400 leading-tight">主图 · A+页面 · 海报，一站式亚马逊视觉生成</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[380px] border-r border-gray-200 overflow-y-auto p-5 space-y-4 flex-shrink-0 bg-gray-50">
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Images size={16} className="text-blue-500" />
              <div><h3 className="text-sm font-semibold text-[#171717]">产品图片</h3><p className="text-xs text-gray-400">所有图片作为参考传入</p></div>
              <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-xl">{productImages.length}/10</span>
            </div>
            {productImages.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mb-3">{productImages.map((item, idx) => (
                <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden bg-gray-100">
                  <img src={item.preview} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removeImage(idx)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100"><X size={14} className="text-white" /></button>
                </div>
              ))}</div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleUpload} multiple accept="image/*" className="hidden" />
            <div onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[#D1D5DB] bg-[#FAFAFA] p-3 flex flex-col items-center justify-center gap-1.5 hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer rounded-xl group"
              role="button" tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}>
              <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                <Plus size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
              </div>
              <span className="text-xs text-gray-400 group-hover:text-blue-600 transition-colors">上传产品图</span>
              <span className="text-[10px] text-[#BDBDBD]">支持 JPG/PNG，单张不超过 20MB</span>
            </div>
          </div>

          {/* 模式选择 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Layout size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">模式</span>
              <span className="text-[10px] text-gray-400 ml-auto">可多选</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map(m => {
                const active = selectedModes.includes(m.value);
                return (
                  <button key={m.value} onClick={() => handleModeToggle(m.value)}
                    className={`py-2.5 rounded-xl text-xs font-medium transition-all border ${active ? 'bg-blue-500 text-white border-blue-500' : 'bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200'}`}>{m.label}</button>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">
              {selectedModes.length > 1
                ? `将依次生成 ${selectedModes.map(m => MODE_LABEL_MAP[m]).join(' + ')}`
                : `默认比例：${MODE_RATIOS[selectedModes[0]]?.default || '1:1'}`}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <ShoppingCart size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">产品标题 <span className="text-red-500">*</span></span>
            </div>
            <input value={productTitle} onChange={e => setProductTitle(e.target.value)} placeholder="例如：Wireless Bluetooth Headphones"
              className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-2xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder:text-gray-400" />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">描述（可选）</span>
            </div>
            <textarea value={customDescription} onChange={e => { setCustomDescription(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder="卖点、颜色、材质、风格要求等"
              className="w-full bg-[#F5F5F5] rounded-2xl p-3 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none text-[#333333] placeholder:text-gray-400 overflow-hidden" rows={1}
              ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Globe size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">目标语言</span>
            </div>
            <select value={language} onChange={e => { setLanguage(e.target.value); saveLanguage(e.target.value); }}
              className="w-full bg-[#F5F5F5] px-3 py-2.5 rounded-2xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-gray-200 appearance-none cursor-pointer">
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Layout size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">比例</span>
            </div>
            {isMultiMode ? (
              <div className="flex flex-col gap-1.5">
                {selectedModes.map(m => (
                  <div key={m} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                    <span className="text-xs font-medium text-gray-600">{MODE_LABEL_MAP[m]}</span>
                    <span className="text-xs text-blue-500 font-medium">{MODE_RATIOS[m].default}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${ratioOptions.length}, 1fr)` }}>
                {ratioOptions.map(r => (
                  <button key={r} onClick={() => setAspectRatio(r)}
                    className={`py-2 rounded-xl text-xs font-medium transition-all ${aspectRatio === r ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{r}</button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Images size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">模型</span>
            </div>
            <div className="relative">
              <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                className="w-full bg-gray-100 px-3 py-2.5 pr-8 rounded-xl text-sm text-[#171717] border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer">
                {models.length > 0 ? models.map(m => <option key={m.value} value={m.value}>{m.label}</option>) : <option value="nanobann2">Nanobann2</option>}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <ModelSpeedNote />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-[#171717]">分辨率</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {['2K', '4K'].map(q => (
                <button key={q} onClick={() => setQuality(q)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${quality === q ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{q}</button>
              ))}
            </div>
          </div>

          {!analyzing && !isGenerating && !analysisComplete && (
            <button onClick={handleAnalyze} disabled={productImages.length === 0}
              className="w-full bg-gradient-to-r from-[#171717] to-[#333333] text-white py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:from-[#27272A] hover:to-[#404040] transition-all disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 shadow-md hover:shadow-lg disabled:shadow-none">
              <Sparkles size={18} /> AI分析
            </button>
          )}
          {!analyzing && !isGenerating && analysisComplete && (
            <div className="space-y-2">
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                <p className="text-xs text-green-700 font-medium">分析完成！请确认信息后点击生成</p>
              </div>
              <button onClick={handleGenerate}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg">
                <Wand2 size={18} /> 开始生成
              </button>
              <button onClick={() => { setAnalysisComplete(false); analysisRef.current = null; }}
                className="w-full bg-gray-100 text-gray-600 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2 hover:bg-gray-200 transition-all">
                重新分析
              </button>
            </div>
          )}
          {(analyzing || isGenerating) && (
            <div className="text-center text-xs text-gray-400 bg-gray-100 rounded-xl py-3 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              {isGenerating ? (progress || '生成中...') : 'AI分析中...'}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
          {!analyzing && !isGenerating && results.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="relative mx-auto mb-6">
                  <div className="w-28 h-28 mx-auto bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 rounded-3xl flex items-center justify-center shadow-lg shadow-amber-100/50">
                    <ShoppingCart size={44} className="text-amber-400/80" />
                  </div>
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-500 rounded-xl flex items-center justify-center shadow-md animate-pulse">
                    <Sparkles size={14} className="text-white" />
                  </div>
                </div>
                <h2 className="text-xl font-bold text-[#171717] mb-2">亚马逊生图</h2>
                <p className="text-sm text-gray-400 leading-relaxed mb-6">上传产品图 → 选择模式 → 一键生成亚马逊视觉</p>
                <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto">
                  {[
                    { label: '主图', desc: '白底产品展示' },
                    { label: 'A+ 页面', desc: '品牌详情页' },
                    { label: '海报', desc: '促销视觉' },
                  ].map((item, i) => (
                    <div key={i} className="bg-gradient-to-b from-[#F8F8F8] to-[#F0F0F0] rounded-xl py-3 px-2 text-center border border-[#E8E8E8]">
                      <p className="text-xs font-semibold text-[#171717] mb-0.5">{item.label}</p>
                      <p className="text-[10px] text-[#A3A3A3]">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6">
              {analyzing && results.length === 0 && (
                <LoadingAnimation
                  title="AI 正在分析"
                  description={progress || '分析产品并规划方案...'}
                  progress={progress || undefined}
                />
              )}
              {isGenerating && !analyzing && (
                <div className="mb-4">
                  <LoadingAnimation
                    title="正在生成"
                    description={progress || '正在生成...'}
                    progress={progress || undefined}
                    showProgressBar
                  />
                </div>
              )}
              {results.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-[#171717]">
                      已生成 ({results.length})
                      {isGenerating && <span className="text-xs text-[#A3A3A3] font-normal ml-2">生成中...</span>}
                    </h2>
                    <div className="flex items-center gap-2">
                      {isGenerating && (
                        <div className="flex items-center gap-2 text-xs text-[#A3A3A3] bg-[#F5F5F5] rounded-xl px-3 py-1.5">
                          <Loader2 size={12} className="animate-spin text-violet-500" />
                          {progress}
                        </div>
                      )}
                      {selectedModes.includes('aplus') && results.length >= 2 && (
                        <button
                          onClick={handleMergeImages}
                          disabled={merging}
                          className="flex items-center gap-1.5 text-sm text-white px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm disabled:opacity-50"
                        >
                          {merging ? (
                            <><Loader2 size={14} className="animate-spin" /> 合并中...</>
                          ) : (
                            <><Columns3 size={14} /> 合并长截图</>
                          )}
                        </button>
                      )}
                      <button
                        onClick={handleDownloadAll}
                        className="flex items-center gap-1.5 text-sm text-white px-4 py-2 bg-gradient-to-r from-[#171717] to-[#333333] rounded-xl hover:from-[#27272A] hover:to-[#404040] transition-all shadow-sm"
                      >
                        <Download size={14} /> 下载全部
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                    {results.map((item, idx) => (
                      <div key={idx} className="group relative bg-gray-50 rounded-2xl overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow">
                        <div className="aspect-square cursor-pointer relative" onClick={() => setPreviewImage(item.url)}>
                          <img src={item.url} alt="" className="w-full h-full object-cover" />
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                            <button
                              onClick={(e) => { e.stopPropagation(); setPreviewImage(item.url); }}
                              className="w-9 h-9 bg-white/90 backdrop-blur-sm rounded-xl flex items-center justify-center shadow-md hover:bg-white transition-colors"
                              title="预览"
                            >
                              <Images size={16} className="text-[#171717]" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setReEditImage(item.url); }}
                              className="w-9 h-9 bg-white/90 backdrop-blur-sm rounded-xl flex items-center justify-center shadow-md hover:bg-white transition-colors"
                              title="重新编辑"
                            >
                              <Wand2 size={14} className="text-[#171717]" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDownload(item.url); }}
                              className="w-9 h-9 bg-white/90 backdrop-blur-sm rounded-xl flex items-center justify-center shadow-md hover:bg-white transition-colors"
                              title="下载"
                            >
                              <Download size={14} className="text-[#171717]" />
                            </button>
                          </div>
                        </div>
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-600 truncate">{item.title}</span>
                          <button onClick={() => handleDownload(item.url)} className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#171717]"><Download size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <ImagePreviewModal isOpen={!!previewImage} onClose={() => setPreviewImage(null)} imageUrl={previewImage || ''} />
      <ReEditModal
        isOpen={!!reEditImage}
        imageUrl={reEditImage || ''}
        aspectRatio={aspectRatio}
        model={selectedModel}
        resolution={quality}
        onClose={() => setReEditImage(null)}
        onReplaced={(oldUrl, newUrl) => { setResults(prev => prev.map(item => item.url === oldUrl ? {...item, url: newUrl} : item)); }}
      />
      {toast && (
        <Toast message={toast.message} type={toast.type} visible onClose={() => setToast(null)} />
      )}
    </div>
  );
};
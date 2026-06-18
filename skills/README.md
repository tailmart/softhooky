# 产品精修 Skills

智能场景融合精修工具，支持多种电商、社媒、视频内容生成。

## 触发方式

### 方式一：直接对话
用户输入包含以下关键词即可触发：
- `softhooky生图`
- `用softhooky生图`
- `我想用softhooky生图`
- `softhooky生成`
- `用softhooky生成`

### 方式二：提供图片修图
用户发送图片 + 触发词 + 需求描述：
```
我想用softhooky生图，把这张产品图背景换成白色
```

## 工作流程

### 流程一：新用户生图
```
用户: "我想用softhooky生图"
   ↓
系统: "请先登录，请提供您的账号和密码"
   ↓
用户: "user@example.com/password123"
   ↓
系统: "登录成功！请选择您需要的功能：..."
   ↓
用户: "独立站轮播图"
   ↓
系统: "请上传产品图片，并告诉我产品标题和描述"
   ↓
用户: "[图片URL] 产品标题：xxx，描述：xxx"
   ↓
系统: "请选择比例：1:1、3:4、4:3、16:9、9:16？"
   ↓
用户: "16:9"
   ↓
系统: "请选择模型：nano（快速）还是 gpt（高质量）？"
   ↓
用户: "gpt"
   ↓
系统: [查询积分] → [生成图片] → [扣费] → [返回结果]
```

### 流程二：修图模式
```
用户: "我想用softhooky生图，把这张产品图背景换成白色 [图片URL]"
   ↓
系统: "检测到您提供了图片，将进入修图模式。
       请告诉我：
       1. 您的修图需求是什么？
       2. 选择模型：nano 还是 gpt？
       3. 选择比例：1:1、3:4、4:3、16:9、9:16？"
   ↓
用户: "背景换成白色，gpt，1:1"
   ↓
系统: [查询积分] → [生成图片] → [扣费] → [返回结果]
```

## 功能列表

### 智能场景融合
| 功能 | nano积分 | gpt积分 | 说明 |
|------|---------|---------|------|
| 推荐 | 5 | 10 | 智能推荐最佳产品展示方案 |
| 三视图生成 | 15 | 30 | 生成产品正面、侧面、背面三视图 |

### 电商
| 功能 | nano积分 | gpt积分 | 说明 |
|------|---------|---------|------|
| 智能设计克隆 | 10 | 20 | 将产品迁移到不同设计风格 |
| 独立站轮播图 | 20 | 40 | 生成独立站首页轮播图 |
| 亚马逊轮播图 | 20 | 40 | 生成亚马逊A+页面轮播图 |
| 详情页设计 | 30 | 60 | 生成产品详情页 |
| Banner设计 | 15 | 30 | 生成电商Banner图 |

### 社媒
| 功能 | nano积分 | gpt积分 | 说明 |
|------|---------|---------|------|
| 小红书种草图文 | 10 | 20 | 生成小红书风格种草内容 |
| 社媒POV出图 | 10 | 20 | 生成社交媒体视角图 |

### 视频
| 功能 | nano积分 | gpt积分 | 说明 |
|------|---------|---------|------|
| 故事板 | 25 | 50 | 生成视频故事板 |
| TK脚本图 | 25 | 50 | 生成TikTok视频脚本图 |

### 工具
| 功能 | nano积分 | gpt积分 | 说明 |
|------|---------|---------|------|
| 电商文案助手 | 5 | 10 | 生成电商产品文案 |

## 快速开始

### 1. 安装依赖

```bash
npm install axios
```

### 2. 导入 Skill

```typescript
import { ProductRefinementSkill } from './skills/product-refinement';

const skill = new ProductRefinementSkill();
```

### 3. 登录

```typescript
const success = await skill.login('username', 'password');
if (success) {
  console.log('登录成功');
} else {
  console.log('登录失败');
}
```

### 4. 查询积分

```typescript
const credits = await skill.refreshCredits();
console.log(`当前积分: ${credits}`);
```

### 5. 生成图片

```typescript
const result = await skill.generate({
  type: 'standalone-carousel',
  images: ['https://example.com/product.jpg'],
  title: 'Product Title',
  description: 'Product Description',
  language: '英文',
  ratio: '16:9',
  model: 'gpt',
});

if (result.success) {
  console.log(`图片URL: ${result.imageUrl}`);
  console.log(`消耗积分: ${result.creditsUsed}`);
}
```

## 图片比例说明

| 比例 | 适用场景 |
|------|---------|
| 1:1 | 正方形，适用于大多数平台 |
| 3:4 | 竖版，适用于小红书、Instagram |
| 4:3 | 横版，适用于Banner、轮播图 |
| 16:9 | 宽屏，适用于视频封面 |
| 9:16 | 竖屏，适用于短视频 |

## 模型选择

- **nano模型**: 快速生成，适合简单需求，消耗积分少
- **gpt模型**: 高质量生成，适合复杂需求，消耗积分多

## 工作流程

1. 用户登录 → 验证账号密码
2. 查询积分 → 确认余额充足
3. 选择功能 → 从功能列表中选择
4. 上传素材 → 提供产品图片等
5. 设置参数 → 比例、模型、语言等
6. 生成图片 → 调用AI接口
7. 扣费保存 → 扣除积分并保存到图片库
8. 返回结果 → 展示生成的图片

## 文件结构

```
skills/
├── product-refinement.md    # 功能说明文档
├── product-refinement.ts    # 核心实现代码
├── example.ts              # 使用示例
└── README.md               # 本文件
```

## API接口

### 登录接口
```
POST /api/auth/login
```

### 积分查询接口
```
GET /api/user/credits
```

### 图片生成接口
```
POST /api/generate/image
```

### 扣费接口
```
POST /api/user/deduct-credits
```

### 图片保存接口
```
POST /api/user/gallery
```

## 注意事项

1. 首次使用需要先登录获取token
2. 生成前会自动检查积分是否充足
3. 生成成功后会自动扣费
4. 所有生成的图片都会保存到用户图片库
5. 不同模型消耗的积分不同，请根据需求选择

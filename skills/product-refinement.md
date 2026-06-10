# 产品精修 Skill

## 功能概述
AI产品视觉精修工具，支持多种电商、社媒、视频内容生成。

## 触发方式

### 关键词触发
用户输入包含以下关键词即可触发：
- `softhooky生图`
- `用softhooky生图`
- `我想用softhooky生图`
- `softhooky生成`
- `用softhooky生成`

### 图片+需求触发
用户发送图片 + 触发词 + 需求描述，自动进入修图模式：
```
我想用softhooky生图，把这张产品图背景换成白色
```

## 功能分类

### AI产品视觉
- **推荐** - 智能推荐最佳产品展示方案
- **手持产品** - 生成手持产品展示效果
- **三视图生成** - 生成产品正面、侧面、背面三视图

### 电商
- **设计风格迁移** - 将产品迁移到不同设计风格
- **独立站轮播图** - 生成独立站首页轮播图
- **亚马逊轮播图** - 生成亚马逊A+页面轮播图
- **详情页设计** - 生成产品详情页
- **Banner设计** - 生成电商Banner图
- **智能海报设计** - 智能生成营销海报

### 社媒
- **小红书种草图文** - 生成小红书风格种草内容
- **社媒POV出图** - 生成社交媒体视角图

### 视频
- **故事板** - 生成视频故事板
- **TK脚本图** - 生成TikTok视频脚本图

### 工具
- **电商文案助手** - 生成电商产品文案

## 工作流程

### 流程一：标准生图流程
```
1. 检测触发词 → 识别用户意图
2. 用户登录 → 验证账号密码
3. 查询积分 → 确认余额充足
4. 功能选择 → 从功能列表中选择
5. 上传素材 → 提供产品图片等
6. 设置参数 → 比例、模型、语言等
7. 生成图片 → 调用AI接口
8. 扣费保存 → 扣除积分并保存到图片库
9. 返回结果 → 展示生成的图片
```

### 流程二：修图流程
```
1. 检测触发词 + 图片 → 识别为修图模式
2. 用户登录 → 验证账号密码
3. 查询积分 → 确认余额充足
4. 收集修图需求 → 用户描述修改内容
5. 设置参数 → 比例、模型
6. 生成图片 → 调用AI接口
7. 扣费保存 → 扣除积分并保存到图片库
8. 返回结果 → 展示修图后的图片
```

### 交互示例

#### 示例1：生图
```
用户: 我想用softhooky生图
系统: 请先登录，请提供您的账号和密码（格式：账号/密码）
用户: test/123456
系统: 登录成功！请选择您需要的功能：
      【AI产品视觉】
        1. 推荐
        2. 手持产品
        3. 三视图生成
      【电商】
        4. 设计风格迁移
        5. 独立站轮播图
        ...
用户: 5
系统: 请上传产品图片，并告诉我产品标题和描述
用户: [图片] 标题：Premium Headphones，描述：高品质无线耳机
系统: 请选择比例：1:1、3:4、4:3、16:9、9:16？
用户: 16:9
系统: 请选择模型：nano（快速，20积分）还是 gpt（高质量，40积分）？
用户: gpt
系统: [生成中...] 
      生成成功！
      图片URL: https://xxx.jpg
      消耗积分: 40
      剩余积分: 60
```

#### 示例2：修图
```
用户: 我想用softhooky生图，把这张产品图背景换成白色 https://example.com/product.jpg
系统: 检测到您提供了图片，将进入修图模式。
      请告诉我：
      1. 您的修图需求是什么？
      2. 选择模型：nano 还是 gpt？
      3. 选择比例：1:1、3:4、4:3、16:9、9:16？
用户: 背景换成白色，gpt，1:1
系统: [生成中...]
      生成成功！
      图片URL: https://xxx_edited.jpg
      消耗积分: 20
      剩余积分: 80
```

## 积分规则

| 功能 | nano模型积分 | gpt模型积分 |
|------|-------------|-------------|
| 推荐 | 5 | 10 |
| 手持产品 | 10 | 20 |
| 三视图生成 | 15 | 30 |
| 设计风格迁移 | 10 | 20 |
| 独立站轮播图 | 20 | 40 |
| 亚马逊轮播图 | 20 | 40 |
| 详情页设计 | 30 | 60 |
| Banner设计 | 15 | 30 |
| 智能海报设计 | 15 | 30 |
| 小红书种草图文 | 10 | 20 |
| 社媒POV出图 | 10 | 20 |
| 故事板 | 25 | 50 |
| TK脚本图 | 25 | 50 |
| 电商文案助手 | 5 | 10 |

## 示例提示词

### 独立站轮播图
```
请为我生成独立站轮播图：
- 产品图片：[用户上传]
- 产品标题：Premium Wireless Headphones
- 产品描述：Experience crystal-clear audio with our premium wireless headphones. Features noise cancellation, 30-hour battery life, and comfortable over-ear design.
- 生成语言：英文
- 比例：16:9
- 模型：gpt
```

### 小红书种草图文
```
请为我生成小红书种草图文：
- 产品图片：[用户上传]
- 种草文案：这款面膜真的太好用了！敷完皮肤嫩得像剥了壳的鸡蛋
- 标签：#面膜推荐 #护肤好物 #变美日记
- 比例：3:4
- 模型：nano
```

## API接口规范

### 登录接口
```typescript
POST /api/auth/login
Body: { username: string, password: string }
Response: { success: boolean, token: string, userId: string }
```

### 积分查询接口
```typescript
GET /api/user/credits
Headers: { Authorization: Bearer <token> }
Response: { credits: number }
```

### 图片生成接口
```typescript
POST /api/generate/image
Headers: { Authorization: Bearer <token> }
Body: {
  type: string,        // 功能类型
  images: string[],    // 产品图片URL
  params: object,      // 功能参数
  ratio: string,       // 比例
  model: string        // 模型类型
}
Response: { 
  success: boolean, 
  imageUrl: string,
  creditsUsed: number,
  remainingCredits: number
}
```

### 扣费接口
```typescript
POST /api/user/deduct-credits
Headers: { Authorization: Bearer <token> }
Body: { amount: number, type: string, description: string }
Response: { success: boolean, remainingCredits: number }
```

### 图片保存接口
```typescript
POST /api/user/gallery
Headers: { Authorization: Bearer <token> }
Body: { 
  imageUrl: string, 
  type: string, 
  params: object,
  createdAt: Date
}
Response: { success: boolean, imageId: string }
```

## 数据库表结构

### users表
```sql
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  credits INT DEFAULT 100,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### generated_images表
```sql
CREATE TABLE generated_images (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  type VARCHAR(50) NOT NULL,
  params JSON,
  model VARCHAR(20),
  ratio VARCHAR(10),
  credits_used INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### credit_transactions表
```sql
CREATE TABLE credit_transactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  amount INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

# Video Studio 功能增强 PRD

## 1. 背景

Video Studio 页面 (`/video`) 已完成基础UI重构（蓝白主题、三Tab布局）。现需增强以下功能：
- 充值/记录/领券弹窗优化
- 独立媒体库（图片+视频隔离存储）
- 3天自动清理机制（COS + 数据库）

## 2. 功能需求

### 2.1 充值/记录/领券弹窗优化

**现状**：StudioNav 的下拉菜单只有文字按钮，无实际弹窗。

**需求**：
- **充值弹窗**：复用现有充值组件，显示积分套餐选择、支付方式
- **记录弹窗**：显示用户的积分消费记录、视频生成历史
- **领券弹窗**：显示可领取的优惠券列表

### 2.2 独立媒体库

**存储路径**：COS `video/` 目录下
```
video/{userId}/{year}/{month}/video-{timestamp}-{random}.mp4
video/{userId}/{year}/{month}/image-{timestamp}-{random}.jpg
```

**数据隔离**：
- `generated_images` 表中 `type = 'video'` 的记录仅在 Video Studio 显示
- 原图片库查询排除 `type = 'video'` 的记录
- 前端 `imageLibraryService.getImages()` 默认过滤掉 video 类型

**UI差异**：
- **图片展示**：网格缩略图，hover 显示操作按钮
- **视频展示**：带播放按钮的封面图，点击弹出预览播放器
- **统一操作**：下载、删除、查看详情

### 2.3 3天自动清理

**机制**：
- 创建时设置 `expires_at = NOW() + 3天`
- 定时任务每小时检查过期记录
- 删除流程：COS文件删除 → 数据库记录删除

**用户手动清理**：
- 单条删除：立即删除COS文件 + 数据库记录
- 批量清理：清理所有3天前的记录

## 3. 技术方案

### 3.1 数据库

**复用现有表**：`generated_images`，通过 `type = 'video'` 区分。

无需新建表，但需确保：
- video 类型记录的 `expires_at` 正确设置
- 清理任务正确处理 video 类型的 COS 文件

### 3.2 后端API

**新增端点**：
- `GET /api/video/media-library` - 获取video专属媒体库（分页+类型筛选）
- `DELETE /api/video/media/:id` - 删除单条video记录（含COS文件删除）
- `POST /api/video/media/batch-delete` - 批量删除
- `POST /api/video/media/cleanup` - 清理过期记录

**修改端点**：
- `GET /api/images/library` - 排除 `type = 'video'` 的记录
- `POST /api/images/library` - video类型保存时使用video COS路径

### 3.3 前端组件

**新增组件**：
- `VideoMediaLibrary.tsx` - 独立媒体库组件
- `VideoMediaCard.tsx` - 单个媒体卡片（区分图片/视频）
- `RechargeModal.tsx` - 充值弹窗
- `RecordModal.tsx` - 记录弹窗
- `CouponModal.tsx` - 领券弹窗

**修改组件**：
- `StudioNav.tsx` - 下拉菜单触发弹窗
- `VideoTab.tsx` - 生成完成后自动入库
- `ScriptTab.tsx` - 生成完成后自动入库
- `SocialTab.tsx` - 生成完成后自动入库

### 3.4 COS路径规划

```
video/
├── {userId}/
│   ├── {year}/
│   │   ├── {month}/
│   │   │   ├── video-{timestamp}-{random}.mp4
│   │   │   ├── image-{timestamp}-{random}.jpg
│   │   │   └── ...
```

## 4. 验收标准

1. Video Studio 生成的图片/视频仅在 Video Studio 媒体库显示
2. 原图片库不显示任何 video 类型内容
3. 所有 video 类型内容3天后自动清理（COS + 数据库）
4. 用户手动删除立即生效（COS + 数据库）
5. 充值/记录/领券弹窗正常工作
6. 图片和视频在UI上有明显区分（播放按钮、尺寸标识等）

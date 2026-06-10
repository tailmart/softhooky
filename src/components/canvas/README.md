# Canvas 组件说明

画布页面已重构为多个独立组件，便于维护和优化。

## 组件结构

### 核心组件

- **LazyImage.tsx** - 懒加载图片组件
  - 支持 Intersection Observer 懒加载
  - 400px 预加载范围
  - 加载状态和错误处理
  - 使用 React.memo 优化

- **CanvasImage.tsx** - 画布图片组件
  - 支持拖拽定位
  - 下载和删除功能
  - 上传状态显示
  - 自定义比较函数优化渲染

- **MessageImage.tsx** - 聊天消息中的图片
  - 点击添加为参考图
  - 悬停提示
  - React.memo 优化

- **ReferenceImage.tsx** - 参考图缩略图
  - 小尺寸预览
  - 删除功能
  - React.memo 优化

### UI 组件

- **CanvasToolbar.tsx** - 画布工具栏
  - 缩放控制
  - 视图重置
  - 拖拽模式切换

- **ConversationTabs.tsx** - 对话标签页
  - 多对话管理
  - 创建/删除对话
  - 切换对话

- **SettingsPanel.tsx** - 设置面板
  - 分辨率选择
  - 尺寸比例选择
  - 动画效果

- **ChatMessages.tsx** - 聊天消息列表
  - 消息渲染
  - 图片展示
  - 空状态提示

- **ChatInput.tsx** - 输入区域
  - 文本输入
  - 文件上传
  - 参考图管理
  - 设置按钮

## 性能优化

1. **React.memo** - 所有组件都使用 memo 避免不必要的重渲染
2. **懒加载** - 图片使用 Intersection Observer 懒加载
3. **防抖保存** - 500ms 防抖延迟保存状态
4. **useCallback** - 关键函数使用 useCallback 缓存
5. **预加载** - 400px 范围预加载图片

## 代码行数对比

- 旧版 CanvasPage: ~1077 行
- 新版 CanvasPage: ~450 行
- 组件总计: ~800 行（分散在 9 个文件中）

## 使用方式

```tsx
import { CanvasPage } from './pages/CanvasPage';

// 组件会自动加载所有子组件
<CanvasPage />
```

## 维护建议

- 每个组件职责单一，便于独立测试和修改
- 修改 UI 时只需关注对应组件
- 性能优化集中在各个小组件中
- 添加新功能时可以创建新组件而不影响现有代码

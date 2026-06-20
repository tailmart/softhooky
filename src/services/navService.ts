export interface NavItem {
  nav_id: string;
  label: string;
  category: string;
  enabled: boolean;
  sort_order: number;
}

const FALLBACK_NAV_ITEMS: NavItem[] = [
  // 素材工作台
  { nav_id: 'chat-gen', label: '创意生图', category: '素材工作台', enabled: true, sort_order: 0 },
  { nav_id: 'workflow', label: '工作流生图', category: '素材工作台', enabled: true, sort_order: 0.5 },
  { nav_id: 'productRefine', label: '产品精修', category: '素材工作台', enabled: true, sort_order: 1 },
  { nav_id: 'productFusion', label: '产品融图', category: '素材工作台', enabled: true, sort_order: 2 },
  { nav_id: 'productTryon', label: '产品穿搭', category: '素材工作台', enabled: true, sort_order: 3 },
  { nav_id: 'product-9grid', label: '产品展示图', category: '素材工作台', enabled: true, sort_order: 4 },
  { nav_id: 'three-view', label: '三视图生成', category: '素材工作台', enabled: true, sort_order: 5 },
  { nav_id: 'image-edit-region', label: '区域编辑', category: '素材工作台', enabled: true, sort_order: 5.5 },
  { nav_id: 'image-translate', label: '图片转译', category: '店铺上架素材', enabled: true, sort_order: 5.7 },
  // 店铺上架素材
  { nav_id: 'detailClone', label: '版式裂变', category: '店铺上架素材', enabled: false, sort_order: 0 },
  { nav_id: 'amazon-image-gen', label: '亚马逊生图', category: '店铺上架素材', enabled: true, sort_order: 2 },
  { nav_id: 'detail2', label: '详情页设计', category: '店铺上架素材', enabled: true, sort_order: 3 },
  { nav_id: 'tryon', label: '产品试穿', category: '店铺上架素材', enabled: true, sort_order: 4 },
  { nav_id: 'handheld', label: '手持产品', category: '店铺上架素材', enabled: true, sort_order: 5 },
  { nav_id: 'banner', label: 'Banner设计', category: '店铺上架素材', enabled: true, sort_order: 5 },

  // 社媒图文引流
  { nav_id: 'xiaohongshu', label: '小红书种草图文', category: '社媒图文引流', enabled: true, sort_order: 0 },
  { nav_id: 'social', label: '社媒POV出图', category: '社媒图文引流', enabled: true, sort_order: 1 },
  // 短视频带货引流
  { nav_id: 'storyboard', label: '故事板', category: '短视频带货引流', enabled: true, sort_order: 0 },

  { nav_id: 'tk-video', label: 'TK脚本图', category: '短视频带货引流', enabled: true, sort_order: 1 },
];

let cached: NavItem[] | null = null;
let lastFetch = 0;
const CACHE_TTL = 300000;

export async function getAvailableNavItems(): Promise<NavItem[]> {
  const now = Date.now();
  if (cached && now - lastFetch < CACHE_TTL) return cached;
  try {
    const apiUrl = import.meta.env.VITE_API_URL || '';
    const res = await fetch(`${apiUrl}/api/nav`);
    const data = await res.json();
    if (data.success && Array.isArray(data.data) && data.data.length > 0) {
      cached = data.data;
      lastFetch = now;
      return cached!;
    }
  } catch {}
  return FALLBACK_NAV_ITEMS;
}

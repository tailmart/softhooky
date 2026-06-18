import React, { useState, useEffect } from 'react'
import { Loader2, Check, X, Navigation } from 'lucide-react'
import { API_URL } from '../../services/api'

interface NavItem {
  nav_id: string
  label: string
  category: string
  enabled: boolean
  sort_order: number
}

export default function NavManagePage({ token }: { token: string }) {
  const [items, setItems] = useState<NavItem[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => { fetchItems() }, [])

  const fetchItems = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/admin/nav`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.success) {
        let list = data.data || [];
        const ALL_NAVS = [
          { nav_id: 'chat-gen', label: '创意生图', category: '素材工作台', sort_order: 0 },
          { nav_id: 'workflow', label: '工作流生图', category: '素材工作台', sort_order: 1 },
          { nav_id: 'productRefine', label: '产品精修', category: '素材工作台', sort_order: 2 },
          { nav_id: 'productFusion', label: '产品融图', category: '素材工作台', sort_order: 3 },
          { nav_id: 'productTryon', label: '产品穿搭', category: '素材工作台', sort_order: 4 },
          { nav_id: 'product-9grid', label: '产品展示图', category: '素材工作台', sort_order: 5 },
          { nav_id: 'three-view', label: '三视图生成', category: '素材工作台', sort_order: 6 },
          { nav_id: 'image-edit-region', label: '区域编辑', category: '素材工作台', sort_order: 7 },
          { nav_id: 'detailClone', label: '版式裂变', category: '店铺上架素材', sort_order: 0 },
          { nav_id: 'amazon-image-gen', label: '亚马逊生图', category: '店铺上架素材', sort_order: 2 },
          { nav_id: 'detail2', label: '详情页设计', category: '店铺上架素材', sort_order: 3 },
          { nav_id: 'banner', label: 'Banner设计', category: '店铺上架素材', sort_order: 4 },
          { nav_id: 'image-translate', label: '图片转译', category: '店铺上架素材', sort_order: 5 },
        ];
        for (const nav of ALL_NAVS) {
          if (!list.find((i: any) => i.nav_id === nav.nav_id)) {
            list.push({ ...nav, enabled: true });
          }
        }
        setItems(list);
      }
    } catch {}
    setLoading(false)
  }

  const toggleItem = async (navId: string) => {
    const item = items.find(m => m.nav_id === navId);
    if (!item) return;
    if ((item as any).id === 0) {
      setItems(prev => prev.map(m => m.nav_id === navId ? { ...m, enabled: !m.enabled } : m));
      return;
    }
    setToggling(navId)
    try {
      const res = await fetch(`${API_URL}/api/admin/nav/${navId}/toggle`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) setItems(prev => prev.map(m => m.nav_id === navId ? { ...m, enabled: data.enabled } : m))
    } catch {}
    setToggling(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-2 border-[#E8ECF0] border-t-[#6366F1] rounded-full animate-spin" />
    </div>
  )

  const CAT_ORDER = ['素材工作台', '店铺上架素材', 'AI辅助工具'];
  const categories = [...new Set(items.map(i => i.category))].sort((a, b) => CAT_ORDER.indexOf(a as string) - CAT_ORDER.indexOf(b as string))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1D21]">导航菜单管理</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">控制左侧导航菜单的显示与隐藏</p>
        </div>
      </div>

      {categories.map(cat => (
        <div key={cat} className="mb-6">
          <h3 className="text-sm font-semibold text-[#9CA3AF] uppercase tracking-wide mb-3 px-1">{cat}</h3>
          <div className="bg-white rounded-3xl border border-[#E8ECF0] overflow-hidden shadow-sm">
            <table className="w-full">
              <thead className="bg-[#F8F9FA] border-b border-[#E8ECF0]">
                <tr>
                  <th className="text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider px-6 py-4">导航 ID</th>
                  <th className="text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider px-6 py-4">名称</th>
                  <th className="text-right text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider px-6 py-4">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8ECF0]">
                {items.filter(i => i.category === cat).map(m => (
                  <tr key={m.nav_id} className="hover:bg-[#F8F9FA] transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono text-[#5E6268]">{m.nav_id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#F3E8FF] rounded-2xl flex items-center justify-center">
                          <Navigation size={18} className="text-[#A855F7]" />
                        </div>
                        <span className="text-sm font-semibold text-[#1A1D21]">{m.label}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => toggleItem(m.nav_id)}
                        disabled={toggling === m.nav_id}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                          m.enabled
                            ? 'bg-[#D1FAE5] text-[#047857] hover:bg-[#A7F3D0]'
                            : 'bg-[#F8F9FA] text-[#9CA3AF] hover:bg-[#E8ECF0]'
                        }`}
                      >
                        {toggling === m.nav_id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : m.enabled ? (
                          <><Check size={12} /> 显示中</>
                        ) : (
                          <><X size={12} /> 已隐藏</>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <p className="text-xs text-[#9CA3AF] mt-4">更改保存后，刷新页面即可生效。</p>
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import { Loader2, Check, X, Save, Brain } from 'lucide-react'

interface ModelItem {
  model_id: string
  label: string
  enabled: boolean
  sort_order: number
}

export default function ModelManagePage({ token }: { token: string }) {
  const [models, setModels] = useState<ModelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<number>(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchModels() }, [])

  const fetchModels = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/models', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.success) setModels(data.data || [])
    } catch {}
    setLoading(false)
  }

  const toggleModel = async (modelId: string) => {
    setToggling(modelId)
    try {
      const res = await fetch(`/api/admin/models/${modelId}/toggle`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        setModels(prev => prev.map(m => m.model_id === modelId ? { ...m, enabled: data.enabled } : m))
      }
    } catch {}
    setToggling(null)
  }

  const startEdit = (model: ModelItem) => {
    setEditingId(model.model_id)
    setEditValue(model.sort_order)
  }

  const saveEdit = async (modelId: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/models/${modelId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: editValue })
      })
      const data = await res.json()
      if (data.success) {
        setModels(prev => prev.map(m => m.model_id === modelId ? { ...m, sort_order: editValue } : m))
      }
    } catch {}
    setSaving(false)
    setEditingId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-2 border-[#E8ECF0] border-t-[#6366F1] rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1D21]">模型管理</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">控制前端所有页面的模型显示与隐藏，点击编辑修改排序</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-[#E8ECF0] overflow-hidden shadow-sm">
        <table className="w-full">
          <thead className="bg-[#F8F9FA] border-b border-[#E8ECF0]">
            <tr>
              <th className="text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider px-6 py-4">模型 ID</th>
              <th className="text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider px-6 py-4">名称</th>
              <th className="text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider px-6 py-4">排序</th>
              <th className="text-right text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider px-6 py-4">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8ECF0]">
            {[...models].sort((a, b) => a.sort_order - b.sort_order).map(m => (
              <tr key={m.model_id} className="hover:bg-[#F8F9FA] transition-colors">
                <td className="px-6 py-4">
                  <span className="text-sm font-mono text-[#5E6268]">{m.model_id}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#EEF2FF] rounded-2xl flex items-center justify-center">
                      <Brain size={18} className="text-[#6366F1]" />
                    </div>
                    <span className="text-sm font-semibold text-[#1A1D21]">{m.label}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {editingId === m.model_id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={editValue}
                        onChange={e => setEditValue(Number(e.target.value))}
                        className="w-20 px-3 py-2 text-sm border border-[#E8ECF0] rounded-2xl focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] transition-all"
                      />
                      <button
                        onClick={() => saveEdit(m.model_id)}
                        disabled={saving}
                        className="p-2 bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white rounded-2xl hover:shadow-lg hover:shadow-[#6366F1]/20 transition-all"
                      >
                        <Save size={14} />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-2 bg-[#F8F9FA] text-[#5E6268] rounded-2xl hover:bg-[#E8ECF0] transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[#9CA3AF]">{m.sort_order}</span>
                      <button
                        onClick={() => startEdit(m)}
                        className="px-3 py-1.5 text-xs font-medium text-[#6366F1] bg-[#EEF2FF] rounded-xl hover:bg-[#C7D2FE] transition-colors"
                      >
                        编辑
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => toggleModel(m.model_id)}
                    disabled={toggling === m.model_id}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      m.enabled
                        ? 'bg-[#D1FAE5] text-[#047857] hover:bg-[#A7F3D0]'
                        : 'bg-[#F8F9FA] text-[#9CA3AF] hover:bg-[#E8ECF0]'
                    }`}
                  >
                    {toggling === m.model_id ? (
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

      <p className="text-xs text-[#9CA3AF] mt-4">点击"编辑"按钮，输入排序数字后保存。</p>
    </div>
  )
}

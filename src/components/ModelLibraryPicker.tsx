import React, { useState, useEffect } from 'react'
import { Loader2, Check } from 'lucide-react'
import { API_URL } from '../services/api'

interface ModelItem {
  id: number
  name: string
  gender: 'female' | 'male'
  image_url: string
  created_at: string
}

interface ModelLibraryPickerProps {
  token?: string
  multi?: boolean
  onSelect: (imageUrls: string | string[]) => void
  onClose: () => void
}

export default function ModelLibraryPicker({ token, multi, onSelect, onClose }: ModelLibraryPickerProps) {
  const [models, setModels] = useState<ModelItem[]>([])
  const [maleModels, setMaleModels] = useState<ModelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => { fetchModels() }, [])

  const fetchModels = async () => {
    setLoading(true)
    try {
      const authToken = token || localStorage.getItem('adminToken') || localStorage.getItem('token') || sessionStorage.getItem('authToken')
      const headers: Record<string, string> = {}
      if (authToken) headers.Authorization = `Bearer ${authToken}`
      const [femaleRes, maleRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/model-library?gender=female`, { headers }),
        fetch(`${API_URL}/api/admin/model-library?gender=male`, { headers })
      ])
      const femaleData = await femaleRes.json()
      const maleData = await maleRes.json()
      if (femaleData.success) setModels(femaleData.data)
      if (maleData.success) setMaleModels(maleData.data)
    } catch (err) { console.error('获取模特库失败:', err) }
    setLoading(false)
  }

  const toggleSelect = (url: string) => {
    if (!multi) { onSelect(url); onClose(); return }
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  const confirmMulti = () => {
    if (selected.size > 0) { onSelect(Array.from(selected)); onClose() }
  }

  const renderGrid = (items: ModelItem[]) => (
    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
      {items.map(item => {
        const isSel = selected.has(item.image_url)
        return (
          <div key={item.id} onClick={() => toggleSelect(item.image_url)}
            className={`relative aspect-[3/4] rounded-xl overflow-hidden border cursor-pointer transition-all bg-[#FAFBFC] ${isSel ? 'ring-2 ring-[#6366F1] border-[#6366F1]' : 'border-[#E8ECF0] hover:ring-2 hover:ring-[#6366F1]'}`}>
            <img src={item.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
            {multi && isSel && (
              <div className="absolute top-1 right-1 w-6 h-6 bg-[#6366F1] rounded-full flex items-center justify-center">
                <Check size={14} className="text-white" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-white rounded-2xl w-[90vw] max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8ECF0]">
          <h2 className="text-lg font-semibold text-[#1A1D21]">{multi ? '从模特库选择参考图（多选）' : '从模特库选择'}</h2>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#1A1D21] text-xl leading-none">&times;</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[#6366F1]" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-[#1A1D21] mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-pink-400" />女性模特（{models.length}）
              </h3>
              {models.length === 0 ? <p className="text-xs text-[#9CA3AF]">暂无女性模特</p> : renderGrid(models)}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#1A1D21] mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400" />男性模特（{maleModels.length}）
              </h3>
              {maleModels.length === 0 ? <p className="text-xs text-[#9CA3AF]">暂无男性模特</p> : renderGrid(maleModels)}
            </div>
          </div>
        )}

        {multi && selected.size > 0 && (
          <div className="px-6 py-4 border-t border-[#E8ECF0] flex justify-end">
            <button onClick={confirmMulti}
              className="px-6 py-2.5 bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white rounded-2xl text-sm font-medium hover:shadow-md transition-all">
              确认选择（{selected.size}张）
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

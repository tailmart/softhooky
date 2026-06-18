import React, { useState, useEffect, useRef } from 'react'
import { Trash2, Loader2, Image as ImageIcon } from 'lucide-react'
import { ImagePreviewModal } from '../../components/ImagePreviewModal'
import { API_URL } from '../../services/api'

interface ModelItem {
  id: number
  name: string
  gender: 'female' | 'male'
  image_url: string
  created_at: string
}

interface ModelLibraryPageProps {
  token: string
}

export default function ModelLibraryPage({ token }: ModelLibraryPageProps) {
  const [activeTab, setActiveTab] = useState<'female' | 'male'>('female')
  const [models, setModels] = useState<ModelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchModels() }, [activeTab])

  const fetchModels = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/admin/model-library?gender=${activeTab}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const d = await res.json()
      if (d.success) setModels(d.data)
    } catch (err) {
      console.error('获取模特列表失败:', err)
    }
    setLoading(false)
  }

  const uploadFile = async (file: File): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const name = `${activeTab === 'female' ? '女模' : '男模'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          const res = await fetch(`${API_URL}/api/admin/model-library/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name, gender: activeTab, imageBase64: reader.result })
          })
          resolve((await res.json()).success)
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleFilesSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from<File>(e.target.files || [])
    if (fileList.length === 0) return
    if (fileRef.current) fileRef.current.value = ''

    setUploading(true)
    setMessage(null)

    let success = 0, fail = 0
    for (let i = 0; i < fileList.length; i++) {
      setMessage({ type: 'success', text: `正在上传 ${i + 1}/${fileList.length}...` })
      try {
        if (await uploadFile(fileList[i])) success++
        else fail++
      } catch {
        fail++
      }
    }

    await fetchModels()
    setUploading(false)
    if (fail === 0) {
      setMessage({ type: 'success', text: `全部上传成功（${success}张）` })
    } else {
      setMessage({ type: 'error', text: `完成：成功${success}张，失败${fail}张` })
    }
  }

  const handleDelete = async (item: ModelItem) => {
    if (!confirm('确定删除？')) return
    try {
      const res = await fetch(`${API_URL}/api/admin/model-library/${item.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const d = await res.json()
      if (d.success) { setMessage({ type: 'success', text: '删除成功' }); fetchModels() }
      else setMessage({ type: 'error', text: d.message || '删除失败' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#1A1D21]">模特库</h1>
        <div className="flex gap-2">
          <button onClick={() => { setActiveTab('female'); setMessage(null) }}
            className={`px-5 py-2 rounded-2xl text-sm font-medium transition-all ${activeTab === 'female' ? 'bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white shadow-md' : 'bg-white text-[#5E6268] border border-[#E8ECF0] hover:bg-[#F8F9FA]'}`}>
            女性模特
          </button>
          <button onClick={() => { setActiveTab('male'); setMessage(null) }}
            className={`px-5 py-2 rounded-2xl text-sm font-medium transition-all ${activeTab === 'male' ? 'bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white shadow-md' : 'bg-white text-[#5E6268] border border-[#E8ECF0] hover:bg-[#F8F9FA]'}`}>
            男性模特
          </button>
        </div>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-2xl text-sm font-medium ${message.type === 'success' ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#FEF2F2] text-[#EF4444]'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#E8ECF0] p-6 mb-6">
        <div className="flex items-center gap-4">
          <div onClick={() => !uploading && fileRef.current?.click()}
            className={`w-32 h-32 rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden bg-[#FAFBFC] flex-shrink-0 ${uploading ? 'opacity-50 cursor-not-allowed border-[#E8ECF0]' : 'cursor-pointer hover:border-[#6366F1] border-[#E8ECF0]'}`}>
            <div className="text-center text-[#9CA3AF]">
              <ImageIcon size={24} className="mx-auto mb-1" />
              <span className="text-xs">{uploading ? '上传中...' : '选择图片上传'}</span>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFilesSelect} className="hidden" />
          {uploading && (
            <div className="flex items-center gap-2 text-[#6366F1] text-sm">
              <Loader2 size={16} className="animate-spin" />
              上传中...
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#E8ECF0] p-6">
        <h2 className="text-lg font-semibold text-[#1A1D21] mb-4">{activeTab === 'female' ? '女性' : '男性'}模特（{models.length}）</h2>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-[#6366F1]" /></div>
        ) : models.length === 0 ? (
          <div className="text-center py-12 text-[#9CA3AF] text-sm">暂无模特，点击上方选择图片上传</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {models.map(item => (
              <div key={item.id} className="group relative rounded-2xl overflow-hidden bg-[#FAFBFC] border border-[#E8ECF0]">
                <div className="aspect-[3/4] cursor-pointer" onClick={() => setPreviewImage(item.image_url)}>
                  <img src={item.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                </div>
                <div className="p-2.5">
                  <p className="text-xs text-[#9CA3AF]">{new Date(item.created_at).toLocaleDateString()}</p>
                </div>
                <button onClick={() => handleDelete(item)} className="absolute top-2 right-2 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ImagePreviewModal isOpen={!!previewImage} onClose={() => setPreviewImage(null)} imageUrl={previewImage || ''} />
    </div>
  )
}

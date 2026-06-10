import React, { useState, useEffect, useRef } from 'react'
import { Loader2, Save, Upload, Image } from 'lucide-react'

interface SiteConfig {
  logo_url: string
  icon_url: string
  site_title: string
}

interface SettingsPageProps {
  token: string
}

export default function SettingsPage({ token }: SettingsPageProps) {
  const [config, setConfig] = useState<SiteConfig>({
    logo_url: '/logo.png',
    icon_url: '/logo.png',
    site_title: 'Softhooky-智能设计平台'
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<'logo' | 'icon' | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const iconRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/admin/site-config', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const d = await res.json()
      if (d.success && d.data) {
        setConfig(d.data)
      }
    } catch (error) {
      console.error('获取站点配置失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const uploadImage = async (file: File, type: 'logo' | 'icon') => {
    setUploading(type)
    try {
      // 转换为 base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/images/upload-base64-to-cos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ base64, mimeType: file.type, fileName: file.name })
      })
      const d = await res.json()
      if (d.success && d.url) {
        setConfig(prev => ({
          ...prev,
          [type === 'logo' ? 'logo_url' : 'icon_url']: d.url
        }))
        setMessage({ type: 'success', text: `${type === 'logo' ? 'Logo' : 'Icon'}上传成功，请点击保存生效` })
      } else {
        setMessage({ type: 'error', text: '上传失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '上传失败' })
    } finally {
      setUploading(null)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'icon') => {
    const file = e.target.files?.[0]
    if (file) uploadImage(file, type)
    if (e.target) e.target.value = ''
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/site-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          logo_url: config.logo_url,
          icon_url: config.icon_url,
          site_title: config.site_title
        })
      })
      const d = await res.json()
      setMessage({ type: d.success ? 'success' : 'error', text: d.message || '保存失败' })
      if (d.success) {
        // 立即刷新页面标题和图标
        document.title = config.site_title
        const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
        if (link) link.href = config.icon_url
      }
    } catch (error) {
      setMessage({ type: 'error', text: '保存失败' })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-2 border-[#E8ECF0] border-t-[#6366F1] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1A1D21]">系统设置</h1>
        <p className="text-sm text-[#9CA3AF] mt-1">配置网站 Logo、图标和站点标题</p>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-2xl border ${
          message.type === 'success'
            ? 'bg-[#D1FAE5] text-[#047857] border-[#A7F3D0]'
            : 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]'
        }`}>
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        {/* Logo 设置 */}
        <div className="bg-white rounded-3xl border border-[#E8ECF0] p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#1A1D21] mb-4">网站 Logo</h2>
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-2xl border-2 border-[#E8ECF0] overflow-hidden bg-[#F8F9FA] flex items-center justify-center flex-shrink-0">
              {config.logo_url ? (
                <img src={config.logo_url} alt="Logo预览" className="w-full h-full object-contain" />
              ) : (
                <Image size={24} className="text-[#9CA3AF]" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm text-[#5E6268] mb-3">推荐尺寸：200x200px 以上，支持 PNG/JPG</p>
              <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => handleFileSelect(e, 'logo')} />
              <button
                onClick={() => logoRef.current?.click()}
                disabled={uploading === 'logo'}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#F8F9FA] border border-[#E8ECF0] rounded-2xl text-sm font-medium text-[#5E6268] hover:bg-[#E8ECF0] transition-all disabled:opacity-50"
              >
                {uploading === 'logo' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {uploading === 'logo' ? '上传中...' : '上传 Logo'}
              </button>
            </div>
          </div>
        </div>

        {/* Icon 设置 */}
        <div className="bg-white rounded-3xl border border-[#E8ECF0] p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#1A1D21] mb-4">网站图标 (Favicon)</h2>
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-2xl border-2 border-[#E8ECF0] overflow-hidden bg-[#F8F9FA] flex items-center justify-center flex-shrink-0">
              {config.icon_url ? (
                <img src={config.icon_url} alt="Icon预览" className="w-full h-full object-contain" />
              ) : (
                <Image size={20} className="text-[#9CA3AF]" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm text-[#5E6268] mb-3">推荐尺寸：32x32px 或 64x64px，支持 PNG</p>
              <input ref={iconRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => handleFileSelect(e, 'icon')} />
              <button
                onClick={() => iconRef.current?.click()}
                disabled={uploading === 'icon'}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#F8F9FA] border border-[#E8ECF0] rounded-2xl text-sm font-medium text-[#5E6268] hover:bg-[#E8ECF0] transition-all disabled:opacity-50"
              >
                {uploading === 'icon' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {uploading === 'icon' ? '上传中...' : '上传 Icon'}
              </button>
            </div>
          </div>
        </div>

        {/* 站点标题设置 */}
        <div className="bg-white rounded-3xl border border-[#E8ECF0] p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#1A1D21] mb-4">站点标题</h2>
          <div className="max-w-md">
            <label className="text-sm text-[#5E6268] mb-2 block">浏览器标签页显示的标题</label>
            <input
              type="text"
              value={config.site_title}
              onChange={e => setConfig(prev => ({ ...prev, site_title: e.target.value }))}
              className="w-full px-4 py-3.5 bg-[#F8F9FA] border border-[#E8ECF0] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] focus:bg-white transition-all duration-300"
              placeholder="输入站点标题"
            />
          </div>
        </div>
      </div>

      {/* 底部保存栏 */}
      <div className="sticky bottom-0 mt-6 bg-white border border-[#E8ECF0] rounded-3xl p-5 flex items-center justify-between shadow-md">
        <span className="text-sm text-[#9CA3AF]">修改后点击保存生效</span>
        <button
          onClick={saveConfig}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white rounded-2xl font-medium hover:shadow-lg hover:shadow-[#6366F1]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          保存设置
        </button>
      </div>
    </div>
  )
}

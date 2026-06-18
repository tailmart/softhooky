import React, { useState, useEffect, useRef } from 'react'
import { Loader2, Save, Upload, Image } from 'lucide-react'
import { API_URL } from '../../services/api'

interface SiteConfig {
  logo_url: string
  icon_url: string
  site_title: string
}

interface OAuthConfig {
  qauth_api: string
  qauth_appkey: string
  qauth_user_secret: string
  qauth_auto_register: boolean
  qauth_state_check: boolean
  platforms: Record<string, boolean>
}

interface SettingsPageProps {
  token: string
}

const PLATFORM_LABELS: Record<string, string> = {
  wechat: '微信扫码登录',
  miniprogram: '小程序登录',
  qq: 'QQ登录',
  github: 'GitHub登录',
  dingtalk: '钉钉登录',
  weibo: '微博登录',
  alipay: '支付宝登录',
  gitee: 'Gitee登录',
  sms: '验证码登录',
  facebook: 'Facebook登录',
  telegram: 'Telegram登录',
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

  // OAuth 配置状态
  const [oauthConfig, setOauthConfig] = useState<OAuthConfig>({
    qauth_api: 'https://api.qauth.cn',
    qauth_appkey: '',
    qauth_user_secret: '',
    qauth_auto_register: true,
    qauth_state_check: true,
    platforms: {}
  })
  const [oauthLoading, setOauthLoading] = useState(true)
  const [oauthSaving, setOauthSaving] = useState(false)
  const [oauthMessage, setOauthMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchConfig()
    fetchOAuthConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/site-config`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        console.error('获取站点配置失败: HTTP', res.status)
        return
      }
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        console.error('获取站点配置失败: 非JSON响应')
        return
      }
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

  const fetchOAuthConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/oauth-config`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        console.error('获取OAuth配置失败: HTTP', res.status)
        return
      }
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        console.error('获取OAuth配置失败: 非JSON响应')
        return
      }
      const d = await res.json()
      if (d.success && d.data) {
        setOauthConfig({
          qauth_api: d.data.qauth_api || 'https://api.qauth.cn',
          qauth_appkey: d.data.qauth_appkey || '',
          qauth_user_secret: d.data.qauth_user_secret || '',
          qauth_auto_register: d.data.qauth_auto_register === 1 || d.data.qauth_auto_register === true,
          qauth_state_check: d.data.qauth_state_check === 1 || d.data.qauth_state_check === true,
          platforms: d.data.platforms || {}
        })
      }
    } catch (error) {
      console.error('获取OAuth配置失败:', error)
    } finally {
      setOauthLoading(false)
    }
  }

  const uploadImage = async (file: File, type: 'logo' | 'icon') => {
    setUploading(type)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch(`${API_URL}/api/images/upload-base64-to-cos`, {
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
      const res = await fetch(`${API_URL}/api/admin/site-config`, {
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
      if (!res.ok) {
        setMessage({ type: 'error', text: `保存失败: HTTP ${res.status}` })
        return
      }
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        setMessage({ type: 'error', text: '保存失败: 服务器响应异常' })
        return
      }
      const d = await res.json()
      setMessage({ type: d.success ? 'success' : 'error', text: d.message || '保存失败' })
      if (d.success) {
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

  const saveOAuthConfig = async () => {
    setOauthSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/admin/oauth-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(oauthConfig)
      })
      if (!res.ok) {
        setOauthMessage({ type: 'error', text: `保存失败: HTTP ${res.status}` })
        return
      }
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        setOauthMessage({ type: 'error', text: '保存失败: 服务器响应异常' })
        return
      }
      const d = await res.json()
      setOauthMessage({ type: d.success ? 'success' : 'error', text: d.message || '保存失败' })
    } catch (error) {
      setOauthMessage({ type: 'error', text: '保存失败' })
    } finally {
      setOauthSaving(false)
      setTimeout(() => setOauthMessage(null), 3000)
    }
  }

  const togglePlatform = (key: string) => {
    setOauthConfig(prev => ({
      ...prev,
      platforms: {
        ...prev.platforms,
        [key]: !prev.platforms[key]
      }
    }))
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
        <p className="text-sm text-[#9CA3AF] mt-1">配置网站 Logo、图标、站点标题和第三方登录</p>
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

        {/* OAuth 第三方登录设置 */}
        <div className="bg-white rounded-3xl border border-[#E8ECF0] p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#1A1D21] mb-4">第三方登录 (QuickAuth)</h2>
          <p className="text-sm text-[#9CA3AF] mb-4">配置 QuickAuth 第三方登录，支持微信扫码、QQ、GitHub 等一键登录</p>

          {oauthMessage && (
            <div className={`mb-4 p-3 rounded-2xl border text-sm ${
              oauthMessage.type === 'success'
                ? 'bg-[#D1FAE5] text-[#047857] border-[#A7F3D0]'
                : 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]'
            }`}>
              {oauthMessage.text}
            </div>
          )}

          {oauthLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-2 border-[#E8ECF0] border-t-[#6366F1] rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-xs text-[#9CA3AF]">
                1. 登录 <a href="https://qauth.cn" target="_blank" rel="noopener noreferrer" className="text-[#6366F1] underline">QuickAuth</a> 网站注册账号
                &nbsp;2. <a href="https://qauth.cn/app" target="_blank" rel="noopener noreferrer" className="text-[#6366F1] underline">创建应用</a> 并获取 AppKey
                &nbsp;3. 回调 URL 配置为 <code className="bg-[#F3F4F6] px-1.5 py-0.5 rounded text-xs">/api/auth/oauth/callback</code>
              </p>

              {/* QuickAuth API 地址 */}
              <div>
                <label className="text-sm text-[#5E6268] mb-1.5 block">QuickAuth API 地址</label>
                <input
                  type="text"
                  value={oauthConfig.qauth_api}
                  onChange={e => setOauthConfig(prev => ({ ...prev, qauth_api: e.target.value }))}
                  className="w-full px-4 py-3 bg-[#F8F9FA] border border-[#E8ECF0] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] focus:bg-white transition-all duration-300"
                  placeholder="https://api.qauth.cn"
                />
                <p className="text-xs text-[#9CA3AF] mt-1">默认即可，无需修改</p>
              </div>

              {/* AppKey */}
              <div>
                <label className="text-sm text-[#5E6268] mb-1.5 block">AppKey</label>
                <input
                  type="text"
                  value={oauthConfig.qauth_appkey}
                  onChange={e => setOauthConfig(prev => ({ ...prev, qauth_appkey: e.target.value }))}
                  className="w-full px-4 py-3 bg-[#F8F9FA] border border-[#E8ECF0] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] focus:bg-white transition-all duration-300"
                  placeholder="请输入 QuickAuth AppKey"
                />
              </div>

              {/* UserSecret */}
              <div>
                <label className="text-sm text-[#5E6268] mb-1.5 block">UserSecret</label>
                <input
                  type="text"
                  value={oauthConfig.qauth_user_secret}
                  onChange={e => setOauthConfig(prev => ({ ...prev, qauth_user_secret: e.target.value }))}
                  className="w-full px-4 py-3 bg-[#F8F9FA] border border-[#E8ECF0] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] focus:bg-white transition-all duration-300"
                  placeholder="请输入 QuickAuth UserSecret"
                />
              </div>

              {/* 自动注册 */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="qauth_auto_register"
                  checked={oauthConfig.qauth_auto_register}
                  onChange={e => setOauthConfig(prev => ({ ...prev, qauth_auto_register: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-[#6366F1] focus:ring-[#6366F1]"
                />
                <label htmlFor="qauth_auto_register" className="text-sm text-[#5E6268]">
                  未绑定用户自动注册
                </label>
              </div>

              {/* 启用平台 */}
              <div>
                <label className="text-sm text-[#5E6268] mb-3 block font-medium">启用登录平台</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
                    <label
                      key={key}
                      className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                        oauthConfig.platforms[key]
                          ? 'bg-[#EEF2FF] border-[#6366F1] text-[#1A1D21]'
                          : 'bg-[#F8F9FA] border-[#E8ECF0] text-[#9CA3AF] hover:border-[#D1D5DB]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!!oauthConfig.platforms[key]}
                        onChange={() => togglePlatform(key)}
                        className="w-4 h-4 rounded border-gray-300 text-[#6366F1] focus:ring-[#6366F1]"
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 保存按钮 */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={saveOAuthConfig}
                  disabled={oauthSaving}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white rounded-2xl font-medium hover:shadow-lg hover:shadow-[#6366F1]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
                >
                  {oauthSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  保存 OAuth 配置
                </button>
              </div>
            </div>
          )}
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

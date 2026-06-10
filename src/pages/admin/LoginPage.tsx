import React, { useState } from 'react'
import axios from 'axios'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useSiteConfig } from '../../contexts/SiteConfigContext'

interface LoginPageProps {
  onLogin: (token: string, user: any) => void
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const { config } = useSiteConfig();
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await axios.post(
        `/api/admin/login`,
        { email, password }
      )

      if (response.data.success) {
        onLogin(response.data.token, response.data.user)
      } else {
        setError(response.data.message || '登录失败')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '登录失败，请检查网络连接')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EEF2FF] via-[#FAFBFC] to-[#F3E8FF] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl shadow-black/5 p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <img src={config.logo_url} alt="Softhooky" className="w-16 h-16 mx-auto mb-4 rounded-3xl shadow-lg" />
          <h1 className="text-2xl font-bold text-[#1A1D21]">{config.site_title}</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">管理后台</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-2xl flex items-center gap-3">
            <AlertCircle size={20} className="text-[#EF4444] flex-shrink-0" />
            <p className="text-sm text-[#EF4444] font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[#1A1D21] mb-2">
              邮箱地址
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="输入你的邮箱"
              className="w-full px-4 py-3.5 bg-[#F8F9FA] border border-[#E8ECF0] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] focus:bg-white transition-all duration-300"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#1A1D21] mb-2">
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入管理员密码"
              className="w-full px-4 py-3.5 bg-[#F8F9FA] border border-[#E8ECF0] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] focus:bg-white transition-all duration-300"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white py-3.5 rounded-2xl font-semibold hover:shadow-lg hover:shadow-[#6366F1]/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                登录中...
              </>
            ) : (
              '登录'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

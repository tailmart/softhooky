import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { ArrowLeft, ChevronLeft, ChevronRight, Ban, CreditCard, User, Shield, Clock, CheckCircle, Users } from 'lucide-react'
import { useParams, useNavigate, Link } from 'react-router-dom'

interface UserDetail {
  id: number
  email: string
  credits: number
  is_enabled: boolean
  recharge_disabled: boolean
  invited_by: number | null
  inviter_email: string | null
  created_at: string
  last_login_at: string
}

interface Recharge {
  id: number
  order_id: string
  amount: number
  status: string
  created_at: string
}

interface SubUser {
  id: number
  email: string
  name: string
  is_enabled: boolean
  created_at: string
}

interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export default function UserDetailPage({ token }: { token: string }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState<UserDetail | null>(null)
  const [recharges, setRecharges] = useState<Recharge[]>([])
  const [subUsers, setSubUsers] = useState<SubUser[]>([])
  const [rechargePagination, setRechargePagination] = useState<PaginationInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [rechargePage, setRechargePage] = useState(1)

  useEffect(() => {
    fetchUserDetail()
  }, [id, rechargePage])

  const fetchUserDetail = async () => {
    try {
      const response = await axios.get(
        `/api/admin/users/${id}?rechargePage=${rechargePage}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )
      if (response.data.success) {
        setUser(response.data.user)
        setRecharges(response.data.recharges.filter((r: Recharge) => r.status !== 'pending'))
        setRechargePagination(response.data.rechargePagination)
        setSubUsers(response.data.subUsers)
      }
    } catch (error) {
      console.error('获取用户详情失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleRechargeDisabled = async () => {
    try {
      await axios.post(
        `/api/admin/users/${id}/toggle-recharge`,
        { rechargeDisabled: !user?.recharge_disabled },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      fetchUserDetail()
    } catch (error) {
      console.error('切换充值状态失败:', error)
      alert('操作失败')
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('zh-CN')
  }

  const getInitial = (email: string) => {
    return email.charAt(0).toUpperCase()
  }

  const getAvatarColor = (email: string) => {
    const colors = [
      'from-[#6366F1] to-[#8B5CF6]',
      'from-[#10B981] to-[#34D399]',
      'from-[#F59E0B] to-[#FBBF24]',
      'from-[#EF4444] to-[#F87171]',
      'from-[#A855F7] to-[#C084FC]',
      'from-[#EC4899] to-[#F472B6]',
    ]
    const index = email.charCodeAt(0) % colors.length
    return colors[index]
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-2 border-[#E8ECF0] border-t-[#6366F1] rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <div className="text-center py-12 text-[#EF4444]">用户不存在</div>
  }

  return (
    <div>
      <Link
        to="/admin/users"
        className="inline-flex items-center gap-2 text-[#5E6268] hover:text-[#6366F1] mb-6 transition-colors"
      >
        <ArrowLeft size={18} />
        <span className="text-sm font-medium">返回用户列表</span>
      </Link>

      {/* 用户头部信息 */}
      <div className="bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] rounded-3xl p-8 mb-6 text-white shadow-lg shadow-[#6366F1]/20">
        <div className="flex items-center gap-6">
          <div className={`w-24 h-24 rounded-3xl bg-gradient-to-br ${getAvatarColor(user.email)} bg-opacity-90 flex items-center justify-center text-white text-4xl font-bold shadow-xl border-4 border-white/20`}>
            {getInitial(user.email)}
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2">{user.email}</h1>
            <div className="flex items-center gap-4">
              <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-semibold ${
                user.is_enabled ? 'bg-white/20 text-white' : 'bg-red-500/30 text-red-100'
              }`}>
                {user.is_enabled ? <><CheckCircle size={16} /> 账号正常</> : <><Ban size={16} /> 已禁用</>}
              </span>
              <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-semibold ${
                user.recharge_disabled ? 'bg-yellow-500/30 text-yellow-100' : 'bg-white/20 text-white'
              }`}>
                {user.recharge_disabled ? <><Ban size={16} /> 禁止充值</> : <><CreditCard size={16} /> 充值正常</>}
              </span>
              <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-semibold ${
                user.invited_by ? 'bg-amber-500/20 text-amber-100' : 'bg-white/20 text-white'
              }`}>
                {user.invited_by ? <>通过代理注册{user.inviter_email && <span className="opacity-75 ml-1">({user.inviter_email})</span>}</> : <>站长注册</>}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-5xl font-bold mb-1">¥{user.credits}</p>
            <p className="text-white/70 text-sm">积分余额</p>
          </div>
        </div>
      </div>

      {/* 统计信息 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-3xl border border-[#E8ECF0] p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#EEF2FF] rounded-2xl flex items-center justify-center">
              <User size={24} className="text-[#6366F1]" />
            </div>
            <div>
              <p className="text-xs text-[#9CA3AF] font-medium">用户ID</p>
              <p className="text-lg font-bold text-[#1A1D21]">#{user.id}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-3xl border border-[#E8ECF0] p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#D1FAE5] rounded-2xl flex items-center justify-center">
              <Clock size={24} className="text-[#10B981]" />
            </div>
            <div>
              <p className="text-xs text-[#9CA3AF] font-medium">注册时间</p>
              <p className="text-sm font-bold text-[#1A1D21]">{formatDate(user.created_at)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-3xl border border-[#E8ECF0] p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#FEF3C7] rounded-2xl flex items-center justify-center">
              <Clock size={24} className="text-[#F59E0B]" />
            </div>
            <div>
              <p className="text-xs text-[#9CA3AF] font-medium">最后登录</p>
              <p className="text-sm font-bold text-[#1A1D21]">
                {user.last_login_at ? formatDate(user.last_login_at) : '未登录'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="bg-white rounded-3xl border border-[#E8ECF0] p-6 mb-6 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleRechargeDisabled}
            className={`inline-flex items-center gap-2 px-6 py-3 rounded-2xl transition-all duration-300 font-medium text-sm ${
              user.recharge_disabled
                ? 'bg-gradient-to-r from-[#10B981] to-[#34D399] text-white hover:shadow-lg hover:shadow-[#10B981]/20'
                : 'bg-gradient-to-r from-[#F59E0B] to-[#FBBF24] text-white hover:shadow-lg hover:shadow-[#F59E0B]/20'
            }`}
          >
            {user.recharge_disabled ? <><CreditCard size={18} /> 恢复充值权限</> : <><Ban size={18} /> 禁止充值</>}
          </button>
        </div>
      </div>

      {/* 充值记录 */}
      <div className="bg-white rounded-3xl border border-[#E8ECF0] p-6 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-[#1A1D21]">充值记录</h2>
          <span className="text-sm text-[#9CA3AF]">{rechargePagination?.total || 0} 条记录</span>
        </div>
        {recharges.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-[#F8F9FA] rounded-3xl flex items-center justify-center mx-auto mb-4">
              <CreditCard size={24} className="text-[#9CA3AF]" />
            </div>
            <p className="text-sm text-[#9CA3AF]">暂无充值记录</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {recharges.map((recharge) => (
                <div key={recharge.id} className="flex items-center justify-between p-4 bg-[#F8F9FA] rounded-2xl hover:bg-[#F3F4F6] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      recharge.status === 'completed' ? 'bg-[#D1FAE5]' : 'bg-[#FEE2E2]'
                    }`}>
                      <CreditCard size={18} className={
                        recharge.status === 'completed' ? 'text-[#10B981]' : 'text-[#EF4444]'
                      } />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#1A1D21]">{recharge.order_id}</p>
                      <p className="text-xs text-[#9CA3AF]">{formatDate(recharge.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-bold text-[#1A1D21]">¥{recharge.amount}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      recharge.status === 'completed'
                        ? 'bg-[#D1FAE5] text-[#047857]'
                        : recharge.status === 'pending'
                        ? 'bg-[#FEF3C7] text-[#B45309]'
                        : 'bg-[#FEE2E2] text-[#B91C1C]'
                    }`}>
                      {recharge.status === 'completed' ? '已完成' : recharge.status === 'pending' ? '待处理' : '已失败'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {/* 分页 */}
            {rechargePagination && rechargePagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4">
                <span className="text-sm text-[#9CA3AF]">
                  共 {rechargePagination.total} 条记录，第 {rechargePagination.page} / {rechargePagination.totalPages} 页
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRechargePage(p => Math.max(1, p - 1))}
                    disabled={rechargePagination.page === 1}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl border border-[#E8ECF0] hover:bg-[#F8F9FA] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                  >
                    <ChevronLeft size={16} />
                    上一页
                  </button>
                  <button
                    onClick={() => setRechargePage(p => Math.min(rechargePagination.totalPages, p + 1))}
                    disabled={rechargePagination.page === rechargePagination.totalPages}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl border border-[#E8ECF0] hover:bg-[#F8F9FA] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                  >
                    下一页
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 子账号 */}
      {subUsers.length > 0 && (
        <div className="bg-white rounded-3xl border border-[#E8ECF0] p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#F3E8FF] rounded-2xl flex items-center justify-center">
              <Users size={20} className="text-[#A855F7]" />
            </div>
            <h2 className="text-lg font-bold text-[#1A1D21]">子账号</h2>
          </div>
          <div className="space-y-3">
            {subUsers.map((subUser) => (
              <div key={subUser.id} className="flex items-center justify-between p-4 bg-[#F8F9FA] rounded-2xl hover:bg-[#F3F4F6] transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(subUser.email)} flex items-center justify-center text-white font-bold text-sm`}>
                    {getInitial(subUser.email)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1A1D21]">{subUser.email}</p>
                    <p className="text-xs text-[#9CA3AF]">{subUser.name} · {formatDate(subUser.created_at)}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  subUser.is_enabled
                    ? 'bg-[#D1FAE5] text-[#047857]'
                    : 'bg-[#FEE2E2] text-[#B91C1C]'
                }`}>
                  {subUser.is_enabled ? '启用' : '禁用'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

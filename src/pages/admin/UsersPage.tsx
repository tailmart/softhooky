import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { ChevronLeft, ChevronRight, Eye, Ban, CheckCircle, CreditCard, ShieldOff, Search, Users, UserPlus, Activity, RefreshCw, Shield, MoreVertical } from 'lucide-react'
import { Link } from 'react-router-dom'

interface User {
  id: number
  email: string
  credits: number
  is_enabled: boolean
  recharge_disabled: boolean
  is_admin: number
  is_agent: number
  applied_agent: number
  invited_by: number | null
  inviter_email: string | null
  created_at: string
  last_login_at: string
}

interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export default function UsersPage({ token }: { token: string }) {
  const [users, setUsers] = useState<User[]>([])
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null)
  const [stats, setStats] = useState({ total: 0, enabled: 0, disabled: 0 })

  useEffect(() => {
    fetchUsers(currentPage)
  }, [currentPage])

  useEffect(() => {
    if (users.length > 0) {
      setStats({
        total: pagination?.total || users.length,
        enabled: users.filter(u => u.is_enabled).length,
        disabled: users.filter(u => !u.is_enabled).length,
      })
    }
  }, [users, pagination])

  const fetchUsers = async (page: number) => {
    try {
      setLoading(true)
      const response = await axios.get(
        `/api/admin/users?page=${page}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )
      if (response.data.success) {
        setUsers(response.data.data)
        setPagination(response.data.pagination)
      }
    } catch (error) {
      console.error('获取用户列表失败:', error)
    } finally {
      setLoading(false)
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

  const toggleUserStatus = async (userId: number, currentStatus: boolean) => {
    try {
      await axios.post(
        `/api/admin/users/${userId}/toggle`,
        { isEnabled: !currentStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      fetchUsers(currentPage)
    } catch (error) {
      console.error('切换用户状态失败:', error)
      alert('操作失败')
    }
  }

  const toggleRechargeDisabled = async (userId: number, currentStatus: boolean) => {
    try {
      await axios.post(
        `/api/admin/users/${userId}/toggle-recharge`,
        { rechargeDisabled: !currentStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      fetchUsers(currentPage)
    } catch (error) {
      console.error('切换充值状态失败:', error)
      alert('操作失败')
    }
  }

  const setAsAgent = async (userId: number, isAgent: boolean) => {
    try {
      await axios.post(
        `/api/admin/agents/${userId}/toggle`,
        { isAgent },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      fetchUsers(currentPage)
    } catch (error) {
      console.error('设置代理失败:', error)
      alert('操作失败')
    }
  }

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1D21]">用户管理</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">管理所有注册用户的状态和权限</p>
        </div>
        <button
          onClick={() => fetchUsers(currentPage)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#F8F9FA] text-[#5E6268] rounded-2xl text-sm font-medium hover:bg-[#E8ECF0] transition-all"
        >
          <RefreshCw size={16} />
          刷新
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-[#6366F1] to-[#818CF8] rounded-3xl p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <Users size={24} />
            </div>
          </div>
          <p className="text-[#C7D2FE] text-sm font-medium">总用户数</p>
          <p className="text-3xl font-bold mt-1">{pagination?.total || stats.total}</p>
        </div>
        <div className="bg-gradient-to-br from-[#10B981] to-[#34D399] rounded-3xl p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <CheckCircle size={24} />
            </div>
          </div>
          <p className="text-[#A7F3D0] text-sm font-medium">正常用户</p>
          <p className="text-3xl font-bold mt-1">{stats.enabled}</p>
        </div>
        <div className="bg-gradient-to-br from-[#EF4444] to-[#F87171] rounded-3xl p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <Ban size={24} />
            </div>
          </div>
          <p className="text-[#FCA5A5] text-sm font-medium">禁用用户</p>
          <p className="text-3xl font-bold mt-1">{stats.disabled}</p>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="mb-6">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            type="text"
            placeholder="搜索用户邮箱..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-[#E8ECF0] rounded-2xl text-sm text-[#1A1D21] placeholder:text-[#9CA3AF] focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] transition-all"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-2 border-[#E8ECF0] border-t-[#6366F1] rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* 用户卡片列表 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredUsers.map((user) => (
              <div key={user.id} className="bg-white rounded-3xl border border-[#E8ECF0] p-5 hover:shadow-md transition-all shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    {/* 头像 */}
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${getAvatarColor(user.email)} flex items-center justify-center text-white text-xl font-bold shadow-lg`}>
                      {getInitial(user.email)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#1A1D21]">{user.email}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs text-[#9CA3AF]">
                          注册: {formatDate(user.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          user.is_enabled ? 'bg-[#D1FAE5] text-[#047857]' : 'bg-[#FEE2E2] text-[#B91C1C]'
                        }`}>
                          {user.is_enabled ? <><CheckCircle size={12} /> 正常</> : <><Ban size={12} /> 已禁用</>}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          user.recharge_disabled ? 'bg-[#FEF3C7] text-[#B45309]' : 'bg-[#D1FAE5] text-[#047857]'
                        }`}>
                          {user.recharge_disabled ? <><Ban size={12} /> 禁止充值</> : <><CreditCard size={12} /> 充值正常</>}
                        </span>
                        {!!user.is_agent && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#EEF2FF] text-[#6366F1]">
                            <Shield size={12} /> 代理
                          </span>
                        )}
                        {!!user.applied_agent && !user.is_agent && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
                            ⏳ 待审核
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          user.invited_by
                            ? 'bg-[#FEF3C7] text-[#B45309]'
                            : 'bg-[#EEF2FF] text-[#6366F1]'
                        }`}>
                          {user.invited_by
                            ? <>通过代理注册{user.inviter_email && <span className="opacity-75">({user.inviter_email})</span>}</>
                            : <>站长注册</>}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-[#1A1D21]">¥{user.credits}</p>
                    <p className="text-xs text-[#9CA3AF]">积分余额</p>
                  </div>
                </div>

                {/* 底部操作区 */}
                <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#F3F4F6]">
                  <div className="text-xs text-[#9CA3AF]">
                    {user.last_login_at ? (
                      <span>最后登录: {formatDate(user.last_login_at)}</span>
                    ) : (
                      <span>未登录过</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/admin/users/${user.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#EEF2FF] text-[#4F46E5] rounded-xl text-xs font-medium hover:bg-[#C7D2FE] transition-all duration-300"
                    >
                      <Eye size={14} />
                      详情
                    </Link>
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpenId(menuOpenId === user.id ? null : user.id)}
                        className="p-2 hover:bg-gray-100 rounded-xl transition-all"
                      >
                        <MoreVertical size={16} className="text-gray-400" />
                      </button>
                      {menuOpenId === user.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 min-w-[140px]">
                            <button
                              onClick={() => { setMenuOpenId(null); toggleRechargeDisabled(user.id, user.recharge_disabled); }}
                              className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium hover:bg-gray-50 transition-all ${
                                user.recharge_disabled ? 'text-green-600' : 'text-amber-600'
                              }`}
                            >
                              {user.recharge_disabled ? <CreditCard size={14} /> : <ShieldOff size={14} />}
                              {user.recharge_disabled ? '恢复充值' : '禁止充值'}
                            </button>
                            {!user.is_admin && (
                              <button
                                onClick={() => { setMenuOpenId(null); setAsAgent(user.id, !user.is_agent); }}
                                className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium hover:bg-gray-50 transition-all ${
                                  user.is_agent ? 'text-red-600' : 'text-indigo-600'
                                }`}
                              >
                                <Shield size={14} />
                                {user.is_agent ? '取消代理' : '设为代理'}
                              </button>
                            )}
                            <button
                              onClick={() => { setMenuOpenId(null); toggleUserStatus(user.id, user.is_enabled); }}
                              className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium hover:bg-gray-50 transition-all ${
                                user.is_enabled ? 'text-red-600' : 'text-green-600'
                              }`}
                            >
                              {user.is_enabled ? <Ban size={14} /> : <CheckCircle size={14} />}
                              {user.is_enabled ? '禁用' : '启用'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-[#F8F9FA] rounded-3xl flex items-center justify-center mx-auto mb-4">
                <Users size={24} className="text-[#9CA3AF]" />
              </div>
              <p className="text-sm text-[#9CA3AF]">未找到匹配的用户</p>
            </div>
          )}

          {/* 分页 */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-2 hover:bg-[#F8F9FA] rounded-2xl disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={20} className="text-[#5E6268]" />
              </button>

              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                    currentPage === page
                      ? 'bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white shadow-md shadow-[#6366F1]/20'
                      : 'bg-[#F8F9FA] text-[#5E6268] hover:bg-[#E8ECF0]'
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage(Math.min(pagination.totalPages, currentPage + 1))}
                disabled={currentPage === pagination.totalPages}
                className="p-2 hover:bg-[#F8F9FA] rounded-2xl disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={20} className="text-[#5E6268]" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

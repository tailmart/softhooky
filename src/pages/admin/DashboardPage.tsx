import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Users, TrendingUp, CreditCard, Activity, DollarSign, ArrowUp } from 'lucide-react'

interface DashboardData {
  totalUsers: number
  todayNewUsers: number
  totalRechargeAmount: number
  todayRechargeAmount: number
  pendingOrders: number
  totalConsumption: number
}

export default function DashboardPage({ token }: { token: string }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboard()
  }, [])

  const fetchDashboard = async () => {
    try {
      const response = await axios.get(
        '/api/admin/dashboard',
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )
      if (response.data.success) {
        setData(response.data.dashboard)
      }
    } catch (error) {
      console.error('获取仪表板数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-[#E8ECF0] border-t-[#6366F1] rounded-full animate-spin" />
      </div>
    )
  }

  if (!data) {
    return <div className="text-center py-12 text-[#EF4444]">加载失败</div>
  }

  const avgConsumption = data.totalUsers > 0 ? (data.totalConsumption / data.totalUsers).toFixed(2) : 0
  const activeRate = data.totalUsers > 0 ? ((data.todayNewUsers / data.totalUsers) * 100).toFixed(1) : 0

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1D21]">仪表盘</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">欢迎回来，查看您的数据概览</p>
        </div>
        <div className="text-sm text-[#9CA3AF] font-medium">
          {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 总用户 */}
        <div className="bg-gradient-to-br from-[#6366F1] to-[#818CF8] rounded-3xl p-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <Users size={24} />
            </div>
            <ArrowUp size={16} className="opacity-60" />
          </div>
          <p className="text-[#C7D2FE] text-sm font-medium">总用户数</p>
          <p className="text-3xl font-bold mt-1">{data.totalUsers}</p>
          <div className="flex items-center gap-1 mt-2 text-[#C7D2FE] text-xs">
            <TrendingUp size={12} />
            <span>活跃增长中</span>
          </div>
        </div>

        {/* 今日新用户 */}
        <div className="bg-gradient-to-br from-[#10B981] to-[#34D399] rounded-3xl p-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <Activity size={24} />
            </div>
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">今日</span>
          </div>
          <p className="text-[#A7F3D0] text-sm font-medium">今日新用户</p>
          <p className="text-3xl font-bold mt-1">{data.todayNewUsers}</p>
          <div className="flex items-center gap-1 mt-2 text-[#A7F3D0] text-xs">
            <TrendingUp size={12} />
            <span>较昨日 +{data.todayNewUsers}</span>
          </div>
        </div>

        {/* 总充值 */}
        <div className="bg-gradient-to-br from-[#A855F7] to-[#C084FC] rounded-3xl p-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <CreditCard size={24} />
            </div>
            <ArrowUp size={16} className="opacity-60" />
          </div>
          <p className="text-[#DDD6FE] text-sm font-medium">总充值金额</p>
          <p className="text-3xl font-bold mt-1">¥{data.totalRechargeAmount}</p>
          <div className="flex items-center gap-1 mt-2 text-[#DDD6FE] text-xs">
            <DollarSign size={12} />
            <span>平台收入</span>
          </div>
        </div>

        {/* 今日充值 */}
        <div className="bg-gradient-to-br from-[#F59E0B] to-[#FBBF24] rounded-3xl p-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <DollarSign size={24} />
            </div>
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">今日</span>
          </div>
          <p className="text-[#FDE68A] text-sm font-medium">今日充值</p>
          <p className="text-3xl font-bold mt-1">¥{data.todayRechargeAmount}</p>
          <div className="flex items-center gap-1 mt-2 text-[#FDE68A] text-xs">
            <TrendingUp size={12} />
            <span>今日收入</span>
          </div>
        </div>
      </div>

      {/* 详细数据 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 充值分析 */}
        <div className="bg-white rounded-3xl p-6 border border-[#E8ECF0] shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-[#1A1D21]">充值分析</h2>
            <div className="w-10 h-10 bg-[#F3E8FF] rounded-2xl flex items-center justify-center">
              <CreditCard size={20} className="text-[#A855F7]" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-[#F8F9FA] rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#EEF2FF] rounded-2xl flex items-center justify-center">
                  <TrendingUp size={18} className="text-[#6366F1]" />
                </div>
                <div>
                  <p className="text-sm text-[#9CA3AF]">今日充值</p>
                  <p className="text-lg font-bold text-[#1A1D21]">¥{data.todayRechargeAmount}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-[#F8F9FA] rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#F3E8FF] rounded-2xl flex items-center justify-center">
                  <CreditCard size={18} className="text-[#A855F7]" />
                </div>
                <div>
                  <p className="text-sm text-[#9CA3AF]">总充值金额</p>
                  <p className="text-lg font-bold text-[#1A1D21]">¥{data.totalRechargeAmount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 消费分析 */}
        <div className="bg-white rounded-3xl p-6 border border-[#E8ECF0] shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-[#1A1D21]">消费分析</h2>
            <div className="w-10 h-10 bg-[#D1FAE5] rounded-2xl flex items-center justify-center">
              <Activity size={20} className="text-[#10B981]" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-[#F8F9FA] rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#D1FAE5] rounded-2xl flex items-center justify-center">
                  <DollarSign size={18} className="text-[#10B981]" />
                </div>
                <div>
                  <p className="text-sm text-[#9CA3AF]">总消费</p>
                  <p className="text-lg font-bold text-[#1A1D21]">¥{data.totalConsumption}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-[#F8F9FA] rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#FEF3C7] rounded-2xl flex items-center justify-center">
                  <Users size={18} className="text-[#F59E0B]" />
                </div>
                <div>
                  <p className="text-sm text-[#9CA3AF]">平均消费</p>
                  <p className="text-lg font-bold text-[#1A1D21]">¥{avgConsumption}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-[#F8F9FA] rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#EEF2FF] rounded-2xl flex items-center justify-center">
                  <Activity size={18} className="text-[#6366F1]" />
                </div>
                <div>
                  <p className="text-sm text-[#9CA3AF]">用户活跃度</p>
                  <p className="text-lg font-bold text-[#1A1D21]">{activeRate}%</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

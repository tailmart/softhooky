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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 总用户 */}
        <div className="bg-white rounded-2xl p-4 border border-[#E8ECF0]">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 bg-[#EEF2FF] rounded-xl flex items-center justify-center">
              <Users size={16} className="text-[#6366F1]" />
            </div>
            <p className="text-xs text-[#9CA3AF] font-medium">总用户数</p>
          </div>
          <p className="text-xl font-bold text-[#1A1D21]">{data.totalUsers}</p>
          <p className="text-[10px] text-[#9CA3AF] mt-1">活跃增长中</p>
        </div>

        {/* 今日新用户 */}
        <div className="bg-white rounded-2xl p-4 border border-[#E8ECF0]">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 bg-[#D1FAE5] rounded-xl flex items-center justify-center">
              <Activity size={16} className="text-[#10B981]" />
            </div>
            <p className="text-xs text-[#9CA3AF] font-medium">今日新用户</p>
          </div>
          <p className="text-xl font-bold text-[#1A1D21]">{data.todayNewUsers}</p>
          <p className="text-[10px] text-[#9CA3AF] mt-1">较昨日 +{data.todayNewUsers}</p>
        </div>

        {/* 总充值 */}
        <div className="bg-white rounded-2xl p-4 border border-[#E8ECF0]">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 bg-[#F3E8FF] rounded-xl flex items-center justify-center">
              <CreditCard size={16} className="text-[#A855F7]" />
            </div>
            <p className="text-xs text-[#9CA3AF] font-medium">总充值金额</p>
          </div>
          <p className="text-xl font-bold text-[#1A1D21]">¥{data.totalRechargeAmount}</p>
          <p className="text-[10px] text-[#9CA3AF] mt-1">平台收入</p>
        </div>

        {/* 今日充值 */}
        <div className="bg-white rounded-2xl p-4 border border-[#E8ECF0]">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 bg-[#FEF3C7] rounded-xl flex items-center justify-center">
              <DollarSign size={16} className="text-[#F59E0B]" />
            </div>
            <p className="text-xs text-[#9CA3AF] font-medium">今日充值</p>
          </div>
          <p className="text-xl font-bold text-[#1A1D21]">¥{data.todayRechargeAmount}</p>
          <p className="text-[10px] text-[#9CA3AF] mt-1">今日收入</p>
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

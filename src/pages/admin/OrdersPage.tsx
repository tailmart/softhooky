import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { ChevronLeft, ChevronRight, Package, Clock, CheckCircle, XCircle } from 'lucide-react'

interface Order {
  id: number
  order_id: string
  user_id: number
  email: string
  amount: number
  status: string
  created_at: string
}

interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export default function OrdersPage({ token }: { token: string }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    fetchOrders(currentPage)
  }, [currentPage, statusFilter])

  const fetchOrders = async (page: number) => {
    try {
      setLoading(true)
      const url = statusFilter
        ? `/api/admin/orders?page=${page}&status=${statusFilter}`
        : `/api/admin/orders?page=${page}`

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.data.success) {
        const filteredOrders = response.data.data.filter((o: Order) => o.status !== 'pending')
        setOrders(filteredOrders)
        setPagination(response.data.pagination)
      }
    } catch (error) {
      console.error('获取订单列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateOrderStatus = async (orderId: number, newStatus: string) => {
    try {
      const response = await axios.put(
        `/api/admin/orders/${orderId}`,
        { status: newStatus },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )
      if (response.data.success) {
        fetchOrders(currentPage)
      }
    } catch (error) {
      console.error('更新订单失败:', error)
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('zh-CN')
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-[#D1FAE5] text-[#047857]'
      case 'pending':
        return 'bg-[#FEF3C7] text-[#B45309]'
      case 'failed':
        return 'bg-[#FEE2E2] text-[#B91C1C]'
      default:
        return 'bg-[#F8F9FA] text-[#5E6268]'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={12} />
      case 'pending':
        return <Clock size={12} />
      case 'failed':
        return <XCircle size={12} />
      default:
        return <Package size={12} />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return '已完成'
      case 'pending':
        return '待处理'
      case 'failed':
        return '已失败'
      default:
        return status
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1A1D21] mb-2">订单管理</h1>
      <p className="text-sm text-[#9CA3AF] mb-6">查看和管理所有订单记录</p>

      {/* 筛选 */}
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => {
            setStatusFilter('')
            setCurrentPage(1)
          }}
          className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-300 ${
            statusFilter === ''
              ? 'bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white shadow-md shadow-[#6366F1]/20'
              : 'bg-[#F8F9FA] text-[#5E6268] hover:bg-[#E8ECF0]'
          }`}
        >
          全部
        </button>
        <button
          onClick={() => {
            setStatusFilter('completed')
            setCurrentPage(1)
          }}
          className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-300 ${
            statusFilter === 'completed'
              ? 'bg-gradient-to-r from-[#10B981] to-[#34D399] text-white shadow-md shadow-[#10B981]/20'
              : 'bg-[#F8F9FA] text-[#5E6268] hover:bg-[#E8ECF0]'
          }`}
        >
          已完成
        </button>
        <button
          onClick={() => {
            setStatusFilter('failed')
            setCurrentPage(1)
          }}
          className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-300 ${
            statusFilter === 'failed'
              ? 'bg-gradient-to-r from-[#EF4444] to-[#F87171] text-white shadow-md shadow-[#EF4444]/20'
              : 'bg-[#F8F9FA] text-[#5E6268] hover:bg-[#E8ECF0]'
          }`}
        >
          已失败
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-2 border-[#E8ECF0] border-t-[#6366F1] rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-3xl border border-[#E8ECF0] overflow-hidden shadow-sm">
            <table className="w-full">
              <thead className="bg-[#F8F9FA] border-b border-[#E8ECF0]">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">订单号</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">用户邮箱</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">金额</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">状态</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">时间</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8ECF0]">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-[#F8F9FA] transition-colors">
                    <td className="px-6 py-4 text-sm text-[#5E6268] font-mono">{order.order_id}</td>
                    <td className="px-6 py-4 text-sm text-[#1A1D21] font-medium">{order.email}</td>
                    <td className="px-6 py-4 text-sm font-bold text-[#1A1D21]">¥{order.amount}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(order.status)}`}>
                        {getStatusIcon(order.status)}
                        {getStatusText(order.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#5E6268]">{formatDate(order.created_at)}</td>
                    <td className="px-6 py-4 text-sm">
                      {order.status === 'pending' && (
                        <button
                          onClick={() => updateOrderStatus(order.id, 'completed')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#D1FAE5] text-[#047857] rounded-xl text-xs font-medium hover:bg-[#A7F3D0] transition-all duration-300"
                        >
                          <CheckCircle size={14} />
                          标记完成
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

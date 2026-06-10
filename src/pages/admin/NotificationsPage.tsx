import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Bell, X } from 'lucide-react'

interface Notification {
  id: number
  title: string
  content: string
  is_active: boolean
  created_at: string
}

interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export default function NotificationsPage({ token }: { token: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [editingNotification, setEditingNotification] = useState<Notification | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    is_active: true
  })

  useEffect(() => {
    fetchNotifications(currentPage)
  }, [currentPage])

  const fetchNotifications = async (page: number) => {
    try {
      setLoading(true)
      const response = await axios.get(
        `/api/admin/notifications?page=${page}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )
      if (response.data.success) {
        setNotifications(response.data.data)
        setPagination(response.data.pagination)
      }
    } catch (error) {
      console.error('获取通知列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingNotification(null)
    setFormData({ title: '', content: '', is_active: true })
    setShowModal(true)
  }

  const handleEdit = (notification: Notification) => {
    setEditingNotification(notification)
    setFormData({
      title: notification.title,
      content: notification.content,
      is_active: notification.is_active
    })
    setShowModal(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条通知吗？')) return

    try {
      await axios.delete(
        `/api/admin/notifications/${id}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )
      fetchNotifications(currentPage)
    } catch (error) {
      console.error('删除通知失败:', error)
      alert('删除失败')
    }
  }

  const handleToggleStatus = async (notification: Notification) => {
    try {
      await axios.put(
        `/api/admin/notifications/${notification.id}`,
        {
          title: notification.title,
          content: notification.content,
          is_active: !notification.is_active
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )
      fetchNotifications(currentPage)
    } catch (error) {
      console.error('切换状态失败:', error)
      alert('切换状态失败')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (editingNotification) {
        await axios.put(
          `/api/admin/notifications/${editingNotification.id}`,
          formData,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        )
      } else {
        await axios.post(
          `/api/admin/notifications`,
          formData,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        )
      }
      setShowModal(false)
      fetchNotifications(currentPage)
    } catch (error) {
      console.error('保存通知失败:', error)
      alert('保存失败')
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('zh-CN')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1A1D21] mb-2">通知管理</h1>
      <p className="text-sm text-[#9CA3AF] mb-6">管理所有通知消息</p>

      {/* 编辑模态框 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-[#E8ECF0]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#EEF2FF] rounded-2xl flex items-center justify-center">
                  <Bell size={20} className="text-[#6366F1]" />
                </div>
                <h2 className="text-lg font-bold text-[#1A1D21]">
                  {editingNotification ? '编辑通知' : '新建通知'}
                </h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[#F8F9FA] transition-colors"
              >
                <X size={18} className="text-[#9CA3AF]" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[#1A1D21] mb-2">标题</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-3 border border-[#E8ECF0] rounded-2xl focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] transition-all text-[#1A1D21] placeholder:text-[#9CA3AF]"
                    placeholder="输入通知标题"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#1A1D21] mb-2">内容</label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    className="w-full px-4 py-3 border border-[#E8ECF0] rounded-2xl focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] transition-all text-[#1A1D21] placeholder:text-[#9CA3AF] resize-none"
                    rows={4}
                    placeholder="输入通知内容"
                    required
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div
                    onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                    className={`w-12 h-7 rounded-full cursor-pointer transition-all duration-300 flex items-center ${
                      formData.is_active ? 'bg-gradient-to-r from-[#10B981] to-[#34D399]' : 'bg-[#E8ECF0]'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300 ${
                      formData.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </div>
                  <span className="text-sm font-medium text-[#1A1D21]">
                    {formData.is_active ? '启用通知' : '禁用通知'}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 border border-[#E8ECF0] rounded-2xl hover:bg-[#F8F9FA] transition-colors text-sm font-medium text-[#5E6268]"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white rounded-2xl hover:shadow-lg hover:shadow-[#6366F1]/20 transition-all text-sm font-medium"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!showModal && (
        <button
          onClick={handleCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white rounded-2xl hover:shadow-lg hover:shadow-[#6366F1]/20 transition-all text-sm font-medium mb-6"
        >
          <Plus size={18} />
          新建通知
        </button>
      )}

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
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">标题</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">状态</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">创建时间</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8ECF0]">
                {notifications.map((notification) => (
                  <tr key={notification.id} className="hover:bg-[#F8F9FA] transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-semibold text-[#1A1D21]">{notification.title}</p>
                        <p className="text-xs text-[#9CA3AF] mt-1 line-clamp-1">{notification.content}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div
                        onClick={() => handleToggleStatus(notification)}
                        className={`w-12 h-7 rounded-full cursor-pointer transition-all duration-300 flex items-center ${
                          notification.is_active ? 'bg-gradient-to-r from-[#10B981] to-[#34D399]' : 'bg-[#E8ECF0]'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300 ${
                          notification.is_active ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#5E6268]">{formatDate(notification.created_at)}</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(notification)}
                          className="w-9 h-9 flex items-center justify-center hover:bg-[#EEF2FF] rounded-xl transition-colors"
                          title="编辑"
                        >
                          <Pencil size={16} className="text-[#6366F1]" />
                        </button>
                        <button
                          onClick={() => handleDelete(notification.id)}
                          className="w-9 h-9 flex items-center justify-center hover:bg-[#FEE2E2] rounded-xl transition-colors"
                          title="删除"
                        >
                          <Trash2 size={16} className="text-[#EF4444]" />
                        </button>
                      </div>
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

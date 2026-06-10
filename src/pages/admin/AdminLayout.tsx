import React from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { LogOut, BarChart3, Users, ShoppingCart, Settings, Bell, DollarSign, Tag, Shield } from 'lucide-react'
import { useSiteConfig } from '../../contexts/SiteConfigContext'

interface User {
  id: number
  email: string
  isAdmin: boolean
}

interface AdminLayoutProps {
  user: User
  onLogout: () => void
}

export default function AdminLayout({ user, onLogout }: AdminLayoutProps) {
  const location = useLocation()
  const { config } = useSiteConfig()

  const NavLink = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => {
    const isActive = location.pathname === to
    return (
      <Link
        to={to}
        className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl transition-all duration-300 ${
          isActive
            ? 'bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white shadow-md shadow-[#6366F1]/20'
            : 'text-[#5E6268] hover:bg-[#F8F9FA] hover:text-[#1A1D21]'
        }`}
      >
        <Icon size={18} />
        <span className="text-sm font-medium">{label}</span>
      </Link>
    )
  }

  const getInitial = (email: string) => email?.charAt(0).toUpperCase() || '?'

  return (
    <div className="min-h-screen bg-[#FAFBFC]">
      {/* 侧边栏 */}
      <aside className="fixed left-0 top-0 w-64 h-screen bg-white border-r border-[#E8ECF0] flex flex-col">
        <div className="p-6 border-b border-[#E8ECF0]">
          <div className="flex items-center gap-3">
            <img src={config.logo_url} alt="Softhooky" className="w-10 h-10 rounded-2xl shadow-lg" />
            <div>
              <h1 className="text-lg font-bold text-[#1A1D21]">Softhooky</h1>
              <p className="text-xs text-[#9CA3AF]">管理后台</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <NavLink to="/admin/dashboard" icon={BarChart3} label="仪表板" />
          <NavLink to="/admin/users" icon={Users} label="用户管理" />
          <NavLink to="/admin/orders" icon={ShoppingCart} label="订单管理" />
          <NavLink to="/admin/notifications" icon={Bell} label="通知管理" />
          <NavLink to="/admin/nav" icon={BarChart3} label="导航管理" />
          <NavLink to="/admin/pricing" icon={DollarSign} label="价格配置" />
          <NavLink to="/admin/coupons" icon={Tag} label="优惠券管理" />
          <NavLink to="/admin/agents" icon={Shield} label="代理管理" />
          <NavLink to="/admin/settings" icon={Settings} label="系统设置" />
        </nav>

        <div className="p-4 border-t border-[#E8ECF0]">
          <div className="mb-4 p-3 bg-[#F8F9FA] rounded-2xl">
            <p className="text-xs text-[#9CA3AF]">登录用户</p>
            <p className="text-sm font-semibold text-[#1A1D21] truncate">{user.email}</p>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm bg-[#FEF2F2] text-[#EF4444] hover:bg-[#FEE2E2] rounded-2xl transition-all duration-300 font-medium"
          >
            <LogOut size={16} />
            退出登录
          </button>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="ml-64 p-8">
        <Outlet />
      </main>
    </div>
  )
}

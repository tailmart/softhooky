import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './LoginPage'
import DashboardPage from './DashboardPage'
import UsersPage from './UsersPage'
import OrdersPage from './OrdersPage'
import UserDetailPage from './UserDetailPage'
import NotificationsPage from './NotificationsPage'
import PricingPage from './PricingPage'
import NavManagePage from './NavManagePage'
import CouponManagePage from './CouponManagePage'
import SettingsPage from './SettingsPage'
import AgentManagePage from './AgentManagePage'
import ModelLibraryPage from './ModelLibraryPage'
import AdminLayout from './AdminLayout'

interface User {
  id: number
  email: string
  isAdmin: boolean
}

export default function AdminApp() {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedToken = localStorage.getItem('adminToken')
    const savedUser = localStorage.getItem('adminUser')
    
    if (savedToken && savedUser) {
      // 使用 fetch 验证 token，避免触发 axios 拦截器的 alert/redirect
      fetch('/api/admin/dashboard', {
        headers: { Authorization: `Bearer ${savedToken}` }
      }).then(resp => {
        if (resp.ok) {
          setToken(savedToken)
          setUser(JSON.parse(savedUser))
        } else {
          localStorage.removeItem('adminToken')
          localStorage.removeItem('adminUser')
        }
      }).catch(() => {
        localStorage.removeItem('adminToken')
        localStorage.removeItem('adminUser')
      }).finally(() => {
        setLoading(false)
      })
    } else {
      setLoading(false)
    }
  }, [])

  const handleLogin = (token: string, user: User) => {
    setToken(token)
    setUser(user)
    localStorage.setItem('adminToken', token)
    localStorage.setItem('adminUser', JSON.stringify(user))
  }

  const handleLogout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('adminToken')
    localStorage.removeItem('adminUser')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFBFC] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-[#E8ECF0] border-t-[#6366F1] rounded-full animate-spin" />
      </div>
    )
  }

  if (!token || !user) {
    return <LoginPage onLogin={handleLogin} />
  }

  return (
    <Routes>
      <Route path="/" element={<AdminLayout user={user} onLogout={handleLogout} />}>
        <Route path="dashboard" element={<DashboardPage token={token} />} />
        <Route path="users" element={<UsersPage token={token} />} />
        <Route path="users/:id" element={<UserDetailPage token={token} />} />
        <Route path="orders" element={<OrdersPage token={token} />} />
        <Route path="notifications" element={<NotificationsPage token={token} />} />
        <Route path="pricing" element={<PricingPage token={token} />} />
        <Route path="nav" element={<NavManagePage token={token} />} />
        <Route path="coupons" element={<CouponManagePage token={token} />} />
        <Route path="models" element={<Navigate to="/admin/nav" replace />} />
        <Route path="model-library" element={<ModelLibraryPage token={token} />} />
        <Route path="settings" element={<SettingsPage token={token} />} />
        <Route path="agents" element={<AgentManagePage token={token} />} />
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
      </Route>
    </Routes>
  )
}

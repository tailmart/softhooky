import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AgentLayout from './AgentLayout'
import AgentDashboard from './AgentDashboard'
import AgentPricing from './AgentPricing'
import AgentInviteCodes from './AgentInviteCodes'
import AgentCustomers from './AgentCustomers'
import AgentCommission from './AgentCommission'
import AgentWithdraw from './AgentWithdraw'

export default function AgentApp() {
  return (
    <Routes>
      <Route path="/" element={<AgentLayout />}>
        <Route index element={<AgentDashboard />} />
        <Route path="pricing" element={<AgentPricing />} />
        <Route path="invite-codes" element={<AgentInviteCodes />} />
        <Route path="customers" element={<AgentCustomers />} />
        <Route path="commission" element={<AgentCommission />} />
        <Route path="withdraw" element={<AgentWithdraw />} />
        <Route path="*" element={<Navigate to="/agent" replace />} />
      </Route>
    </Routes>
  )
}

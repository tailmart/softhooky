import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ArrowLeft, Copy, Check, RefreshCw, Wallet, Users, TrendingUp, DollarSign, Loader2 } from 'lucide-react';

const api = axios.create({
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' }
});

function getAuthToken() {
  return sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
}

function getAuthHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface CommissionLog {
  id: number;
  user_email: string;
  amount: number;
  source: string;
  created_at: string;
}

interface Customer {
  id: number;
  email: string;
  credits: number;
  created_at: string;
  total_consumption: number;
}

interface WithdrawLog {
  id: number;
  amount: number;
  status: string;
  remark: string | null;
  created_at: string;
  processed_at: string | null;
}

export const AgentCenter: React.FC = () => {
  const [balance, setBalance] = useState(0);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [commissionLogs, setCommissionLogs] = useState<CommissionLog[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [withdrawLogs, setWithdrawLogs] = useState<WithdrawLog[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'customers' | 'withdraw'>('overview');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAgent, setIsAgent] = useState(false);

  useEffect(() => {
    checkAgentStatus();
    loadCommission();
    loadInviteCodes();
    loadCustomers();
    loadWithdrawLogs();
  }, []);

  const checkAgentStatus = async () => {
    try {
      const userStr = sessionStorage.getItem('user') || localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        const res = await api.get('/api/auth/me', { headers: getAuthHeaders() });
        if (res.data.success) {
          setIsAgent(res.data.user.is_agent || false);
          sessionStorage.setItem('user', JSON.stringify(res.data.user));
        }
      }
    } catch {}
  };

  const loadCommission = async () => {
    try {
      const res = await api.get('/api/agent/commission?page=1', { headers: getAuthHeaders() });
      if (res.data.success) {
        setBalance(res.data.balance || 0);
        setCommissionLogs(res.data.logs || []);
      }
    } catch (err: any) {
      if (err.response?.status !== 403) console.error('Failed to load commission:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadInviteCodes = async () => {
    try {
      const res = await api.get('/api/agent/invite-codes', { headers: getAuthHeaders() });
      if (res.data.success && res.data.data?.length > 0) {
        // Find first unused code
        const unused = res.data.data.find((c: any) => !c.used_at);
        if (unused) setInviteCode(unused.code);
      }
    } catch {}
  };

  const generateInviteCode = async () => {
    setGenerating(true);
    try {
      const res = await api.post('/api/agent/invite-code', {}, { headers: getAuthHeaders() });
      if (res.data.success) {
        setInviteCode(res.data.code);
        setIsAgent(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const loadCustomers = async () => {
    try {
      const res = await api.get('/api/agent/customers?page=1', { headers: getAuthHeaders() });
      if (res.data.success) {
        setCustomers(res.data.customers || []);
      }
    } catch {}
  };

  const loadWithdrawLogs = async () => {
    try {
      const res = await api.get('/api/agent/withdraw-logs', { headers: getAuthHeaders() });
      if (res.data.success) {
        setWithdrawLogs(res.data.data || []);
      }
    } catch {}
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) { setError('请输入有效的提现金额'); return; }
    if (amount > balance) { setError('提现金额不能超过可用余额'); return; }
    setWithdrawing(true);
    setError('');
    try {
      const res = await api.post('/api/agent/withdraw', { amount }, { headers: getAuthHeaders() });
      if (res.data.success) {
        setWithdrawAmount('');
        setBalance(b => b - amount);
        loadWithdrawLogs();
        alert('提现申请已提交，等待平台处理');
      } else {
        setError(res.data.message || '提现失败');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '提现失败');
    } finally {
      setWithdrawing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getInviteLink = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/?code=${inviteCode}`;
  };

  const goBack = () => {
    window.location.href = '/';
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      done: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    const labels: Record<string, string> = {
      pending: '待处理',
      done: '已完成',
      rejected: '已拒绝',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center h-14 gap-3">
            <button onClick={goBack} className="p-2 hover:bg-gray-100 rounded-xl transition-all">
              <ArrowLeft size={20} className="text-gray-600" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">佣金中心</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl text-sm">
            {error}
          </div>
        )}

        {!isAgent ? (
          /* Not an agent yet - show onboarding */
          <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-gray-100">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <DollarSign size={28} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">成为代理，赚取佣金</h2>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              邀请好友使用平台，他们每次消费你都能获得佣金分成
            </p>
            <button
              onClick={generateInviteCode}
              disabled={generating}
              className="px-8 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-2xl font-semibold hover:shadow-lg hover:shadow-indigo-500/25 transition-all disabled:opacity-50 inline-flex items-center gap-2"
            >
              {generating ? <Loader2 size={18} className="animate-spin" /> : <TrendingUp size={18} />}
              立即开通代理
            </button>
          </div>
        ) : (
          <>
            {/* Balance Card */}
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-indigo-100 text-sm font-medium">可用佣金</span>
                <Wallet size={20} className="text-indigo-200" />
              </div>
              <div className="text-4xl font-bold mb-4">¥{balance.toFixed(2)}</div>
              <div className="flex gap-3">
                <a
                  href="/agent/pricing"
                  className="px-5 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-all inline-block"
                >
                  定价
                </a>
                <button
                  onClick={() => setActiveTab('withdraw')}
                  className="px-5 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-all"
                >
                  提现
                </button>
                <button
                  onClick={() => setActiveTab('overview')}
                  className="px-5 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-all"
                >
                  明细
                </button>
              </div>
            </div>

            {/* Invite Code Section */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">推广邀请</h3>
              {inviteCode ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-50 rounded-2xl px-4 py-3 border border-gray-200">
                      <code className="text-lg font-bold text-indigo-600 tracking-wider">{inviteCode}</code>
                    </div>
                    <button
                      onClick={() => copyToClipboard(inviteCode)}
                      className="p-3 bg-indigo-50 hover:bg-indigo-100 rounded-2xl transition-all"
                      title="复制邀请码"
                    >
                      {copied ? <Check size={20} className="text-green-600" /> : <Copy size={20} className="text-indigo-600" />}
                    </button>
                    <button
                      onClick={generateInviteCode}
                      disabled={generating}
                      className="p-3 bg-gray-50 hover:bg-gray-100 rounded-2xl transition-all"
                      title="生成新码"
                    >
                      <RefreshCw size={20} className={`text-gray-500 ${generating ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  <div>
                    <button
                      onClick={() => copyToClipboard(getInviteLink())}
                      className="text-sm text-indigo-600 hover:text-indigo-700 underline"
                    >
                      复制推广链接
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={generateInviteCode}
                  disabled={generating}
                  className="px-6 py-3 bg-indigo-500 text-white rounded-2xl text-sm font-semibold hover:bg-indigo-600 transition-all disabled:opacity-50"
                >
                  {generating ? '生成中...' : '生成邀请码'}
                </button>
              )}
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 bg-gray-100 rounded-2xl p-1">
              {([
                { key: 'overview', label: '佣金明细' },
                { key: 'customers', label: '我的客户' },
                { key: 'withdraw', label: '提现' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    activeTab === tab.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Commission Logs */}
              {activeTab === 'overview' && (
                <div>
                  {commissionLogs.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">
                      暂无佣金记录，邀请好友使用平台开始赚取佣金吧
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {commissionLogs.map(log => (
                        <div key={log.id} className="px-6 py-4 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {log.source === 'consume' ? '消费佣金' : log.source === 'recharge' ? '充值佣金' : log.source === 'gift' ? '赠送' : log.source}
                            </p>
                            <p className="text-xs text-gray-400">
                              {log.user_email} · {new Date(log.created_at).toLocaleString('zh-CN')}
                            </p>
                          </div>
                          <span className={`text-sm font-semibold ${log.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {log.amount > 0 ? '+' : ''}¥{log.amount.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Customers */}
              {activeTab === 'customers' && (
                <div>
                  {customers.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">
                      暂无客户，分享你的邀请码邀请好友注册
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {customers.map(c => (
                        <div key={c.id} className="px-6 py-4 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{c.email}</p>
                            <p className="text-xs text-gray-400">注册于 {new Date(c.created_at).toLocaleDateString('zh-CN')}</p>
                          </div>
                          <span className="text-sm text-gray-500">
                            消费 ¥{c.total_consumption.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Withdraw */}
              {activeTab === 'withdraw' && (
                <div className="p-6 space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">提现金额</label>
                    <div className="flex gap-3">
                      <input
                        type="number"
                        value={withdrawAmount}
                        onChange={e => setWithdrawAmount(e.target.value)}
                        placeholder="输入金额"
                        max={balance}
                        step="0.01"
                        className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                      />
                      <button
                        onClick={handleWithdraw}
                        disabled={withdrawing || !withdrawAmount}
                        className="px-6 py-3 bg-indigo-500 text-white rounded-2xl text-sm font-semibold hover:bg-indigo-600 transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {withdrawing ? <Loader2 size={16} className="animate-spin" /> : <DollarSign size={16} />}
                        提现
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">可用余额: ¥{balance.toFixed(2)}</p>
                  </div>

                  {withdrawLogs.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 mb-3">提现记录</h4>
                      <div className="divide-y divide-gray-100">
                        {withdrawLogs.map(w => (
                          <div key={w.id} className="py-3 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-900">¥{w.amount.toFixed(2)}</p>
                              <p className="text-xs text-gray-400">{new Date(w.created_at).toLocaleString('zh-CN')}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {w.remark && <span className="text-xs text-gray-400">{w.remark}</span>}
                              {statusBadge(w.status)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AgentCenter;

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Lock, Unlock, Coins, User, Eye, EyeOff, Sliders, Gauge } from 'lucide-react';
import axios from 'axios';

interface SubAccount {
  id: number;
  email: string;
  name: string;
  is_enabled: boolean;
  created_at: string;
  credits_spent?: number;
  quota_limit?: number;
  quota_consumed?: number;
  quota_remaining?: number;
}

export const SubAccountManager: React.FC<{ token: string }> = ({ token }) => {
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [quotaMode, setQuotaMode] = useState('shared');
  const [mainCredits, setMainCredits] = useState(0);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSubEmail, setNewSubEmail] = useState('');
  const [newSubPassword, setNewSubPassword] = useState('');
  const [showSubPassword, setShowSubPassword] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [loading, setLoading] = useState(false);
  const [setQuotaFor, setSetQuotaFor] = useState<number | null>(null);
  const [setQuotaValue, setSetQuotaValue] = useState('');
  const [addQuotaFor, setAddQuotaFor] = useState<number | null>(null);
  const [addQuotaValue, setAddQuotaValue] = useState('');
  const [modeSwitching, setModeSwitching] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSubAccounts();
    const interval = setInterval(loadSubAccounts, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (actionMsg) {
      const t = setTimeout(() => setActionMsg(null), 3000);
      return () => clearTimeout(t);
    }
  }, [actionMsg]);

  const loadSubAccounts = async () => {
    try {
      const response = await axios.get('/api/auth/sub-users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSubAccounts(response.data.data || []);
      setQuotaMode(response.data.quota_mode || 'shared');
      setMainCredits(Number(response.data.credits) || 0);
    } catch (error) {
      console.error('加载子账号失败:', error);
    }
  };

  const createSubAccount = async () => {
    if (!newSubEmail || !newSubPassword || !newSubName) {
      alert('请填写所有字段');
      return;
    }
    try {
      setLoading(true);
      await axios.post('/api/auth/sub-users', { email: newSubEmail, password: newSubPassword, name: newSubName },
        { headers: { Authorization: `Bearer ${token}` } });
      setNewSubEmail(''); setNewSubPassword(''); setNewSubName('');
      setShowNewForm(false);
      loadSubAccounts();
      showMsg('success', '子账号创建成功');
    } catch (error: any) {
      alert(error.response?.data?.message || '创建子账号失败');
    } finally {
      setLoading(false);
    }
  };

  const toggleSubAccount = async (subUserId: number, isEnabled: boolean) => {
    try {
      await axios.post(`/api/auth/sub-users/${subUserId}/toggle`, { isEnabled: !isEnabled },
        { headers: { Authorization: `Bearer ${token}` } });
      loadSubAccounts();
    } catch (error: any) {
      alert(error.response?.data?.message || '操作失败');
    }
  };

  const deleteSubAccount = async (subUserId: number) => {
    if (!confirm('确定要删除这个子账号吗？')) return;
    try {
      await axios.delete(`/api/auth/sub-users/${subUserId}`, { headers: { Authorization: `Bearer ${token}` } });
      loadSubAccounts();
      showMsg('success', '子账号已删除');
    } catch (error: any) {
      alert(error.response?.data?.message || '删除失败');
    }
  };

  const toggleQuotaMode = async () => {
    const newMode = quotaMode === 'shared' ? 'allocated' : 'shared';
    const confirmMsg = newMode === 'allocated'
      ? '切换为配额模式后，每个子账号将只能使用您分配的额度。确定切换吗？'
      : '切换为共享模式后，所有子账号将共享您全部的积分。确定切换吗？';

    if (!confirm(confirmMsg)) return;

    try {
      setModeSwitching(true);
      const response = await axios.put('/api/auth/sub-users/quota-mode', { mode: newMode },
        { headers: { Authorization: `Bearer ${token}` } });
      if (response.data.success) {
        setQuotaMode(newMode);
        showMsg('success', response.data.message || (newMode === 'allocated' ? '已切换到配额模式' : '已切换到共享模式'));
        loadSubAccounts();
      }
    } catch (error: any) {
      showMsg('error', error.response?.data?.message || '切换失败');
    } finally {
      setModeSwitching(false);
    }
  };

  const handleSetQuota = async (subUserId: number) => {
    const value = parseFloat(setQuotaValue);
    if (isNaN(value) || value < 0) {
      showMsg('error', '请输入有效的配额数量');
      return;
    }
    try {
      const response = await axios.put(`/api/auth/sub-users/${subUserId}/quota`, { quotaLimit: value },
        { headers: { Authorization: `Bearer ${token}` } });
      if (response.data.success) {
        showMsg('success', response.data.message);
        setSetQuotaFor(null);
        setSetQuotaValue('');
        loadSubAccounts();
      }
    } catch (error: any) {
      showMsg('error', error.response?.data?.message || '设置配额失败');
    }
  };

  const handleAddQuota = async (subUserId: number) => {
    const value = parseFloat(addQuotaValue);
    if (isNaN(value) || value <= 0) {
      showMsg('error', '请输入有效的追加数量');
      return;
    }
    try {
      const response = await axios.post(`/api/auth/sub-users/${subUserId}/quota/add`, { amount: value },
        { headers: { Authorization: `Bearer ${token}` } });
      if (response.data.success) {
        showMsg('success', response.data.message);
        setAddQuotaFor(null);
        setAddQuotaValue('');
        loadSubAccounts();
      }
    } catch (error: any) {
      showMsg('error', error.response?.data?.message || '追加配额失败');
    }
  };

  const showMsg = (type: 'success' | 'error', text: string) => {
    setActionMsg({ type, text });
  };

  // 计算总已分配额度
  const totalAllocated = subAccounts.reduce((sum, a) => sum + Number(a.quota_limit || 0), 0);
  const availableQuota = Math.max(0, mainCredits - totalAllocated);

  return (
    <div className="space-y-5">
      {/* 顶部提示消息 */}
      {actionMsg && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium ${
          actionMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {actionMsg.text}
        </div>
      )}

      {/* 模式切换与配额概览 */}
      <div className="bg-[#FAFAFA] rounded-2xl p-4 border border-[#E5E5E5] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders size={16} className="text-[#525252]" />
            <span className="text-sm font-medium text-[#171717]">子账号额度模式</span>
          </div>
          <button
            onClick={toggleQuotaMode}
            disabled={modeSwitching}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              quotaMode === 'allocated' ? 'bg-[#171717]' : 'bg-[#D4D4D4]'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              quotaMode === 'allocated' ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className={`px-2 py-0.5 rounded-full font-medium ${
            quotaMode === 'shared' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            {quotaMode === 'shared' ? '共享模式：子账号共享全部积分' : '配额模式：子账号使用固定额度'}
          </span>
          <span className="text-[#A3A3A3]">
            可用积分: <span className="font-semibold text-[#171717]">{Number(mainCredits).toFixed(1)}</span>
          </span>
        </div>
        {quotaMode === 'allocated' && (
          <div className="flex items-center justify-between text-xs pt-1 border-t border-[#E5E5E5]">
            <span className="text-[#A3A3A3]">
              已分配: <span className="font-medium text-[#171717]">{totalAllocated.toFixed(1)}</span>
            </span>
            <span className="text-[#A3A3A3]">
              可分配: <span className="font-medium text-green-600">{availableQuota.toFixed(1)}</span>
            </span>
            <span className="text-[#A3A3A3]">
              子账号: <span className="font-medium text-[#171717]">{subAccounts.length} 个</span>
            </span>
          </div>
        )}
      </div>

      {/* Header + Add Button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#A3A3A3]">管理您的子账号，共 {subAccounts.length} 个</p>
        <button onClick={() => setShowNewForm(!showNewForm)}
          className="px-4 py-2 bg-[#171717] text-white rounded-xl font-medium hover:bg-[#27272A] transition-colors text-sm flex items-center gap-1.5 shadow-sm">
          <Plus size={15} />
          新增
        </button>
      </div>

      {/* New Form */}
      {showNewForm && (
        <div className="bg-[#FAFAFA] rounded-2xl p-5 border border-[#E5E5E5] space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-[#A3A3A3] mb-1.5">账号名称</label>
            <input type="text" value={newSubName} onChange={(e) => setNewSubName(e.target.value)}
              placeholder="例如：销售员A"
              className="w-full px-3.5 py-2.5 bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm text-[#171717] placeholder:text-[#BDBDBD]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#A3A3A3] mb-1.5">邮箱</label>
            <input type="email" value={newSubEmail} onChange={(e) => setNewSubEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3.5 py-2.5 bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm text-[#171717] placeholder:text-[#BDBDBD]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#A3A3A3] mb-1.5">密码</label>
            <div className="relative">
              <input type={showSubPassword ? 'text' : 'password'} value={newSubPassword} onChange={(e) => setNewSubPassword(e.target.value)}
                placeholder="至少6位"
                className="w-full px-3.5 py-2.5 bg-white border border-[#E5E5E5] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm text-[#171717] placeholder:text-[#BDBDBD] pr-10" />
              <button type="button" onClick={() => setShowSubPassword(!showSubPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showSubPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="flex gap-2.5 pt-1">
            <button onClick={createSubAccount} disabled={loading}
              className="flex-1 px-4 py-2.5 bg-[#171717] text-white rounded-xl font-medium hover:bg-[#27272A] transition-colors disabled:bg-[#E5E5E5] disabled:text-[#A3A3A3] text-sm">创建</button>
            <button onClick={() => setShowNewForm(false)}
              className="flex-1 px-4 py-2.5 bg-[#F5F5F5] text-[#525252] rounded-xl font-medium hover:bg-[#EEEEEE] transition-colors text-sm">取消</button>
          </div>
        </div>
      )}

      {/* List */}
      {subAccounts.length > 0 ? (
        <div className="space-y-2.5">
          {subAccounts.map((account) => (
            <div key={account.id} className="bg-white p-4 rounded-xl border border-[#E5E5E5] hover:border-[#D4D4D4] transition-colors shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#171717] to-[#404040] flex items-center justify-center flex-shrink-0">
                    <User size={16} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[#171717] truncate">{account.name}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0 ${
                        account.is_enabled ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {account.is_enabled ? '启用' : '禁用'}
                      </span>
                    </div>
                    <p className="text-xs text-[#A3A3A3] mt-0.5 truncate">{account.email}</p>
                    <p className="text-[11px] text-[#BDBDBD] mt-0.5">创建于 {new Date(account.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              {/* 配额模式下的额度信息 */}
              {quotaMode === 'allocated' && (
                <div className="mb-3 bg-[#FAFAFA] rounded-xl p-3 border border-[#E5E5E5]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Gauge size={14} className="text-[#525252]" />
                      <span className="text-xs font-medium text-[#525252]">额度</span>
                    </div>
                    <span className="text-xs text-[#A3A3A3]">
                      已用 <span className="font-semibold text-[#171717]">{Number(account.quota_consumed || 0).toFixed(1)}</span>
                      {' / '}
                      总计 <span className="font-semibold text-[#171717]">{Number(account.quota_limit || 0).toFixed(1)}</span>
                    </span>
                  </div>
                  {/* 进度条 */}
                  {Number(account.quota_limit || 0) > 0 && (
                    <div className="w-full h-2 bg-[#E5E5E5] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          (Number(account.quota_consumed || 0) / Number(account.quota_limit || 1)) >= 0.9
                            ? 'bg-red-500'
                            : (Number(account.quota_consumed || 0) / Number(account.quota_limit || 1)) >= 0.7
                            ? 'bg-amber-500'
                            : 'bg-green-500'
                        }`}
                        style={{
                          width: `${Math.min(100, (Number(account.quota_consumed || 0) / Math.max(1, Number(account.quota_limit || 1))) * 100)}%`
                        }}
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[11px] text-[#A3A3A3]">
                      剩余: <span className="font-medium text-green-600">{Math.max(0, Number(account.quota_limit || 0) - Number(account.quota_consumed || 0)).toFixed(1)}</span>
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { setSetQuotaFor(account.id); setSetQuotaValue(String(account.quota_limit || 0)); setAddQuotaFor(null); }}
                        className="px-2 py-1 text-[11px] bg-[#171717] text-white rounded-lg hover:bg-[#27272A] transition-colors"
                      >
                        设置
                      </button>
                      <button
                        onClick={() => { setAddQuotaFor(account.id); setAddQuotaValue(''); setSetQuotaFor(null); }}
                        className="px-2 py-1 text-[11px] bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        追加
                      </button>
                    </div>
                  </div>

                  {/* 设置配额表单 */}
                  {setQuotaFor === account.id && (
                    <div className="mt-2 pt-2 border-t border-[#E5E5E5]">
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          value={setQuotaValue}
                          onChange={(e) => setSetQuotaValue(e.target.value)}
                          placeholder="输入新配额"
                          min="0"
                          step="0.1"
                          className="flex-1 px-3 py-1.5 text-xs bg-white border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSetQuota(account.id)}
                          className="px-3 py-1.5 text-xs bg-[#171717] text-white rounded-lg hover:bg-[#27272A] transition-colors"
                        >
                          确定
                        </button>
                        <button
                          onClick={() => { setSetQuotaFor(null); setSetQuotaValue(''); }}
                          className="px-3 py-1.5 text-xs bg-[#F5F5F5] text-[#525252] rounded-lg hover:bg-[#EEEEEE] transition-colors"
                        >
                          取消
                        </button>
                      </div>
                      {Number(setQuotaValue) > 0 && (
                        <p className="text-[10px] text-[#A3A3A3] mt-1">
                          设置后将重置为 0 消耗，可分配余额: {availableQuota.toFixed(1)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* 追加配额表单 */}
                  {addQuotaFor === account.id && (
                    <div className="mt-2 pt-2 border-t border-[#E5E5E5]">
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          value={addQuotaValue}
                          onChange={(e) => setAddQuotaValue(e.target.value)}
                          placeholder="输入追加数量"
                          min="0"
                          step="0.1"
                          className="flex-1 px-3 py-1.5 text-xs bg-white border border-[#E5E5E5] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          autoFocus
                        />
                        <button
                          onClick={() => handleAddQuota(account.id)}
                          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          追加
                        </button>
                        <button
                          onClick={() => { setAddQuotaFor(null); setAddQuotaValue(''); }}
                          className="px-3 py-1.5 text-xs bg-[#F5F5F5] text-[#525252] rounded-lg hover:bg-[#EEEEEE] transition-colors"
                        >
                          取消
                        </button>
                      </div>
                      {Number(addQuotaValue) > 0 && (
                        <p className="text-[10px] text-[#A3A3A3] mt-1">
                          追加后总额度: {(Number(account.quota_limit || 0) + Number(addQuotaValue)).toFixed(1)}，可分配余额: {availableQuota.toFixed(1)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 非配额模式下的消费显示 */}
              {quotaMode !== 'allocated' && account.credits_spent !== undefined && (
                <div className="flex items-center gap-1 mb-3">
                  <Coins size={12} className="text-amber-500" />
                  <span className="text-xs text-amber-600 font-medium">已消耗 {Number(account.credits_spent).toFixed(1)} 积分</span>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex gap-2">
                <button onClick={() => toggleSubAccount(account.id, account.is_enabled)}
                  className={`flex-1 py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-1.5 text-sm ${
                    account.is_enabled
                      ? 'bg-[#F5F5F5] text-[#737373] hover:bg-[#EEEEEE]'
                      : 'bg-[#171717] text-white hover:bg-[#27272A]'
                  }`}>
                  {account.is_enabled ? <><Lock size={14} />禁用</> : <><Unlock size={14} />启用</>}
                </button>
                <button onClick={() => deleteSubAccount(account.id)}
                  className="flex-1 py-2 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5 text-sm">
                  <Trash2 size={14} />删除
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-[#F5F5F5] rounded-2xl flex items-center justify-center mb-4">
            <User size={24} className="text-[#D4D4D4]" />
          </div>
          <p className="text-sm font-medium text-[#737373]">暂无子账号</p>
          <p className="text-xs text-[#A3A3A3] mt-1">点击右上角「新增」按钮添加子账号</p>
        </div>
      )}
    </div>
  );
};

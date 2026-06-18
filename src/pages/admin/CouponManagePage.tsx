import React, { useState, useEffect } from 'react';
import { Tag, Plus, X, Loader2, Trash2 } from 'lucide-react';
import api from '../../services/api';

interface Coupon {
  id: number;
  code: string;
  credits: number;
  max_claims: number;
  claimed_count: number;
  claim_deadline: string;
  expire_days: number;
  is_active: number;
  created_at: string;
}

interface CouponManagePageProps {
  token: string;
}

export default function CouponManagePage({ token }: CouponManagePageProps) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ code: '', credits: '', max_claims: '', claim_deadline: '', expire_days: '30' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => { fetchCoupons(); }, [page]);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const fetchCoupons = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/admin/coupons?page=${page}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCoupons(res.data.data || []);
      setTotalPages(res.data.pagination?.totalPages || 1);
    } catch (e: any) {
      showMsg('error', '获取失败');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditId(null);
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    setForm({ code: '', credits: '', max_claims: '', claim_deadline: d.toISOString().slice(0, 16), expire_days: '30' });
    setShowForm(true);
  };

  const openEdit = (c: Coupon) => {
    setEditId(c.id);
    setForm({
      code: c.code,
      credits: String(c.credits),
      max_claims: String(c.max_claims),
      claim_deadline: c.claim_deadline.slice(0, 16),
      expire_days: String(c.expire_days),
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.code || !form.credits || !form.claim_deadline) {
      showMsg('error', '请填写必填字段');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.toUpperCase(),
        credits: parseFloat(form.credits),
        max_claims: parseInt(form.max_claims) || 0,
        claim_deadline: form.claim_deadline,
        expire_days: parseInt(form.expire_days) || 30,
        is_active: 1,
      };

      if (editId) {
        await api.put(`/api/admin/coupons/${editId}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showMsg('success', '更新成功');
      } else {
        await api.post('/api/admin/coupons', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showMsg('success', '创建成功');
      }
      setShowForm(false);
      fetchCoupons();
    } catch (e: any) {
      showMsg('error', e.response?.data?.message || '操作失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除该优惠券？')) return;
    try {
      await api.delete(`/api/admin/coupons/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showMsg('success', '已删除');
      fetchCoupons();
    } catch {
      showMsg('error', '删除失败');
    }
  };

  const toggleActive = async (c: Coupon) => {
    try {
      await api.put(`/api/admin/coupons/${c.id}`, {
        ...c, is_active: c.is_active ? 0 : 1
      }, { headers: { Authorization: `Bearer ${token}` } });
      fetchCoupons();
    } catch {
      showMsg('error', '操作失败');
    }
  };

  return (
    <div>
      {msg && (
        <div className={`mb-6 p-4 rounded-2xl border ${
          msg.type === 'success'
            ? 'bg-[#D1FAE5] text-[#047857] border-[#A7F3D0]'
            : 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]'
        }`}>{msg.text}</div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1D21]">优惠券管理</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">创建和管理优惠券活动</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white rounded-2xl text-sm font-medium hover:shadow-lg hover:shadow-[#6366F1]/20 transition-all">
          <Plus size={16} />
          新建优惠券
        </button>
      </div>

      {/* 表单弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#FEF3C7] rounded-2xl flex items-center justify-center">
                  <Tag size={20} className="text-[#F59E0B]" />
                </div>
                <h2 className="text-base font-bold text-[#1A1D21]">{editId ? '编辑优惠券' : '新建优惠券'}</h2>
              </div>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[#F8F9FA] transition-colors">
                <X size={18} className="text-[#9CA3AF]" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#1A1D21] mb-1.5 block">优惠券码 *</label>
                <input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="例如：WELCOME50" maxLength={50}
                  className="w-full px-4 py-3 border border-[#E8ECF0] rounded-2xl text-sm focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] transition-all text-[#1A1D21] placeholder:text-[#9CA3AF]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#1A1D21] mb-1.5 block">面额（积分） *</label>
                  <input type="number" value={form.credits} onChange={e => setForm({ ...form, credits: e.target.value })}
                    min="0" step="0.1"
                    className="w-full px-4 py-3 border border-[#E8ECF0] rounded-2xl text-sm focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] transition-all text-[#1A1D21]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#1A1D21] mb-1.5 block">领取名额（0=不限）</label>
                  <input type="number" value={form.max_claims} onChange={e => setForm({ ...form, max_claims: e.target.value })}
                    min="0"
                    className="w-full px-4 py-3 border border-[#E8ECF0] rounded-2xl text-sm focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] transition-all text-[#1A1D21]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#1A1D21] mb-1.5 block">领取截止时间 *</label>
                  <input type="datetime-local" value={form.claim_deadline} onChange={e => setForm({ ...form, claim_deadline: e.target.value })}
                    className="w-full px-4 py-3 border border-[#E8ECF0] rounded-2xl text-sm focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] transition-all text-[#1A1D21]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#1A1D21] mb-1.5 block">领取后有效天数</label>
                  <input type="number" value={form.expire_days} onChange={e => setForm({ ...form, expire_days: e.target.value })}
                    min="1"
                    className="w-full px-4 py-3 border border-[#E8ECF0] rounded-2xl text-sm focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] transition-all text-[#1A1D21]" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-3 bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white rounded-2xl text-sm font-medium hover:shadow-lg hover:shadow-[#6366F1]/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving && <Loader2 size={14} className="animate-spin" />}{editId ? '保存' : '创建'}
                </button>
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-3 bg-[#F8F9FA] text-[#5E6268] rounded-2xl text-sm font-medium hover:bg-[#E8ECF0] transition-colors">取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-2 border-[#E8ECF0] border-t-[#6366F1] rounded-full animate-spin" />
        </div>
      ) : coupons.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-[#FEF3C7] rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Tag size={24} className="text-[#F59E0B]" />
          </div>
          <p className="text-sm text-[#9CA3AF]">暂无优惠券，点击右上角创建</p>
        </div>
      ) : (
        <div className="space-y-3">
          {coupons.map(c => {
            const deadline = new Date(c.claim_deadline);
            const isExpired = deadline < new Date();
            const remaining = Math.max(0, c.max_claims - c.claimed_count);
            return (
              <div key={c.id} className="bg-white rounded-3xl border border-[#E8ECF0] p-5 hover:shadow-md transition-all shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#FEF3C7] flex items-center justify-center">
                      <Tag size={20} className="text-[#F59E0B]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-[#1A1D21] tracking-wider">{c.code}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          c.is_active && !isExpired ? 'bg-[#D1FAE5] text-[#047857]' : 'bg-[#FEE2E2] text-[#B91C1C]'
                        }`}>
                          {c.is_active && !isExpired ? '进行中' : '已失效'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-[#9CA3AF]">
                        <span>面额: <strong className="text-[#F59E0B]">{c.credits}</strong> 积分</span>
                        <span>名额: <strong className={remaining > 0 ? 'text-[#1A1D21]' : 'text-[#EF4444]'}>{c.claimed_count}/{c.max_claims || '∞'}</strong></span>
                        <span>领取截止: <strong className={isExpired ? 'text-[#EF4444]' : 'text-[#1A1D21]'}>{deadline.toLocaleDateString()}</strong></span>
                        <span>有效期: <strong className="text-[#1A1D21]">{c.expire_days} 天</strong></span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleActive(c)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-300 ${
                        c.is_active ? 'bg-[#F8F9FA] text-[#5E6268] hover:bg-[#E8ECF0]' : 'bg-[#D1FAE5] text-[#047857] hover:bg-[#A7F3D0]'
                      }`}>
                      {c.is_active ? '禁用' : '启用'}
                    </button>
                    <button onClick={() => openEdit(c)} className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[#EEF2FF] text-[#6366F1] hover:bg-[#C7D2FE] transition-colors">编辑</button>
                    <button onClick={() => handleDelete(c.id)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[#FEE2E2] transition-colors"><Trash2 size={14} className="text-[#EF4444]" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-3 py-1.5 rounded-xl text-sm bg-[#F8F9FA] text-[#5E6268] hover:bg-[#E8ECF0] disabled:opacity-30 transition-colors">上一页</button>
          <span className="text-sm text-[#9CA3AF]">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-xl text-sm bg-[#F8F9FA] text-[#5E6268] hover:bg-[#E8ECF0] disabled:opacity-30 transition-colors">下一页</button>
        </div>
      )}
    </div>
  );
}

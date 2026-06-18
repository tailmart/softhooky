import React, { useState, useEffect, useCallback } from 'react';
import { X, Loader2, History, Coins, ArrowUpRight, ArrowDownLeft, RefreshCw } from 'lucide-react';
import { getAuthToken } from '../../services/authService';
import { useAuth } from '../../contexts/AuthContext';

interface MobileRecordsProps { onBack: () => void; }

export const MobileRecords: React.FC<MobileRecordsProps> = ({ onBack }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'consumption' | 'recharge'>('consumption');
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 30;

  const fetchRecords = useCallback(async (p: number, tab: string) => {
    const token = getAuthToken();
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const endpoint = tab === 'recharge'
        ? `/api/payment/records?page=${p}`
        : `/api/payment/consumption?page=${p}&pageSize=${pageSize}`;
      const r = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) {
        if (tab === 'recharge') {
          setRecords(d.orders || []);
          setTotalPages(d.pagination?.totalPages || 1);
          setTotalCount(d.pagination?.total || 0);
        } else {
          setRecords(d.consumptions || []);
          setTotalPages(d.pagination?.totalPages || 1);
          setTotalCount(d.pagination?.totalConsumptions || 0);
        }
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRecords(page, activeTab); }, [page, activeTab, fetchRecords]);

  const switchTab = (tab: 'consumption' | 'recharge') => {
    setActiveTab(tab);
    setPage(1);
    setRecords([]);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 mobile-tap"><X size={16} className="text-gray-500" /></button>
        <h1 className="text-base font-bold text-[#171717]">历史记录</h1>
        <button onClick={() => fetchRecords(page, activeTab)} className="ml-auto p-2 rounded-full bg-gray-100"><RefreshCw size={14} className="text-gray-500" /></button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-4">
        <button onClick={() => switchTab('consumption')}
          className={`py-3 text-sm font-medium border-b-2 transition-colors mr-6 ${activeTab === 'consumption' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400'}`}>
          消费记录
        </button>
        {!user?.isSubUser && !user?.recharge_disabled && (
          <button onClick={() => switchTab('recharge')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'recharge' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400'}`}>
            充值记录
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? <div className="flex items-center justify-center py-20"><Loader2 size={20} className="text-gray-400 animate-spin" /></div>
        : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-3 shadow-sm border border-gray-200"><History size={28} className="text-gray-300" /></div>
            <p className="text-sm font-medium text-gray-400">暂无记录</p>
            <span className="text-xs text-gray-300 mt-1">{totalCount || 0} 条</span>
          </div>
        ) : (
          <div className="px-4 pt-4 pb-4 space-y-2">
            <p className="text-xs text-gray-400 mb-2">{totalCount} 条记录</p>
            {records.map((r: any, idx: number) => {
              const isRecharge = activeTab === 'recharge';
              const amount = isRecharge ? r.amount || r.total_amount || 0 : r.credits_spent || r.credits || 0;
              const desc = isRecharge ? `充值 ¥${r.amount || r.total_amount || 0}` : r.description || r.reason || 'AI生成消耗';
              return (
                <div key={r.id || idx} className="bg-gray-50 rounded-2xl p-4 border border-gray-200 flex items-center gap-3.5">
                  <div className={`w-10 h-10 rounded-xl ${isRecharge ? 'bg-green-500/10' : 'bg-red-500/10'} flex items-center justify-center flex-shrink-0`}>
                    {isRecharge ? <ArrowUpRight size={18} className="text-green-500" /> : <ArrowDownLeft size={18} className="text-red-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#171717]">{desc}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(r.created_at || r.createdAt || '')}</p>
                  </div>
                  <span className={`text-sm font-bold flex-shrink-0 ${isRecharge ? 'text-green-500' : 'text-red-400'}`}>
                    {isRecharge ? '+' : '-'}{Number(amount).toFixed(1)}
                  </span>
                </div>
              );
            })}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-4">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="px-4 py-2 rounded-xl bg-gray-100 border border-gray-200 text-xs font-medium disabled:opacity-40 text-gray-500">上一页</button>
                <span className="text-xs text-gray-400">{page}/{totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="px-4 py-2 rounded-xl bg-gray-100 border border-gray-200 text-xs font-medium disabled:opacity-40 text-gray-500">下一页</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

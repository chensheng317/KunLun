import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Coins,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { CreditRecord } from '../../contexts/AuthContext';
import { apiClient } from '../../utils/api-client';

/**
 * 积分记录页面
 * NOTE: Phase 2.8 — 改为从后端 API 异步加载积分流水
 *       GET /api/credits/records?pageSize=500
 *       移除对 getCreditRecords (localStorage) 的依赖
 */

const PAGE_SIZE = 8;

/** 后端 API 返回的积分记录格式 */
interface ApiCreditRecord {
  id: number;
  userId: number;
  type: string;
  amount: number;
  balance: number;
  description: string | null;
  createdAt: string;
}

/** 后端分页响应 */
interface ApiCreditListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: ApiCreditRecord[];
}

export default function CreditsPage() {
  const { user, credits } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);
  const [allRecords, setAllRecords] = useState<CreditRecord[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * 从后端 API 加载积分流水记录
   * NOTE: 一次拉取最多 500 条，覆盖绝大多数用户场景
   */
  const fetchRecords = useCallback(async () => {
    if (!user) {
      setAllRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const resp = await apiClient.get<ApiCreditListResponse>(
        '/api/credits/records?pageSize=500',
      );
      // NOTE: 将后端格式映射为前端 CreditRecord 类型
      const mapped: CreditRecord[] = resp.items.map((item) => ({
        id: String(item.id),
        username: user.username,
        type: item.type as CreditRecord['type'],
        amount: item.amount,
        balance: item.balance,
        description: item.description || '',
        createdAt: item.createdAt,
      }));
      setAllRecords(mapped);
    } catch {
      // NOTE: API 不可用时显示空列表，不影响页面渲染
      setAllRecords([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const totalPages = Math.max(1, Math.ceil(allRecords.length / PAGE_SIZE));
  const currentRecords = allRecords.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  // NOTE: 累计消费 = 所有负数金额的绝对值之和
  const totalConsume = allRecords
    .filter((r) => r.amount < 0)
    .reduce((sum, r) => sum + Math.abs(r.amount), 0);
  // NOTE: 累计充值 = 所有充值/升级/撤销退款的正数之和
  const totalRecharge = allRecords
    .filter((r) => r.type === 'recharge' || r.type === 'upgrade' || r.type === 'undo_refund')
    .reduce((sum, r) => sum + r.amount, 0);

  /** 格式化时间 */
  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch { return iso; }
  };

  /** 类型标签 */
  const typeLabel = (r: CreditRecord) => {
    if (r.amount < 0) return { text: '消费', cls: 'bg-rose-500/20 text-rose-400 border border-rose-500/30', icon: ArrowDownRight };
    return { text: '充值', cls: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30', icon: ArrowUpRight };
  };

  /** 生成分页按钮列表 */
  const getPageNumbers = (): (number | '...')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | '...')[] = [1];
    if (currentPage > 3) pages.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  return (
    <div className="h-full overflow-y-auto p-8 max-w-5xl mx-auto space-y-8">
      {/* 标题 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-xl font-bold text-nexus-text flex items-center gap-3">
          <Coins size={22} className="text-nexus-primary" />
          积分记录
        </h1>
        <p className="text-sm text-nexus-muted mt-1.5">
          查看积分消费与充值明细。
        </p>
      </motion.div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-nexus-surface border border-nexus-border rounded-2xl p-5"
        >
          <p className="text-xs text-nexus-muted mb-1">当前余额</p>
          <p className="text-2xl font-black text-nexus-primary font-mono">
            {credits.toLocaleString()}
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-nexus-surface border border-nexus-border rounded-2xl p-5"
        >
          <p className="text-xs text-nexus-muted mb-1">累计消费</p>
          <p className="text-2xl font-black text-rose-400 font-mono">
            -{totalConsume.toLocaleString()}
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-nexus-surface border border-nexus-border rounded-2xl p-5"
        >
          <p className="text-xs text-nexus-muted mb-1">累计充值</p>
          <p className="text-2xl font-black text-emerald-400 font-mono">
            +{totalRecharge.toLocaleString()}
          </p>
        </motion.div>
      </div>

      {/* 记录表格 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-nexus-surface border border-nexus-border rounded-2xl overflow-hidden"
      >
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 size={28} className="mx-auto text-nexus-primary animate-spin mb-3" />
            <p className="text-sm text-nexus-muted">加载积分记录中…</p>
          </div>
        ) : allRecords.length === 0 ? (
          <div className="py-16 text-center">
            <Coins size={40} className="mx-auto text-nexus-muted/40 mb-3" />
            <p className="text-sm text-nexus-muted">暂无积分变动记录</p>
          </div>
        ) : (
          <>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-nexus-surface-alt/40 border-b border-nexus-border">
                  <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">类型</th>
                  <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">描述</th>
                  <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">积分变动</th>
                  <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">余额</th>
                  <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nexus-border">
                {currentRecords.map((record) => {
                  const t = typeLabel(record);
                  const TIcon = t.icon;
                  return (
                    <tr key={record.id} className="hover:bg-nexus-bg/50 transition-colors">
                      <td className="p-4">
                        <div className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded font-bold ${t.cls}`}>
                          <TIcon size={10} />
                          {t.text}
                        </div>
                      </td>
                      <td className="p-4 text-sm text-nexus-text">{record.description}</td>
                      <td className={`p-4 text-sm font-mono font-bold text-right ${record.amount < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {record.amount > 0 ? '+' : ''}{record.amount}
                      </td>
                      <td className="p-4 text-xs text-nexus-muted font-mono text-right">{record.balance}</td>
                      <td className="p-4 text-xs text-nexus-muted font-mono text-right">{formatDate(record.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* 分页控件 */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-nexus-border flex items-center justify-between bg-nexus-surface-alt/20">
                <span className="text-[11px] text-nexus-muted font-mono">
                  共 {allRecords.length} 条 · 第 {currentPage}/{totalPages} 页
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="首页">
                    <ChevronsLeft size={16} />
                  </button>
                  <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <ChevronLeft size={16} />
                  </button>
                  {getPageNumbers().map((page, idx) =>
                    page === '...' ? (
                      <span key={`dots-${idx}`} className="w-7 h-7 flex items-center justify-center text-xs text-nexus-muted">…</span>
                    ) : (
                      <button key={page} onClick={() => setCurrentPage(page)} className={`w-7 h-7 rounded-md text-xs font-bold transition-all ${page === currentPage ? 'bg-nexus-primary text-nexus-inverse shadow-cyber-glow' : 'text-nexus-muted hover:text-nexus-text hover:bg-nexus-surface'}`}>
                        {page}
                      </button>
                    ),
                  )}
                  <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <ChevronRight size={16} />
                  </button>
                  <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="尾页">
                    <ChevronsRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}

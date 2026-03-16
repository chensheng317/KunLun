import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Coins,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

/**
 * 积分记录页面
 * NOTE: 展示用户积分消费/充值的明细记录，含分页
 */

interface CreditRecord {
  id: number;
  type: 'consume' | 'recharge';
  amount: number;
  balance: number;
  description: string;
  date: string;
}

/** 模拟积分记录数据 */
const allRecords: CreditRecord[] = [
  { id: 1, type: 'consume', amount: -50, balance: 2580, description: '数字员工 · 竞品分析任务', date: '2026-03-16 14:30' },
  { id: 2, type: 'consume', amount: -120, balance: 2630, description: '数字工厂 · 批量数据处理', date: '2026-03-16 10:15' },
  { id: 3, type: 'recharge', amount: 500, balance: 2750, description: '积分充值 · PRO 套餐', date: '2026-03-15 18:00' },
  { id: 4, type: 'consume', amount: -30, balance: 2250, description: '数字员工 · 关键词挖掘', date: '2026-03-15 09:20' },
  { id: 5, type: 'consume', amount: -80, balance: 2280, description: '数字员工 · 营销素材抓取', date: '2026-03-14 16:45' },
  { id: 6, type: 'consume', amount: -200, balance: 2360, description: '数字工厂 · 深度学习训练', date: '2026-03-14 11:30' },
  { id: 7, type: 'recharge', amount: 1000, balance: 2560, description: '积分充值 · 企业套餐', date: '2026-03-13 20:00' },
  { id: 8, type: 'consume', amount: -40, balance: 1560, description: '数字员工 · 店铺体检', date: '2026-03-13 15:10' },
  { id: 9, type: 'consume', amount: -60, balance: 1600, description: '数字员工 · 话术优化', date: '2026-03-12 14:00' },
  { id: 10, type: 'consume', amount: -90, balance: 1660, description: '数字工厂 · 库存同步', date: '2026-03-12 09:30' },
  { id: 11, type: 'recharge', amount: 200, balance: 1750, description: '积分充值 · 基础包', date: '2026-03-11 22:00' },
  { id: 12, type: 'consume', amount: -35, balance: 1550, description: '数字员工 · 文案生成', date: '2026-03-11 11:45' },
  { id: 13, type: 'consume', amount: -110, balance: 1585, description: '数字工厂 · 视频剪辑渲染', date: '2026-03-10 16:20' },
  { id: 14, type: 'consume', amount: -25, balance: 1695, description: '数字员工 · 评论采集', date: '2026-03-10 08:50' },
  { id: 15, type: 'recharge', amount: 300, balance: 1720, description: '积分充值 · 季度包', date: '2026-03-09 19:30' },
  { id: 16, type: 'consume', amount: -70, balance: 1420, description: '数字员工 · 价格监控', date: '2026-03-09 13:15' },
  { id: 17, type: 'consume', amount: -45, balance: 1490, description: '数字工厂 · 报表生成', date: '2026-03-08 17:40' },
  { id: 18, type: 'consume', amount: -55, balance: 1535, description: '数字员工 · 直播数据分析', date: '2026-03-08 10:25' },
  { id: 19, type: 'recharge', amount: 800, balance: 1590, description: '积分充值 · 年度套餐', date: '2026-03-07 21:00' },
  { id: 20, type: 'consume', amount: -100, balance: 790, description: '数字工厂 · AI 模型微调', date: '2026-03-07 14:30' },
];

const PAGE_SIZE = 8;

export default function CreditsPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(allRecords.length / PAGE_SIZE);
  const currentRecords = allRecords.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const totalConsume = allRecords
    .filter((r) => r.type === 'consume')
    .reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const totalRecharge = allRecords
    .filter((r) => r.type === 'recharge')
    .reduce((sum, r) => sum + r.amount, 0);

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
    <div className="p-8 max-w-5xl mx-auto space-y-8">
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
            2,580
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
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-nexus-surface-alt/40 border-b border-nexus-border">
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">
                类型
              </th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">
                描述
              </th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">
                积分变动
              </th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">
                余额
              </th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">
                时间
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-nexus-border">
            {currentRecords.map((record) => (
              <tr
                key={record.id}
                className="hover:bg-nexus-bg/50 transition-colors"
              >
                <td className="p-4">
                  <div
                    className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded font-bold ${
                      record.type === 'consume'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {record.type === 'consume' ? (
                      <ArrowDownRight size={10} />
                    ) : (
                      <ArrowUpRight size={10} />
                    )}
                    {record.type === 'consume' ? '消费' : '充值'}
                  </div>
                </td>
                <td className="p-4 text-sm text-nexus-text">
                  {record.description}
                </td>
                <td
                  className={`p-4 text-sm font-mono font-bold text-right ${
                    record.type === 'consume'
                      ? 'text-rose-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {record.amount > 0 ? '+' : ''}
                  {record.amount}
                </td>
                <td className="p-4 text-xs text-nexus-muted font-mono text-right">
                  {record.balance}
                </td>
                <td className="p-4 text-xs text-nexus-muted font-mono text-right">
                  {record.date}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 分页控件 */}
        <div className="px-4 py-3 border-t border-nexus-border flex items-center justify-between bg-nexus-surface-alt/20">
          <span className="text-[11px] text-nexus-muted font-mono">
            共 {allRecords.length} 条 · 第 {currentPage}/{totalPages} 页
          </span>
          <div className="flex items-center gap-1">
            {/* 首页 */}
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="首页"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {getPageNumbers().map((page, idx) =>
              page === '...' ? (
                <span
                  key={`dots-${idx}`}
                  className="w-7 h-7 flex items-center justify-center text-xs text-nexus-muted"
                >
                  …
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-7 h-7 rounded-md text-xs font-bold transition-all ${
                    page === currentPage
                      ? 'bg-nexus-primary text-nexus-inverse shadow-cyber-glow'
                      : 'text-nexus-muted hover:text-nexus-text hover:bg-nexus-surface'
                  }`}
                >
                  {page}
                </button>
              ),
            )}
            <button
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages, p + 1))
              }
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
            {/* 尾页 */}
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="尾页"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

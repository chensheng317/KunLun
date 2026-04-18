import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  CheckCircle,
  XCircle,
  Cpu,
  Wrench,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader,
  Download,
  Trash2,
} from 'lucide-react';
import { apiClient } from '../../utils/api-client';
import {
  getHistoryRecords,
  getWorkerHistoryRecords,
  type FactoryHistoryRecord,
  type WorkerHistoryRecord,
} from '../../utils/factory-records';

/**
 * 历史记录页面
 * NOTE: 保存用户与数字员工的会话历史 + 用户在数字工厂的使用历史
 * 使用 Tab 切换两种历史类型，每种都有分页导航
 * 支持从数字员工页面跳转时自动切换到指定 tab
 */

// ============ 类型定义 ============

interface WorkerHistory {
  id: string;
  command: string;
  status: 'success' | 'failed' | 'running';
  time: string;
  duration: string;
  result?: string;
  logFile?: string;
  deviceLabel?: string;
}

interface FactoryHistory {
  id: number;
  toolName: string;
  action: string;
  status: 'success' | 'failed' | 'running';
  time: string;
  duration: string;
  output?: string;
}

type HistoryTab = 'workers' | 'factory';

const PAGE_SIZE = 6;

/**
 * 生成分页按钮列表（含省略号）
 * NOTE: 与资产库的分页逻辑保持一致
 */
function getPageNumbers(
  currentPage: number,
  totalPages: number,
): (number | '...')[] {
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
}

/**
 * 将 ISO 时间转换为可读的相对时间
 */
function formatRelativeTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin} 分钟前`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)} 小时前`;
    return `${Math.floor(diffMin / 1440)} 天前`;
  } catch {
    return isoStr;
  }
}

const API_BASE = 'http://localhost:8000';

export default function HistoryPage() {
  const [activeTab, setActiveTab] = useState<HistoryTab>('workers');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [workerPage, setWorkerPage] = useState(1);
  const [factoryPage, setFactoryPage] = useState(1);

  // 从 localStorage 加载工厂使用记录
  const [dynamicRecords, setDynamicRecords] = useState<FactoryHistoryRecord[]>([]);
  // 从 localStorage 加载数字员工真实历史
  const [workerRecords, setWorkerRecords] = useState<WorkerHistoryRecord[]>([]);

  useEffect(() => {
    // NOTE: Phase 2.1 — 异步加载历史记录（优先 API，回退 localStorage）
    const loadHistory = async () => {
      const [factory, worker] = await Promise.all([
        getHistoryRecords(),
        getWorkerHistoryRecords(),
      ]);
      setDynamicRecords(factory);
      setWorkerRecords(worker);
    };
    loadHistory();
  }, []);

  // 监听从数字员工页跳转来时指定的 subTab
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.subTab === 'workers') {
        setActiveTab('workers');
      }
    };
    window.addEventListener('navigate-to-tab', handler);
    return () => window.removeEventListener('navigate-to-tab', handler);
  }, []);

  /**
   * 仅使用 API 返回的真实数据（不再追加 mock 数据）
   */
  const mergedWorkerHistory: WorkerHistory[] = useMemo(() => {
    return workerRecords.map((r) => ({
      id: r.id,
      command: r.command,
      status: r.status,
      time: formatRelativeTime(r.time),
      duration: r.duration,
      result: r.result,
      logFile: r.logFile,
      deviceLabel: r.deviceLabel,
    }));
  }, [workerRecords]);

  const mergedFactoryHistory: FactoryHistory[] = useMemo(() => {
    return dynamicRecords.map((r, idx) => ({
      id: 2000 + idx,
      toolName: r.toolName,
      action: r.action,
      status: r.status,
      time: formatRelativeTime(r.time),
      duration: r.duration,
      output: r.output,
    }));
  }, [dynamicRecords]);

  // 分页计算
  const workerTotalPages = Math.max(1, Math.ceil(mergedWorkerHistory.length / PAGE_SIZE));
  const factoryTotalPages = Math.max(1, Math.ceil(mergedFactoryHistory.length / PAGE_SIZE));
  const currentWorkerItems = mergedWorkerHistory.slice(
    (workerPage - 1) * PAGE_SIZE,
    workerPage * PAGE_SIZE,
  );
  const currentFactoryItems = mergedFactoryHistory.slice(
    (factoryPage - 1) * PAGE_SIZE,
    factoryPage * PAGE_SIZE,
  );

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  /** 下载日志文件 */
  const handleDownloadLog = useCallback((filename: string) => {
    const url = `${API_BASE}/api/digital-worker/logs/${filename}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  /** 删除数字员工历史记录 */
  const handleDeleteWorker = useCallback(async (recordId: string) => {
    if (!confirm('确定要删除这条历史记录吗？')) return;
    try {
      await apiClient.delete(`/api/assets/worker/${recordId}`);
      setWorkerRecords((prev) => prev.filter((r) => r.id !== recordId));
    } catch {
      alert('删除失败，请重试');
    }
  }, []);

  /** 删除工厂使用历史记录 */
  const handleDeleteFactory = useCallback(async (recordId: string) => {
    if (!confirm('确定要删除这条历史记录吗？')) return;
    try {
      await apiClient.delete(`/api/assets/history/${recordId}`);
      setDynamicRecords((prev) => prev.filter((r) => r.id !== recordId));
    } catch {
      alert('删除失败，请重试');
    }
  }, []);

  return (
    <div className="h-full overflow-y-auto p-8 max-w-7xl mx-auto space-y-6">
      {/* 标题 */}
      <div>
        <h1 className="text-xl font-bold text-nexus-text flex items-center gap-3">
          <Clock size={22} className="text-nexus-primary" />
          历史记录
        </h1>
        <p className="text-sm text-nexus-muted mt-1.5">
          追溯所有会话记录、指令执行状态与数字工厂使用历史。
        </p>
      </div>

      {/* Tab 切换 */}
      <div className="flex items-center gap-1 bg-nexus-surface border border-nexus-border rounded-xl p-1 w-fit">
        <button
          onClick={() => {
            setActiveTab('workers');
            setExpandedId(null);
          }}
          className={`cursor-target flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'workers'
            ? 'bg-nexus-primary text-nexus-inverse shadow-cyber-glow'
            : 'text-nexus-muted hover:text-nexus-text'
            }`}
        >
          <Cpu size={15} />
          数字员工会话
        </button>
        <button
          onClick={() => {
            setActiveTab('factory');
            setExpandedId(null);
          }}
          className={`cursor-target flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'factory'
            ? 'bg-nexus-primary text-nexus-inverse shadow-cyber-glow'
            : 'text-nexus-muted hover:text-nexus-text'
            }`}
        >
          <Wrench size={15} />
          数字工厂使用
        </button>
      </div>

      {/* ====== 数字员工会话列表 ====== */}
      {activeTab === 'workers' && (
        <>
          <div className="space-y-3">
            {currentWorkerItems.length === 0 && (
              <div className="text-center py-16 text-nexus-muted">
                <Cpu size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">暂无数字员工会话记录</p>
                <p className="text-xs mt-1 opacity-60">使用数字员工执行任务后，记录将自动出现在这里</p>
              </div>
            )}
            {currentWorkerItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="cursor-target bg-nexus-surface border border-nexus-border rounded-xl overflow-hidden hover:border-nexus-primary/30 transition-colors duration-300"
              >
                <button
                  onClick={() => toggleExpand(item.id)}
                  className="w-full p-5 flex items-center justify-between text-left"
                >
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <div className="mt-0.5 shrink-0">
                      {item.status === 'success' && (
                        <CheckCircle size={18} className="text-emerald-400" />
                      )}
                      {item.status === 'failed' && (
                        <XCircle size={18} className="text-rose-400" />
                      )}
                      {item.status === 'running' && (
                        <Loader
                          size={18}
                          className="text-nexus-primary animate-spin"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-nexus-text truncate">
                        {item.command}
                      </p>
                      <div className="flex items-center gap-4 text-[11px] text-nexus-muted font-mono mt-1.5">
                        <span>{item.time}</span>
                        <span>耗时: {item.duration}</span>
                        {item.deviceLabel && (
                          <span className="text-nexus-primary/60">{item.deviceLabel}</span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${item.status === 'success'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : item.status === 'failed'
                              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              : 'bg-nexus-primary/15 text-nexus-primary border border-nexus-primary/30'
                            }`}
                        >
                          {item.status === 'success'
                            ? '成功'
                            : item.status === 'failed'
                              ? '失败'
                              : '执行中'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 ml-4 text-nexus-muted">
                    {expandedId === item.id ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </div>
                </button>

                {/* 展开详情 */}
                {expandedId === item.id && item.result && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="px-5 pb-4 border-t border-nexus-border"
                  >
                    <div className="mt-3 p-3 bg-nexus-bg rounded-lg border border-nexus-border">
                      <div className="flex items-center gap-2 mb-1.5">
                        <MessageSquare
                          size={12}
                          className="text-nexus-primary"
                        />
                        <span className="text-[10px] font-bold text-nexus-primary uppercase tracking-wider">
                          执行结果
                        </span>
                      </div>
                      <p className="text-xs text-nexus-muted leading-relaxed font-mono whitespace-pre-wrap">
                        {item.result}
                      </p>
                      {/* 日志下载按钮 */}
                      {item.logFile && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadLog(item.logFile!);
                          }}
                          className="cursor-target mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-nexus-primary border border-nexus-primary/30 hover:bg-nexus-primary/10 transition-all"
                        >
                          <Download size={12} />
                          下载执行日志
                        </button>
                      )}
                      {/* 删除按钮 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteWorker(item.id);
                        }}
                        className="cursor-target mt-2 ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-rose-400 border border-rose-500/30 hover:bg-rose-500/10 transition-all"
                      >
                        <Trash2 size={12} />
                        删除记录
                      </button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>

          {/* 分页导航 */}
          <PaginationBar
            currentPage={workerPage}
            totalPages={workerTotalPages}
            totalItems={mergedWorkerHistory.length}
            onPageChange={(p) => {
              setWorkerPage(p);
              setExpandedId(null);
            }}
          />
        </>
      )}

      {/* ====== 数字工厂使用列表 ====== */}
      {activeTab === 'factory' && (
        <>
          <div className="space-y-3">
            {currentFactoryItems.length === 0 && (
              <div className="text-center py-16 text-nexus-muted">
                <Wrench size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">暂无数字工厂使用记录</p>
                <p className="text-xs mt-1 opacity-60">使用数字工厂中的工具后，记录将自动出现在这里</p>
              </div>
            )}
            {currentFactoryItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="cursor-target bg-nexus-surface border border-nexus-border rounded-xl overflow-hidden hover:border-amber-500/30 transition-colors duration-300"
              >
                <button
                  onClick={() => toggleExpand(`factory-${item.id}`)}
                  className="w-full p-5 flex items-center justify-between text-left"
                >
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <div className="mt-0.5 shrink-0">
                      {item.status === 'success' && (
                        <CheckCircle size={18} className="text-emerald-400" />
                      )}
                      {item.status === 'failed' && (
                        <XCircle size={18} className="text-rose-400" />
                      )}
                      {item.status === 'running' && (
                        <Loader
                          size={18}
                          className="text-amber-400 animate-spin"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold">
                          {item.toolName}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-nexus-text truncate">
                        {item.action}
                      </p>
                      <div className="flex items-center gap-4 text-[11px] text-nexus-muted font-mono mt-1.5">
                        <span>{item.time}</span>
                        <span>耗时: {item.duration}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${item.status === 'success'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : item.status === 'running'
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            }`}
                        >
                          {item.status === 'success'
                            ? '成功'
                            : item.status === 'running'
                              ? '执行中'
                              : '失败'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 ml-4 text-nexus-muted">
                    {expandedId === `factory-${item.id}` ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </div>
                </button>

                {/* 展开详情 */}
                {expandedId === `factory-${item.id}` && item.output && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="px-5 pb-4 border-t border-nexus-border"
                  >
                    <div className="mt-3 p-3 bg-nexus-bg rounded-lg border border-nexus-border">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Wrench size={12} className="text-amber-400" />
                        <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                          产出结果
                        </span>
                      </div>
                      <p className="text-xs text-nexus-muted leading-relaxed font-mono">
                        {item.output}
                      </p>
                      {/* 删除按钮 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const realRecord = dynamicRecords[mergedFactoryHistory.findIndex((h) => h.id === item.id)];
                          if (realRecord) handleDeleteFactory(realRecord.id);
                        }}
                        className="cursor-target mt-2 ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-rose-400 border border-rose-500/30 hover:bg-rose-500/10 transition-all"
                      >
                        <Trash2 size={12} />
                        删除记录
                      </button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>

          {/* 分页导航 */}
          <PaginationBar
            currentPage={factoryPage}
            totalPages={factoryTotalPages}
            totalItems={mergedFactoryHistory.length}
            onPageChange={(p) => {
              setFactoryPage(p);
              setExpandedId(null);
            }}
          />
        </>
      )}
    </div>
  );
}


// ================================================================
//  分页导航组件
// ================================================================

interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

/**
 * 通用分页导航：首页 / 上一页 / 页码 / 下一页 / 尾页
 * NOTE: 复用资产库的分页按钮生成逻辑
 */
function PaginationBar({ currentPage, totalPages, totalItems, onPageChange }: PaginationBarProps) {
  if (totalPages <= 1) return null;

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <div className="flex items-center justify-between pt-4">
      <span className="text-[11px] text-nexus-muted font-mono">
        共 {totalItems} 条 · 第 {currentPage}/{totalPages} 页
      </span>
      <div className="flex items-center gap-1">
        {/* 首页 */}
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="cursor-target p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="首页"
        >
          <ChevronsLeft size={16} />
        </button>
        {/* 上一页 */}
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="cursor-target p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="上一页"
        >
          <ChevronLeft size={16} />
        </button>
        {/* 页码 */}
        {pageNumbers.map((page, idx) =>
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
              onClick={() => onPageChange(page)}
              className={`cursor-target w-7 h-7 rounded-md text-xs font-bold transition-all ${page === currentPage
                ? 'bg-nexus-primary text-nexus-inverse shadow-cyber-glow'
                : 'text-nexus-muted hover:text-nexus-text hover:bg-nexus-surface'
                }`}
            >
              {page}
            </button>
          ),
        )}
        {/* 下一页 */}
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="cursor-target p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="下一页"
        >
          <ChevronRight size={16} />
        </button>
        {/* 尾页 */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="cursor-target p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="尾页"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
}

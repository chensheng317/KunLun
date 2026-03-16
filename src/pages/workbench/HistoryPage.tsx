import { useState } from 'react';
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
  Loader,
} from 'lucide-react';

/**
 * 历史记录页面
 * NOTE: 保存用户与数字员工的会话历史 + 用户在数字工厂的使用历史
 * 使用 Tab 切换两种历史类型
 */

// ============ Mock 数据 ============

interface WorkerHistory {
  id: number;
  command: string;
  status: 'success' | 'failed' | 'running';
  time: string;
  duration: string;
  result?: string;
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

const workerHistory: WorkerHistory[] = [
  {
    id: 1,
    command: '帮我分析一下最近一周抖音美妆类目的爆款视频数据',
    status: 'success',
    time: '10 分钟前',
    duration: '45s',
    result: '已生成报告：竞品分析报告_20260312.md（24 KB），已保存至资产库。',
  },
  {
    id: 2,
    command: '全网抓取高转化营销素材，智能分类打标',
    status: 'success',
    time: '2 小时前',
    duration: '1m 20s',
    result: '已生成报告：营销素材抓取结果.json（1.2 MB），已保存至资产库。',
  },
  {
    id: 3,
    command: '一键分发多平台图文内容',
    status: 'failed',
    time: '昨天 14:30',
    duration: '12s',
    result: '执行失败：平台授权过期，请重新绑定账号。',
  },
  {
    id: 4,
    command: '全方位扫描店铺健康度',
    status: 'success',
    time: '昨天 09:00',
    duration: '3m 10s',
    result: '已生成报告：店铺健康度体检报告.md（18 KB），已保存至资产库。',
  },
  {
    id: 5,
    command: '根据客户画像生成高情商回复',
    status: 'running',
    time: '刚刚',
    duration: '进行中...',
  },
  {
    id: 6,
    command: '提取短视频核心数据指标，生成优化建议',
    status: 'success',
    time: '3 天前',
    duration: '2m 5s',
    result: '已生成报告：短视频数据复盘_02.md（32 KB），已保存至资产库。',
  },
];

const factoryHistory: FactoryHistory[] = [
  {
    id: 1,
    toolName: '全域营销自动化',
    action: '启动营销数据透视分析任务',
    status: 'success',
    time: '1 天前',
    duration: '8m 30s',
    output: '产物：全域营销数据透视.json（3.8 MB），已归档至资产库。',
  },
  {
    id: 2,
    toolName: '智能客服中枢',
    action: '训练客服对话模型，生成训练集',
    status: 'success',
    time: '2 天前',
    duration: '15m 42s',
    output: '产物：客服对话训练集.csv（12 MB），已归档至资产库。',
  },
  {
    id: 3,
    toolName: '跨平台库存同步',
    action: '全渠道库存同步任务',
    status: 'success',
    time: '3 天前',
    duration: '4m 12s',
    output: '产物：跨平台库存同步日志.log（256 KB），已归档至资产库。',
  },
  {
    id: 4,
    toolName: '云端渲染引擎',
    action: '渲染营销 Banner 素材 v3',
    status: 'success',
    time: '4 天前',
    duration: '6m 55s',
    output: '产物：渲染产物_banner_v3.png（2.1 MB），已归档至资产库。',
  },
  {
    id: 5,
    toolName: '深度学习训练集群',
    action: '训练模型评估任务',
    status: 'failed',
    time: '5 天前',
    duration: '22m 10s',
    output: '任务失败：GPU 资源不足，请升级算力节点后重试。',
  },
];

type HistoryTab = 'workers' | 'factory';

export default function HistoryPage() {
  const [activeTab, setActiveTab] = useState<HistoryTab>('workers');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
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
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === 'workers'
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
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === 'factory'
              ? 'bg-nexus-primary text-nexus-inverse shadow-cyber-glow'
              : 'text-nexus-muted hover:text-nexus-text'
          }`}
        >
          <Wrench size={15} />
          数字工厂使用
        </button>
      </div>

      {/* 列表 */}
      <div className="space-y-3">
        {activeTab === 'workers' &&
          workerHistory.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-nexus-surface border border-nexus-border rounded-xl overflow-hidden hover:border-nexus-primary/30 transition-colors duration-300"
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
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          item.status === 'success'
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
                    <p className="text-xs text-nexus-muted leading-relaxed font-mono">
                      {item.result}
                    </p>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ))}

        {activeTab === 'factory' &&
          factoryHistory.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-nexus-surface border border-nexus-border rounded-xl overflow-hidden hover:border-amber-500/30 transition-colors duration-300"
            >
              <button
                onClick={() => toggleExpand(item.id + 1000)}
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
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          item.status === 'success'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {item.status === 'success' ? '成功' : '失败'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="shrink-0 ml-4 text-nexus-muted">
                  {expandedId === item.id + 1000 ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </div>
              </button>

              {/* 展开详情 */}
              {expandedId === item.id + 1000 && item.output && (
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
                  </div>
                </motion.div>
              )}
            </motion.div>
          ))}
      </div>
    </div>
  );
}

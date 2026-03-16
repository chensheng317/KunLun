import React from 'react';
import { motion } from 'framer-motion';
import {
  ActivityIcon,
  ServerIcon,
  ShieldCheckIcon,
  ZapIcon,
  ArrowRightIcon,
  TerminalIcon } from
'lucide-react';
export function HomePage() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Welcome & Status */}
      <motion.div
        initial={{
          opacity: 0,
          y: 20
        }}
        animate={{
          opacity: 1,
          y: 0
        }}
        className="bg-nexus-surface border border-nexus-border rounded-2xl p-8 relative overflow-hidden">
        
        <div className="absolute top-0 right-0 w-64 h-64 bg-nexus-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-nexus-text mb-2 flex items-center gap-3">
              情报局中枢{' '}
              <span className="text-nexus-primary animate-pulse">_</span>
            </h1>
            <p className="text-nexus-muted">
              欢迎接入昆仑工坊。系统运行平稳，各项指标正常。
            </p>
          </div>

          <div className="flex items-center gap-6 bg-nexus-bg p-4 rounded-xl border border-nexus-border">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-nexus-primary animate-pulse-glow"></div>
              <span className="text-sm font-medium text-nexus-text">
                核心引擎在线
              </span>
            </div>
            <div className="w-px h-8 bg-nexus-border"></div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-nexus-secondary"></div>
              <span className="text-sm font-medium text-nexus-text">
                API 节点就绪
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* System Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          title="算力负载"
          value="24%"
          icon={<ActivityIcon className="w-5 h-5 text-nexus-primary" />}
          delay={0.1} />
        
        <MetricCard
          title="活跃节点"
          value="1,024"
          icon={<ServerIcon className="w-5 h-5 text-nexus-secondary" />}
          delay={0.2} />
        
        <MetricCard
          title="安全防护"
          value="已开启"
          icon={<ShieldCheckIcon className="w-5 h-5 text-emerald-400" />}
          delay={0.3} />
        
      </div>

      {/* Usage Instructions */}
      <motion.div
        initial={{
          opacity: 0,
          y: 20
        }}
        animate={{
          opacity: 1,
          y: 0
        }}
        transition={{
          delay: 0.4
        }}
        className="bg-nexus-surface border border-nexus-border rounded-2xl overflow-hidden">
        
        <div className="px-6 py-5 border-b border-nexus-border bg-nexus-surface-alt/30 flex items-center gap-3">
          <TerminalIcon className="w-5 h-5 text-nexus-primary" />
          <h2 className="text-lg font-bold text-nexus-text">
            系统使用说明 (Operation Manual)
          </h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <InstructionCard
            step="01"
            title="部署数字员工"
            desc="在「数字员工」模块，使用内置的快速口令或自然语言，一键生成自动化执行脚本。适用于竞品分析、营销素材抓取等高频电商场景。" />
          
          <InstructionCard
            step="02"
            title="接入数字工厂"
            desc="升级至 PRO 节点后，可在「数字工厂」调用第三方高级 API 工具，实现更复杂的业务流转与数据处理。" />
          
          <InstructionCard
            step="03"
            title="管理资产库"
            desc="所有数字员工执行完毕后生成的日志报告、数据表格、分析产物，均会自动归档至「资产库」，随时可供下载与查阅。" />
          
          <InstructionCard
            step="04"
            title="追溯执行历史"
            desc="在「历史」面板中，您可以查看所有的会话记录、指令下发历史以及任务执行状态，确保每一次操作都有迹可循。" />
          
        </div>
      </motion.div>
    </div>);

}
function MetricCard({ title, value, icon, delay }: any) {
  return (
    <motion.div
      initial={{
        opacity: 0,
        y: 20
      }}
      animate={{
        opacity: 1,
        y: 0
      }}
      transition={{
        delay
      }}
      className="bg-nexus-surface border border-nexus-border p-6 rounded-2xl flex items-center gap-4 hover:border-nexus-primary/50 hover:shadow-cyber-glow transition-all group">
      
      <div className="w-12 h-12 rounded-xl bg-nexus-bg border border-nexus-border flex items-center justify-center group-hover:border-nexus-primary/50 transition-colors">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-medium text-nexus-muted">{title}</h3>
        <p className="text-2xl font-bold text-nexus-text mt-1">{value}</p>
      </div>
    </motion.div>);

}
function InstructionCard({ step, title, desc }: any) {
  return (
    <div className="p-5 rounded-xl bg-nexus-bg border border-nexus-border hover:border-nexus-secondary/50 transition-colors relative overflow-hidden group">
      <div className="absolute -right-4 -top-4 text-6xl font-black text-nexus-surface-alt/50 group-hover:text-nexus-primary/10 transition-colors pointer-events-none">
        {step}
      </div>
      <h3 className="text-lg font-bold text-nexus-text mb-2 flex items-center gap-2 relative z-10">
        <span className="text-nexus-primary">[{step}]</span> {title}
      </h3>
      <p className="text-sm text-nexus-muted leading-relaxed relative z-10">
        {desc}
      </p>
    </div>);

}
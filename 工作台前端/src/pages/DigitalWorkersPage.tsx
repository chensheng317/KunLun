import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  SearchIcon,
  TrendingUpIcon,
  VideoIcon,
  MessageCircleIcon,
  StoreIcon,
  Share2Icon,
  TerminalIcon,
  SendIcon,
  CpuIcon } from
'lucide-react';
const presetSkills = [
{
  id: 1,
  title: '爆款竞品分析',
  icon: SearchIcon,
  desc: '深度拆解竞品爆款逻辑，生成多维分析报告。'
},
{
  id: 2,
  title: '营销素材嗅探',
  icon: TrendingUpIcon,
  desc: '全网抓取高转化营销素材，智能分类打标。'
},
{
  id: 3,
  title: '短视频数据复盘',
  icon: VideoIcon,
  desc: '提取短视频核心数据指标，生成优化建议。'
},
{
  id: 4,
  title: '私域微信回复',
  icon: MessageCircleIcon,
  desc: '根据客户画像与历史语境，生成高情商回复。'
},
{
  id: 5,
  title: '店铺经营体检',
  icon: StoreIcon,
  desc: '全方位扫描店铺健康度，输出风险预警报告。'
},
{
  id: 6,
  title: '平台内容发布',
  icon: Share2Icon,
  desc: '一键分发多平台图文/视频内容，智能排版。'
}];

export function DigitalWorkersPage() {
  const [command, setCommand] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const handleExecute = () => {
    if (!command.trim()) return;
    setIsExecuting(true);
    // Simulate execution
    setTimeout(() => setIsExecuting(false), 2000);
  };
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text flex items-center gap-3">
            <CpuIcon className="w-6 h-6 text-nexus-primary" />
            数字员工{' '}
            <span className="text-xs px-2 py-0.5 rounded bg-nexus-secondary/20 text-nexus-secondary border border-nexus-secondary/30">
              FREE
            </span>
          </h1>
          <p className="text-nexus-muted mt-1">
            AutoGLM 核心驱动，您的全天候智能业务助理。
          </p>
        </div>
      </div>

      {/* Preset Skills Grid */}
      <div>
        <h2 className="text-sm font-semibold text-nexus-muted uppercase tracking-wider mb-4 flex items-center gap-2">
          <TerminalIcon className="w-4 h-4" /> 内置快速口令 (Skills)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {presetSkills.map((skill, index) => {
            const Icon = skill.icon;
            return (
              <motion.button
                key={skill.id}
                initial={{
                  opacity: 0,
                  y: 20
                }}
                animate={{
                  opacity: 1,
                  y: 0
                }}
                transition={{
                  delay: index * 0.1
                }}
                onClick={() => setCommand(skill.title)}
                className="text-left p-5 rounded-xl bg-nexus-surface border border-nexus-border hover:border-nexus-primary hover:shadow-cyber-glow transition-all group">
                
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-nexus-bg border border-nexus-border flex items-center justify-center group-hover:border-nexus-primary/50 group-hover:text-nexus-primary transition-colors">
                    <Icon className="w-5 h-5 text-nexus-muted group-hover:text-nexus-primary" />
                  </div>
                  <h3 className="font-bold text-nexus-text group-hover:text-nexus-primary transition-colors">
                    {skill.title}
                  </h3>
                </div>
                <p className="text-xs text-nexus-muted leading-relaxed">
                  {skill.desc}
                </p>
              </motion.button>);

          })}
        </div>
      </div>

      {/* Custom Command Input Area */}
      <div className="flex-1 flex flex-col justify-end mt-8">
        <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-6 relative overflow-hidden focus-within:border-nexus-primary focus-within:shadow-cyber-glow transition-all duration-300">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-nexus-primary animate-pulse-glow"></div>
            <span className="text-xs font-bold text-nexus-primary uppercase tracking-widest">
              Awaiting Command Input...
            </span>
          </div>

          <div className="flex gap-4">
            <div className="flex-1 relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-nexus-primary font-mono text-lg">
                {'>'}
              </span>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="输入自然语言指令，例如：帮我分析一下最近一周抖音美妆类目的爆款视频数据..."
                className="w-full bg-nexus-bg border border-nexus-border rounded-xl py-4 pl-10 pr-4 text-nexus-text placeholder-nexus-muted focus:outline-none focus:border-nexus-primary/50 font-mono text-sm transition-colors"
                onKeyDown={(e) => e.key === 'Enter' && handleExecute()} />
              
            </div>
            <button
              onClick={handleExecute}
              disabled={!command.trim() || isExecuting}
              className={`px-6 rounded-xl font-bold flex items-center gap-2 transition-all ${command.trim() && !isExecuting ? 'bg-nexus-primary text-nexus-bg hover:bg-nexus-primary/90 shadow-cyber-glow' : 'bg-nexus-bg border border-nexus-border text-nexus-muted cursor-not-allowed'}`}>
              
              {isExecuting ?
              <>
                  <div className="w-4 h-4 border-2 border-nexus-bg border-t-transparent rounded-full animate-spin"></div>
                  执行中
                </> :

              <>
                  <SendIcon className="w-4 h-4" />
                  下发指令
                </>
              }
            </button>
          </div>

          <p className="text-[10px] text-nexus-muted mt-4 font-mono">
            * 指令将自动转换为提示词，套用固定 Python
            模板生成临时脚本并在后台执行。执行完毕后，产物将保存至「资产库」。
          </p>
        </div>
      </div>
    </div>);

}
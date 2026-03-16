import React from 'react';
import { motion } from 'framer-motion';
import {
  WrenchIcon,
  LockIcon,
  GlobeIcon,
  DatabaseIcon,
  CloudIcon,
  CpuIcon } from
'lucide-react';
const thirdPartyTools = [
{
  id: 1,
  name: '电商数据罗盘 API',
  provider: 'DataTech Inc.',
  icon: DatabaseIcon,
  status: 'locked'
},
{
  id: 2,
  name: '全域营销自动化',
  provider: 'MarketFlow',
  icon: GlobeIcon,
  status: 'locked'
},
{
  id: 3,
  name: '智能客服中枢',
  provider: 'AIChat Pro',
  icon: MessageCircleIcon,
  status: 'locked'
},
{
  id: 4,
  name: '云端渲染引擎',
  provider: 'CloudRender',
  icon: CloudIcon,
  status: 'locked'
},
{
  id: 5,
  name: '深度学习训练集群',
  provider: 'NeuralNet',
  icon: CpuIcon,
  status: 'locked'
},
{
  id: 6,
  name: '跨平台库存同步',
  provider: 'SyncMaster',
  icon: WrenchIcon,
  status: 'locked'
}];

function MessageCircleIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>);

}
export function DigitalFactoryPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text flex items-center gap-3">
            <WrenchIcon className="w-6 h-6 text-amber-400" />
            数字工厂{' '}
            <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              PRO
            </span>
          </h1>
          <p className="text-nexus-muted mt-1">
            接入第三方高级 API，解锁企业级自动化生产力。
          </p>
        </div>
        <button className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all flex items-center gap-2">
          <LockIcon className="w-4 h-4" />
          解锁专业版
        </button>
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {thirdPartyTools.map((tool, index) => {
          const Icon = tool.icon;
          return (
            <motion.div
              key={tool.id}
              initial={{
                opacity: 0,
                scale: 0.95
              }}
              animate={{
                opacity: 1,
                scale: 1
              }}
              transition={{
                delay: index * 0.1
              }}
              className="bg-nexus-surface border border-nexus-border rounded-2xl p-6 relative overflow-hidden group">
              
              <div className="absolute inset-0 bg-nexus-bg/50 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <LockIcon className="w-8 h-8 text-amber-400 mb-2" />
                <span className="text-sm font-bold text-amber-400">
                  需升级 PRO 节点
                </span>
              </div>

              <div className="flex items-start justify-between mb-4 relative z-0">
                <div className="w-12 h-12 rounded-xl bg-nexus-bg border border-nexus-border flex items-center justify-center">
                  <Icon className="w-6 h-6 text-nexus-muted" />
                </div>
                <span className="text-[10px] px-2 py-1 rounded bg-nexus-bg border border-nexus-border text-nexus-muted font-mono uppercase">
                  API Integration
                </span>
              </div>

              <div className="relative z-0">
                <h3 className="font-bold text-nexus-text text-lg">
                  {tool.name}
                </h3>
                <p className="text-sm text-nexus-muted mt-1">
                  Provider: {tool.provider}
                </p>
              </div>
            </motion.div>);

        })}
      </div>
    </div>);

}
import { motion } from 'framer-motion';
import {
  Wrench,
  Lock,
  Globe,
  Database,
  Cloud,
  Cpu,
  MessageCircle,
} from 'lucide-react';

/**
 * 数字工厂页 — PRO 版第三方 API 集成面板
 * NOTE: 所有工具默认锁定状态，悬浮时显示"需升级 PRO 节点"遮罩
 */

const thirdPartyTools = [
  { id: 1, name: '电商数据罗盘 API', provider: 'DataTech Inc.', icon: Database },
  { id: 2, name: '全域营销自动化', provider: 'MarketFlow', icon: Globe },
  { id: 3, name: '智能客服中枢', provider: 'AIChat Pro', icon: MessageCircle },
  { id: 4, name: '云端渲染引擎', provider: 'CloudRender', icon: Cloud },
  { id: 5, name: '深度学习训练集群', provider: 'NeuralNet', icon: Cpu },
  { id: 6, name: '跨平台库存同步', provider: 'SyncMaster', icon: Wrench },
];

export default function DigitalFactoryPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-nexus-text flex items-center gap-3">
            <Wrench size={22} className="text-amber-400" />
            数字工厂{' '}
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold">
              PRO
            </span>
          </h1>
          <p className="text-sm text-nexus-muted mt-1.5">
            接入第三方高级 API，解锁企业级自动化生产力。
          </p>
        </div>
        <button className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white px-5 py-2.5 rounded-lg text-xs font-bold shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all duration-300 flex items-center gap-2">
          <Lock size={14} />
          解锁专业版
        </button>
      </div>

      {/* 工具网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {thirdPartyTools.map((tool, index) => {
          const Icon = tool.icon;
          return (
            <motion.div
              key={tool.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.08 }}
              className="bg-nexus-surface border border-nexus-border rounded-2xl p-6 relative overflow-hidden group"
            >
              {/* 锁定遮罩 */}
              <div className="absolute inset-0 bg-nexus-bg/50 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <Lock size={28} className="text-amber-400 mb-2" />
                <span className="text-xs font-bold text-amber-400">
                  需升级 PRO 节点
                </span>
              </div>

              <div className="flex items-start justify-between mb-4 relative z-0">
                <div className="w-11 h-11 rounded-xl bg-nexus-bg border border-nexus-border flex items-center justify-center">
                  <Icon size={20} className="text-nexus-muted" />
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-nexus-bg border border-nexus-border text-nexus-muted font-mono uppercase">
                  API Integration
                </span>
              </div>

              <div className="relative z-0">
                <h3 className="font-bold text-nexus-text text-sm">{tool.name}</h3>
                <p className="text-xs text-nexus-muted mt-1">
                  Provider: {tool.provider}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

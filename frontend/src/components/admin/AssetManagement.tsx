import { motion } from 'framer-motion';
import { FolderOpen, Construction } from 'lucide-react';

/**
 * 管理后台 — 资产管理占位页面
 * NOTE: 后续实现完整的资产管理功能
 */
export default function AssetManagement() {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4"
      >
        <div className="w-16 h-16 rounded-2xl bg-nexus-surface border border-nexus-border mx-auto flex items-center justify-center">
          <FolderOpen size={28} className="text-amber-400" />
        </div>
        <h2 className="text-lg font-bold text-nexus-text">资产管理</h2>
        <p className="text-sm text-nexus-muted max-w-md">
          查看和管理平台中所有用户上传/生成的资产文件与平台预设素材库。
        </p>
        <div className="inline-flex items-center gap-2 text-xs text-amber-400/70 bg-amber-500/10 px-4 py-2 rounded-xl border border-amber-500/20">
          <Construction size={14} />
          功能开发中，敬请期待
        </div>
      </motion.div>
    </div>
  );
}

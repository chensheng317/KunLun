import React from 'react';
import { motion } from 'framer-motion';
import {
  ChevronRightIcon,
  HelpCircleIcon,
  BellIcon,
  MessageSquareIcon,
  ZapIcon } from
'lucide-react';
export interface TopBarProps {
  activeTabLabel: string;
}
export function TopBar({ activeTabLabel }: TopBarProps) {
  return (
    <header className="fixed top-0 left-64 right-0 h-16 bg-nexus-surface/90 backdrop-blur-md border-b border-nexus-border z-10 flex items-center justify-between px-6">
      {/* Breadcrumb */}
      <div className="flex items-center text-sm">
        <span className="text-nexus-muted hover:text-nexus-text cursor-pointer transition-colors font-medium tracking-wide">
          昆仑工坊
        </span>
        <ChevronRightIcon className="w-4 h-4 mx-2 text-nexus-border" />
        <span className="text-nexus-primary font-semibold drop-shadow-[0_0_8px_rgba(62,237,231,0.3)]">
          {activeTabLabel}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        {/* Credits Display */}
        <div className="hidden md:flex items-center gap-2 bg-nexus-surface-alt border border-nexus-primary/30 px-3 py-1.5 rounded-lg text-sm font-medium text-nexus-primary shadow-[inset_0_0_10px_rgba(62,237,231,0.1)]">
          <ZapIcon className="w-4 h-4 text-nexus-primary fill-nexus-primary/20" />
          <span className="tracking-wider">2,580 算力</span>
        </div>

        {/* Icon Buttons */}
        <div className="flex items-center gap-2">
          <button className="w-9 h-9 rounded-lg flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface-alt border border-transparent hover:border-nexus-primary/30 transition-all group relative">
            <HelpCircleIcon className="w-5 h-5" />
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-nexus-bg border border-nexus-border text-nexus-text text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              帮助文档
            </span>
          </button>

          <button className="relative w-9 h-9 rounded-lg flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface-alt border border-transparent hover:border-nexus-primary/30 transition-all group">
            <BellIcon className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-nexus-primary rounded-full shadow-[0_0_5px_rgba(62,237,231,0.8)]"></span>
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-nexus-bg border border-nexus-border text-nexus-text text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              系统公告
            </span>
          </button>

          <button className="w-9 h-9 rounded-lg flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface-alt border border-transparent hover:border-nexus-primary/30 transition-all group relative">
            <MessageSquareIcon className="w-5 h-5" />
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-nexus-bg border border-nexus-border text-nexus-text text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              联系客服
            </span>
          </button>
        </div>

        <div className="w-px h-6 bg-nexus-border mx-1"></div>

        {/* Upgrade Button */}
        <motion.button
          whileHover={{
            scale: 1.02
          }}
          whileTap={{
            scale: 0.98
          }}
          className="flex items-center gap-2 bg-nexus-bg border border-nexus-primary text-nexus-primary px-4 py-2 rounded-lg text-sm font-bold shadow-cyber-glow hover:shadow-cyber-glow-strong hover:bg-nexus-primary/10 transition-all uppercase tracking-wider">
          
          <ZapIcon className="w-4 h-4" />
          <span>升级节点</span>
        </motion.button>
      </div>
    </header>);

}
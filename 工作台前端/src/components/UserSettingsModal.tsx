import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XIcon,
  UserIcon,
  ShieldIcon,
  PaletteIcon,
  LogOutIcon } from
'lucide-react';
interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}
export function UserSettingsModal({ isOpen, onClose }: UserSettingsModalProps) {
  return (
    <AnimatePresence>
      {isOpen &&
      <>
          <motion.div
          initial={{
            opacity: 0
          }}
          animate={{
            opacity: 1
          }}
          exit={{
            opacity: 0
          }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        
          <motion.div
          initial={{
            opacity: 0,
            scale: 0.95,
            y: 20
          }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0
          }}
          exit={{
            opacity: 0,
            scale: 0.95,
            y: 20
          }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-nexus-surface border border-nexus-border rounded-2xl shadow-2xl z-50 overflow-hidden">
          
            {/* Header */}
            <div className="px-6 py-4 border-b border-nexus-border flex items-center justify-between bg-nexus-surface-alt/50">
              <h2 className="text-lg font-bold text-nexus-text flex items-center gap-2">
                <UserIcon className="w-5 h-5 text-nexus-primary" />
                用户控制面板
              </h2>
              <button
              onClick={onClose}
              className="text-nexus-muted hover:text-nexus-primary transition-colors p-1 rounded-md hover:bg-nexus-bg">
              
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Profile Info */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <img
                  src="https://i.pravatar.cc/150?img=11"
                  alt="User Avatar"
                  className="w-16 h-16 rounded-xl border-2 border-nexus-primary shadow-cyber-glow" />
                
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-nexus-primary rounded-full border-2 border-nexus-surface animate-pulse-glow"></div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-nexus-text">张三</h3>
                  <p className="text-sm text-nexus-secondary mt-1">
                    系统管理员 · 昆仑工坊节点
                  </p>
                </div>
              </div>

              <div className="h-px bg-nexus-border w-full"></div>

              {/* Settings Options */}
              <div className="space-y-2">
                <button className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-nexus-bg border border-transparent hover:border-nexus-border transition-all group">
                  <div className="flex items-center gap-3 text-nexus-text group-hover:text-nexus-primary">
                    <ShieldIcon className="w-5 h-5" />
                    <span className="font-medium">账户安全与授权</span>
                  </div>
                  <ChevronRightIcon className="w-4 h-4 text-nexus-muted group-hover:text-nexus-primary" />
                </button>

                <button className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-nexus-bg border border-transparent hover:border-nexus-border transition-all group">
                  <div className="flex items-center gap-3 text-nexus-text group-hover:text-nexus-primary">
                    <PaletteIcon className="w-5 h-5" />
                    <span className="font-medium">界面与主题设置</span>
                  </div>
                  <ChevronRightIcon className="w-4 h-4 text-nexus-muted group-hover:text-nexus-primary" />
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-nexus-border bg-nexus-bg flex justify-end">
              <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-400/10 border border-transparent hover:border-rose-400/30 transition-all">
              
                <LogOutIcon className="w-4 h-4" />
                断开连接 (退出登录)
              </button>
            </div>
          </motion.div>
        </>
      }
    </AnimatePresence>);

}
function ChevronRightIcon(props: any) {
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
      
      <path d="m9 18 6-6-6-6" />
    </svg>);

}
import React from 'react';
import { motion } from 'framer-motion';
import {
  HomeIcon,
  CpuIcon,
  WrenchIcon,
  DatabaseIcon,
  ClockIcon,
  HexagonIcon,
  SettingsIcon } from
'lucide-react';
export interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onUserClick: () => void;
}
const navItems = [
{
  id: 'home',
  label: '首页',
  icon: HomeIcon
},
{
  id: 'workers',
  label: '数字员工',
  icon: CpuIcon,
  badge: 'FREE'
},
{
  id: 'factory',
  label: '数字工厂',
  icon: WrenchIcon,
  badge: 'PRO'
},
{
  id: 'assets',
  label: '资产库',
  icon: DatabaseIcon
},
{
  id: 'history',
  label: '历史',
  icon: ClockIcon
}];

export function Sidebar({
  activeTab,
  setActiveTab,
  onUserClick
}: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-nexus-bg border-r border-nexus-border flex flex-col z-20">
      {/* Logo Area */}
      <div className="h-16 flex items-center px-6 border-b border-nexus-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-nexus-surface-alt flex items-center justify-center border border-nexus-primary/30 shadow-cyber-glow">
            <HexagonIcon className="w-5 h-5 text-nexus-primary" />
          </div>
          <span className="text-xl font-bold tracking-wide text-nexus-text">
            昆仑工坊
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-2">
        <div className="px-3 mb-4 text-xs font-semibold text-nexus-muted uppercase tracking-wider">
          核心中枢
        </div>
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative w-full flex items-center justify-between px-3 py-3 rounded-lg transition-all duration-200 text-sm font-medium ${isActive ? 'text-nexus-primary bg-nexus-surface border border-nexus-primary/20 shadow-[inset_0_0_15px_rgba(62,237,231,0.1)]' : 'text-nexus-muted hover:text-nexus-text hover:bg-nexus-surface/50 border border-transparent'}`}>
              
              {isActive &&
              <motion.div
                layoutId="active-sidebar-indicator"
                className="absolute left-0 top-0 bottom-0 w-1 bg-nexus-primary rounded-l-lg shadow-[0_0_10px_rgba(62,237,231,0.8)]"
                initial={false}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 30
                }} />

              }
              <div className="flex items-center gap-3 relative z-10">
                <Icon
                  className={`w-5 h-5 ${isActive ? 'text-nexus-primary drop-shadow-[0_0_5px_rgba(62,237,231,0.5)]' : ''}`} />
                
                <span>{item.label}</span>
              </div>

              {item.badge &&
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-bold relative z-10 ${item.badge === 'FREE' ? 'bg-nexus-secondary/20 text-nexus-secondary border border-nexus-secondary/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                
                  {item.badge}
                </span>
              }
            </button>);

        })}
      </nav>

      {/* Bottom User Section */}
      <div className="p-4 border-t border-nexus-border">
        <button
          onClick={onUserClick}
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-nexus-surface border border-nexus-border hover:border-nexus-primary/50 hover:shadow-cyber-glow transition-all group">
          
          <div className="relative">
            <img
              src="https://i.pravatar.cc/150?img=11"
              alt="User Avatar"
              className="w-10 h-10 rounded-lg border border-nexus-border group-hover:border-nexus-primary transition-colors" />
            
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-nexus-primary rounded-full border-2 border-nexus-surface animate-pulse-glow"></div>
          </div>
          <div className="flex flex-col text-left flex-1">
            <span className="text-sm font-medium text-nexus-text group-hover:text-nexus-primary transition-colors">
              张三
            </span>
            <span className="text-xs text-nexus-muted">系统管理员</span>
          </div>
          <SettingsIcon className="w-4 h-4 text-nexus-muted group-hover:text-nexus-primary transition-colors" />
        </button>
      </div>
    </aside>);

}
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  HelpCircle,
  Bell,
  MessageSquare,
  Zap,
  Coins,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

/**
 * 工作台顶栏组件
 * NOTE: 积分按钮下拉 / 帮助→外部链接 / 通知→公告弹窗 / 客服→微信二维码
 */

interface TopBarProps {
  activeTabLabel: string;
  sidebarCollapsed: boolean;
  /** 由父组件控制是否切换到积分记录 tab */
  onNavigateToCredits?: () => void;
}

export default function WorkbenchTopBar({
  activeTabLabel,
  sidebarCollapsed,
  onNavigateToCredits,
}: TopBarProps) {
  const navigate = useNavigate();

  // 积分下拉菜单
  const [showCreditsMenu, setShowCreditsMenu] = useState(false);
  const creditsRef = useRef<HTMLDivElement>(null);

  // 公告弹窗
  const [showAnnouncement, setShowAnnouncement] = useState(false);

  // 客服二维码下浮
  const [showCustomerService, setShowCustomerService] = useState(false);
  const csRef = useRef<HTMLDivElement>(null);

  /** 全局点击关闭下拉菜单 */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (creditsRef.current && !creditsRef.current.contains(e.target as Node)) {
        setShowCreditsMenu(false);
      }
      if (csRef.current && !csRef.current.contains(e.target as Node)) {
        setShowCustomerService(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, []);

  return (
    <>
      <header
        className={`fixed top-0 right-0 h-16 bg-nexus-surface/90 backdrop-blur-xl border-b border-nexus-border z-10 flex items-center justify-between px-6 transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? 'left-[72px]' : 'left-64'
        }`}
      >
        {/* 面包屑 */}
        <div className="flex items-center text-sm">
          <Link
            to="/"
            className="text-nexus-muted hover:text-nexus-text transition-colors font-medium tracking-wide"
          >
            昆仑工坊
          </Link>
          <ChevronRight size={14} className="mx-2 text-nexus-border" />
          <span className="text-nexus-primary font-semibold drop-shadow-[0_0_8px_rgba(62,237,231,0.3)]">
            {activeTabLabel}
          </span>
        </div>

        {/* 右侧操作区 */}
        <div className="flex items-center gap-3">
          {/* ======= 积分余额（可点击下拉） ======= */}
          <div className="relative" ref={creditsRef}>
            <button
              onClick={() => setShowCreditsMenu((v) => !v)}
              className="hidden md:flex items-center gap-2 bg-nexus-surface-alt border border-nexus-primary/30 px-3 py-1.5 rounded-lg text-sm font-medium text-nexus-primary shadow-[inset_0_0_10px_rgba(62,237,231,0.08)] hover:bg-nexus-primary/10 hover:border-nexus-primary/60 transition-all cursor-pointer"
            >
              <Zap
                size={14}
                className="text-nexus-primary fill-nexus-primary/20"
              />
              <span className="tracking-wider font-mono text-xs">
                2,580 积分
              </span>
            </button>

            {/* 积分下拉菜单 */}
            <AnimatePresence>
              {showCreditsMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full right-0 mt-2 w-full bg-nexus-surface border border-nexus-border rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-50"
                >
                  <button
                    onClick={() => {
                      setShowCreditsMenu(false);
                      onNavigateToCredits?.();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-3 text-sm text-nexus-text hover:bg-nexus-primary/10 hover:text-nexus-primary transition-colors"
                  >
                    <Coins size={14} />
                    积分用量
                  </button>
                  <div className="h-px bg-nexus-border mx-2" />
                  <button
                    onClick={() => {
                      setShowCreditsMenu(false);
                      navigate('/pricing');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-3 text-sm text-nexus-text hover:bg-nexus-primary/10 hover:text-nexus-primary transition-colors"
                  >
                    <Zap size={14} />
                    升级方案
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 工具按钮组 */}
          <div className="flex items-center gap-1.5">
            {/* 帮助文档 → 外部链接 */}
            <a
              href="https://docs.kunlun.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="relative w-8 h-8 rounded-lg flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface-alt border border-transparent hover:border-nexus-primary/30 transition-all group"
            >
              <HelpCircle size={18} />
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-nexus-bg border border-nexus-border text-nexus-text text-[11px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                帮助文档
              </span>
            </a>

            {/* 通知 → 公告弹窗 */}
            <button
              onClick={() => setShowAnnouncement(true)}
              className="relative w-8 h-8 rounded-lg flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface-alt border border-transparent hover:border-nexus-primary/30 transition-all group"
            >
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-nexus-primary rounded-full shadow-[0_0_5px_rgba(62,237,231,0.8)]" />
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-nexus-bg border border-nexus-border text-nexus-text text-[11px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                系统公告
              </span>
            </button>

            {/* 联系客服 → 微信二维码下浮 */}
            <div className="relative" ref={csRef}>
              <button
                onClick={() => setShowCustomerService((v) => !v)}
                className="relative w-8 h-8 rounded-lg flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface-alt border border-transparent hover:border-nexus-primary/30 transition-all group"
              >
                <MessageSquare size={18} />
                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-nexus-bg border border-nexus-border text-nexus-text text-[11px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                  联系客服
                </span>
              </button>

              {/* 客服二维码下浮 */}
              <AnimatePresence>
                {showCustomerService && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full right-0 mt-2 w-56 bg-nexus-surface border border-nexus-border rounded-xl shadow-2xl shadow-black/40 p-5 z-50"
                  >
                    <p className="text-xs font-bold text-nexus-text text-center mb-3">
                      微信扫码联系客服
                    </p>
                    <div className="bg-white rounded-lg p-2 flex items-center justify-center">
                      <img
                        src="/kefu.jpg"
                        alt="客服微信二维码"
                        className="w-full h-auto rounded"
                      />
                    </div>
                    <p className="text-[10px] text-nexus-muted text-center mt-2.5">
                      工作日 9:00 – 18:00 在线
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="w-px h-6 bg-nexus-border mx-1" />

          {/* 升级方案按钮 */}
          <Link to="/pricing">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 bg-nexus-bg border border-nexus-primary text-nexus-primary px-4 py-2 rounded-lg text-xs font-bold shadow-cyber-glow hover:shadow-cyber-glow-hover hover:bg-nexus-primary/10 transition-all uppercase tracking-wider"
            >
              <Zap size={14} />
              <span>升级方案</span>
            </motion.button>
          </Link>
        </div>
      </header>

      {/* ======= 公告弹窗 — 覆盖全屏居中 ======= */}
      <AnimatePresence>
        {showAnnouncement && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowAnnouncement(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-nexus-surface border border-nexus-border rounded-2xl max-w-lg w-full shadow-2xl shadow-black/50 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 弹窗头 */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-nexus-border bg-nexus-surface-alt/30">
                <div className="flex items-center gap-2.5">
                  <Bell size={18} className="text-nexus-primary" />
                  <h3 className="text-sm font-bold text-nexus-text">
                    系统公告
                  </h3>
                </div>
                <button
                  onClick={() => setShowAnnouncement(false)}
                  className="p-1.5 rounded-lg text-nexus-muted hover:text-nexus-text hover:bg-nexus-bg transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 弹窗内容 */}
              <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
                {/* 版本更新 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-nexus-primary/20 text-nexus-primary font-bold border border-nexus-primary/30">
                      v2.6.0
                    </span>
                    <span className="text-[11px] text-nexus-muted font-mono">
                      2026-03-16
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-nexus-text">
                    🚀 KunLun 昆仑工坊 v2.6.0 版本更新
                  </h4>

                  <ul className="space-y-2 text-xs text-nexus-muted leading-relaxed">
                    <li className="flex items-start gap-2">
                      <span className="text-nexus-primary mt-0.5">•</span>
                      <span>
                        <span className="text-nexus-text font-medium">
                          数字员工设备矩阵
                        </span>{' '}
                        — 新增 20 台手机设备卡片管理面板，支持一键连接状态检测、自定义代号和右键快捷操作
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-nexus-primary mt-0.5">•</span>
                      <span>
                        <span className="text-nexus-text font-medium">
                          用户认证系统
                        </span>{' '}
                        — 上线登录 / 注册页面，支持 localStorage 前端模拟认证和路由守卫
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-nexus-primary mt-0.5">•</span>
                      <span>
                        <span className="text-nexus-text font-medium">
                          资产库增强
                        </span>{' '}
                        — 新增完整分页控件（首页 / 尾页 / 省略号），测试数据扩充至 50+ 条
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-nexus-primary mt-0.5">•</span>
                      <span>
                        <span className="text-nexus-text font-medium">
                          素材库扩展
                        </span>{' '}
                        — 平台预设新增「虚拟IP形象库」
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-nexus-primary mt-0.5">•</span>
                      <span>
                        <span className="text-nexus-text font-medium">
                          顶栏交互升级
                        </span>{' '}
                        — 积分余额可点击展开菜单，通知弹窗、客服二维码、帮助文档快捷入口
                      </span>
                    </li>
                  </ul>
                </div>

                {/* 旧版本 */}
                <div className="pt-3 border-t border-nexus-border space-y-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-nexus-border text-nexus-muted font-bold">
                      v2.5.0
                    </span>
                    <span className="text-[11px] text-nexus-muted font-mono">
                      2026-03-09
                    </span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-nexus-muted leading-relaxed">
                    <li className="flex items-start gap-2">
                      <span className="text-nexus-muted mt-0.5">•</span>
                      工作台首页上线，含情报局、数字员工、数字工厂模块
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-nexus-muted mt-0.5">•</span>
                      资产库与素材库基础功能、用户设置弹窗
                    </li>
                  </ul>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

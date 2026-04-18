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
  Settings,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

/**
 * 工作台顶栏组件
 * NOTE: 积分按钮下拉 / 帮助→外部链接 / 通知→公告弹窗 / 客服→微信二维码
 * NOTE: 公告内容动态读取 localStorage(kunlun_announcements)，与管理后台公告管理同步
 *       红点通过对比最新已发布公告版本号与已读版本号来判断
 */

const LS_KEY_READ_ANNOUNCEMENT = 'kunlun_read_announcement_version';
const LS_KEY_ANNOUNCEMENTS = 'kunlun_announcements';

/** 公告数据结构（与 AnnouncementManagement 保持一致） */
interface AnnouncementItem {
  id: string;
  version: string;
  title: string;
  items: string[];
  publishedAt: string;
  isActive: boolean;
}

/** 从 localStorage 读取已发布的公告列表 */
function getActiveAnnouncements(): AnnouncementItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY_ANNOUNCEMENTS);
    if (!raw) return [];
    const all: AnnouncementItem[] = JSON.parse(raw);
    return all.filter((a) => a.isActive).sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
  } catch {
    return [];
  }
}

/** 获取最新已发布公告的版本号（用于红点判断） */
function getLatestAnnouncementVersion(): string {
  const active = getActiveAnnouncements();
  return active.length > 0 ? active[0].version : '';
}

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
  const { isAdmin, credits } = useAuth();

  // 积分下拉菜单
  const [showCreditsMenu, setShowCreditsMenu] = useState(false);
  const creditsRef = useRef<HTMLDivElement>(null);

  // 公告弹窗
  const [showAnnouncement, setShowAnnouncement] = useState(false);

  // 公告红点：对比最新已发布公告版本与已读版本
  const [hasUnread, setHasUnread] = useState(() => {
    const readVersion = localStorage.getItem(LS_KEY_READ_ANNOUNCEMENT);
    const latestVersion = getLatestAnnouncementVersion();
    return latestVersion !== '' && readVersion !== latestVersion;
  });

  // 客服二维码下浮
  const [showCustomerService, setShowCustomerService] = useState(false);
  const csRef = useRef<HTMLDivElement>(null);

  /**
   * 点击铃铛时打开公告弹窗并标记已读
   * NOTE: 写入 localStorage 后即使刷新页面红点也不会再出现
   */
  const handleBellClick = () => {
    setShowAnnouncement(true);
    if (hasUnread) {
      const latestVersion = getLatestAnnouncementVersion();
      if (latestVersion) {
        localStorage.setItem(LS_KEY_READ_ANNOUNCEMENT, latestVersion);
      }
      setHasUnread(false);
    }
  };

  /** 全局点击关闭下拉菜单 */
  // NOTE: 使用 mousedown 实现点击外部立即关闭，菜单项自身用 stopPropagation 防止被吞
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
          {/* ======= 积分余额（仅用户可见，管理员隐藏） ======= */}
          {!isAdmin && (
          <div className="relative" ref={creditsRef}>
            <button
              onClick={() => setShowCreditsMenu((v) => !v)}
              className="cursor-target hidden md:flex items-center gap-2 bg-nexus-surface-alt border border-nexus-primary/30 px-3 py-1.5 rounded-lg text-sm font-medium text-nexus-primary shadow-[inset_0_0_10px_rgba(62,237,231,0.08)] hover:bg-nexus-primary/10 hover:border-nexus-primary/60 transition-all cursor-pointer min-w-[120px] justify-center"
            >
              <Zap
                size={14}
                className="text-nexus-primary fill-nexus-primary/20"
              />
              <span className="tracking-wider font-mono text-xs">
                {credits.toLocaleString()} 积分
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
                  className="absolute top-full right-0 mt-2 min-w-[140px] w-max bg-nexus-surface border border-nexus-border rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-50"
                >
                  <button
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setShowCreditsMenu(false);
                      onNavigateToCredits?.();
                    }}
                    className="cursor-target w-full flex items-center gap-2 px-4 py-3 text-sm text-nexus-text hover:bg-nexus-primary/10 hover:text-nexus-primary transition-colors whitespace-nowrap"
                  >
                    <Coins size={14} className="shrink-0" />
                    积分用量
                  </button>
                  <div className="h-px bg-nexus-border mx-2" />
                  <button
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setShowCreditsMenu(false);
                      navigate('/recharge');
                    }}
                    className="cursor-target w-full flex items-center gap-2 px-4 py-3 text-sm text-nexus-text hover:bg-nexus-primary/10 hover:text-nexus-primary transition-colors whitespace-nowrap"
                  >
                    <Zap size={14} className="text-amber-400 shrink-0" />
                    积分充值
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          )}

          {/* 工具按钮组 */}
          <div className="flex items-center gap-1.5">
            {/* 帮助文档 → 外部链接 */}
            <a
              href="https://docs.kunlun.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-target relative w-8 h-8 rounded-lg flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface-alt border border-transparent hover:border-nexus-primary/30 transition-all group"
            >
              <HelpCircle size={18} />
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-nexus-bg border border-nexus-border text-nexus-text text-[11px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                帮助文档
              </span>
            </a>

            {/* 通知 → 公告弹窗 */}
            <button
              onClick={handleBellClick}
              className="cursor-target relative w-8 h-8 rounded-lg flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface-alt border border-transparent hover:border-nexus-primary/30 transition-all group"
            >
              <Bell size={18} />
              {/* 红点：仅未读时显示，点击后消失，刷新也不会再出现 */}
              {hasUnread && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-nexus-primary rounded-full shadow-[0_0_5px_rgba(62,237,231,0.8)]" />
              )}
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-nexus-bg border border-nexus-border text-nexus-text text-[11px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                系统公告
              </span>
            </button>

            {/* 联系客服 → 微信二维码下浮 */}
            <div className="relative" ref={csRef}>
              <button
                onClick={() => setShowCustomerService((v) => !v)}
                className="cursor-target relative w-8 h-8 rounded-lg flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface-alt border border-transparent hover:border-nexus-primary/30 transition-all group"
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

          {/* NOTE: 管理员级别显示"管理后台"按钮，非管理员显示"升级方案" */}
          {isAdmin ? (
            <Link to="/admin">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="cursor-target flex items-center gap-2 bg-nexus-bg border border-amber-500 text-amber-400 px-4 py-2 rounded-lg text-xs font-bold shadow-[0_0_15px_rgba(245,158,11,0.2)] hover:shadow-[0_0_25px_rgba(245,158,11,0.3)] hover:bg-amber-500/10 transition-all uppercase tracking-wider"
              >
                <Settings size={14} />
                <span>管理后台</span>
              </motion.button>
            </Link>
          ) : (
            <Link to="/pricing">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="cursor-target flex items-center gap-2 bg-nexus-bg border border-nexus-primary text-nexus-primary px-4 py-2 rounded-lg text-xs font-bold shadow-cyber-glow hover:shadow-cyber-glow-hover hover:bg-nexus-primary/10 transition-all uppercase tracking-wider"
              >
                <Zap size={14} />
                <span>升级方案</span>
              </motion.button>
            </Link>
          )}
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

              {/* 弹窗内容 — 仅展示已发布公告（isActive=true），草稿不可见 */}
              <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
                {(() => {
                  const activeList = getActiveAnnouncements();

                  if (activeList.length === 0) {
                    return (
                      <p className="text-sm text-nexus-muted text-center py-8">
                        暂无公告
                      </p>
                    );
                  }

                  return activeList.map((a, idx) => (
                    <div key={a.id} className={idx > 0 ? 'pt-3 border-t border-nexus-border' : ''}>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-nexus-primary/20 text-nexus-primary font-bold border border-nexus-primary/30">
                            {a.version}
                          </span>
                          <span className="text-[11px] text-nexus-muted font-mono">
                            {a.publishedAt}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-nexus-text">{a.title}</h4>
                        <ul className="space-y-2 text-xs text-nexus-muted leading-relaxed">
                          {a.items.map((item, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-nexus-primary mt-0.5">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

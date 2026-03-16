import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ExternalLink,
  Smartphone,
  Wifi,
  WifiOff,
  RefreshCw,
  PenLine,
  Check,
  X,
  Loader2,
} from 'lucide-react';

/**
 * 手机设备数据模型
 * NOTE: 使用 localStorage 持久化设备配置（代号/别名）
 * 状态每次进入页面时模拟刷新（模拟 ADB 查询）
 */
interface PhoneDevice {
  /** 设备序列号（模拟 ADB serial） */
  serial: string;
  /** 用户自定义别名，默认 "X号手机" */
  alias: string;
  /** 连接状态 */
  connected: boolean;
  /** 设备序号 */
  index: number;
}

const DEVICES_KEY = 'kunlun_phone_devices';
const MAX_DEVICES = 20;

/** 从 localStorage 读取设备配置 */
function loadDeviceConfig(): PhoneDevice[] {
  try {
    const raw = localStorage.getItem(DEVICES_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* 忽略解析错误 */ }
  return getDefaultDevices();
}

/** 生成默认的 20 台设备配置 */
function getDefaultDevices(): PhoneDevice[] {
  return Array.from({ length: MAX_DEVICES }, (_, i) => ({
    serial: generateSerial(),
    alias: `${i + 1}号手机`,
    connected: false,
    index: i + 1,
  }));
}

/** 模拟生成 ADB 设备序列号（如 2312DRAABC） */
function generateSerial(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const year = String(new Date().getFullYear()).slice(2);
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  let suffix = '';
  for (let i = 0; i < 5; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${year}${month}${suffix}`;
}

/**
 * 模拟 ADB 设备状态查询
 * NOTE: 在真实场景中，这里应调用后端 API（后端执行 adb devices 并返回结果）
 * 当前模拟：每次进入页面时随机分配部分设备为"已连接"
 */
function simulateAdbQuery(devices: PhoneDevice[]): PhoneDevice[] {
  return devices.map((d) => ({
    ...d,
    // 模拟约 40% 的设备处于连接状态
    connected: Math.random() < 0.4,
  }));
}

/**
 * 工作台首页 — 情报局 + 数字员工设备矩阵
 * NOTE: 删除了旧的系统指标和操作说明，替换为手机设备卡片网格
 * 左键点击 → 跳转确认弹窗
 * 右键点击 → 上下文菜单（改名/刷新状态）
 */
export default function WorkbenchHome() {
  const [devices, setDevices] = useState<PhoneDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 跳转确认弹窗
  const [confirmDevice, setConfirmDevice] = useState<PhoneDevice | null>(null);

  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    device: PhoneDevice;
  } | null>(null);

  // 重命名状态
  const [renamingDevice, setRenamingDevice] = useState<PhoneDevice | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // 单个设备刷新加载态
  const [refreshingSerial, setRefreshingSerial] = useState<string | null>(null);

  /** 初始化：加载设备配置并模拟 ADB 查询 */
  useEffect(() => {
    const stored = loadDeviceConfig();
    const updated = simulateAdbQuery(stored);
    setDevices(updated);
    localStorage.setItem(DEVICES_KEY, JSON.stringify(updated));
    // 模拟查询延迟
    setTimeout(() => setIsLoading(false), 800);
  }, []);

  /** 全局点击关闭右键菜单 */
  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  /** 重命名时自动聚焦 */
  useEffect(() => {
    if (renamingDevice && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingDevice]);

  /** 保存设备配置到 localStorage */
  const persistDevices = useCallback((updated: PhoneDevice[]) => {
    setDevices(updated);
    localStorage.setItem(DEVICES_KEY, JSON.stringify(updated));
  }, []);

  /** 取消重命名（丢弃未确认的修改） */
  const cancelRename = useCallback(() => {
    setRenamingDevice(null);
    setRenameValue('');
  }, []);

  /** 右键菜单事件 — 同时取消未提交的重命名 */
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, device: PhoneDevice) => {
      e.preventDefault();
      e.stopPropagation();
      cancelRename();
      setContextMenu({ x: e.clientX, y: e.clientY, device });
    },
    [cancelRename]
  );

  /** 左键点击 — 取消重命名 + 弹出跳转确认弹窗 */
  const handleLeftClick = useCallback((device: PhoneDevice) => {
    cancelRename();
    setConfirmDevice(device);
  }, [cancelRename]);

  /** 确认跳转至数字员工 */
  const handleConfirmJump = useCallback(() => {
    if (!confirmDevice) return;
    // TODO: 跳转至数字员工指挥页面，传递设备信息
    // 当前先关闭弹窗
    setConfirmDevice(null);
  }, [confirmDevice]);

  /** 开始重命名 */
  const startRename = useCallback((device: PhoneDevice) => {
    setRenamingDevice(device);
    setRenameValue(device.alias);
    setContextMenu(null);
  }, []);

  /** 提交重命名 */
  const submitRename = useCallback(() => {
    if (!renamingDevice || !renameValue.trim()) return;
    const updated = devices.map((d) =>
      d.serial === renamingDevice.serial
        ? { ...d, alias: renameValue.trim() }
        : d
    );
    persistDevices(updated);
    setRenamingDevice(null);
  }, [renamingDevice, renameValue, devices, persistDevices]);

  /** 刷新单台设备状态 */
  const refreshSingleDevice = useCallback(
    (device: PhoneDevice) => {
      setContextMenu(null);
      setRefreshingSerial(device.serial);
      // 模拟单设备 ADB 查询延迟
      setTimeout(() => {
        const newConnected = Math.random() < 0.5;
        const updated = devices.map((d) =>
          d.serial === device.serial ? { ...d, connected: newConnected } : d
        );
        persistDevices(updated);
        setRefreshingSerial(null);
      }, 1000);
    },
    [devices, persistDevices]
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* ======== 情报局卡片 ======== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-nexus-surface border border-nexus-border rounded-2xl p-8 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-nexus-primary/[0.04] rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-nexus-text mb-2 flex items-center gap-3">
            情报局{' '}
            <span className="text-nexus-primary animate-pulse">_</span>
          </h1>
          <p className="text-sm text-nexus-muted leading-relaxed mb-3">
            欢迎接入昆仑工坊。系统运行平稳，各项指标正常。
          </p>
          <a
            href="https://kunlun-intelligence.netlify.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-nexus-primary/10 border border-nexus-primary/30 text-nexus-primary text-sm font-medium hover:bg-nexus-primary/20 hover:border-nexus-primary/60 hover:shadow-cyber-glow transition-all duration-300 group/link"
          >
            <ExternalLink
              size={14}
              className="group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform duration-300"
            />
            进入情报局
          </a>
        </div>
      </motion.div>

      {/* ======== 您的数字员工 ======== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-nexus-text flex items-center gap-2.5">
            <Smartphone size={20} className="text-nexus-primary" />
            您的数字员工
            <span className="text-xs font-normal text-nexus-muted ml-1">
              ({devices.filter((d) => d.connected).length}/{devices.length} 在线)
            </span>
          </h2>
          <button
            onClick={() => {
              setIsLoading(true);
              const updated = simulateAdbQuery(devices);
              persistDevices(updated);
              setTimeout(() => setIsLoading(false), 800);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-nexus-surface border border-nexus-border text-xs font-medium text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/50 transition-all duration-300"
          >
            <RefreshCw
              size={13}
              className={isLoading ? 'animate-spin' : ''}
            />
            刷新全部
          </button>
        </div>

        {/* 设备卡片网格 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2
              size={32}
              className="text-nexus-primary animate-spin"
            />
            <span className="ml-3 text-sm text-nexus-muted">
              正在查询设备连接状态...
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {devices.map((device, i) => (
              <DeviceCard
                key={device.serial}
                device={device}
                index={i}
                isRefreshing={refreshingSerial === device.serial}
                isRenaming={renamingDevice?.serial === device.serial}
                renameValue={renameValue}
                renameInputRef={
                  renamingDevice?.serial === device.serial
                    ? renameInputRef
                    : undefined
                }
                onRenameChange={setRenameValue}
                onRenameSubmit={submitRename}
                onRenameCancel={cancelRename}
                onLeftClick={handleLeftClick}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        )}
      </motion.div>

      {/* ======== 右键菜单 ======== */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.12 }}
            className="fixed z-[100] bg-nexus-surface border border-nexus-border rounded-xl shadow-2xl shadow-black/50 overflow-hidden min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => startRename(contextMenu.device)}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-nexus-text hover:bg-nexus-primary/10 hover:text-nexus-primary transition-colors"
            >
              <PenLine size={14} />
              修改代号
            </button>
            <div className="h-px bg-nexus-border mx-2" />
            <button
              onClick={() => refreshSingleDevice(contextMenu.device)}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-nexus-text hover:bg-nexus-primary/10 hover:text-nexus-primary transition-colors"
            >
              <RefreshCw size={14} />
              刷新状态
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======== 左键确认弹窗 ======== */}
      <AnimatePresence>
        {confirmDevice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setConfirmDevice(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-nexus-surface border border-nexus-border rounded-2xl p-6 max-w-sm w-full shadow-2xl shadow-black/50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-nexus-primary/15 flex items-center justify-center">
                  <Smartphone size={20} className="text-nexus-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-nexus-text">
                    {confirmDevice.alias}
                  </h3>
                  <p className="text-[11px] text-nexus-muted font-mono">
                    {confirmDevice.serial}
                  </p>
                </div>
              </div>

              <p className="text-sm text-nexus-muted mb-6 leading-relaxed">
                是否跳转至<span className="text-nexus-text font-medium">数字员工</span>指挥这部手机？
                {!confirmDevice.connected && (
                  <span className="block text-amber-400 text-xs mt-2">
                    ⚠ 该设备当前处于断开状态，请确认 USB 连接后再操作。
                  </span>
                )}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDevice(null)}
                  className="flex-1 py-2.5 rounded-xl border border-nexus-border text-sm font-medium text-nexus-muted hover:text-nexus-text hover:border-nexus-text/30 transition-all"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmJump}
                  className="flex-1 py-2.5 rounded-xl bg-nexus-primary text-nexus-inverse text-sm font-bold shadow-cyber-glow hover:shadow-cyber-glow-hover transition-all"
                >
                  确认跳转
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * 单个手机设备卡片
 * NOTE: 设计风格参照参考图 — 深色底 + 图标 + 状态文字
 * 已连接：主题色（青绿）高亮
 * 已断开：暗灰低饱和
 */
function DeviceCard({
  device,
  index,
  isRefreshing,
  isRenaming,
  renameValue,
  renameInputRef,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onLeftClick,
  onContextMenu,
}: {
  device: PhoneDevice;
  index: number;
  isRefreshing: boolean;
  isRenaming: boolean;
  renameValue: string;
  renameInputRef?: React.RefObject<HTMLInputElement | null>;
  onRenameChange: (val: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onLeftClick: (d: PhoneDevice) => void;
  onContextMenu: (e: React.MouseEvent, d: PhoneDevice) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={() => onLeftClick(device)}
      onContextMenu={(e) => onContextMenu(e, device)}
      className={`relative rounded-2xl border p-5 cursor-pointer select-none transition-all duration-300 group overflow-hidden ${
        device.connected
          ? 'bg-nexus-surface border-nexus-primary/30 hover:border-nexus-primary hover:shadow-cyber-glow'
          : 'bg-nexus-surface border-nexus-border hover:border-nexus-muted/50'
      }`}
    >
      {/* 刷新加载态覆盖层 */}
      {isRefreshing && (
        <div className="absolute inset-0 z-20 bg-nexus-bg/80 backdrop-blur-sm rounded-2xl flex items-center justify-center">
          <RefreshCw size={20} className="text-nexus-primary animate-spin" />
        </div>
      )}

      {/* 序号 + 序列号 */}
      <div className="flex items-start justify-between mb-4">
        <span
          className={`text-2xl font-black font-mono leading-none ${
            device.connected ? 'text-nexus-primary' : 'text-nexus-muted/40'
          }`}
        >
          {String(device.index).padStart(2, '0')}
        </span>
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
            device.connected
              ? 'bg-nexus-primary/10 text-nexus-primary'
              : 'bg-nexus-border/50 text-nexus-muted/60'
          }`}
        >
          {device.serial}
        </span>
      </div>

      {/* 手机图标 */}
      <div className="flex justify-center mb-4">
        <Smartphone
          size={40}
          strokeWidth={1.5}
          className={`transition-colors duration-300 ${
            device.connected
              ? 'text-nexus-primary drop-shadow-[0_0_8px_rgba(62,237,231,0.3)]'
              : 'text-nexus-muted/30'
          }`}
        />
      </div>

      {/* 设备别名 — 可能处于重命名状态 */}
      {isRenaming ? (
        <div className="flex items-center gap-1.5 mb-2">
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameSubmit();
              if (e.key === 'Escape') onRenameCancel();
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-nexus-bg border border-nexus-primary/50 rounded-lg px-2 py-1 text-xs text-nexus-text focus:outline-none focus:border-nexus-primary"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRenameSubmit();
            }}
            className="p-1 rounded text-emerald-400 hover:bg-emerald-400/10"
          >
            <Check size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRenameCancel();
            }}
            className="p-1 rounded text-nexus-muted hover:bg-nexus-border"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <h3 className="text-sm font-bold text-nexus-text text-center mb-1.5 truncate">
          {device.alias}
        </h3>
      )}

      {/* 连接状态 */}
      <div
        className={`flex items-center justify-center gap-1.5 text-[11px] font-medium ${
          device.connected ? 'text-nexus-primary' : 'text-rose-400/70'
        }`}
      >
        {device.connected ? (
          <>
            <Wifi size={12} />
            已连接
          </>
        ) : (
          <>
            <WifiOff size={12} />
            已断开连接
          </>
        )}
      </div>

      {/* 右键提示 */}
      <div className="absolute bottom-1.5 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[9px] text-nexus-muted/40">右键更多</span>
      </div>
    </motion.div>
  );
}

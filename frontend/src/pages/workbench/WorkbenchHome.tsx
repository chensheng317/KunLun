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
  Lock,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { UserRole } from '../../contexts/AuthContext';

/**
 * 各角色对应的手机设备配额
 * NOTE: 超出配额的卡片显示“升级方案”蒙版
 */
const DEVICE_QUOTA: Record<UserRole, number> = {
  super_admin: 20,
  admin: 20,
  ultra: 20,
  pro: 20,
  normal: 10,
  guest: 5,
};

/**
 * 手机设备数据模型
 * NOTE: alias（代号）通过 localStorage 持久化，但绑定到 ADB serial
 *       — USB 拔出后再插入，serial 重新匹配，如查不到原 serial 则恢复默认名
 * 连接状态由后端 ADB 查询实时驱动，不做本地模拟
 */
interface PhoneDevice {
  /** 设备序列号（真实 ADB serial 或 placeholder） */
  serial: string;
  /** 用户自定义别名，默认 "X号手机" */
  alias: string;
  /** 连接状态 */
  connected: boolean;
  /** 设备序号（UI 槽位 1-20） */
  index: number;
  /** 设备型号（来自 ADB） */
  model?: string;
  /** 设备品牌（来自 ADB） */
  brand?: string;
}

/** 后端返回的设备信息（与 DigitalWorkersPage 使用相同结构） */
interface AdbDeviceInfo {
  id: string;
  model: string;
  brand: string;
  status: 'online' | 'busy' | 'offline';
}

const ALIAS_KEY = 'kunlun_device_aliases';
const MAX_DEVICES = 20;
const API_BASE = 'http://localhost:8000';

/**
 * 从 localStorage 读取 "serial → alias" 映射表
 * NOTE: 只持久化用户主动修改过的别名，默认名不存储
 */
function loadAliasMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ALIAS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* 忽略解析错误 */ }
  return {};
}

function saveAliasMap(map: Record<string, string>): void {
  localStorage.setItem(ALIAS_KEY, JSON.stringify(map));
}

/**
 * 将后端 ADB 设备列表映射到 20 个卡片槽位
 * - 已连接设备按顺序填充 1 号、2 号…
 * - 剩余槽位为断开状态，serial 显示 "···"
 * - alias 优先读取用户修改过的名称
 */
function buildDeviceSlots(adbDevices: AdbDeviceInfo[]): PhoneDevice[] {
  const aliasMap = loadAliasMap();
  const slots: PhoneDevice[] = [];

  // 已连接设备按顺序填充
  adbDevices.forEach((dev, i) => {
    const idx = i + 1;
    slots.push({
      serial: dev.id,
      alias: aliasMap[dev.id] || `${idx}号手机`,
      connected: true,
      index: idx,
      model: dev.model,
      brand: dev.brand,
    });
  });

  // 剩余槽位 — 断开状态
  for (let i = adbDevices.length; i < MAX_DEVICES; i++) {
    const idx = i + 1;
    slots.push({
      serial: '···',
      alias: `${idx}号手机`,
      connected: false,
      index: idx,
    });
  }

  return slots;
}

/**
 * 工作台首页 — 情报局 + 数字员工设备矩阵
 *
 * NOTE: 20 个卡片槽位实时反映后端 ADB 设备检测结果
 * - 左键 → 跳转确认弹窗 → 数字员工页（自动选中该设备）
 * - 右键 → 上下文菜单（改名/刷新状态）
 * - 代号绑定 ADB serial 持久化；USB 拔插后 serial 不变则保留代号
 */
export default function WorkbenchHome() {
  const { user } = useAuth();
  const userRole = (user?.role as UserRole) || 'guest';
  const deviceQuota = DEVICE_QUOTA[userRole] || 5;

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

  /**
   * 从后端 REST API 获取已连接设备列表
   * NOTE: 调用 /api/digital-worker/devices 拿到真实 ADB 数据
   */
  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/digital-worker/devices`);
      const data = await res.json();
      const adbDevices: AdbDeviceInfo[] = data.devices || [];
      const slots = buildDeviceSlots(adbDevices);
      setDevices(slots);
    } catch {
      // 后端不可达 — 全部显示断开
      setDevices(buildDeviceSlots([]));
    }
  }, []);

  /** 初始化：从后端获取真实设备列表 */
  useEffect(() => {
    setIsLoading(true);
    fetchDevices().finally(() => setIsLoading(false));
  }, [fetchDevices]);

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

  /** 取消重命名 */
  const cancelRename = useCallback(() => {
    setRenamingDevice(null);
    setRenameValue('');
  }, []);

  /** 右键菜单事件 */
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, device: PhoneDevice) => {
      e.preventDefault();
      e.stopPropagation();
      cancelRename();
      setContextMenu({ x: e.clientX, y: e.clientY, device });
    },
    [cancelRename]
  );

  /** 左键点击 — 弹出跳转确认弹窗 */
  const handleLeftClick = useCallback((device: PhoneDevice) => {
    cancelRename();
    setConfirmDevice(device);
  }, [cancelRename]);

  /**
   * 确认跳转至数字员工
   * NOTE: 通过 CustomEvent 传递 deviceId，切换 tab 并自动选中该设备
   */
  const handleConfirmJump = useCallback(() => {
    if (!confirmDevice) return;
    // 先切换到数字员工 tab
    window.dispatchEvent(
      new CustomEvent('navigate-to-tab', {
        detail: { tab: 'workers' },
      })
    );
    // 再通知数字员工页自动选中该设备
    // NOTE: 延迟发送以确保 DigitalWorkersPage 已挂载并监听
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('select-worker-device', {
          detail: {
            deviceId: confirmDevice.serial,
            deviceLabel: confirmDevice.alias,
          },
        })
      );
    }, 300);
    setConfirmDevice(null);
  }, [confirmDevice]);

  /**
   * 开始重命名
   * NOTE: 代号持久化绑定到 ADB serial，USB 拔出后 serial 不在列表中时恢复默认
   */
  const startRename = useCallback((device: PhoneDevice) => {
    setRenamingDevice(device);
    setRenameValue(device.alias);
    setContextMenu(null);
  }, []);

  /**
   * 提交重命名
   * NOTE: 将 serial → alias 写入 localStorage，刷新卡片
   */
  const submitRename = useCallback(() => {
    if (!renamingDevice || !renameValue.trim()) return;
    // 持久化到 alias map
    const aliasMap = loadAliasMap();
    aliasMap[renamingDevice.serial] = renameValue.trim();
    saveAliasMap(aliasMap);
    // 更新 UI
    setDevices((prev) =>
      prev.map((d) =>
        d.serial === renamingDevice.serial
          ? { ...d, alias: renameValue.trim() }
          : d
      )
    );
    setRenamingDevice(null);
    setRenameValue('');
  }, [renamingDevice, renameValue]);

  /**
   * 刷新全部 — 重新调用后端 ADB 接口
   */
  const handleRefreshAll = useCallback(async () => {
    setIsLoading(true);
    await fetchDevices();
    setIsLoading(false);
  }, [fetchDevices]);

  /**
   * 刷新单台设备状态
   * NOTE: 重新请求后端设备列表，检查该 serial 是否仍在线
   */
  const refreshSingleDevice = useCallback(
    async (device: PhoneDevice) => {
      setContextMenu(null);
      setRefreshingSerial(device.serial);
      try {
        const res = await fetch(`${API_BASE}/api/digital-worker/devices`);
        const data = await res.json();
        const adbDevices: AdbDeviceInfo[] = data.devices || [];
        const isStillConnected = adbDevices.some((d) => d.id === device.serial);
        setDevices((prev) =>
          prev.map((d) =>
            d.serial === device.serial
              ? { ...d, connected: isStillConnected }
              : d
          )
        );
      } catch {
        // 后端不可达 — 标记为断开
        setDevices((prev) =>
          prev.map((d) =>
            d.serial === device.serial ? { ...d, connected: false } : d
          )
        );
      }
      setRefreshingSerial(null);
    },
    []
  );

  const connectedCount = devices.filter((d) => d.connected).length;

  return (
    <div className="h-full overflow-y-auto p-8 max-w-7xl mx-auto space-y-8">
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
            className="cursor-target inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-nexus-primary/10 border border-nexus-primary/30 text-nexus-primary text-sm font-medium hover:bg-nexus-primary/20 hover:border-nexus-primary/60 hover:shadow-cyber-glow transition-all duration-300 group/link"
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
              ({connectedCount}/{MAX_DEVICES} 在线)
            </span>
          </h2>
          <button
            onClick={handleRefreshAll}
            className="cursor-target flex items-center gap-2 px-3.5 py-2 rounded-lg bg-nexus-surface border border-nexus-border text-xs font-medium text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/50 transition-all duration-300"
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
            {devices.map((device, i) => {
              // NOTE: 超出角色配额的卡片加“升级方案”蒙版
              const isOverQuota = device.index > deviceQuota;
              return (
                <div key={`${device.index}-${device.serial}`} className="relative">
                  <DeviceCard
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
                    onLeftClick={isOverQuota ? () => {} : handleLeftClick}
                    onContextMenu={isOverQuota ? (e) => e.preventDefault() : handleContextMenu}
                  />
                  {/* 配额超限蒙版 */}
                  {isOverQuota && (
                    <div className="absolute inset-0 z-30 bg-nexus-bg/80 backdrop-blur-[2px] rounded-2xl flex flex-col items-center justify-center gap-2 cursor-not-allowed">
                      <Lock size={20} className="text-nexus-muted/60" />
                      <span className="text-[11px] text-nexus-muted/80 font-medium">请升级您的方案</span>
                    </div>
                  )}
                </div>
              );
            })}
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
                    {confirmDevice.connected ? confirmDevice.serial : '设备未连接'}
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
                  className="cursor-target flex-1 py-2.5 rounded-xl border border-nexus-border text-sm font-medium text-nexus-muted hover:text-nexus-text hover:border-nexus-text/30 transition-all"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmJump}
                  disabled={!confirmDevice.connected}
                  className="cursor-target flex-1 py-2.5 rounded-xl bg-nexus-primary text-nexus-inverse text-sm font-bold shadow-cyber-glow hover:shadow-cyber-glow-hover transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
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
 * NOTE: 已连接设备显示真实 ADB serial（右上角高亮）
 *       断开设备右上角显示 "···"（未知占位符）
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
      className={`cursor-target relative rounded-2xl border p-5 cursor-pointer select-none transition-all duration-300 group overflow-hidden ${
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
              : 'bg-nexus-border/50 text-nexus-muted/40'
          }`}
        >
          {device.connected ? device.serial : '· · ·'}
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

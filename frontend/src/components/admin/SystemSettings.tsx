import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Settings,
  Globe,
  Tag,
  ScrollText,
  Save,
  CheckCircle,
  Eye,
  Power,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
} from 'lucide-react';
import { apiClient } from '../../utils/api-client';

/**
 * 管理后台 — 系统管理面板（仅超级管理员可见）
 * NOTE: 包含站点配置、套餐定价配置、操作日志审计三个子 Tab
 * 所有数据通过 REST API 从 PostgreSQL 读写，不再依赖 localStorage
 * 日志由后端 service 层自动记录，前端无需手动调用 logAdminAction
 */

/** 子 Tab 配置 */
const SUB_TABS = [
  { id: 'site', label: '站点配置', icon: Globe },
  { id: 'pricing', label: '套餐定价', icon: Tag },
  { id: 'logs', label: '操作日志', icon: ScrollText },
] as const;

type SubTabId = typeof SUB_TABS[number]['id'];

/* ─────────────────────────────────────────────
 * 后端数据类型定义
 * ───────────────────────────────────────────── */

/** 后端 SiteConfigResponse */
interface SiteConfigEntry {
  id: number;
  configKey: string;
  configValue: unknown;
  updatedAt: string;
}

/** 后端 AdminLogResponse */
interface AdminLogEntry {
  id: number;
  operator: string;
  action: string;
  target: string | null;
  detail: string | null;
  createdAt: string;
}

/** 后端 AdminLogListResponse */
interface AdminLogListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: AdminLogEntry[];
}

/* ─────────────────────────────────────────────
 * 站点配置接口
 * ───────────────────────────────────────────── */
interface SiteConfig {
  siteName: string;
  siteDescription: string;
  maintenanceMode: boolean;
  registrationOpen: boolean;
  maxUploadSize: number;
  defaultCredits: number;
}

const DEFAULT_SITE_CONFIG: SiteConfig = {
  siteName: '昆仑工坊',
  siteDescription: 'AI 驱动的跨境电商智能工具平台',
  maintenanceMode: false,
  registrationOpen: true,
  maxUploadSize: 50,
  defaultCredits: 50,
};

/**
 * 站点配置 key 与 SiteConfig 字段的映射
 * NOTE: 后端以 key-value 形式存储，前端需要做扁平字段 ↔ 独立 key 的双向转换
 */
const CONFIG_KEY_MAP: Record<string, keyof SiteConfig> = {
  site_name: 'siteName',
  site_description: 'siteDescription',
  maintenance_mode: 'maintenanceMode',
  registration_open: 'registrationOpen',
  max_upload_size: 'maxUploadSize',
  default_credits: 'defaultCredits',
};

/** SiteConfig 字段 → 后端 key 的反向映射 */
const FIELD_TO_KEY: Record<keyof SiteConfig, string> = Object.fromEntries(
  Object.entries(CONFIG_KEY_MAP).map(([k, v]) => [v, k]),
) as Record<keyof SiteConfig, string>;

export default function SystemSettings() {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('site');

  return (
    <div className="h-full overflow-y-auto p-8 space-y-6">
      {/* 页面标题 */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold text-nexus-text flex items-center gap-3">
          <Settings size={22} className="text-amber-400" />
          系统管理
        </h1>
        <p className="text-sm text-nexus-muted mt-1.5">
          管理站点配置、套餐定价和操作日志审计。
        </p>
      </motion.div>

      {/* 子 Tab 切换 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-2 border-b border-nexus-border pb-0"
      >
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 -mb-[1px] ${
                isActive
                  ? 'text-amber-400 border-amber-400'
                  : 'text-nexus-muted border-transparent hover:text-nexus-text hover:border-nexus-border'
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </motion.div>

      {/* 子 Tab 内容 */}
      <motion.div
        key={activeSubTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeSubTab === 'site' && <SiteConfigPanel />}
        {activeSubTab === 'pricing' && <PricingConfigPanel />}
        {activeSubTab === 'logs' && <AdminLogsPanel />}
      </motion.div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * 站点配置面板
 * ───────────────────────────────────────────── */
function SiteConfigPanel() {
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /** 从后端加载所有站点配置 */
  useEffect(() => {
    setLoading(true);
    apiClient.get<SiteConfigEntry[]>('/api/config/site')
      .then((entries) => {
        if (!entries) return;
        const merged = { ...DEFAULT_SITE_CONFIG };
        for (const entry of entries) {
          const field = CONFIG_KEY_MAP[entry.configKey];
          if (field) {
            (merged as Record<string, unknown>)[field] = entry.configValue;
          }
        }
        setConfig(merged);
      })
      .catch((err) => console.error('Failed to load site config:', err))
      .finally(() => setLoading(false));
  }, []);

  /** 逐项保存配置到后端 */
  const handleSave = async () => {
    setSaving(true);
    try {
      const entries = Object.entries(FIELD_TO_KEY) as [keyof SiteConfig, string][];
      for (const [field, key] of entries) {
        await apiClient.put(`/api/config/site/${key}`, {
          configValue: config[field],
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save site config:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-amber-400" />
        <span className="ml-3 text-sm text-nexus-muted">加载中…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-6 space-y-5">
        <h3 className="text-sm font-bold text-nexus-text flex items-center gap-2">
          <Globe size={16} className="text-nexus-primary" />
          基本信息
        </h3>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-nexus-muted font-medium mb-1.5 block">站点名称</label>
            <input
              value={config.siteName}
              onChange={(e) => setConfig({ ...config, siteName: e.target.value })}
              className="w-full bg-nexus-bg border border-nexus-border rounded-xl px-4 py-2.5 text-sm text-nexus-text focus:outline-none focus:border-amber-500/50 transition-all"
            />
          </div>
          <div>
            <label className="text-xs text-nexus-muted font-medium mb-1.5 block">站点描述</label>
            <textarea
              value={config.siteDescription}
              onChange={(e) => setConfig({ ...config, siteDescription: e.target.value })}
              rows={2}
              className="w-full bg-nexus-bg border border-nexus-border rounded-xl px-4 py-2.5 text-sm text-nexus-text focus:outline-none focus:border-amber-500/50 transition-all resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-nexus-muted font-medium mb-1.5 block">游客注册默认积分</label>
            <input
              type="number"
              min={0}
              value={config.defaultCredits}
              onChange={(e) => setConfig({ ...config, defaultCredits: parseInt(e.target.value, 10) || 0 })}
              className="w-48 bg-nexus-bg border border-nexus-border rounded-xl px-4 py-2.5 text-sm text-nexus-text font-mono focus:outline-none focus:border-amber-500/50 transition-all"
            />
          </div>
          <div>
            <label className="text-xs text-nexus-muted font-medium mb-1.5 block">最大上传文件大小 (MB)</label>
            <input
              type="number"
              min={1}
              value={config.maxUploadSize}
              onChange={(e) => setConfig({ ...config, maxUploadSize: parseInt(e.target.value, 10) || 50 })}
              className="w-48 bg-nexus-bg border border-nexus-border rounded-xl px-4 py-2.5 text-sm text-nexus-text font-mono focus:outline-none focus:border-amber-500/50 transition-all"
            />
          </div>
        </div>
      </div>

      {/* 开关类配置 */}
      <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-6 space-y-5">
        <h3 className="text-sm font-bold text-nexus-text flex items-center gap-2">
          <Power size={16} className="text-nexus-primary" />
          功能开关
        </h3>

        <div className="space-y-4">
          <ToggleRow
            label="维护模式"
            description="开启后访客将看到维护中页面，管理员仍可访问"
            checked={config.maintenanceMode}
            onChange={(v) => setConfig({ ...config, maintenanceMode: v })}
            danger
          />
          <ToggleRow
            label="开放注册"
            description="关闭后新用户将无法注册账号"
            checked={config.registrationOpen}
            onChange={(v) => setConfig({ ...config, registrationOpen: v })}
          />
        </div>
      </div>

      {/* 保存按钮 */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all ${
          saved
            ? 'bg-emerald-500 text-white'
            : saving
              ? 'bg-amber-500/50 text-white cursor-wait'
              : 'bg-amber-500 text-white hover:bg-amber-600 shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:shadow-[0_0_25px_rgba(245,158,11,0.5)]'
        }`}
      >
        {saved ? <CheckCircle size={16} /> : saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {saved ? '已保存' : saving ? '保存中…' : '保存配置'}
      </button>
    </div>
  );
}

/** 开关行组件 */
function ToggleRow({
  label,
  description,
  checked,
  onChange,
  danger,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-nexus-text font-medium">{label}</p>
        <p className="text-[11px] text-nexus-muted">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-all duration-300 ${
          checked
            ? danger
              ? 'bg-rose-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]'
              : 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
            : 'bg-nexus-border'
        }`}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * 套餐定价配置面板
 * ───────────────────────────────────────────── */

interface PricingPlanConfig {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  initialCredits: number;
  firstBonus: number;
}

const DEFAULT_PRICING: PricingPlanConfig[] = [
  { id: 'free', name: '体验版', monthlyPrice: 0, yearlyPrice: 0, initialCredits: 50, firstBonus: 0 },
  { id: 'starter', name: '基础版', monthlyPrice: 99, yearlyPrice: 79, initialCredits: 1000, firstBonus: 500 },
  { id: 'pro', name: '专业版', monthlyPrice: 299, yearlyPrice: 249, initialCredits: 3000, firstBonus: 1500 },
  { id: 'enterprise', name: '旗舰版', monthlyPrice: 999, yearlyPrice: 799, initialCredits: 10000, firstBonus: 5000 },
];

function PricingConfigPanel() {
  const [plans, setPlans] = useState<PricingPlanConfig[]>(DEFAULT_PRICING);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /** 从后端 site_config 中加载 pricing_config */
  useEffect(() => {
    setLoading(true);
    apiClient.get<SiteConfigEntry>('/api/config/site/pricing_config')
      .then((entry) => {
        if (entry?.configValue && Array.isArray(entry.configValue)) {
          setPlans(entry.configValue as PricingPlanConfig[]);
        }
      })
      .catch(() => {
        // NOTE: 404 表示尚未设置，使用默认值即可
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (id: string, field: keyof PricingPlanConfig, value: number) => {
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    );
  };

  /** 将整个定价数组作为 pricing_config 的 configValue 保存 */
  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put('/api/config/site/pricing_config', {
        configValue: plans,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save pricing config:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-amber-400" />
        <span className="ml-3 text-sm text-nexus-muted">加载中…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-nexus-surface border border-nexus-border rounded-2xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-nexus-surface-alt/40 border-b border-nexus-border">
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">套餐</th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">月付 (¥)</th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">年付/月 (¥)</th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">初始积分</th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">首次加赠</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-nexus-border">
            {plans.map((plan) => (
              <tr key={plan.id} className="hover:bg-nexus-bg/50 transition-colors">
                <td className="p-4">
                  <span className="text-sm text-nexus-text font-medium">{plan.name}</span>
                </td>
                <td className="p-4">
                  <input
                    type="number"
                    min={0}
                    value={plan.monthlyPrice}
                    onChange={(e) => handleChange(plan.id, 'monthlyPrice', parseInt(e.target.value, 10) || 0)}
                    className="w-24 bg-nexus-bg border border-nexus-border rounded-lg px-2.5 py-1.5 text-xs text-nexus-text font-mono focus:outline-none focus:border-amber-500/50 transition-all"
                  />
                </td>
                <td className="p-4">
                  <input
                    type="number"
                    min={0}
                    value={plan.yearlyPrice}
                    onChange={(e) => handleChange(plan.id, 'yearlyPrice', parseInt(e.target.value, 10) || 0)}
                    className="w-24 bg-nexus-bg border border-nexus-border rounded-lg px-2.5 py-1.5 text-xs text-nexus-text font-mono focus:outline-none focus:border-amber-500/50 transition-all"
                  />
                </td>
                <td className="p-4">
                  <input
                    type="number"
                    min={0}
                    value={plan.initialCredits}
                    onChange={(e) => handleChange(plan.id, 'initialCredits', parseInt(e.target.value, 10) || 0)}
                    className="w-24 bg-nexus-bg border border-nexus-border rounded-lg px-2.5 py-1.5 text-xs text-nexus-text font-mono focus:outline-none focus:border-amber-500/50 transition-all"
                  />
                </td>
                <td className="p-4">
                  <input
                    type="number"
                    min={0}
                    value={plan.firstBonus}
                    onChange={(e) => handleChange(plan.id, 'firstBonus', parseInt(e.target.value, 10) || 0)}
                    className="w-24 bg-nexus-bg border border-nexus-border rounded-lg px-2.5 py-1.5 text-xs text-nexus-text font-mono focus:outline-none focus:border-amber-500/50 transition-all"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 配置预览 */}
      <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5">
        <h3 className="text-sm font-bold text-nexus-text mb-3 flex items-center gap-2">
          <Eye size={15} className="text-nexus-primary" />
          当前配置预览
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {plans.map((plan) => (
            <div key={plan.id} className="p-3 rounded-xl bg-nexus-bg/50 border border-nexus-border/50">
              <p className="text-xs text-nexus-text font-bold mb-2">{plan.name}</p>
              <p className="text-[10px] text-nexus-muted">
                月付 ¥{plan.monthlyPrice} · 年付 ¥{plan.yearlyPrice}/月
              </p>
              <p className="text-[10px] text-nexus-primary mt-1">
                初始 {plan.initialCredits.toLocaleString()} + 加赠 {plan.firstBonus.toLocaleString()} 积分
              </p>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all ${
          saved
            ? 'bg-emerald-500 text-white'
            : saving
              ? 'bg-amber-500/50 text-white cursor-wait'
              : 'bg-amber-500 text-white hover:bg-amber-600 shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:shadow-[0_0_25px_rgba(245,158,11,0.5)]'
        }`}
      >
        {saved ? <CheckCircle size={16} /> : saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {saved ? '已保存' : saving ? '保存中…' : '保存定价配置'}
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * 操作日志审计面板
 * NOTE: 日志存储在 PostgreSQL 中，通过后端 /api/admin/logs 分页查询
 * 后端已自动记录所有管理员操作，前端仅做只读展示
 * ───────────────────────────────────────────── */
const LOG_PAGE_SIZE = 12;

function AdminLogsPanel() {
  const [logs, setLogs] = useState<AdminLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  /** 从后端加载日志（带分页） */
  const loadLogs = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const data = await apiClient.get<AdminLogListResponse>(
        `/api/admin/logs?page=${page}&pageSize=${LOG_PAGE_SIZE}`,
      );
      if (data) {
        setLogs(data.items || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load admin logs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs(currentPage);
  }, [currentPage, loadLogs]);

  const totalPages = Math.max(1, Math.ceil(total / LOG_PAGE_SIZE));

  /** 前端搜索过滤（在当前页内） */
  const filteredLogs = searchQuery
    ? logs.filter((l) => {
        const q = searchQuery.toLowerCase();
        return (
          l.operator.toLowerCase().includes(q) ||
          (l.target?.toLowerCase().includes(q) ?? false) ||
          (l.detail?.toLowerCase().includes(q) ?? false) ||
          l.action.toLowerCase().includes(q)
        );
      })
    : logs;

  const formatDate = (iso: string): string => {
    try {
      const d = new Date(iso);
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    } catch { return iso; }
  };

  const getPageNumbers = (): (number | '...')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (currentPage > 3) pages.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  return (
    <div className="space-y-5">
      {/* 搜索 + 统计 */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-nexus-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索操作员、目标或详情…"
            className="w-full bg-nexus-bg border border-nexus-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-nexus-text placeholder-nexus-muted/50 focus:outline-none focus:border-amber-500/50 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-nexus-muted font-mono">
            共 {total} 条日志
          </span>
        </div>
      </div>

      {/* 日志列表 */}
      <div className="bg-nexus-surface border border-nexus-border rounded-2xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-nexus-surface-alt/40 border-b border-nexus-border">
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">时间</th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">操作员</th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">操作</th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">目标</th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">详情</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-nexus-border">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-12 text-center">
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 size={20} className="animate-spin text-amber-400" />
                    <span className="text-sm text-nexus-muted">加载中…</span>
                  </div>
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center text-nexus-muted text-sm">
                  暂无操作日志
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-nexus-bg/50 transition-colors">
                  <td className="p-4 text-xs text-nexus-muted font-mono whitespace-nowrap">{formatDate(log.createdAt)}</td>
                  <td className="p-4 text-sm text-nexus-text font-medium">{log.operator}</td>
                  <td className="p-4">
                    <span className="inline-flex text-[10px] px-2 py-1 rounded font-bold border bg-nexus-primary/10 text-nexus-primary border-nexus-primary/20">
                      {log.action}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-nexus-muted">{log.target || '-'}</td>
                  <td className="p-4 text-xs text-nexus-muted max-w-xs truncate" title={log.detail || ''}>{log.detail || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-nexus-border flex items-center justify-between bg-nexus-surface-alt/20">
            <span className="text-[11px] text-nexus-muted font-mono">
              共 {total} 条 · 第 {currentPage}/{totalPages} 页
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-1.5 rounded-md text-nexus-muted hover:text-amber-400 hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronsLeft size={16} />
              </button>
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-md text-nexus-muted hover:text-amber-400 hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft size={16} />
              </button>
              {getPageNumbers().map((page, idx) =>
                page === '...' ? (
                  <span key={`dots-${idx}`} className="w-7 h-7 flex items-center justify-center text-xs text-nexus-muted">…</span>
                ) : (
                  <button key={page} onClick={() => setCurrentPage(page)} className={`w-7 h-7 rounded-md text-xs font-bold transition-all ${
                    page === currentPage
                      ? 'bg-amber-500 text-nexus-inverse shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                      : 'text-nexus-muted hover:text-nexus-text hover:bg-nexus-surface'
                  }`}>{page}</button>
                ),
              )}
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-md text-nexus-muted hover:text-amber-400 hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronRight size={16} />
              </button>
              <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-1.5 rounded-md text-nexus-muted hover:text-amber-400 hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

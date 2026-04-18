/**
 * 数字工厂产物记录工具
 *
 * NOTE: Phase 2.1 重构 — 资产库 / 历史记录 / 自建素材库核心函数改为调用后端 API
 *       数字员工会话状态仍使用 localStorage（临时数据，不需要持久化到数据库）
 *
 * 架构：
 * - 资产库 (FactoryAsset)      → POST/GET /api/assets/factory-assets
 * - 历史记录 (FactoryHistory)   → POST/GET /api/assets/factory-history
 * - 数字员工历史 (WorkerHistory) → POST/GET /api/assets/worker-history
 * - 自建素材库 (CustomLibrary)  → /api/libraries
 * - 数字员工会话/任务           → localStorage（临时状态）
 */

import { apiClient } from './api-client';

// ============ 类型定义 ============

/** 资产库条目 — 来自数字工厂的产物 */
export interface FactoryAssetRecord {
  id: string;
  /** 文件/产物名称 */
  name: string;
  /** 来源工具名称，如 "数字工厂-AI营销音乐" */
  source: string;
  /** 文件类型，如 "audio", "image", "json" 等 */
  type: string;
  /** 文件大小描述 */
  size: string;
  /** 生成时间（ISO 字符串） */
  date: string;
  /** 音频/文件下载 URL（可选） */
  downloadUrl?: string;
  /** 预览跳转使用的工具路径标识 */
  toolId?: string;
}

/** 历史记录条目 — 数字工厂使用记录 */
export interface FactoryHistoryRecord {
  id: string;
  /** 工具名称 */
  toolName: string;
  /** 操作描述 */
  action: string;
  /** 状态 */
  status: 'success' | 'failed' | 'running';
  /** 时间（ISO 字符串） */
  time: string;
  /** 耗时描述 */
  duration: string;
  /** 产出结果描述 */
  output?: string;
}

// ============ 用户隔离（保留，供数字员工临时状态使用） ============

/**
 * 获取当前登录用户名
 * NOTE: 从 localStorage 读取，与 AuthContext 保持一致
 */
export function getCurrentUsername(): string {
  try {
    const raw = localStorage.getItem('kunlun_current_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.username || 'anonymous';
    }
  } catch { /* ignore */ }
  return 'anonymous';
}

/**
 * 生成带用户名前缀的 localStorage key
 * NOTE: 确保多用户环境下各账号的任务状态、缓存数据完全隔离
 * @param baseKey 原始 key（如 'kunlun_dh_active_task'）
 * @returns 带用户名后缀的 key（如 'kunlun_dh_active_task_testuser'）
 */
export function getUserScopedKey(baseKey: string): string {
  return `${baseKey}_${getCurrentUsername()}`;
}

/**
 * 带用户隔离的 localStorage 代理
 * NOTE: 仅用于数字员工会话/任务状态等临时数据
 */
export const scopedStorage = {
  getItem(baseKey: string): string | null {
    return localStorage.getItem(getUserScopedKey(baseKey));
  },
  setItem(baseKey: string, value: string): void {
    localStorage.setItem(getUserScopedKey(baseKey), value);
  },
  removeItem(baseKey: string): void {
    localStorage.removeItem(getUserScopedKey(baseKey));
  },
};

// ============ localStorage Key（数字员工专用） ============

function workerSessionKey(): string { return `kunlun_worker_session_${getCurrentUsername()}`; }
function activeTaskKey(): string { return `kunlun_worker_active_task_${getCurrentUsername()}`; }

// ============ 资产库操作（API 驱动） ============

/** API 响应中的资产记录格式 */
interface ApiAssetResponse {
  id: number;
  userId: number;
  name: string;
  source: string;
  type: string;
  size: string;
  downloadUrl: string | null;
  toolId: string | null;
  createdAt: string;
}

/**
 * 获取所有工厂产物的资产记录
 * NOTE: Phase 2.1 — 改为调用后端 API，API 自动按 user_id 隔离
 */
export async function getAssetRecords(): Promise<FactoryAssetRecord[]> {
  try {
    const resp = await apiClient.get<{
      total: number;
      items: ApiAssetResponse[];
    }>('/api/assets/factory?pageSize=500');
    return resp.items.map((item) => ({
      id: String(item.id),
      name: item.name,
      source: item.source,
      type: item.type,
      size: item.size,
      date: item.createdAt,
      downloadUrl: item.downloadUrl || undefined,
      toolId: item.toolId || undefined,
    }));
  } catch {
    // NOTE: API 不可用时回退到 localStorage（兼容未登录/离线场景）
    return getAssetRecordsLocal();
  }
}

/**
 * 同步版本 — 从 localStorage 读取（兼容不支持 async 的旧调用点）
 */
export function getAssetRecordsSync(): FactoryAssetRecord[] {
  return getAssetRecordsLocal();
}

/** localStorage 回退读取 */
function getAssetRecordsLocal(): FactoryAssetRecord[] {
  try {
    const key = `kunlun_factory_assets_${getCurrentUsername()}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * 添加一条资产记录
 * NOTE: Phase 2.1 — 同时写入后端 API + localStorage（双写过渡期）
 */
export function addAssetRecord(record: FactoryAssetRecord): void {
  // 立即写入 localStorage（确保 UI 即时可见）
  try {
    const key = `kunlun_factory_assets_${getCurrentUsername()}`;
    const raw = localStorage.getItem(key);
    const existing: FactoryAssetRecord[] = raw ? JSON.parse(raw) : [];
    if (existing.some((r) => r.id === record.id)) return;
    const updated = [record, ...existing];
    localStorage.setItem(key, JSON.stringify(updated));
  } catch { /* quota exceeded 等极端情况静默忽略 */ }

  // 异步写入后端 API（fire-and-forget）
  apiClient.post('/api/assets/factory', {
    name: record.name,
    source: record.source,
    type: record.type,
    size: record.size,
    downloadUrl: record.downloadUrl || null,
    toolId: record.toolId || null,
  }).catch(() => {
    // NOTE: API 写入失败不影响用户体验，localStorage 已有数据
  });
}

/**
 * 格式化文件字节数为人类可读字符串
 * NOTE: 1024 进制，保留一位小数
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * 通过 HEAD 请求获取远程文件大小
 * NOTE: 如果 CORS 不允许 HEAD 或无 Content-Length，回退返回 null
 */
async function fetchRemoteFileSize(url: string): Promise<number | null> {
  try {
    const resp = await fetch(url, { method: 'HEAD' });
    const cl = resp.headers.get('content-length');
    if (cl) return parseInt(cl, 10);
    return null;
  } catch {
    return null;
  }
}

/**
 * 更新已存在的资产记录的 size 字段
 */
function updateAssetSize(recordId: string, size: string): void {
  try {
    const key = `kunlun_factory_assets_${getCurrentUsername()}`;
    const raw = localStorage.getItem(key);
    const records: FactoryAssetRecord[] = raw ? JSON.parse(raw) : [];
    const idx = records.findIndex((r) => r.id === recordId);
    if (idx === -1) return;
    records[idx].size = size;
    localStorage.setItem(key, JSON.stringify(records));
  } catch { /* ignore */ }
}

/**
 * 添加资产记录并异步获取文件大小
 * NOTE: 先以 size='-' 立即写入，再通过 HEAD 请求回填真实大小
 *       不阻塞调用方流程
 */
export function addAssetRecordWithSize(record: FactoryAssetRecord): void {
  // 先用 '-' 占位立即写入
  addAssetRecord({ ...record, size: record.size || '-' });

  // 异步获取文件大小并回填
  if (record.downloadUrl) {
    fetchRemoteFileSize(record.downloadUrl).then((bytes) => {
      if (bytes && bytes > 0) {
        updateAssetSize(record.id, formatFileSize(bytes));
      }
    });
  }
}

// ============ 历史记录操作（API 驱动） ============

/** API 响应中的历史记录格式 */
interface ApiHistoryResponse {
  id: number;
  userId: number;
  toolName: string;
  action: string;
  status: string;
  duration: string | null;
  output: string | null;
  createdAt: string;
}

/**
 * 获取所有工厂使用的历史记录
 * NOTE: Phase 2.1 — 改为调用后端 API
 */
export async function getHistoryRecords(): Promise<FactoryHistoryRecord[]> {
  try {
    const resp = await apiClient.get<{
      total: number;
      items: ApiHistoryResponse[];
    }>('/api/assets/history?pageSize=500');
    return resp.items.map((item) => ({
      id: String(item.id),
      toolName: item.toolName,
      action: item.action,
      status: item.status as FactoryHistoryRecord['status'],
      time: item.createdAt,
      duration: item.duration || '',
      output: item.output || undefined,
    }));
  } catch {
    return getHistoryRecordsLocal();
  }
}

/**
 * 同步版本 — 从 localStorage 读取
 */
export function getHistoryRecordsSync(): FactoryHistoryRecord[] {
  return getHistoryRecordsLocal();
}

/** localStorage 回退读取 */
function getHistoryRecordsLocal(): FactoryHistoryRecord[] {
  try {
    const key = `kunlun_factory_history_${getCurrentUsername()}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * 添加一条历史记录
 * NOTE: Phase 2.1 — 双写（localStorage + API）
 */
export function addHistoryRecord(record: FactoryHistoryRecord): void {
  // 立即写入 localStorage
  try {
    const key = `kunlun_factory_history_${getCurrentUsername()}`;
    const raw = localStorage.getItem(key);
    const existing: FactoryHistoryRecord[] = raw ? JSON.parse(raw) : [];
    if (existing.some((r) => r.id === record.id)) return;
    const updated = [record, ...existing];
    localStorage.setItem(key, JSON.stringify(updated));
  } catch { /* ignore */ }

  // 异步写入后端 API
  apiClient.post('/api/assets/history', {
    toolName: record.toolName,
    action: record.action,
    status: record.status,
    duration: record.duration || null,
    output: record.output || null,
  }).catch(() => { /* API 写入失败不影响用户体验 */ });
}


// ============ 数字员工专用记录（API 驱动） ============

/** 数字员工会话历史条目 */
export interface WorkerHistoryRecord {
  id: string;
  /** 用户指令 */
  command: string;
  /** 状态 */
  status: 'success' | 'failed' | 'running';
  /** 时间（ISO 字符串） */
  time: string;
  /** 耗时描述 */
  duration: string;
  /** 执行结果描述 */
  result?: string;
  /** 日志文件名，用于下载 */
  logFile?: string;
  /** 设备描述 */
  deviceLabel?: string;
}

/** API 响应中的数字员工历史格式 */
interface ApiWorkerHistoryResponse {
  id: number;
  userId: number;
  command: string;
  status: string;
  duration: string | null;
  result: string | null;
  logFile: string | null;
  deviceLabel: string | null;
  createdAt: string;
}

/**
 * 获取所有数字员工会话历史
 * NOTE: Phase 2.1 — 改为调用后端 API
 */
export async function getWorkerHistoryRecords(): Promise<WorkerHistoryRecord[]> {
  try {
    const resp = await apiClient.get<{
      total: number;
      items: ApiWorkerHistoryResponse[];
    }>('/api/assets/worker?pageSize=500');
    return resp.items.map((item) => ({
      id: String(item.id),
      command: item.command,
      status: item.status as WorkerHistoryRecord['status'],
      time: item.createdAt,
      duration: item.duration || '',
      result: item.result || undefined,
      logFile: item.logFile || undefined,
      deviceLabel: item.deviceLabel || undefined,
    }));
  } catch {
    return getWorkerHistoryRecordsLocal();
  }
}

/**
 * 同步版本 — 从 localStorage 读取
 */
export function getWorkerHistoryRecordsSync(): WorkerHistoryRecord[] {
  return getWorkerHistoryRecordsLocal();
}

/** localStorage 回退读取 */
function getWorkerHistoryRecordsLocal(): WorkerHistoryRecord[] {
  try {
    const key = `kunlun_worker_history_${getCurrentUsername()}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * 添加一条数字员工历史记录
 * NOTE: Phase 2.1 — 双写
 */
export function addWorkerHistoryRecord(record: WorkerHistoryRecord): void {
  // 立即写入 localStorage
  try {
    const key = `kunlun_worker_history_${getCurrentUsername()}`;
    const raw = localStorage.getItem(key);
    const existing: WorkerHistoryRecord[] = raw ? JSON.parse(raw) : [];
    if (existing.some((r) => r.id === record.id)) return;
    const updated = [record, ...existing];
    localStorage.setItem(key, JSON.stringify(updated));
  } catch { /* ignore */ }

  // 异步写入后端 API
  apiClient.post('/api/assets/worker', {
    command: record.command,
    status: record.status,
    duration: record.duration || null,
    result: record.result || null,
    logFile: record.logFile || null,
    deviceLabel: record.deviceLabel || null,
  }).catch(() => { /* ignore */ });
}

/**
 * 更新数字员工历史记录的状态
 * NOTE: 用于将 running 状态更新为 success 或 failed
 *       仅更新 localStorage（API 侧通过 addWorkerHistoryRecord 已有最终状态）
 */
export function updateWorkerHistoryRecord(
  id: string,
  updates: Partial<WorkerHistoryRecord>,
): void {
  // 更新 localStorage
  try {
    const key = `kunlun_worker_history_${getCurrentUsername()}`;
    const raw = localStorage.getItem(key);
    const records: WorkerHistoryRecord[] = raw ? JSON.parse(raw) : [];
    const idx = records.findIndex((r) => r.id === id);
    if (idx === -1) return;
    records[idx] = { ...records[idx], ...updates };
    localStorage.setItem(key, JSON.stringify(records));
  } catch { /* ignore */ }

  // NOTE: 同步更新后端 DB 中最近一条 running 状态记录
  if (updates.status && updates.status !== 'running') {
    apiClient.patch('/api/assets/worker/latest-running', {
      status: updates.status,
      duration: updates.duration || null,
      result: updates.result || null,
      logFile: updates.logFile || null,
    }).catch(() => { /* API 更新失败不影响用户体验 */ });
  }
}

// ============ 数字员工当前会话持久化（localStorage — 临时状态） ============

/**
 * 保存当前数字员工会话消息到 localStorage
 */
export function saveWorkerSession(messages: unknown[]): void {
  try {
    localStorage.setItem(workerSessionKey(), JSON.stringify(messages));
  } catch { /* ignore */ }
}

/**
 * 读取数字员工会话消息
 */
export function loadWorkerSession(): unknown[] {
  try {
    const raw = localStorage.getItem(workerSessionKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * 清除数字员工会话消息（新建会话时调用）
 */
export function clearWorkerSession(): void {
  try {
    localStorage.removeItem(workerSessionKey());
  } catch { /* ignore */ }
}

// ============ 活跃任务状态持久化（localStorage — 临时状态） ============

/**
 * 保存当前活跃任务 ID 到 localStorage
 * NOTE: 在 task_created 时调用，确保用户导航离开页面再返回后
 *       能恢复 isExecuting + currentTaskId 状态，显示取消按钮
 */
export function saveActiveTaskId(taskId: string): void {
  try {
    localStorage.setItem(activeTaskKey(), taskId);
  } catch { /* ignore */ }
}

/**
 * 读取当前活跃任务 ID
 * 如果存在说明有任务仍在执行中（或上次异常退出未清理）
 */
export function loadActiveTaskId(): string | null {
  try {
    return localStorage.getItem(activeTaskKey());
  } catch {
    return null;
  }
}

/**
 * 清除活跃任务 ID（任务完成/失败/取消/新建会话时调用）
 */
export function clearActiveTaskId(): void {
  try {
    localStorage.removeItem(activeTaskKey());
  } catch { /* ignore */ }
}

// ============ 用户自建素材库（API 驱动） ============

/** 自建素材库元数据 */
export interface CustomLibrary {
  id: string;
  name: string;
  createdAt: string;
  fileCount?: number;
}

/** 自建素材库中的文件 */
export interface CustomLibFile {
  id: string;
  name: string;
  size: string;
  date: string;
  /** 文件的下载 URL（TOS 预签名 URL 或 data URI） */
  dataUrl?: string;
  mimeType?: string;
}

/** API 响应中的素材库格式 */
interface ApiLibraryResponse {
  id: number;
  userId: number;
  name: string;
  fileCount: number;
  createdAt: string;
}

/** API 响应中的素材库文件格式 */
interface ApiLibFileResponse {
  id: number;
  libraryId: number;
  name: string;
  size: string;
  mimeType: string | null;
  storageUrl: string | null;
  createdAt: string;
}

/**
 * 获取当前用户的自建库列表
 * NOTE: Phase 2.4 — 改为调用后端 API
 */
export async function getCustomLibraries(): Promise<CustomLibrary[]> {
  try {
    const resp = await apiClient.get<{ items: ApiLibraryResponse[] }>('/api/libraries');
    return resp.items.map((lib) => ({
      id: String(lib.id),
      name: lib.name,
      createdAt: lib.createdAt,
      fileCount: lib.fileCount,
    }));
  } catch {
    return getCustomLibrariesLocal();
  }
}

/** localStorage 回退 */
function getCustomLibrariesLocal(): CustomLibrary[] {
  try {
    const key = `kunlun_custom_libs_${getCurrentUsername()}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/**
 * 添加自建库
 * NOTE: Phase 2.4 — 改为调用后端 API
 */
export async function addCustomLibrary(lib: CustomLibrary): Promise<CustomLibrary> {
  try {
    const resp = await apiClient.post<ApiLibraryResponse>('/api/libraries', {
      name: lib.name,
    });
    return {
      id: String(resp.id),
      name: resp.name,
      createdAt: resp.createdAt,
      fileCount: 0,
    };
  } catch {
    // 回退到 localStorage
    try {
      const key = `kunlun_custom_libs_${getCurrentUsername()}`;
      const existing = getCustomLibrariesLocal();
      if (!existing.some((l) => l.id === lib.id)) {
        localStorage.setItem(key, JSON.stringify([...existing, lib]));
      }
    } catch { /* ignore */ }
    return lib;
  }
}

/**
 * 删除自建库（含其下文件）
 * NOTE: Phase 2.4 — 后端 API 会自动清理 TOS 文件 + 数据库级联删除
 */
export async function deleteCustomLibrary(libId: string): Promise<void> {
  try {
    await apiClient.delete(`/api/libraries/${libId}`);
  } catch {
    // 回退到 localStorage
    try {
      const key = `kunlun_custom_libs_${getCurrentUsername()}`;
      const existing = getCustomLibrariesLocal().filter((l) => l.id !== libId);
      localStorage.setItem(key, JSON.stringify(existing));
      localStorage.removeItem(`kunlun_lib_files_${getCurrentUsername()}_${libId}`);
    } catch { /* ignore */ }
  }
}

/**
 * 获取自建库中的文件列表
 * NOTE: Phase 2.4 — 改为调用后端 API
 */
export async function getCustomLibFiles(libId: string): Promise<CustomLibFile[]> {
  try {
    const resp = await apiClient.get<{ items: ApiLibFileResponse[] }>(`/api/libraries/${libId}/files`);
    return resp.items.map((f) => ({
      id: String(f.id),
      name: f.name,
      size: f.size,
      date: f.createdAt,
      dataUrl: f.storageUrl || undefined,
      mimeType: f.mimeType || undefined,
    }));
  } catch {
    return getCustomLibFilesLocal(libId);
  }
}

/** localStorage 回退 */
function getCustomLibFilesLocal(libId: string): CustomLibFile[] {
  try {
    const key = `kunlun_lib_files_${getCurrentUsername()}_${libId}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/**
 * 向自建库上传文件
 * NOTE: Phase 2.4 — 通过 multipart/form-data 上传到后端，后端转存 TOS
 */
export async function addCustomLibFile(libId: string, file: CustomLibFile, rawFile?: File): Promise<CustomLibFile> {
  // 优先走 API 上传
  if (rawFile) {
    try {
      const formData = new FormData();
      formData.append('file', rawFile);
      const resp = await apiClient.postForm<ApiLibFileResponse>(`/api/libraries/${libId}/files`, formData);
      return {
        id: String(resp.id),
        name: resp.name,
        size: resp.size,
        date: resp.createdAt,
        dataUrl: resp.storageUrl || undefined,
        mimeType: resp.mimeType || undefined,
      };
    } catch {
      // 回退到 localStorage
    }
  }

  // localStorage 回退
  try {
    const key = `kunlun_lib_files_${getCurrentUsername()}_${libId}`;
    const existing = getCustomLibFilesLocal(libId);
    if (!existing.some((f) => f.id === file.id)) {
      localStorage.setItem(key, JSON.stringify([file, ...existing]));
    }
  } catch { /* ignore */ }
  return file;
}

/**
 * 删除自建库中的文件
 * NOTE: Phase 2.4 — 后端 API 会同步清理 TOS 文件
 */
export async function deleteCustomLibFile(libId: string, fileId: string): Promise<void> {
  try {
    await apiClient.delete(`/api/libraries/${libId}/files/${fileId}`);
  } catch {
    // 回退到 localStorage
    try {
      const key = `kunlun_lib_files_${getCurrentUsername()}_${libId}`;
      const existing = getCustomLibFilesLocal(libId).filter((f) => f.id !== fileId);
      localStorage.setItem(key, JSON.stringify(existing));
    } catch { /* ignore */ }
  }
}

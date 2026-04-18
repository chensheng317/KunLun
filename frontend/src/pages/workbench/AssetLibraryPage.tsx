import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  FileText,
  Download,
  FileJson,
  FileCode,
  Image,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Upload,
  Plus,
  FolderPlus,
  Search,
  X,
  Check,
  Trash2,

  Home,
  MessageSquareText,
  KeyRound,
  Palette as PaletteIcon,
  BookText,
  User,
  Music,
  Video,
  Loader2,
} from 'lucide-react';
import {
  getAssetRecords,
  getCustomLibraries,
  addCustomLibrary,
  deleteCustomLibrary,
  getCustomLibFiles,
  addCustomLibFile,
  deleteCustomLibFile,
  type FactoryAssetRecord,
  type CustomLibrary as CustomLibType,
  type CustomLibFile,
} from '../../utils/factory-records';

/**
 * 资产库页面
 * NOTE: 分为上下两大区域
 * 上方：数字员工/数字工厂的真实任务产物文件表，带完整分页
 * 下方：平台预设素材库(面包屑导航) + 用户自建库 + 文件上传
 *
 * 所有数据来源于 localStorage，按当前登录用户隔离
 */

// ============ 产物文件图标映射 ============

/**
 * 根据文件类型返回对应图标
 */
function getFileIcon(type: string) {
  switch (type) {
    case 'video': return Video;
    case 'audio': return Music;
    case 'image': return Image;
    case 'json': return FileJson;
    case 'script': return FileCode;
    default: return FileText;
  }
}

const PAGE_SIZE = 5;

// ============ 下方素材库预设数据 ============

interface MaterialLibrary {
  id: string;
  name: string;
  format: string;
  icon: typeof Image;
  isPreset: boolean;
}

const PRESET_LIBRARIES: MaterialLibrary[] = [
  { id: 'product-images', name: '商品图库', format: '图片格式', icon: Image, isPreset: true },
  { id: 'keywords', name: '关键词库', format: '文本格式', icon: KeyRound, isPreset: true },
  { id: 'reply-scripts', name: '回复话术库', format: '文本格式', icon: MessageSquareText, isPreset: true },
  { id: 'intercept-scripts', name: '截流话术库', format: '文本格式', icon: BookText, isPreset: true },
  { id: 'copy-materials', name: '文案素材库', format: '文本格式', icon: PaletteIcon, isPreset: true },
  { id: 'virtual-ip', name: '虚拟IP形象库', format: '图片/视频格式', icon: User, isPreset: true },
];

/**
 * 生成分页按钮列表（含省略号）
 * NOTE: 总页数 ≤ 7 时全部展示，否则当前页前后各显示1页 + 省略号 + 首尾页
 */
function getPageNumbers(
  currentPage: number,
  totalPages: number,
): (number | '...')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | '...')[] = [1];
  if (currentPage > 3) pages.push('...');
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (currentPage < totalPages - 2) pages.push('...');
  pages.push(totalPages);
  return pages;
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AssetLibraryPage() {
  // ======= 上方：从 localStorage 加载真实工厂产物记录 =======
  const [factoryRecords, setFactoryRecords] = useState<FactoryAssetRecord[]>([]);

  useEffect(() => {
    // NOTE: Phase 2.1 — 异步加载资产记录（优先 API，回退 localStorage）
    const loadAssets = async () => {
      const records = await getAssetRecords();
      setFactoryRecords(records);
    };
    loadAssets();
  }, []);

  // ======= 上方产物分页 =======
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(factoryRecords.length / PAGE_SIZE));
  const currentAssets = factoryRecords.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  // ======= 下方素材库 =======
  const [customLibraries, setCustomLibraries] = useState<CustomLibType[]>([]);
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
  const [isCreatingLib, setIsCreatingLib] = useState(false);
  const [newLibName, setNewLibName] = useState('');
  const [libFiles, setLibFiles] = useState<CustomLibFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // 加载用户自建库
  useEffect(() => {
    const loadLibs = async () => {
      const libs = await getCustomLibraries();
      setCustomLibraries(libs);
    };
    loadLibs();
  }, []);

  // 当切换到某个库时加载其文件列表
  useEffect(() => {
    if (activeLibraryId) {
      const loadFiles = async () => {
        const files = await getCustomLibFiles(activeLibraryId);
        setLibFiles(files);
      };
      loadFiles();
    } else {
      setLibFiles([]);
    }
  }, [activeLibraryId]);

  const activeLibrary = useMemo(() => {
    const preset = PRESET_LIBRARIES.find((lib) => lib.id === activeLibraryId);
    if (preset) return preset;
    const custom = customLibraries.find((lib) => lib.id === activeLibraryId);
    if (custom) return { ...custom, format: '自定义', icon: Database, isPreset: false };
    return null;
  }, [activeLibraryId, customLibraries]);

  /** 创建新库 — 持久化到后端 API */
  const handleCreateLibrary = useCallback(async () => {
    if (!newLibName.trim()) return;
    const newLib: CustomLibType = {
      id: `custom-${Date.now()}`,
      name: newLibName.trim(),
      createdAt: new Date().toISOString(),
    };
    await addCustomLibrary(newLib);
    const libs = await getCustomLibraries();
    setCustomLibraries(libs);
    setNewLibName('');
    setIsCreatingLib(false);
  }, [newLibName]);

  /** 删除自建库 — 持久化到后端 API */
  const handleDeleteLibrary = useCallback(async (id: string) => {
    await deleteCustomLibrary(id);
    const libs = await getCustomLibraries();
    setCustomLibraries(libs);
    if (activeLibraryId === id) setActiveLibraryId(null);
  }, [activeLibraryId]);

  /**
   * 真实文件上传 — 读取为 base64 存入 localStorage
   * NOTE: localStorage 限制约 5-10MB 总量，大文件会警告
   */
  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeLibraryId || !e.target.files?.length) return;
    setUploading(true);
    const file = e.target.files[0];

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.readAsDataURL(file);
      });

      const newFile: CustomLibFile = {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        size: formatFileSize(file.size),
        date: new Date().toLocaleDateString('zh-CN'),
        dataUrl,
        mimeType: file.type,
      };
      await addCustomLibFile(activeLibraryId, newFile, file);
      const updatedFiles = await getCustomLibFiles(activeLibraryId);
      setLibFiles(updatedFiles);
    } catch (err) {
      console.error('File upload failed:', err);
    } finally {
      setUploading(false);
      // 重置 input 允许重复上传同一文件
      e.target.value = '';
    }
  }, [activeLibraryId]);

  /** 删除库内文件 */
  const handleDeleteFile = useCallback(async (fileId: string) => {
    if (!activeLibraryId) return;
    await deleteCustomLibFile(activeLibraryId, fileId);
    const updatedFiles = await getCustomLibFiles(activeLibraryId);
    setLibFiles(updatedFiles);
  }, [activeLibraryId]);

  /**
   * 下载文件 — 通过 Blob URL 触发浏览器下载
   * NOTE: 对于有 dataUrl 的自建库文件用 base64 转 blob
   *       对于有 downloadUrl 的工厂产物用 fetch blob
   */
  const triggerDownload = useCallback(async (url: string, filename: string) => {
    try {
      if (url.startsWith('data:')) {
        // base64 Data URI → blob 下载
        const resp = await fetch(url);
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
      } else {
        // 普通 URL → fetch blob 下载
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
      }
    } catch {
      // 降级：新标签页打开
      window.open(url, '_blank');
    }
  }, []);

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <div className="h-full overflow-y-auto p-8 max-w-7xl mx-auto space-y-10">
      {/* ============ 上方：任务产物文件区 ============ */}
      <section>
        <div className="mb-5">
          <h1 className="text-xl font-bold text-nexus-text flex items-center gap-3">
            <Database size={22} className="text-nexus-primary" />
            资产库
          </h1>
          <p className="text-sm text-nexus-muted mt-1.5">
            存放数字员工任务日志、报告及数字工厂所有产物。
          </p>
        </div>

        <div className="bg-nexus-surface border border-nexus-border rounded-2xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-nexus-surface-alt/40 border-b border-nexus-border">
                <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">
                  文件名称
                </th>
                <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">
                  来源
                </th>
                <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">
                  大小
                </th>
                <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">
                  生成时间
                </th>
                <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nexus-border">
              {currentAssets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-sm text-nexus-muted">
                    暂无产物记录。使用数字员工或数字工厂后，产物将自动出现在此处。
                  </td>
                </tr>
              ) : (
                currentAssets.map((record) => {
                  const Icon = getFileIcon(record.type);
                  const isWorker = record.source.includes('数字员工');
                  return (
                    <tr
                      key={record.id}
                      className="hover:bg-nexus-bg/50 transition-colors group"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <Icon
                            size={16}
                            className="text-nexus-secondary shrink-0"
                          />
                          <span className="text-sm font-medium text-nexus-text group-hover:text-nexus-primary transition-colors">
                            {record.name}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            isWorker
                              ? 'bg-nexus-secondary/20 text-nexus-secondary border border-nexus-secondary/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {isWorker ? '数字员工' : '数字工厂'}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-nexus-muted font-mono">
                        {record.size}
                      </td>
                      <td className="p-4 text-xs text-nexus-muted font-mono">
                        {record.date}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 下载：通过浏览器下载产物 */}
                          {record.downloadUrl ? (
                            <button
                              className="cursor-target p-2 rounded-lg text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface-alt transition-colors"
                              title="下载"
                              onClick={() => triggerDownload(record.downloadUrl!, record.name)}
                            >
                              <Download size={15} />
                            </button>
                          ) : (
                            <button
                              className="cursor-target p-2 rounded-lg text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface-alt transition-colors"
                              title="下载"
                              onClick={() => {
                                /**
                                 * NOTE: TTS 语音合成的音频是 base64 格式，没有 downloadUrl
                                 * 从 localStorage 中读取最近一次合成结果执行 Blob 下载
                                 */
                                if (record.toolId === 'tts-synthesis') {
                                  try {
                                    const saved = localStorage.getItem('kunlun_tts_last_result');
                                    if (saved) {
                                      const result = JSON.parse(saved);
                                      if (result.audioBase64) {
                                        const binaryStr = atob(result.audioBase64);
                                        const bytes = new Uint8Array(binaryStr.length);
                                        for (let i = 0; i < binaryStr.length; i++) {
                                          bytes[i] = binaryStr.charCodeAt(i);
                                        }
                                        const blob = new Blob([bytes], { type: `audio/${result.audioFormat || 'mp3'}` });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = record.name || `tts_${Date.now()}.${result.audioFormat || 'mp3'}`;
                                        document.body.appendChild(a);
                                        a.click();
                                        // NOTE: 延迟释放 Blob URL，避免浏览器未读取完就被回收
                                        setTimeout(() => {
                                          document.body.removeChild(a);
                                          URL.revokeObjectURL(url);
                                        }, 1500);
                                      }
                                    }
                                  } catch { /* ignore */ }
                                }
                              }}
                            >
                              <Download size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* ======= 分页控件 ======= */}
          {factoryRecords.length > 0 && (
            <div className="px-4 py-3 border-t border-nexus-border flex items-center justify-between bg-nexus-surface-alt/20">
              <span className="text-[11px] text-nexus-muted font-mono">
                共 {factoryRecords.length} 条 · 第 {currentPage}/{totalPages} 页
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="cursor-target p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="首页"
                >
                  <ChevronsLeft size={16} />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="cursor-target p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                {pageNumbers.map((page, idx) =>
                  page === '...' ? (
                    <span
                      key={`dots-${idx}`}
                      className="w-7 h-7 flex items-center justify-center text-xs text-nexus-muted"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`cursor-target w-7 h-7 rounded-md text-xs font-bold transition-all ${
                        page === currentPage
                          ? 'bg-nexus-primary text-nexus-inverse shadow-cyber-glow'
                          : 'text-nexus-muted hover:text-nexus-text hover:bg-nexus-surface'
                      }`}
                    >
                      {page}
                    </button>
                  ),
                )}
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="cursor-target p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="cursor-target p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="尾页"
                >
                  <ChevronsRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ============ 下方：素材库区 ============ */}
      <section>
        {/* 面包屑导航 */}
        <div className="flex items-center gap-2 text-sm mb-5">
          <button
            onClick={() => setActiveLibraryId(null)}
            className={`cursor-target flex items-center gap-1.5 transition-colors ${
              activeLibraryId
                ? 'text-nexus-muted hover:text-nexus-text'
                : 'text-nexus-primary font-semibold'
            }`}
          >
            <Home size={14} />
            素材库
          </button>
          {activeLibrary && (
            <>
              <ChevronRight size={14} className="text-nexus-border" />
              <span className="text-nexus-primary font-semibold">
                {activeLibrary.name}
              </span>
            </>
          )}
        </div>

        <AnimatePresence mode="wait">
          {/* ---- 库列表视图 ---- */}
          {!activeLibraryId && (
            <motion.div
              key="lib-list"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              {/* 预设库 */}
              <div>
                <h2 className="text-[11px] font-semibold text-nexus-muted uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Database size={13} />
                  平台预设素材库
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {PRESET_LIBRARIES.map((lib) => {
                    const Icon = lib.icon;
                    return (
                      <button
                        key={lib.id}
                        onClick={() => setActiveLibraryId(lib.id)}
                        className="cursor-target text-left p-5 rounded-xl bg-nexus-surface border border-nexus-border hover:border-nexus-primary/60 hover:shadow-cyber-glow transition-all duration-300 group"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 rounded-xl bg-nexus-bg border border-nexus-border flex items-center justify-center group-hover:border-nexus-primary/50 transition-colors">
                            <Icon
                              size={20}
                              className="text-nexus-muted group-hover:text-nexus-primary transition-colors"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold text-nexus-text group-hover:text-nexus-primary transition-colors truncate">
                              {lib.name}
                            </h3>
                            <p className="text-[10px] text-nexus-muted mt-0.5">
                              {lib.format}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 自建库 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[11px] font-semibold text-nexus-muted uppercase tracking-widest flex items-center gap-2">
                    <FolderPlus size={13} />
                    用户自建库
                  </h2>
                  <button
                    onClick={() => setIsCreatingLib(true)}
                    className="cursor-target flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-nexus-primary border border-nexus-primary/30 hover:bg-nexus-primary/10 hover:border-nexus-primary/60 transition-all"
                  >
                    <Plus size={14} />
                    新建库
                  </button>
                </div>

                {/* 新建库输入 */}
                <AnimatePresence>
                  {isCreatingLib && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-4 overflow-hidden"
                    >
                      <div className="flex items-center gap-3 bg-nexus-surface border border-nexus-primary/30 rounded-xl p-3">
                        <input
                          type="text"
                          value={newLibName}
                          onChange={(e) => setNewLibName(e.target.value)}
                          placeholder="输入新库名称，如：竞品素材库"
                          className="cursor-target flex-1 bg-nexus-bg border border-nexus-border rounded-lg px-3 py-2 text-sm text-nexus-text placeholder-nexus-muted/60 focus:outline-none focus:border-nexus-primary/50"
                          autoFocus
                          onKeyDown={(e) =>
                            e.key === 'Enter' && handleCreateLibrary()
                          }
                        />
                        <button
                          onClick={handleCreateLibrary}
                          disabled={!newLibName.trim()}
                          className="cursor-target p-2 rounded-lg bg-nexus-primary text-nexus-inverse hover:bg-nexus-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setIsCreatingLib(false);
                            setNewLibName('');
                          }}
                          className="cursor-target p-2 rounded-lg text-nexus-muted hover:text-rose-400 hover:bg-rose-400/10 transition-all"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {customLibraries.length === 0 && !isCreatingLib ? (
                  <div className="text-center py-10 text-nexus-muted text-sm border border-dashed border-nexus-border rounded-xl">
                    暂无自建库，点击「新建库」按需创建
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {customLibraries.map((lib) => (
                      <div
                        key={lib.id}
                        className="relative text-left p-5 rounded-xl bg-nexus-surface border border-nexus-border hover:border-nexus-secondary/60 transition-all duration-300 group"
                      >
                        <button
                          onClick={() => setActiveLibraryId(lib.id)}
                          className="cursor-target w-full text-left"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-nexus-bg border border-nexus-border flex items-center justify-center group-hover:border-nexus-secondary/50 transition-colors">
                              <Database
                                size={20}
                                className="text-nexus-muted group-hover:text-nexus-secondary transition-colors"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-bold text-nexus-text group-hover:text-nexus-secondary transition-colors truncate">
                                {lib.name}
                              </h3>
                              <p className="text-[10px] text-nexus-muted mt-0.5">
                                自定义 · {lib.fileCount ?? 0} 条
                              </p>
                            </div>
                          </div>
                        </button>
                        {/* 删除按钮 — 仅自建库可删除 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLibrary(lib.id);
                          }}
                          className="cursor-target absolute top-3 right-3 p-1.5 rounded-md text-nexus-muted opacity-0 group-hover:opacity-100 hover:text-rose-400 hover:bg-rose-400/10 transition-all"
                          title="删除该库"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ---- 库内详情视图 ---- */}
          {activeLibraryId && (
            <motion.div
              key="lib-detail"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              {/* 操作栏 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Search size={16} className="text-nexus-muted" />
                  <input
                    type="text"
                    placeholder={`在「${activeLibrary?.name}」中搜索...`}
                    className="cursor-target bg-nexus-bg border border-nexus-border rounded-lg px-3 py-2 text-sm text-nexus-text placeholder-nexus-muted/60 focus:outline-none focus:border-nexus-primary/50 w-72 transition-colors"
                  />
                </div>
                {/* 隐藏的 file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelected}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="cursor-target flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold bg-nexus-primary text-nexus-inverse hover:bg-nexus-primary/90 shadow-cyber-glow disabled:opacity-50 transition-all"
                >
                  {uploading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      上传中...
                    </>
                  ) : (
                    <>
                      <Upload size={14} />
                      上传文件
                    </>
                  )}
                </button>
              </div>

              {/* 文件列表 */}
              {libFiles.length > 0 ? (
                <div className="bg-nexus-surface border border-nexus-border rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-nexus-surface-alt/40 border-b border-nexus-border">
                        <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">
                          文件名
                        </th>
                        <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">
                          大小
                        </th>
                        <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">
                          上传时间
                        </th>
                        <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-nexus-border">
                      {libFiles.map((file) => (
                        <tr
                          key={file.id}
                          className="hover:bg-nexus-bg/50 transition-colors group"
                        >
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <FileText
                                size={16}
                                className="text-nexus-secondary shrink-0"
                              />
                              <span className="text-sm font-medium text-nexus-text group-hover:text-nexus-primary transition-colors">
                                {file.name}
                              </span>
                            </div>
                          </td>
                          <td className="p-4 text-xs text-nexus-muted font-mono">
                            {file.size}
                          </td>
                          <td className="p-4 text-xs text-nexus-muted font-mono">
                            {file.date}
                          </td>
                          <td className="p-4">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* 下载 */}
                              <button
                                className="cursor-target p-2 rounded-lg text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface-alt transition-colors"
                                title="下载"
                                onClick={() => {
                                  if (file.dataUrl) triggerDownload(file.dataUrl, file.name);
                                }}
                              >
                                <Download size={15} />
                              </button>
                              {/* 删除 */}
                              <button
                                className="cursor-target p-2 rounded-lg text-nexus-muted hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
                                title="删除"
                                onClick={() => handleDeleteFile(file.id)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-16 text-nexus-muted text-sm border border-dashed border-nexus-border rounded-xl">
                  该库暂无文件，点击上方「上传文件」添加
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}

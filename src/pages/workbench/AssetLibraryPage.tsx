import { useState, useMemo } from 'react';
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
  Eye,
  Home,
  MessageSquareText,
  KeyRound,
  Palette as PaletteIcon,
  BookText,
  User,
} from 'lucide-react';

/**
 * 资产库页面
 * NOTE: 分为上下两大区域
 * 上方：数字员工/数字工厂的任务产物文件表，带完整分页（首页/尾页/省略号）
 * 下方：平台预设素材库(面包屑导航) + 用户自建库 + 文件上传
 */

// ============ 上方产物文件 Mock 数据 ============

interface AssetFile {
  id: number;
  name: string;
  source: '数字员工' | '数字工厂';
  type: string;
  size: string;
  date: string;
  icon: typeof FileText;
}

/** 大量测试数据，确保 5页+ 的分页效果 */
const allAssets: AssetFile[] = [
  { id: 1, name: '竞品分析报告_20260312.md', source: '数字员工', type: 'markdown', size: '24 KB', date: '2026-03-12 14:30', icon: FileText },
  { id: 2, name: '营销素材抓取结果.json', source: '数字员工', type: 'json', size: '1.2 MB', date: '2026-03-11 09:15', icon: FileJson },
  { id: 3, name: '执行脚本_task_8892.py', source: '数字员工', type: 'script', size: '4 KB', date: '2026-03-11 09:14', icon: FileCode },
  { id: 4, name: '店铺健康度体检报告.md', source: '数字员工', type: 'markdown', size: '18 KB', date: '2026-03-10 16:45', icon: FileText },
  { id: 5, name: '全域营销数据透视.json', source: '数字工厂', type: 'json', size: '3.8 MB', date: '2026-03-09 20:10', icon: FileJson },
  { id: 6, name: '客服对话训练集.csv', source: '数字工厂', type: 'data', size: '12 MB', date: '2026-03-09 18:00', icon: FileText },
  { id: 7, name: '短视频数据复盘_02.md', source: '数字员工', type: 'markdown', size: '32 KB', date: '2026-03-08 11:30', icon: FileText },
  { id: 8, name: '跨平台库存同步日志.log', source: '数字工厂', type: 'log', size: '256 KB', date: '2026-03-08 09:00', icon: FileCode },
  { id: 9, name: '渲染产物_banner_v3.png', source: '数字工厂', type: 'image', size: '2.1 MB', date: '2026-03-07 15:45', icon: Image },
  { id: 10, name: '私域回复话术优化建议.md', source: '数字员工', type: 'markdown', size: '8 KB', date: '2026-03-07 10:20', icon: FileText },
  { id: 11, name: '爆款关键词挖掘报告.json', source: '数字员工', type: 'json', size: '640 KB', date: '2026-03-06 14:00', icon: FileJson },
  { id: 12, name: '深度学习模型评估报告.md', source: '数字工厂', type: 'markdown', size: '45 KB', date: '2026-03-05 16:30', icon: FileText },
  // 第三页开始的数据
  { id: 13, name: '用户画像分析_Q1.json', source: '数字工厂', type: 'json', size: '5.2 MB', date: '2026-03-05 11:20', icon: FileJson },
  { id: 14, name: '自动回复话术_v4.txt', source: '数字员工', type: 'text', size: '96 KB', date: '2026-03-04 19:45', icon: FileText },
  { id: 15, name: '直播间数据采集_0304.csv', source: '数字员工', type: 'data', size: '8.4 MB', date: '2026-03-04 15:30', icon: FileText },
  { id: 16, name: '供应链优化建议报告.md', source: '数字工厂', type: 'markdown', size: '28 KB', date: '2026-03-04 10:00', icon: FileText },
  { id: 17, name: '竞品价格监控_周报.json', source: '数字员工', type: 'json', size: '1.8 MB', date: '2026-03-03 22:15', icon: FileJson },
  // 第四页
  { id: 18, name: 'ROI分析_渠道对比.md', source: '数字工厂', type: 'markdown', size: '36 KB', date: '2026-03-03 14:50', icon: FileText },
  { id: 19, name: '评论情感分析结果.json', source: '数字员工', type: 'json', size: '2.4 MB', date: '2026-03-03 09:30', icon: FileJson },
  { id: 20, name: '批量上架脚本_v2.py', source: '数字工厂', type: 'script', size: '12 KB', date: '2026-03-02 17:20', icon: FileCode },
  { id: 21, name: '搜索广告_关键词优化.md', source: '数字员工', type: 'markdown', size: '14 KB', date: '2026-03-02 11:00', icon: FileText },
  { id: 22, name: '智能客服训练日志_0302.log', source: '数字工厂', type: 'log', size: '480 KB', date: '2026-03-02 08:45', icon: FileCode },
  // 第五页
  { id: 23, name: '爆款选品推荐_春季.json', source: '数字员工', type: 'json', size: '920 KB', date: '2026-03-01 20:30', icon: FileJson },
  { id: 24, name: '社群运营数据报告.md', source: '数字员工', type: 'markdown', size: '52 KB', date: '2026-03-01 15:15', icon: FileText },
  { id: 25, name: '自动化测试报告_UAT.md', source: '数字工厂', type: 'markdown', size: '22 KB', date: '2026-03-01 10:40', icon: FileText },
  { id: 26, name: '视频素材渲染输出.mp4', source: '数字工厂', type: 'video', size: '128 MB', date: '2026-02-28 21:00', icon: FileText },
  { id: 27, name: '私域流量漏斗分析.json', source: '数字员工', type: 'json', size: '3.1 MB', date: '2026-02-28 16:30', icon: FileJson },
  // 第六页
  { id: 28, name: '会员体系优化方案.md', source: '数字员工', type: 'markdown', size: '40 KB', date: '2026-02-28 11:20', icon: FileText },
  { id: 29, name: '多平台数据聚合_Feb.csv', source: '数字工厂', type: 'data', size: '15 MB', date: '2026-02-27 18:45', icon: FileText },
  { id: 30, name: '内容分发策略报告.md', source: '数字员工', type: 'markdown', size: '19 KB', date: '2026-02-27 14:10', icon: FileText },
  { id: 31, name: 'A/B测试结果_landing_v5.json', source: '数字工厂', type: 'json', size: '780 KB', date: '2026-02-27 09:00', icon: FileJson },
  { id: 32, name: '智能推荐算法日志.log', source: '数字工厂', type: 'log', size: '1.5 MB', date: '2026-02-26 22:30', icon: FileCode },
  // 第七页
  { id: 33, name: '品牌声量监测_周报.md', source: '数字员工', type: 'markdown', size: '26 KB', date: '2026-02-26 16:00', icon: FileText },
  { id: 34, name: '商品详情页_自动生成.html', source: '数字工厂', type: 'markup', size: '340 KB', date: '2026-02-26 10:30', icon: FileCode },
  { id: 35, name: '用户行为路径分析.json', source: '数字员工', type: 'json', size: '4.6 MB', date: '2026-02-25 19:15', icon: FileJson },
  { id: 36, name: '短视频脚本_模板库.md', source: '数字员工', type: 'markdown', size: '88 KB', date: '2026-02-25 14:45', icon: FileText },
  { id: 37, name: '仓储调度优化结果.json', source: '数字工厂', type: 'json', size: '2.8 MB', date: '2026-02-25 09:20', icon: FileJson },
];

const PAGE_SIZE = 5;

// ============ 下方素材库 Mock 数据 ============

/** 素材库类型 */
interface MaterialLibrary {
  id: string;
  name: string;
  format: string;
  icon: typeof Image;
  isPreset: boolean;
  fileCount: number;
}

interface MaterialFile {
  id: number;
  name: string;
  size: string;
  date: string;
}

const presetLibraries: MaterialLibrary[] = [
  { id: 'product-images', name: '商品图库', format: '图片格式', icon: Image, isPreset: true, fileCount: 128 },
  { id: 'keywords', name: '关键词库', format: '文本格式', icon: KeyRound, isPreset: true, fileCount: 2048 },
  { id: 'reply-scripts', name: '回复话术库', format: '文本格式', icon: MessageSquareText, isPreset: true, fileCount: 512 },
  { id: 'intercept-scripts', name: '截流话术库', format: '文本格式', icon: BookText, isPreset: true, fileCount: 256 },
  { id: 'copy-materials', name: '文案素材库', format: '文本格式', icon: PaletteIcon, isPreset: true, fileCount: 1024 },
  { id: 'virtual-ip', name: '虚拟IP形象库', format: '图片/视频格式', icon: User, isPreset: true, fileCount: 86 },
];

/** 各库内的 Mock 文件 */
const libraryFiles: Record<string, MaterialFile[]> = {
  'product-images': [
    { id: 1, name: '夏季新品主图_001.jpg', size: '2.4 MB', date: '2026-03-10' },
    { id: 2, name: '详情页_尺码表.png', size: '830 KB', date: '2026-03-09' },
    { id: 3, name: '白底图_SKU_3392.jpg', size: '1.6 MB', date: '2026-03-08' },
  ],
  'keywords': [
    { id: 1, name: '美妆类目_核心关键词.txt', size: '128 KB', date: '2026-03-12' },
    { id: 2, name: '服饰秋冬_长尾词包.txt', size: '256 KB', date: '2026-03-11' },
  ],
  'reply-scripts': [
    { id: 1, name: '售前咨询_通用话术.txt', size: '64 KB', date: '2026-03-10' },
    { id: 2, name: '售后退换_应对模板.txt', size: '48 KB', date: '2026-03-09' },
  ],
  'intercept-scripts': [
    { id: 1, name: '竞品关注_截流话术包.txt', size: '96 KB', date: '2026-03-08' },
  ],
  'copy-materials': [
    { id: 1, name: '节日营销_文案合集.txt', size: '320 KB', date: '2026-03-12' },
    { id: 2, name: '短视频口播_脚本模板.txt', size: '180 KB', date: '2026-03-10' },
  ],
  'virtual-ip': [
    { id: 1, name: '虚拟主播_形象_A.png', size: '4.2 MB', date: '2026-03-14' },
    { id: 2, name: '虚拟主播_形象_B.png', size: '3.8 MB', date: '2026-03-13' },
    { id: 3, name: '虚拟客服_Q版头像.png', size: '1.6 MB', date: '2026-03-12' },
    { id: 4, name: 'IP形象_动作序列_01.mp4', size: '28 MB', date: '2026-03-10' },
  ],
};

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

export default function AssetLibraryPage() {
  // ======= 上方产物分页 =======
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(allAssets.length / PAGE_SIZE);
  const currentAssets = allAssets.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  // ======= 下方素材库 =======
  const [customLibraries, setCustomLibraries] = useState<MaterialLibrary[]>([]);
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
  const [isCreatingLib, setIsCreatingLib] = useState(false);
  const [newLibName, setNewLibName] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);

  const allLibraries = useMemo(
    () => [...presetLibraries, ...customLibraries],
    [customLibraries],
  );

  const activeLibrary = allLibraries.find((lib) => lib.id === activeLibraryId);
  const activeFiles = activeLibraryId ? (libraryFiles[activeLibraryId] || []) : [];

  /** 创建新库 */
  const handleCreateLibrary = () => {
    if (!newLibName.trim()) return;
    const newLib: MaterialLibrary = {
      id: `custom-${Date.now()}`,
      name: newLibName.trim(),
      format: '自定义',
      icon: Database,
      isPreset: false,
      fileCount: 0,
    };
    setCustomLibraries((prev) => [...prev, newLib]);
    setNewLibName('');
    setIsCreatingLib(false);
  };

  /** 删除自建库 */
  const handleDeleteLibrary = (id: string) => {
    setCustomLibraries((prev) => prev.filter((lib) => lib.id !== id));
    if (activeLibraryId === id) setActiveLibraryId(null);
  };

  /** 模拟上传 */
  const handleUpload = () => {
    setUploadingFile(true);
    setTimeout(() => setUploadingFile(false), 1500);
  };

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10">
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
              {currentAssets.map((asset) => {
                const Icon = asset.icon;
                return (
                  <tr
                    key={asset.id}
                    className="hover:bg-nexus-bg/50 transition-colors group"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Icon
                          size={16}
                          className="text-nexus-secondary shrink-0"
                        />
                        <span className="text-sm font-medium text-nexus-text group-hover:text-nexus-primary transition-colors">
                          {asset.name}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          asset.source === '数字员工'
                            ? 'bg-nexus-secondary/20 text-nexus-secondary border border-nexus-secondary/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {asset.source}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-nexus-muted font-mono">
                      {asset.size}
                    </td>
                    <td className="p-4 text-xs text-nexus-muted font-mono">
                      {asset.date}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          className="p-2 rounded-lg text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface-alt transition-colors"
                          title="预览"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          className="p-2 rounded-lg text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface-alt transition-colors"
                          title="下载"
                        >
                          <Download size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ======= 分页控件（首页/尾页/省略号） ======= */}
          <div className="px-4 py-3 border-t border-nexus-border flex items-center justify-between bg-nexus-surface-alt/20">
            <span className="text-[11px] text-nexus-muted font-mono">
              共 {allAssets.length} 条 · 第 {currentPage}/{totalPages} 页
            </span>
            <div className="flex items-center gap-1">
              {/* 首页 */}
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="首页"
              >
                <ChevronsLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                    className={`w-7 h-7 rounded-md text-xs font-bold transition-all ${
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
                className="p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
              {/* 尾页 */}
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="尾页"
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ============ 下方：素材库区 ============ */}
      <section>
        {/* 面包屑导航 */}
        <div className="flex items-center gap-2 text-sm mb-5">
          <button
            onClick={() => setActiveLibraryId(null)}
            className={`flex items-center gap-1.5 transition-colors ${
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
                  {presetLibraries.map((lib) => {
                    const Icon = lib.icon;
                    return (
                      <button
                        key={lib.id}
                        onClick={() => setActiveLibraryId(lib.id)}
                        className="text-left p-5 rounded-xl bg-nexus-surface border border-nexus-border hover:border-nexus-primary/60 hover:shadow-cyber-glow transition-all duration-300 group"
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
                              {lib.format} · {lib.fileCount} 条
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-nexus-primary border border-nexus-primary/30 hover:bg-nexus-primary/10 hover:border-nexus-primary/60 transition-all"
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
                          className="flex-1 bg-nexus-bg border border-nexus-border rounded-lg px-3 py-2 text-sm text-nexus-text placeholder-nexus-muted/60 focus:outline-none focus:border-nexus-primary/50"
                          autoFocus
                          onKeyDown={(e) =>
                            e.key === 'Enter' && handleCreateLibrary()
                          }
                        />
                        <button
                          onClick={handleCreateLibrary}
                          disabled={!newLibName.trim()}
                          className="p-2 rounded-lg bg-nexus-primary text-nexus-inverse hover:bg-nexus-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setIsCreatingLib(false);
                            setNewLibName('');
                          }}
                          className="p-2 rounded-lg text-nexus-muted hover:text-rose-400 hover:bg-rose-400/10 transition-all"
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
                    {customLibraries.map((lib) => {
                      const Icon = lib.icon;
                      return (
                        <div
                          key={lib.id}
                          className="relative text-left p-5 rounded-xl bg-nexus-surface border border-nexus-border hover:border-nexus-secondary/60 transition-all duration-300 group"
                        >
                          <button
                            onClick={() => setActiveLibraryId(lib.id)}
                            className="w-full text-left"
                          >
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-10 h-10 rounded-xl bg-nexus-bg border border-nexus-border flex items-center justify-center group-hover:border-nexus-secondary/50 transition-colors">
                                <Icon
                                  size={20}
                                  className="text-nexus-muted group-hover:text-nexus-secondary transition-colors"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-bold text-nexus-text group-hover:text-nexus-secondary transition-colors truncate">
                                  {lib.name}
                                </h3>
                                <p className="text-[10px] text-nexus-muted mt-0.5">
                                  {lib.format} · {lib.fileCount} 条
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
                            className="absolute top-3 right-3 p-1.5 rounded-md text-nexus-muted opacity-0 group-hover:opacity-100 hover:text-rose-400 hover:bg-rose-400/10 transition-all"
                            title="删除该库"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
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
                    className="bg-nexus-bg border border-nexus-border rounded-lg px-3 py-2 text-sm text-nexus-text placeholder-nexus-muted/60 focus:outline-none focus:border-nexus-primary/50 w-72 transition-colors"
                  />
                </div>
                <button
                  onClick={handleUpload}
                  disabled={uploadingFile}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold bg-nexus-primary text-nexus-inverse hover:bg-nexus-primary/90 shadow-cyber-glow disabled:opacity-50 transition-all"
                >
                  {uploadingFile ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-nexus-inverse border-t-transparent rounded-full animate-spin" />
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
              {activeFiles.length > 0 ? (
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
                      {activeFiles.map((file) => (
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
                              <button className="p-2 rounded-lg text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface-alt transition-colors">
                                <Eye size={15} />
                              </button>
                              <button className="p-2 rounded-lg text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface-alt transition-colors">
                                <Download size={15} />
                              </button>
                              <button className="p-2 rounded-lg text-nexus-muted hover:text-rose-400 hover:bg-rose-400/10 transition-colors">
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

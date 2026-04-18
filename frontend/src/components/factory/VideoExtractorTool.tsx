import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCreditsGuard } from '../../hooks/useCreditsGuard';
import { addAssetRecordWithSize, addHistoryRecord } from '../../utils/factory-records';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Link2,
  Download,
  Image,
  Video,
  Loader2,
  Zap,
  ExternalLink,
  Copy,
  CheckCircle2,
  ImageIcon,
} from 'lucide-react';

/**
 * 视频链接提取工具组件
 * NOTE: 支持抖音、小红书、快手、B站四大平台的视频源文件和封面提取
 * NOTE: 小红书图文笔记支持提取全部图片
 * NOTE: 提取结果自动持久化到 localStorage，路由切换后保留
 */

interface ExtractResult {
  platform: string;
  title: string;
  videoUrl: string;
  coverUrl: string;
  author: string;
  creditCost: number;
  /** 小红书图文笔记的全部图片 */
  images?: string[];
  /** 内容类型：video | image（图文笔记无视频） */
  contentType?: string;
}

const PLATFORM_INFO: Record<string, { name: string; color: string; gradient: string }> = {
  douyin: { name: '抖音', color: '#fe2c55', gradient: 'from-[#fe2c55] to-[#25f4ee]' },
  xiaohongshu: { name: '小红书', color: '#ff2442', gradient: 'from-[#ff2442] to-[#ff6680]' },
  kuaishou: { name: '快手', color: '#ff5000', gradient: 'from-[#ff5000] to-[#ffa000]' },
  bilibili: { name: 'B站', color: '#00a1d6', gradient: 'from-[#00a1d6] to-[#fb7299]' },
};

const CREDIT_COST = 1;

/** localStorage 键名 — 持久化最近一次提取结果 */
const STORAGE_KEY = 'kunlun_video_extractor_last_result';

export default function VideoExtractorTool() {
  const { consumeCredits } = useAuth();
  const { checkCredits } = useCreditsGuard();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState('');
  const [copiedField, setCopiedField] = useState('');
  const [downloading, setDownloading] = useState('');

  // NOTE: 组件挂载时从 localStorage 恢复最近一条提取结果
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ExtractResult;
        setResult(parsed);
      }
    } catch {
      // 恢复失败不影响正常使用
    }
  }, []);

  /**
   * 将提取结果持久化到 localStorage
   * NOTE: 每次成功提取后自动调用
   */
  const persistResult = useCallback((data: ExtractResult) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage 满或不可用时静默失败
    }
  }, []);

  /**
   * 通过 fetch → blob → createObjectURL 触发浏览器下载
   * NOTE: 不能直接用 <a download> 因为跨域 CDN 和后端代理 URL 浏览器会忽略 download 属性
   */
  const triggerBrowserDownload = useCallback(async (downloadUrl: string, filename: string, type: string) => {
    setDownloading(type);
    try {
      // 对后端代理/合并的 URL，加上当前域名前缀
      const fetchUrl = downloadUrl.startsWith('/') ? downloadUrl : downloadUrl;
      const resp = await fetch(fetchUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // NOTE: 延迟释放 blob URL，避免浏览器还没开始读取就被回收导致文件截断
      setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
    } catch (err) {
      console.error('Download failed:', err);
      // 降级方案：直接在新标签页打开
      window.open(downloadUrl, '_blank');
    } finally {
      setDownloading('');
    }
  }, []);

  /**
   * 提交视频链接提取请求
   * NOTE: 调用后端 API，自动识别平台并提取无水印视频和封面
   */
  const handleExtract = async () => {
    // NOTE: 积分前置检查
    if (!checkCredits(CREDIT_COST, '视频提取')) return;
    if (!url.trim()) {
      setError('请输入视频链接');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const resp = await fetch('/api/video-extract/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!resp.ok) {
        // NOTE: 后端不可用时响应体可能为空，json() 会抛异常
        let detail = '提取失败';
        try {
          const errData = await resp.json();
          detail = errData.detail || detail;
        } catch {
          if (resp.status === 502 || resp.status === 503) {
            detail = '后端服务未启动或不可用，请检查 python main.py 是否运行';
          } else {
            detail = `服务端错误 (HTTP ${resp.status})`;
          }
        }
        throw new Error(detail);
      }

      const data = await resp.json() as ExtractResult;
      setResult(data);
      persistResult(data);

      // NOTE: 提取成功后扣除积分
      await consumeCredits(CREDIT_COST, '视频链接提取');

      // NOTE: 同步到统一资产库 — 使用 addAssetRecordWithSize / addHistoryRecord，确保在资产库页可见可下载
      const now = Date.now();
      const dateStr = new Date(now).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
      const primaryUrl = data.videoUrl || data.coverUrl;
      const isImage = data.contentType === 'image';

      if (primaryUrl) {
        addAssetRecordWithSize({
          id: `extract-${now}`,
          name: `${data.platform}_${(data.title || '提取内容').slice(0, 30)}.${isImage ? 'jpg' : 'mp4'}`,
          source: '数字工厂-视频链接提取',
          type: isImage ? 'image' : 'video',
          downloadUrl: primaryUrl,
          size: '-',
          date: dateStr,
          toolId: 'video-extract',
        });
      }
      // NOTE: 小红书图文场景可能有多张图片，每张都写入资产库
      if (data.images?.length) {
        data.images.forEach((imgUrl: string, idx: number) => {
          addAssetRecordWithSize({
            id: `extract-img-${now}-${idx}`,
            name: `${data.platform}_${(data.title || '图文').slice(0, 20)}_${idx + 1}.jpg`,
            source: '数字工厂-视频链接提取',
            type: 'image',
            downloadUrl: imgUrl,
            size: '-',
            date: dateStr,
            toolId: 'video-extract',
          });
        });
      }
      addHistoryRecord({
        id: `history-extract-${now}`,
        toolName: '视频链接提取',
        action: `提取 ${data.platform} 内容「${(data.title || '').slice(0, 40)}」`,
        status: 'success',
        time: new Date(now).toISOString(),
        duration: '-',
        output: data.images?.length
          ? `已提取 ${data.images.length} 张图片，已保存至资产库。`
          : `已提取${isImage ? '封面图' : '视频'}，已保存至资产库。`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // NOTE: fetch 网络层错误（如 ERR_CONNECTION_REFUSED）不会有 resp 对象
      if (msg.includes('Unexpected end of JSON') || msg.includes('Failed to fetch')) {
        setError('后端服务未启动或连接失败，请确认 python main.py 正在运行');
      } else {
        setError(msg || '网络请求失败，请检查后端服务是否启动');
      }
    } finally {
      setLoading(false);
    }
  };

  /** 复制链接到剪贴板 */
  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(''), 2000);
    } catch {
      // 降级方案
    }
  };

  const platformData = result ? PLATFORM_INFO[result.platform] : null;
  const images = result?.images ?? [];
  const isImagePost = result?.contentType === 'image';

  return (
    <div className="space-y-6">
      {/* 输入区域 */}
      <div className="bg-nexus-surface/50 border border-nexus-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Link2 size={16} className="text-nexus-primary" />
          <span className="text-xs text-nexus-muted font-mono uppercase">视频链接输入</span>
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
            placeholder="粘贴 抖音/小红书/快手/B站 视频分享链接..."
            className="cursor-target flex-1 bg-nexus-bg border border-nexus-border rounded-xl px-4 py-3 text-sm text-nexus-text placeholder-nexus-muted/50 outline-none focus:border-nexus-primary/50 focus:shadow-[0_0_15px_rgba(62,237,231,0.1)] transition-all"
          />
          <button
            onClick={handleExtract}
            disabled={loading || !url.trim()}
            className="cursor-target px-6 py-3 bg-gradient-to-r from-nexus-primary to-nexus-secondary text-nexus-inverse font-bold text-sm rounded-xl hover:shadow-cyber-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            提取
          </button>
        </div>

        {/* 积分消耗提示 */}
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-400/80">
          <Zap size={12} />
          <span>本次提取将消耗 <strong>{CREDIT_COST}</strong> 算力</span>
        </div>

        {/* 支持平台标签 */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-nexus-muted">支持平台：</span>
          {Object.entries(PLATFORM_INFO).map(([key, info]) => (
            <span
              key={key}
              className="text-[10px] px-2 py-0.5 rounded-full border font-medium"
              style={{ borderColor: `${info.color}40`, color: info.color }}
            >
              {info.name}
            </span>
          ))}
        </div>
      </div>

      {/* 错误提示 */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 提取结果 */}
      <AnimatePresence>
        {result && platformData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-nexus-surface/50 border border-nexus-border rounded-2xl p-6 space-y-5"
          >
            {/* 平台标识 + 标题 */}
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${platformData.gradient} flex items-center justify-center text-white font-bold text-lg shrink-0`}
              >
                {platformData.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                    style={{ backgroundColor: `${platformData.color}20`, color: platformData.color }}
                  >
                    {platformData.name}
                  </span>
                  {isImagePost && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold">
                      图文
                    </span>
                  )}
                  {result.author && (
                    <span className="text-[11px] text-nexus-muted">@{result.author}</span>
                  )}
                </div>
                <h3 className="text-sm font-medium text-nexus-text truncate">{result.title}</h3>
              </div>
            </div>

            {/* 视频源链接 */}
            {result.videoUrl && (
              <div className="bg-nexus-bg rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Video size={14} className="text-nexus-primary" />
                    <span className="text-xs font-medium text-nexus-text">视频源文件</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(result.videoUrl, 'video')}
                      className="cursor-target text-[11px] px-2 py-1 rounded-lg bg-nexus-surface border border-nexus-border text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30 transition-all flex items-center gap-1"
                    >
                      {copiedField === 'video' ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                      {copiedField === 'video' ? '已复制' : '复制'}
                    </button>
                    <button
                      onClick={() => triggerBrowserDownload(
                        result.videoUrl,
                        `${result.platform}_${result.title.slice(0, 30) || 'video'}.mp4`,
                        'video'
                      )}
                      disabled={downloading === 'video'}
                      className="cursor-target text-[11px] px-2 py-1 rounded-lg bg-nexus-primary text-nexus-inverse font-bold hover:shadow-cyber-glow transition-all flex items-center gap-1 disabled:opacity-50"
                    >
                      {downloading === 'video' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                      {downloading === 'video' ? '下载中...' : '下载视频'}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-nexus-muted break-all font-mono">{result.videoUrl}</p>
              </div>
            )}

            {/* 封面图（非图文模式时显示） */}
            {result.coverUrl && !isImagePost && (
              <div className="bg-nexus-bg rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Image size={14} className="text-amber-400" />
                    <span className="text-xs font-medium text-nexus-text">视频封面</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(result.coverUrl, 'cover')}
                      className="cursor-target text-[11px] px-2 py-1 rounded-lg bg-nexus-surface border border-nexus-border text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30 transition-all flex items-center gap-1"
                    >
                      {copiedField === 'cover' ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                      {copiedField === 'cover' ? '已复制' : '复制'}
                    </button>
                    <button
                      onClick={() => triggerBrowserDownload(
                        result.coverUrl,
                        `${result.platform}_${result.title.slice(0, 30) || 'cover'}.jpg`,
                        'cover'
                      )}
                      disabled={downloading === 'cover'}
                      className="cursor-target text-[11px] px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 transition-all flex items-center gap-1 disabled:opacity-50"
                    >
                      {downloading === 'cover' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                      {downloading === 'cover' ? '下载中...' : '下载封面'}
                    </button>
                  </div>
                </div>
                <img
                  src={result.coverUrl}
                  alt="视频封面"
                  className="w-full max-h-48 object-contain rounded-lg bg-nexus-surface"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}

            {/* 小红书图文笔记：全部图片列表 */}
            {images.length > 0 && (
              <div className="bg-nexus-bg rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon size={14} className="text-pink-400" />
                    <span className="text-xs font-medium text-nexus-text">
                      {isImagePost ? '笔记图片' : '相关图片'} ({images.length} 张)
                    </span>
                  </div>
                  {/* 一键下载全部 */}
                  {images.length > 1 && (
                    <button
                      onClick={async () => {
                        for (let i = 0; i < images.length; i++) {
                          const ext = images[i].includes('.png') ? 'png' : 'jpg';
                          await triggerBrowserDownload(
                            images[i],
                            `${result.platform}_${result.title.slice(0, 20) || 'img'}_${i + 1}.${ext}`,
                            `img_${i}`
                          );
                          // NOTE: 每张间隔 500ms，避免浏览器并发下载限制
                          await new Promise(r => setTimeout(r, 500));
                        }
                      }}
                      className="cursor-target text-[11px] px-3 py-1.5 rounded-lg bg-pink-500/20 border border-pink-500/30 text-pink-400 hover:bg-pink-500/30 transition-all flex items-center gap-1 font-bold"
                    >
                      <Download size={12} />
                      下载全部
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {images.map((imgUrl, idx) => (
                    <div key={idx} className="relative group rounded-lg overflow-hidden bg-nexus-surface border border-nexus-border/30">
                      <img
                        src={imgUrl}
                        alt={`图片 ${idx + 1}`}
                        className="w-full h-32 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '';
                          (e.target as HTMLImageElement).alt = '加载失败';
                        }}
                      />
                      {/* 悬浮操作栏 */}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            const ext = imgUrl.includes('.png') ? 'png' : 'jpg';
                            triggerBrowserDownload(
                              imgUrl,
                              `${result.platform}_${result.title.slice(0, 20) || 'img'}_${idx + 1}.${ext}`,
                              `img_${idx}`
                            );
                          }}
                          className="cursor-target p-2 rounded-lg bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-all"
                          title="下载此图片"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          onClick={() => handleCopy(imgUrl, `img_${idx}`)}
                          className="cursor-target p-2 rounded-lg bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-all"
                          title="复制链接"
                        >
                          {copiedField === `img_${idx}` ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                        </button>
                        <a
                          href={imgUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="cursor-target p-2 rounded-lg bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-all"
                          title="新窗口打开"
                        >
                          <ExternalLink size={14} />
                        </a>
                      </div>
                      {/* 序号角标 */}
                      <span className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white font-mono">
                        {idx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
